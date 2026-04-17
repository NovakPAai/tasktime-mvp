---
tags: [module, links, issues]
---

# Module — Issue Links

Path: `backend/src/modules/links/`

## Роуты

| Method | Path | Описание |
|--------|------|---------|
| GET | `/links/types` | Список типов связей |
| POST | `/links/types` | Создать тип (name, outboundName, inboundName) |
| PATCH/DELETE | `/links/types/:id` | Обновить / удалить |
| GET | `/issues/:issueId/links` | Связи задачи |
| POST | `/issues/:issueId/links` | Создать связь (targetIssueId, linkTypeId) |
| DELETE | `/links/:id` | Удалить связь |

## Типы связей (IssueLinkType)

- `blocks` / `is blocked by`
- `depends on` / `is depended on by`
- `relates to` (симметричный)
- Кастомные типы через admin

## Связи

- [[Module - Issues]] — задачи-участники связи
- [[Module - Admin]] — `AdminLinkTypesPage`
- [[Database Schema]] — IssueLink, IssueLinkType
