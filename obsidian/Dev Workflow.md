---
tags: [dev, workflow, commands]
---

# Dev Workflow

## Запуск

```bash
make dev        # postgres + redis + backend (:3000) + frontend (:5173)
make seed       # залить demo данные
make test       # backend тесты (Vitest + Supertest)
```

## Seed пользователи

| Email | Пароль | Роль |
|-------|--------|------|
| admin@tasktime.ru | password123 | SUPER_ADMIN |
| manager@tasktime.ru | password123 | MANAGER |
| dev@tasktime.ru | password123 | USER |
| viewer@tasktime.ru | password123 | VIEWER |

Seed проекты: DEMO, BACK

## База данных

```bash
cd backend && npx prisma db push        # применить schema без миграции
cd backend && npx prisma migrate dev    # создать и применить миграцию
cd backend && npx prisma studio         # GUI для БД
```

## Ветки и коммиты

| Участник | Claude Code | Cursor |
|---------|------------|--------|
| jackrescuer-gif | `claude/jack-*` | `cursor/jack-*` |
| St1tcher86 | `claude/alex-*` | `cursor/alex-*` |

```bash
make sync   # fetch + rebase на origin/main
make pr     # push + create PR
make ship   # sync → lint → push → PR
make merge  # squash-merge PR + удалить ветку
```

## Деплой

- Прямой push в `main` — запрещён (защищена)
- Флоу: feature branch → PR → CI green → approve → squash merge
- Скрипты: `deploy/scripts/deploy.sh`, `deploy/scripts/rollback.sh`
- Nginx: `deploy/nginx/` — reverse proxy + rate limit

→ [[Architecture Overview]] · [[Infra - Docker]]
