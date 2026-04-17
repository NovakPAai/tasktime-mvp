---
tags: [module, teams]
---

# Module — Teams

Path: `backend/src/modules/teams/`

## Роуты (`/api/teams`)

| Method | Path | Описание |
|--------|------|---------|
| GET | `/teams` | Список команд |
| POST | `/teams` | Создать (name, description) |
| GET | `/teams/:id` | Детали + члены |
| PATCH | `/teams/:id` | Обновить |
| DELETE | `/teams/:id` | Удалить |
| POST | `/teams/:id/members` | Добавить члена (userId, role) |
| DELETE | `/teams/:id/members/:userId` | Убрать члена |

## Типы команд в спринте

Спринт ([[Module - Sprints]]) хранит три ссылки:
- `projectTeamId` — проектная команда
- `businessTeamId` — бизнес-команда
- `flowTeamId` — flow-команда

## Связи

- [[Model - Team]] — Prisma-модель
- [[Module - Sprints]] — команды в спринте
- [[Module - Projects]] — команды проекта
- [[Model - User]] — члены команды
- [[Frontend - Pages]] — `TeamsPage`, `BusinessTeamsPage`, `FlowTeamsPage`
