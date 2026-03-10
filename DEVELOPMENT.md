# TaskTime MVP — Локальная разработка

## Требования

- **Node.js 20+** (рекомендуется 22 LTS)
- **Docker** и **Docker Compose** (для PostgreSQL и Redis)
- **Make** (опционально, но удобно)

## Быстрый старт

```bash
# 1. Клонировать и перейти в директорию
git clone <repo-url> && cd tasktime-mvp
git checkout claude/mvp-project-management-hdAvd

# 2. Запустить setup (ставит зависимости, поднимает БД, накатывает схему, сидит данные)
make setup

# 3. Запустить dev-серверы
make dev
```

Открыть **http://localhost:5173** в браузере.

## Demo-аккаунты

| Email | Роль | Пароль |
|-------|------|--------|
| admin@tasktime.ru | Admin | password123 |
| manager@tasktime.ru | Manager | password123 |
| dev@tasktime.ru | User | password123 |
| viewer@tasktime.ru | Viewer | password123 |

## Команды (Makefile)

| Команда | Описание |
|---------|----------|
| `make setup` | Первоначальная настройка (всё в одной команде) |
| `make dev` | Запуск backend + frontend |
| `make backend` | Только backend (порт 3000) |
| `make frontend` | Только frontend (порт 5173) |
| `make infra` | Только PostgreSQL + Redis |
| `make seed` | Пересидировать БД |
| `make db-push` | Накатить Prisma-схему |
| `make db-reset` | Сбросить БД и пересидировать |
| `make db-studio` | Открыть Prisma Studio (GUI для БД) |
| `make test` | Запуск тестов |
| `make test-cov` | Тесты с coverage |
| `make lint` | Линтинг |
| `make stop` | Остановить всё |
| `make clean` | Остановить + удалить volumes и node_modules |

## Структура проекта

```
tasktime-mvp/
├── backend/           # Express API (порт 3000)
│   ├── src/
│   │   ├── modules/   # auth, users, projects, issues...
│   │   ├── prisma/    # schema + seed
│   │   ├── middleware/ # auth, error handling
│   │   └── config.ts  # env validation (Zod)
│   └── .env           # переменные окружения
├── frontend/          # React + Vite (порт 5173)
│   └── src/
├── docker-compose.yml # PostgreSQL 16 + Redis 7
├── Makefile           # dev-команды
└── setup.sh           # первоначальная настройка
```

## Ручная настройка (без Make)

```bash
# Инфраструктура
docker compose up -d

# Backend
cd backend
cp .env.example .env
npm install
npx prisma generate
npx prisma db push
npm run db:seed
npm run dev

# Frontend (в другом терминале)
cd frontend
cp .env.example .env
npm install
npm run dev
```

## API

Backend доступен на `http://localhost:3000/api`.
Frontend проксирует `/api` запросы на backend через Vite.

```bash
# Health check
curl http://localhost:3000/api/health

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@tasktime.ru","password":"password123"}'
```

## Troubleshooting

**Порт 5432 занят** — остановите локальный PostgreSQL: `sudo systemctl stop postgresql`

**Порт 3000 занят** — найдите процесс: `lsof -i :3000` и завершите его

**Prisma ошибки после pull** — пересоздайте клиент: `cd backend && npx prisma generate && npx prisma db push`
