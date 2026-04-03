# TaskTime MVP

**Flow Universe** — система управления проектами и задачами, созданная AI-агентом на вайб-кодинге. Полнофункциональный MVP для проверки гипотезы.

## Краткая справка

| Что | Технология |
|-----|-----------|
| **Backend** | Node.js 20 + Express 4 + TypeScript |
| **Frontend** | React 18 + Vite 6 + Ant Design 5 |
| **ORM** | Prisma 6 |
| **БД** | PostgreSQL 16 + Redis 7 |
| **Auth** | JWT + refresh tokens |
| **Статус** | MVP: управление проектами/задачами, таймер, отчёты, RBAC |

## Что реализовано

✅ **Auth & RBAC**: JWT, refresh tokens, 4 роли (ADMIN, MANAGER, USER, VIEWER)
✅ **Project Management**: проекты с ключами, иерархия задач (EPIC→STORY→TASK→SUBTASK, BUG)
✅ **Kanban Board**: статусы, drag-n-drop, сохранение порядка
✅ **Sprints**: создание, старт/закрытие, перенос между бэклогом и спринтом
✅ **Time Tracking**: таймер + ручной ввод, агрегация по дням/задачам
✅ **Comments**: CRUD, привязка к задачам
✅ **Teams & Admin**: управление командами, административные функции
✅ **Reports**: базовые отчёты по задачам и времени
✅ **Audit Log**: история всех мутаций (ФЗ-152 compliant)
✅ **Redis**: кэш и вспомогательные сценарии
✅ **Tests**: Vitest + Supertest, ~60% coverage

⏳ **Sprint 4 (в работе)**: AI-модуль (оценка, декомпозиция), GitLab webhook, Telegram-бот, polish

## Структура

```
.
├── backend/              # Express API (modular: 11 modules, auth→service→Prisma)
│   ├── src/
│   │   ├── modules/      # auth, users, projects, issues, comments, boards, sprints, time, teams, audit, admin
│   │   ├── middleware/   # RBAC, validation, audit logging
│   │   └── index.ts      # Express app
│   ├── prisma/
│   │   └── schema.prisma # ORM model
│   ├── tests/            # Vitest + Supertest
│   └── package.json
├── frontend/             # React 18 + Vite + Ant Design 5
│   ├── src/
│   │   ├── pages/        # Login, Dashboard, Projects, Project detail, Issue detail
│   │   ├── components/   # UI components
│   │   ├── store/        # Zustand state
│   │   └── App.tsx
│   └── package.json
├── docker-compose.yml    # PostgreSQL 16 + Redis 7
├── .github/workflows/    # CI/CD (4 workflows)
├── docs/RU/
│   ├── REBUILD_PLAN_V2.md  # полный план архитектуры
│   └── <другие гайды>
└── Makefile              # setup, dev, backend, frontend, lint, test
```

## Быстрый старт

### Локально (dev)

```bash
make setup   # установка зависимостей, Docker Compose, инициализация БД
make dev     # backend + frontend
```

Откройте **http://localhost:5173**

**Аккаунты:**
- admin@tasktime.ru / password123
- manager@tasktime.ru / password123
- dev@tasktime.ru / password123
- viewer@tasktime.ru / password123

### Production

```bash
# Deployment и инструкции:
docs/DEPLOYMENT_STEPS.md   # краткий гайд
.github/workflows/         # CI/CD pipelines
```

## Переменные окружения

Основные переменные в `backend/.env`:

```
DATABASE_URL=postgresql://...
JWT_SECRET=...
JWT_EXPIRES_IN=7d
NODE_ENV=development
PORT=3000
REDIS_URL=redis://...
```

## Документация

| Документ | Назначение |
|----------|-----------|
| `docs/RU/REBUILD_PLAN_V2.md` | Полный план архитектуры, доменная модель, API контракт |
| `docs/DEPLOYMENT_STEPS.md` | Развёртывание и обновления |
| `docs/RU/` | Прочие гайды (по модулям, RBAC, безопасность) |
| `.github/workflows/` | CI/CD pipelines ( 4 workflow) |

## Лицензия

Проект защищен лицензией **MIT License** © 2026 Pavel Novak.

Полный текст лицензии в файле [`LICENSE`](./LICENSE).

**Где ещё указана лицензия:**
- ✅ `LICENSE` — основной файл (стандартный способ)
- ✅ `package.json` — поле `"license": "MIT"` (для npm, ещё нужно добавить)
- ⚪ Заголовки в исходном коде (опционально, SPDX комментарии)
- ⚪ `CONTRIBUTING.md` — если будут внешние контрибьютеры

**Краткая справка по MIT:**
- ✅ Можно использовать в коммерческих целях
- ✅ Можно модифицировать и распространять
- ⚠️ Обязательно указать авторство и лицензию
- ⚠️ Используется как-есть (без гарантий)

