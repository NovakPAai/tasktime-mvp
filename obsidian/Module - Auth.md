---
tags: [module, auth, security]
---

# Module — Auth

Path: `backend/src/modules/auth/`

## Роуты (`/api/auth`)

| Method | Path | Описание |
|--------|------|---------|
| GET | `/registration-status` | Открыта ли регистрация |
| POST | `/register` | Регистрация (email, password, name) |
| POST | `/login` | Логин → accessToken + refreshToken |
| POST | `/refresh` | Обновить токен |
| POST | `/logout` | Выйти (инвалидировать refresh) |
| GET | `/me` | Текущий пользователь |
| POST | `/change-password` | Смена пароля |

## Логика

- `bcryptjs` — хэш пароля (salt rounds 10)
- `jsonwebtoken` — access (15min) + refresh (7d)
- При logout: refresh-токен → [[Redis Cache]] blacklist
- `mustChangePassword` flag — принудительная смена при первом входе

## DTO (Zod)

- `RegisterDto` — email, password, name
- `LoginDto` — email, password
- `RefreshDto` — refreshToken
- `ChangePasswordDto` — currentPassword, newPassword

## Связи

- [[Model - User]] — сущность пользователя
- [[Model - RefreshToken]] — хранение refresh-токенов в БД
- [[RBAC & Permissions]] — роли после логина
- [[Redis Cache]] — blacklist токенов
- [[Frontend - Stores]] — `auth.store.ts`
