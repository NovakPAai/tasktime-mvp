---
tags: [module, users]
---

# Module — Users

Path: `backend/src/modules/users/`

## Роуты

Большинство user-управления через [[Module - Admin]].

Модуль отвечает за:
- User CRUD (service-уровень)
- Смену пароля (policy enforcement)
- `mustChangePassword` флаг

## Связи

- [[Model - User]] — Prisma-модель
- [[Module - Auth]] — логин/регистрация
- [[Module - Admin]] — admin endpoints для users
- [[RBAC & Permissions]] — роли пользователя
