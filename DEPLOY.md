# Деплой TaskTime MVP на сервер (Timeweb Cloud / Ubuntu)

Репозиторий: **https://github.com/jackrescuer-gif/tasktime-mvp**

- **Что сделано (простыми словами):** [DEPLOYMENT_STEPS.md](DEPLOYMENT_STEPS.md) — для отчёта и объяснения неподготовленной аудитории.
- **Учётные записи (формат, логины, пароли):** [ACCOUNTS.md](ACCOUNTS.md).

---

## 1. Подготовка сервера (один раз)

Скопируйте скрипт на сервер и запустите (с Mac в папке проекта):

```bash
cd /Users/pavelnovak/tasktime-mvp
scp scripts/setup-script.sh root@IP_СЕРВЕРА:/root/
ssh root@IP_СЕРВЕРА
chmod +x /root/setup-script.sh
bash /root/setup-script.sh
```

Лог установки: `cat /var/log/tasktime-setup.log`

**На Ubuntu 24** установится PostgreSQL 16. Если в логе были ошибки про `/etc/postgresql/15/`, выполните на сервере:

```bash
sudo tee /etc/postgresql/16/main/pg_hba.conf << 'EOF'
local   all             postgres                                peer
local   all             all                                     scram-sha-256
host    all             all             127.0.0.1/32            scram-sha-256
host    all             all             ::1/128                 scram-sha-256
EOF
sudo sed -i "s/#listen_addresses = 'localhost'/listen_addresses = 'localhost'/" /etc/postgresql/16/main/postgresql.conf
sudo systemctl restart postgresql
```

---

## 2. Клонирование репозитория и первый запуск

На сервере (подставьте IP вместо `5.129.242.171`):

```bash
# Сохранить .env, созданный скриптом
sudo -u tasktime cp /home/tasktime/app/.env /home/tasktime/.env.bak

# Очистить каталог и клонировать репозиторий
sudo -u tasktime sh -c 'cd /home/tasktime && rm -rf app && git clone https://github.com/jackrescuer-gif/tasktime-mvp.git app'

# Вернуть .env
sudo -u tasktime cp /home/tasktime/.env.bak /home/tasktime/app/.env
```

Если репозиторий **приватный**, используйте URL с токеном:

```bash
sudo -u tasktime sh -c 'cd /home/tasktime && rm -rf app && git clone https://ТОКЕН@github.com/jackrescuer-gif/tasktime-mvp.git app'
```

Запуск приложения из папки `backend`:

```bash
sudo sed -i 's|ExecStart=/usr/bin/node server.js|ExecStart=/usr/bin/node backend/server.js|' /etc/systemd/system/tasktime.service
sudo systemctl daemon-reload
```

Установка зависимостей, схема БД и старт сервиса:

```bash
sudo -u tasktime bash -c 'cd /home/tasktime/app/backend && npm install'
# При обновлении: применять schema.sql для новых таблиц (например audit_log). Миграции: см. docs/ADMIN_GUIDE.md.
sudo cat /home/tasktime/app/backend/schema.sql | sudo -u postgres psql -d tasktime
sudo -u tasktime /home/tasktime/init-db.sh
sudo systemctl start tasktime
sudo systemctl status tasktime
```

Проверка в браузере: `http://IP_СЕРВЕРА`

**Рекомендация:** в проде отдавайте приложение только через HTTPS (обратный прокси с TLS). См. раздел «HTTPS и безопасность» ниже.

---

## 3. Деплой обновлений

На сервере (под пользователем `tasktime` или через root):

```bash
sudo -u tasktime /home/tasktime/deploy.sh
```

Либо вручную:

```bash
cd /home/tasktime/app
sudo -u tasktime git pull origin main
sudo -u tasktime bash -c 'cd /home/tasktime/app/backend && npm install'
sudo systemctl restart tasktime
```

---

## Полезные команды

| Действие              | Команда |
|-----------------------|--------|
| Лог настройки         | `cat /var/log/tasktime-setup.log` |
| Лог приложения        | `sudo journalctl -u tasktime -f` |
| Статус сервиса        | `sudo systemctl status tasktime` |
| Перезапуск приложения | `sudo systemctl restart tasktime` |

---

## Резервное копирование (ТЗ п. 9.7)

Регулярно создавайте резервные копии БД и при необходимости восстанавливайте из них:

```bash
# Создание дампа (пример: в /backup)
sudo -u postgres pg_dump -Fc tasktime > /backup/tasktime_$(date +%Y%m%d).dump

# Восстановление (осторожно: перезаписывает БД)
sudo -u postgres pg_restore -d tasktime --clean --if-exists /backup/tasktime_YYYYMMDD.dump
```

Рекомендуется автоматизировать резервное копирование (cron) и хранить копии в безопасном месте. Подробнее: [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md).

---

## HTTPS и безопасность (ТЗ п. 9.4, TLS)

Доступ к системе из внешней и внутренней сети должен осуществляться по **HTTPS** (целостность и безопасность данных при передаче). Рекомендуется:

1. Установить перед приложением обратный прокси (nginx, Caddy и т.п.) с TLS 1.2 и выше.
2. Настроить сертификат (например Let's Encrypt) и перенаправление HTTP → HTTPS.
3. Не передавать секреты (JWT_SECRET, пароли БД) по незашифрованным каналам.

Детали настройки прокси и сертификатов зависят от вашей инфраструктуры. См. также [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md).
