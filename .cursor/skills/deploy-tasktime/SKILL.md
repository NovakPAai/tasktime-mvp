# Skill: deploy-tasktime

Цель: описать базовый lifecycle развёртывания и диагностики Flow Universe (dev/staging/prod) с учётом сети и доступности.

## 1. Dev-окружение (локально)

- Требования:
  - Node.js 20, Docker + Docker Compose, доступ к интернету для установки зависимостей.
- Команды:
  - `make setup` — установка зависимостей, подготовка БД (Prisma migrations/seed).
  - `make dev` — запуск backend + frontend + Postgres + Redis (по текущему Makefile).
- Проверка:
  - Frontend: `http://localhost:5173` открывает login‑страницу.
  - Backend: `GET /api/health` (или аналогичный health‑endpoint, если есть) возвращает `200`.

## 2. Staging/Prod (Docker / VPS)

- Базовая модель:
  - Один контейнер с Node.js + backend + собранный frontend (Vite build).
  - Отдельный контейнер с PostgreSQL 16.
  - Опционально Redis 7.
- Минимальные шаги:
  - Поднять БД (PostgreSQL 16), прогнать Prisma migrations.
  - Собрать frontend: `npm run build` в frontend.
  - Запустить backend в prod‑режиме.
  - Настроить reverse proxy (Nginx/аналог) с HTTPS и пробросом `/api/*` на backend.

## 3. CI/CD (минимальный шаблон)

- Любой pipeline должен содержать шаги:
  1. `npm ci` / `pnpm install --frozen-lockfile`.
  2. Линтеры и тесты (`npm test` / `pnpm test`).
  3. Prisma migrate (для миграций в staging/prod).
  4. Build frontend + backend.
  5. Деплой артефактов/контейнеров на целевую среду.
- Нельзя деплоить в prod с упавшими тестами или миграциями.

## 4. Диагностика доступности (инфраструктура)

- Если приложение «не открывается»:
  - Проверить, что контейнеры запущены (`docker ps`).
  - Проверить порты:
    - frontend (по умолчанию 5173 в dev),
    - backend (порт из env),
    - Postgres (5432),
    - Redis (6379).
  - Проверить, что health‑endpoint backend отвечает локально (`curl http://localhost:<port>/api/health`).
- Если снаружи недоступно:
  - Проверить firewall/SG: открыт ли внешний порт.
  - Проверить DNS/домен (если используется).
  - Если есть reverse proxy — логи Nginx/аналог.

## 5. Особенности целевых ОС (кратко)

- Dev/staging: Ubuntu 22.04 LTS.
- Prod: ориентир на Astra Linux SE 1.7+ и Red OS 7.3+.
- Важное:
  - Systemd‑юниты для сервисов, или запуск через контейнеры под управлением оркестратора.
  - Настройки времени и локали (важно для тайм‑логов и аудита).

