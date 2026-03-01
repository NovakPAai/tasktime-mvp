---
name: deploy-tasktime
description: Deploy and troubleshoot TaskTime MVP on Ubuntu/Timeweb: setup script, Node, PostgreSQL, Nginx, systemd, env paths, schema and seed. Use when deploying to VPS, fixing server/setup/DB issues, or editing scripts/setup-script.sh, DEPLOY.md.
---

# Deploy TaskTime (Ubuntu / Timeweb)

## Контекст

- Репозиторий: `github.com/jackrescuer-gif/tasktime-mvp`.
- Сервер: приложение в `/home/tasktime/app`, backend в `app/backend`, `.env` в `app/.env`. Сервис: `WorkingDirectory=/home/tasktime/app`, `ExecStart=node backend/server.js`.

## Подход к скриптам и путям

- **PostgreSQL**: версия на Ubuntu 24 — 16, не 15. В скриптах использовать путь из установки: `$(ls /etc/postgresql)/main` или явно `16`.
- **Схема БД**: `postgres` не имеет доступа к `/home/tasktime/`. Применять так: `sudo cat /home/tasktime/app/backend/schema.sql | sudo -u postgres psql -d tasktime` (не `psql -f` по пути из home).
- **Seed / init-db**: зависимости в `backend/node_modules`, `.env` в `app/.env`. Запускать из `app/backend`: `cd /home/tasktime/app/backend && node scripts/seed.js`. В `seed.js` подгружать `.env` из корня приложения: `path.resolve(__dirname, '../../.env')` (для `backend/scripts/seed.js`).
- **db.js**: использует `PG_HOST`, `PG_PORT`, `PG_DATABASE`, `PG_USER`, `PG_PASSWORD`; при нестроковом пароле будет ошибка "client password must be a string" — значит .env не подхватился.

## Чеклист деплоя (на сервере)

1. Починить PG 16: `pg_hba.conf`, `listen_addresses`, `systemctl restart postgresql`.
2. Клонировать в `app`, сохранить/восстановить `app/.env`.
3. Сервис: `ExecStart=node backend/server.js`, не `server.js`.
4. `npm install` в `app/backend`.
5. Схема: `cat .../schema.sql | sudo -u postgres psql -d tasktime`.
6. Сид: `sudo -u tasktime /home/tasktime/init-db.sh` (init-db.sh вызывает `cd app/backend && node scripts/seed.js`).

## Где что лежит

- Установка: `scripts/setup-script.sh`; лог на сервере: `/var/log/tasktime-setup.log`.
- Инструкции: `DEPLOY.md`, `DEPLOYMENT_STEPS.md`, `ACCOUNTS.md`.

---

## GitHub Actions: авто-деплой на push в main

Настроен пайплайн: каждый `push` в `main` автоматически деплоит на сервер по SSH.

### Как это работает

- Файл: `.github/workflows/deploy.yml`
- Action: `appleboy/ssh-action@v1.2.0` — подключается к серверу по SSH и запускает `bash /home/tasktime/deploy.sh`
- Пользователь: `tasktime` (не root)
- Флаг `script_stop: true` — при ошибке в deploy.sh workflow падает с ненулевым кодом

### GitHub Secrets (обязательны)

| Secret | Значение |
|--------|----------|
| `DEPLOY_HOST` | IP-адрес или домен сервера |
| `DEPLOY_SSH_KEY` | Приватный SSH-ключ без пассфразы (содержимое `~/.ssh/id_rsa`) |

Добавить: **GitHub → Settings → Secrets and variables → Actions → New repository secret**.

Публичный ключ должен быть в `~/.ssh/authorized_keys` на сервере под пользователем `tasktime`.

### deploy.sh на сервере

Файл: `/home/tasktime/deploy.sh` (копия `scripts/deploy-server.sh` из репо).

Что делает:
1. `git fetch` + проверяет, есть ли новые коммиты (если нет — выходит без действий)
2. `git pull origin main`
3. `npm install --omit=dev` в `app/backend`
4. `sudo systemctl restart tasktime`
5. Через 3 секунды проверяет `systemctl is-active tasktime`
6. **Автоматический откат**: если сервис не поднялся — `git reset --hard <старый_коммит>` + повторный `npm install` + `restart`

Лог деплоя: `/var/log/tasktime-deploy.log`

### Sudoers: перезапуск без пароля

В `/etc/sudoers.d/tasktime` (настраивается `setup-script.sh`):
```
tasktime ALL=(ALL) NOPASSWD: /bin/systemctl restart tasktime
```
Без этой строки `sudo systemctl restart tasktime` в deploy.sh потребует пароль и зависнет.

### Диагностика авто-деплоя

| Проблема | Команда |
|----------|---------|
| Смотреть лог деплоя | `tail -f /var/log/tasktime-deploy.log` |
| Смотреть лог сервиса | `sudo journalctl -u tasktime -n 50` |
| Запустить деплой вручную | `bash /home/tasktime/deploy.sh` |
| Проверить статус сервиса | `sudo systemctl status tasktime` |
| Проверить sudoers | `sudo -l -U tasktime` |

### Типичные грабли

- **deploy.sh не существует на сервере** — надо скопировать из репо: `cp scripts/deploy-server.sh /home/tasktime/deploy.sh && chmod +x /home/tasktime/deploy.sh`
- **SSH-ключ с пассфразой** — workflow зависнет; ключ должен быть без пассфразы
- **`DEPLOY_SSH_KEY` содержит только публичный ключ** — нужен приватный (`id_rsa`, не `id_rsa.pub`)
- **Sudoers не настроен** — деплой зависает на `sudo systemctl restart`; проверить `sudo -l -U tasktime`
