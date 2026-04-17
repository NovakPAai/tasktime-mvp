---
tags: [frontend, api, axios]
---

# Frontend — API Client

Path: `frontend/src/api/` — 27 файлов

## Структура

Каждый файл — обёртка axios для одного модуля:

| Файл | Backend модуль |
|------|---------------|
| `auth.ts` | [[Module - Auth]] |
| `issues.ts` | [[Module - Issues]] |
| `projects.ts` | [[Module - Projects]] |
| `boards.ts` | [[Module - Boards]] |
| `sprints.ts` | [[Module - Sprints]] |
| `time.ts` | [[Module - Time Tracking]] |
| `comments.ts` | [[Module - Comments]] |
| `teams.ts` | [[Module - Teams]] |
| `releases.ts` | [[Module - Releases]] |
| `workflows.ts` | [[Module - Workflows]] |
| `workflowEngine.ts` | [[Module - Workflow Engine]] |
| `customFields.ts` | [[Module - Custom Fields]] |
| `fieldSchemas.ts` | [[Module - Field Schemas]] |
| `links.ts` | [[Module - Issue Links]] |
| `ai.ts` | [[Module - AI]] |
| `admin.ts` | [[Module - Admin]] |
| `monitoring.ts` | [[Module - Monitoring]] |

## Axios Interceptors

- **Request**: добавляет `Authorization: Bearer {token}`
- **Response 401**: автоматически вызывает `POST /api/auth/refresh`
- После успешного refresh — повторяет оригинальный запрос

## Связи

- [[Frontend - Stores]] — результаты API → сторы
- [[Frontend Architecture]] — как организован frontend
