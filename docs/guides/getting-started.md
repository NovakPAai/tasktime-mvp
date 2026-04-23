# Getting Started with Flow Universe

> RU: Быстрый старт для нового разработчика | EN: Quick start for new developer
> Last updated: 2026-03-25

---

## Requirements / Требования

| Tool | Version |
|------|---------|
| Node.js | 20+ (22 LTS recommended) |
| Docker + Docker Compose | latest |
| Make | optional but convenient |
| Git | latest |

---

## RU: Запуск за 5 минут

```bash
# 1. Клонировать репозиторий
git clone <repo-url>
cd tasktime-mvp

# 2. Полная первоначальная настройка (зависимости + БД + сид данные)
make setup

# 3. Запустить dev-серверы
make dev
```

Открыть **http://localhost:5173** → войти под `admin@tasktime.ru` / `password123`.

---

## EN: 5-minute setup

```bash
# 1. Clone repo
git clone <repo-url>
cd tasktime-mvp

# 2. Full first-time setup (deps + DB + seed)
make setup

# 3. Start dev servers
make dev
```

Open **http://localhost:5173** → login as `admin@tasktime.ru` / `password123`.

---

## Demo accounts / Демо-аккаунты

| Email | Role | Password |
|-------|------|----------|
| admin@tasktime.ru | ADMIN | password123 |
| manager@tasktime.ru | MANAGER | password123 |
| dev@tasktime.ru | USER | password123 |
| viewer@tasktime.ru | VIEWER | password123 |

---

## Manual setup (without Make) / Ручная настройка

```bash
# Infrastructure
docker compose up -d

# Backend
cd backend
cp .env.example .env          # edit DB/Redis URLs if needed
npm install
npx prisma generate
npx prisma db push
npm run db:seed
npm run dev                   # starts on :3000

# Frontend (new terminal)
cd frontend
cp .env.example .env
npm install
npm run dev                   # starts on :5173
```

---

## Make commands / Команды Makefile

| Command | Description |
|---------|-------------|
| `make setup` | First-time setup (all in one) |
| `make dev` | Start backend + frontend |
| `make backend` | Backend only (port 3000) |
| `make frontend` | Frontend only (port 5173) |
| `make infra` | PostgreSQL + Redis only |
| `make seed` | Re-seed database |
| `make db-push` | Apply Prisma schema changes |
| `make db-reset` | Reset DB + re-seed |
| `make db-studio` | Open Prisma Studio (DB GUI) |
| `make test` | Run tests |
| `make test-cov` | Tests with coverage report |
| `make lint` | Run ESLint |
| `make audit` | Security audit (npm audit) |
| `make stop` | Stop all services |
| `make clean` | Stop + remove volumes + node_modules |
| `make docs` | Update CHANGELOG + API docs + check staleness |
| `make sync` | Rebase current branch on origin/main |
| `make pr` | Push + create PR |
| `make ship` | sync → lint → push → PR |
| `make merge` | Squash-merge current PR + delete branch |

---

## Environment variables / Переменные окружения

