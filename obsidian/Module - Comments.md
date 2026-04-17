---
tags: [module, comments]
---

# Module — Comments

Path: `backend/src/modules/comments/`

## Роуты (`/api/issues/:issueId/comments`)

| Method | Path | Описание |
|--------|------|---------|
| GET | `/issues/:issueId/comments` | Комментарии задачи |
| POST | `/issues/:issueId/comments` | Создать (body) |
| PATCH | `/comments/:id` | Обновить (только автор) |
| DELETE | `/comments/:id` | Удалить (автор или ADMIN) |

## Связи

- [[Module - Issues]] — комментарии привязаны к задаче
- [[Model - User]] — автор комментария
- [[Frontend - Pages]] — `IssueDetailPage`
