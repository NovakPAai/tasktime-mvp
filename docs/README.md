# Flow Universe — Документация / Documentation

> RU: Мастер-индекс всей документации проекта
> EN: Master index of all project documentation

---

## Структура / Structure

```
docs/
├── README.md               ← this file
├── CHANGELOG.md            ← auto-updated on every merge to main
│
├── architecture/           # Technical docs (EN)
│   ├── overview.md         ← START HERE for new developers
│   ├── data-model.md       ← Prisma models, enums, relationships
│   ├── backend-modules.md  ← All 14 backend modules with route tables
│   ├── frontend-architecture.md ← Pages, routing, Zustand stores
│   └── security.md         ← RBAC, JWT, audit, ФЗ-152
│
├── api/
│   └── reference.md        ← Full REST API reference (all endpoints)
│
├── guides/                 # For developers (RU + EN)
│   ├── getting-started.md  ← 5-minute local setup
│   ├── contributing.md     ← Branch naming, commit format, PR process
│   ├── doc-workflow.md     ← How the doc system works (READ THIS)
│   ├── deployment.md       ← Staging + production deploy
│   ├── testing.md          ← Test stack, coverage, TDD workflow
│   └── operations.md       ← Health checks, logs, rollback, DB ops
│
├── user-manual/            # For end users (RU)
│   ├── overview.md         ← What is Flow Universe, quick start by role
│   ├── roles/              ← Admin, Manager, User, Viewer guides
│   └── features/           ← Per-feature user guides
│       ├── tasks.md        ← Issues, types, statuses, hierarchy
│       ├── kanban.md       ← Kanban board
│       ├── sprints.md      ← Sprint lifecycle
│       ├── time-tracking.md ← Timer, manual entry, My Time page
│       ├── reports.md      ← Reports, audit log
│       ├── admin-panel.md  ← Admin panel tabs
│       ├── custom-fields.md ← Configurable fields
│       └── ai-assistant.md ← AI estimation and decomposition
│
├── integrations/
│   ├── gitlab.md           ← GitLab webhook (auto-status updates)
│   └── telegram.md         ← Telegram bot (planned)
│
├── design-system/
│   ├── overview.md         ← Tokens, theme, typography, components
│   └── storybook.md        ← Component catalog, visual regression
│
├── decisions/
│   └── 001-tech-stack.md   ← ADR: TypeScript, React, Prisma, PostgreSQL
│
└── (legacy)
    ├── RU/                 ← Old docs, partially outdated
    ├── ENG/                ← Old docs, partially outdated
    ├── plans/              ← Historical sprint planning docs
    └── archive/            ← Archived reference material
```

---

## RU: С чего начать

| Кто вы | Читайте сначала |
|--------|----------------|
| Новый разработчик | [guides/getting-started.md](guides/getting-started.md) |
| Разработчик-контрибьютор | [guides/contributing.md](guides/contributing.md) + [guides/doc-workflow.md](guides/doc-workflow.md) |
| Архитектор / тимлид | [architecture/overview.md](architecture/overview.md) |
| DevOps / деплой | [guides/deployment.md](guides/deployment.md) + [guides/operations.md](guides/operations.md) |
| PM / менеджер | [user-manual/overview.md](user-manual/overview.md) |
| Пользователь (разработчик) | [user-manual/roles/user.md](user-manual/roles/user.md) |
| CIO / руководитель | [user-manual/roles/viewer.md](user-manual/roles/viewer.md) |
| Интеграция с GitLab | [integrations/gitlab.md](integrations/gitlab.md) |

---

## EN: Where to start

| Who you are | Start here |
|-------------|-----------|
| New developer | [guides/getting-started.md](guides/getting-started.md) |
| Contributing developer | [guides/contributing.md](guides/contributing.md) + [guides/doc-workflow.md](guides/doc-workflow.md) |
| Architect / tech lead | [architecture/overview.md](architecture/overview.md) |
| DevOps / deployer | [guides/deployment.md](guides/deployment.md) + [guides/operations.md](guides/operations.md) |
| API integrator | [api/reference.md](api/reference.md) |

---

## Как обновлять документацию / How to update docs

1. **Автоматически** — CHANGELOG и API-доки обновляются после каждого мержа в `main` (GitHub Actions)
2. **Вручную** — при создании PR заполни чеклист документации (шаблон появляется автоматически)
3. **Локально** — `make docs` для проверки и обновления

Подробнее: [guides/doc-workflow.md](guides/doc-workflow.md)

---

## Демо-аккаунты (тестовая среда)

| Email | Role | Password |
|-------|------|----------|
| admin@tasktime.ru | ADMIN | password123 |
| manager@tasktime.ru | MANAGER | password123 |
| dev@tasktime.ru | USER | password123 |
| viewer@tasktime.ru | VIEWER | password123 |