Copy from examples:
```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Key backend variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | postgresql://... | PostgreSQL connection string |
| `JWT_SECRET` | — | **Required.** Min 32 chars |
| `JWT_EXPIRES_IN` | `7d` | Token TTL |
| `REDIS_URL` | redis://localhost:6379 | Redis connection |
| `PORT` | `3000` | Backend port |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed frontend origin |
| `ANTHROPIC_API_KEY` | — | For AI features |
| `GITLAB_WEBHOOK_SECRET` | — | For GitLab integration |

---

## Project structure / Структура проекта

```
tasktime-mvp/
├── backend/
│   ├── src/
│   │   ├── modules/     # 14 feature modules
│   │   ├── prisma/      # schema.prisma, seed.ts
│   │   └── shared/      # middleware, auth, utils
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── pages/       # 15 main pages
│   │   ├── components/  # UI components
│   │   ├── api/         # API client modules
│   │   └── store/       # Zustand stores
│   └── .env
├── docs/                # THIS documentation
├── deploy/              # Deploy scripts, nginx, env templates
├── docker-compose.yml
└── Makefile
```

See [../architecture/overview.md](../architecture/overview.md) for full architecture.

---

## Troubleshooting / Решение проблем

**Port 5432 busy / Порт 5432 занят:**
```bash
sudo systemctl stop postgresql  # Linux
brew services stop postgresql   # macOS
```

**Port 3000 busy / Порт 3000 занят:**
```bash
lsof -i :3000    # find process
kill <PID>
```

**Prisma errors after git pull / Ошибки Prisma после pull:**
```bash
cd backend && npx prisma generate && npx prisma db push
```

**Fresh start / Чистый старт:**
```bash
make clean && make setup
```

<!-- AUTO-GENERATED:START:env -->
> ⚡ Авто-сгенерировано из `backend/.env.example` и `frontend/.env.example`
> Скопируй файлы и заполни нужные значения: `cp backend/.env.example backend/.env`

### Backend (`backend/.env`)

| Переменная | Пример | Описание |
|-----------|--------|----------|
| `DATABASE_URL` | `postgresql://tasktime:tasktime@localh...` |  |
| `JWT_SECRET` | `REPLACE_WITH_STRONG_SECRET_32_CHARS_MIN` | CVE-01: In production, use secrets >= 32 chars. Generate: openssl rand -base64 48 |
| `JWT_REFRESH_SECRET` | `REPLACE_WITH_STRONG_REFRESH_SECRET_32` |  |
| `JWT_EXPIRES_IN` | `15m` |  |
| `JWT_REFRESH_EXPIRES_IN` | `7d` |  |
| `PORT` | `3000` |  |
| `NODE_ENV` | `development` |  |
| `CORS_ORIGIN` | `http://localhost:5173` |  |
| `REDIS_URL` | `redis://localhost:6379` |  |
| `REDIS_CACHE_TTL_SECONDS` | `30` |  |
| `BOOTSTRAP_ENABLED` | `false` | Optional local bootstrap for built-in users via `npm run db:bootstrap` |
| `BOOTSTRAP_DEFAULT_PASSWORD` | `—` |  |
| `BOOTSTRAP_OWNER_ADMIN_EMAIL` | `—` |  |
| `FEATURES_AI` | `true` | Feature flags (all enabled by default; set to false to disable in restricted environments) |
| `FEATURES_MCP` | `true` |  |
| `FEATURES_GITLAB` | `true` |  |
| `FEATURES_TELEGRAM` | `false` |  |
| `FEATURES_BULK_OPS` | `false` | При true монтируется роутер /api/bulk-operations/* (в PR-1 — только stub /ping → 501). |
| `AI_PROVIDER` | `heuristic` | AI provider: anthropic | heuristic (heuristic = no external LLM, formula-based) |

### Frontend (`frontend/.env`)

| Переменная | Значение | Описание |
|-----------|---------|----------|
| `VITE_API_URL` | `/api` |  |
| `VITE_FEATURES_ADVANCED_SEARCH` | `false` | бэкенд вернёт 404 на /api/search/*. |
| `VITE_FEATURES_BULK_OPS` | `false` | а бэкенд вернёт 404 на /api/bulk-operations/*. См. docs/tz/TTBULK-1.md §13.1. |
<!-- AUTO-GENERATED:END:env -->

<!-- AUTO-GENERATED:START:makefile -->
> ⚡ Авто-сгенерировано из `Makefile`. Запуск: `make <команда>`

**First time setup**

| Команда | Описание |
|---------|----------|
| `make setup` |  |

**Infrastructure (Postgres + Redis)**

| Команда | Описание |
|---------|----------|
| `make infra` |  |

**Dev servers**

| Команда | Описание |
|---------|----------|
| `make backend` |  |
| `make frontend` |  |
| `make dev` | Start both backend and frontend (backend in background) |

**Database**

| Команда | Описание |
|---------|----------|
| `make seed` |  |
| `make db-push` |  |
| `make db-reset` |  |
| `make db-studio` |  |

**Documentation**

| Команда | Описание |
|---------|----------|
| `make docs` |  |

**Quality**

| Команда | Описание |
|---------|----------|
| `make test` |  |
| `make audit` | Security: dependency vulnerabilities (run periodically and before release) |
| `make test-cov` |  |
| `make lint` |  |

**Git workflow**

| Команда | Описание |
|---------|----------|
| `make sync` |  |
| `make pr` |  |
| `make ship` |  |
| `make merge` |  |
| `make branches` |  |

**Cleanup**

| Команда | Описание |
|---------|----------|
| `make stop` |  |
| `make clean` |  |
<!-- AUTO-GENERATED:END:makefile -->

<!-- AUTO-GENERATED:START:docker -->
> ⚡ Авто-сгенерировано из `docker-compose.yml`
> Запуск: `make infra` (только БД+Redis) или `docker compose up -d` (все сервисы)

| Сервис | Image | Порты | Профиль |
|--------|-------|-------|---------|
| `postgres` | `postgres:16-alpine` | 5432:5432 | default |
| `redis` | `redis:7-alpine` | 6379:6379 | default |
| `mcp-tasktime` | `evilfreelancer/openapi-to-mcp:latest` | 3002:3000 | backend |
<!-- AUTO-GENERATED:END:docker -->
