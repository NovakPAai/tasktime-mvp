#!/bin/sh

# Логирование
exec > /var/log/tasktime-setup.log 2>&1
set -x

echo "=== TaskTime MVP Setup Started === $(date)"

# 1. Обновление системы
apt-get update
apt-get upgrade -y

# 2. Установка Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# 3. Установка PostgreSQL
apt-get install -y postgresql postgresql-contrib
systemctl enable postgresql
systemctl start postgresql

# 4. Создание базы данных и пользователя
DB_PASSWORD="TaskTime2024!"  # Смените на свой пароль!

sudo -u postgres psql << EOF
CREATE DATABASE tasktime;
CREATE USER taskuser WITH ENCRYPTED PASSWORD '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON DATABASE tasktime TO taskuser;
ALTER USER taskuser WITH SUPERUSER;
\q
EOF

# Настройка PostgreSQL для локальных подключений (версия: 16 на Ubuntu 24, 15 на 22.04)
PG_CONF_DIR="/etc/postgresql/$(ls /etc/postgresql)/main"
cat > "$PG_CONF_DIR/pg_hba.conf" << 'EOF'
local   all             postgres                                peer
local   all             all                                     scram-sha-256
host    all             all             127.0.0.1/32            scram-sha-256
host    all             all             ::1/128                 scram-sha-256
EOF

sed -i "s/#listen_addresses = 'localhost'/listen_addresses = 'localhost'/" "$PG_CONF_DIR/postgresql.conf"

systemctl restart postgresql

# 5. Установка PM2 и Nginx
npm install -g pm2
apt-get install -y nginx git

# 6. Настройка Nginx
cat > /etc/nginx/sites-available/tasktime << 'EOF'
server {
    listen 80;
    server_name _;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

ln -sf /etc/nginx/sites-available/tasktime /etc/nginx/sites-enabled/tasktime
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

# 7. Создание пользователя для приложения (безопасность)
useradd -m -s /bin/bash tasktime
usermod -aG sudo tasktime

# 8. Подготовка папки проекта
mkdir -p /home/tasktime/app
chown tasktime:tasktime /home/tasktime/app

# 9. Создание файла окружения (PG_* для backend/db.js, DATABASE_URL для init-db.sh)
cat > /home/tasktime/app/.env << EOF
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=tasktime
PG_USER=taskuser
PG_PASSWORD=${DB_PASSWORD}
DATABASE_URL=postgresql://taskuser:${DB_PASSWORD}@localhost:5432/tasktime
JWT_SECRET=$(openssl rand -base64 32)
JWT_EXPIRES_IN=7d
PORT=3000
NODE_ENV=production
EOF

chown tasktime:tasktime /home/tasktime/app/.env

# 10. Создание systemd сервиса для приложения
cat > /etc/systemd/system/tasktime.service << 'EOF'
[Unit]
Description=TaskTime MVP Application
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=tasktime
WorkingDirectory=/home/tasktime/app
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable tasktime

# 11. Настройка брандмауэра
apt-get install -y ufw
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow http
ufw allow https
ufw --force enable

# 12. Установка Certbot для SSL (опционально)
apt-get install -y certbot python3-certbot-nginx

# 13. Sudoers: деплой без пароля для systemctl restart/status
cat > /etc/sudoers.d/tasktime-deploy << 'EOF'
tasktime ALL=(ALL) NOPASSWD: /bin/systemctl restart tasktime, /bin/systemctl status tasktime
EOF
chmod 440 /etc/sudoers.d/tasktime-deploy

# 13b. Скрипт деплоя (с логами и rollback; также используется GitHub Actions)
cat > /home/tasktime/deploy.sh << 'EOF'
#!/bin/bash
set -e

APP_DIR="/home/tasktime/app"
LOG_FILE="/var/log/tasktime-deploy.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

log() {
  echo "[$TIMESTAMP] $1" | tee -a "$LOG_FILE"
}

log "=== Deploy started ==="

cd "$APP_DIR"

OLD_COMMIT=$(git rev-parse HEAD)

git fetch origin main
NEW_COMMIT=$(git rev-parse origin/main)

if [ "$OLD_COMMIT" = "$NEW_COMMIT" ]; then
  log "No new commits. Deploy skipped."
  exit 0
fi

log "Updating: $OLD_COMMIT -> $NEW_COMMIT"
git pull origin main

log "Running npm install..."
cd "$APP_DIR/backend"
npm install --omit=dev --no-audit --prefer-offline 2>&1 | tee -a "$LOG_FILE"

log "Restarting tasktime service..."
sudo systemctl restart tasktime

sleep 3
if systemctl is-active --quiet tasktime; then
  log "Service is running. Deploy completed successfully."
else
  log "ERROR: Service failed. Rolling back to $OLD_COMMIT..."
  git -C "$APP_DIR" reset --hard "$OLD_COMMIT"
  cd "$APP_DIR/backend"
  npm install --omit=dev --no-audit --prefer-offline 2>&1 | tee -a "$LOG_FILE"
  sudo systemctl restart tasktime
  sleep 3
  if systemctl is-active --quiet tasktime; then
    log "Rollback successful."
  else
    log "CRITICAL: Rollback also failed. Manual intervention required."
  fi
  exit 1
fi
EOF

chmod +x /home/tasktime/deploy.sh
chown tasktime:tasktime /home/tasktime/deploy.sh

# 14. Создание демо-пользователей в базе (после клонирования кода; использует backend/scripts/seed.js)
cat > /home/tasktime/init-db.sh << 'INITEOF'
#!/bin/bash
cd /home/tasktime/app/backend && node scripts/seed.js
INITEOF

chmod +x /home/tasktime/init-db.sh
chown tasktime:tasktime /home/tasktime/init-db.sh

echo "=== Setup Completed === $(date)"
echo "PostgreSQL password: ${DB_PASSWORD}"
echo "JWT_SECRET generated and saved to /home/tasktime/app/.env"
echo ""
echo "Next steps (see DEPLOY.md for full instructions):"
echo "1. Backup .env: sudo -u tasktime cp /home/tasktime/app/.env /home/tasktime/.env.bak"
echo "2. Clone repo:   sudo -u tasktime sh -c 'cd /home/tasktime && rm -rf app && git clone https://github.com/jackrescuer-gif/tasktime-mvp.git app'"
echo "3. Restore .env: sudo -u tasktime cp /home/tasktime/.env.bak /home/tasktime/app/.env"
echo "4. Fix service:  sudo sed -i 's|ExecStart=/usr/bin/node server.js|ExecStart=/usr/bin/node backend/server.js|' /etc/systemd/system/tasktime.service && sudo systemctl daemon-reload"
echo "5. Install deps: sudo -u tasktime bash -c 'cd /home/tasktime/app/backend && npm install'"
echo "6. Schema:       sudo cat /home/tasktime/app/backend/schema.sql | sudo -u postgres psql -d tasktime"
echo "7. Demo users:   sudo -u tasktime /home/tasktime/init-db.sh"
echo "8. Start:        sudo systemctl start tasktime && sudo systemctl status tasktime"
