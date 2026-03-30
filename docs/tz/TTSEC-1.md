# TTSEC-1: ИБ — Устранение уязвимостей безопасности v0.1 (17 CVE)

> **Тип:** EPIC · **Приоритет:** CRITICAL · **Проект:** TTSEC
> **Статус:** OPEN · **Оценка:** ~21ч (2ч анализ + 12ч backend + 1ч frontend + 4ч тесты + 2ч ревью)

---

## Резюме

Эпик по устранению 17 уязвимостей безопасности, обнаруженных при аудите кодовой базы TaskTime MVP. Уязвимости покрывают OWASP Top 10: инъекции, аутентификация, авторизация, конфигурация, логирование.

---

## CVE Matrix

### Очередь 1: CRITICAL (блокеры для production)

| # | CVE | Файл | Описание |
|---|-----|------|----------|
| CVE-04 | IDOR | `issues.router.ts`, `issues.service.ts` | GET/PATCH `/issues/:id` без проверки ownership — любой аутентифицированный пользователь может читать/редактировать любую задачу |
| CVE-05 | Project RBAC | `rbac.ts`, `issues.router.ts` | Middleware `requireProjectRole()` определён, но НЕ ИСПОЛЬЗУЕТСЯ на issue endpoints |

### Очередь 2: HIGH

| # | CVE | Файл | Описание |
|---|-----|------|----------|
| CVE-02 | GitLab Webhook | `webhooks.router.ts:14` | `if (!secret) return true` — если `GITLAB_WEBHOOK_SECRET` не задан, webhook принимает все запросы (fail-open) |
| CVE-03 | Nginx TLS | `nginx.conf` | Только HTTP (port 80), нет HTTPS/TLS конфигурации |
| CVE-07 | Redis Auth | `docker-compose.yml`, `redis.ts` | Redis без пароля, доступен по `6379` без аутентификации |

### Очередь 3: MEDIUM

| # | CVE | Файл | Описание |
|---|-----|------|----------|
| CVE-01 | JWT Secrets | `config.ts`, `jwt.ts` | Минимум 10 символов, нет ротации, `.env.example` содержит placeholder |
| CVE-06 | Brute Force | `auth.router.ts` | Только nginx rate limit (5r/s), нет application-level lockout |
| CVE-08 | Bulk Limits | `issues.router.ts` | Массив `issueIds` без ограничения размера |
| CVE-09 | Swagger | `app.ts:67-72` | `/api/docs` и `/api/docs/json` публичны, раскрывают всю API схему |
| CVE-10 | CSP | `nginx.conf` | Отсутствует `Content-Security-Policy` header |
| CVE-11 | Password | `auth.router.ts` | Только 8 символов минимум, нет проверки сложности |
| CVE-13 | Search Limit | `issues.router.ts:24` | `/issues/search` без лимита пагинации |
| CVE-16 | Refresh Rate | `auth.router.ts:44` | `/auth/refresh` без rate limit |

### Очередь 4: LOW

| # | CVE | Файл | Описание |
|---|-----|------|----------|
| CVE-12 | Logging | `audit.ts`, `error-handler.ts` | Возможна утечка sensitive data в `details` поле audit_log и `console.error()` |
| CVE-14 | Cookies | `app.ts:50` | `cookieParser()` без секрета (unsigned cookies) |
| CVE-15 | CORS | `app.ts:47` | `CORS_ORIGIN` может содержать wildcard |
| CVE-17 | Audit Singleton | `audit.ts:4` | Новый `PrismaClient()` на каждый audit — утечка соединений |

---

## Затронутые файлы (20)

### Backend core
- `backend/src/config.ts` — валидация секретов
- `backend/src/app.ts` — CORS, cookies, Swagger
- `backend/src/shared/utils/jwt.ts` — JWT sign/verify
- `backend/src/shared/redis.ts` — Redis client

### Middleware
- `backend/src/shared/middleware/auth.ts` — JWT auth
- `backend/src/shared/middleware/rbac.ts` — RBAC (requireRole, requireProjectRole)
- `backend/src/shared/middleware/audit.ts` — audit logging
- `backend/src/shared/middleware/error-handler.ts` — error handling

### Modules
- `backend/src/modules/auth/auth.router.ts` — login, register, refresh, change-password
- `backend/src/modules/auth/auth.service.ts` — auth logic
- `backend/src/modules/auth/auth.dto.ts` — validation schemas
- `backend/src/modules/issues/issues.router.ts` — issue CRUD (IDOR, bulk, search)
- `backend/src/modules/issues/issues.service.ts` — issue business logic
- `backend/src/modules/webhooks/webhooks.router.ts` — GitLab webhook

### Infrastructure
- `deploy/nginx/nginx.conf` — TLS, CSP, rate limiting
- `docker-compose.yml` — Redis password

---

## Риски

1. **IDOR фикс ломает frontend** (MEDIUM) — ownership check на `/issues/:id` может заблокировать frontend, который сейчас обращается без project context → проверить все `api.get('/issues/${id}')` вызовы
2. **TLS требует сертификат** (HIGH) — конфиг подготовить, но применить только при наличии Let's Encrypt на VPS
3. **Redis password** (LOW) — обновить `REDIS_URL` и `docker-compose.yml` одновременно

---

## Plan of Attack

### Phase 1: CRITICAL (CVE-04, CVE-05)
- Добавить `requireProjectRole()` на все issue CRUD routes
- Добавить ownership/membership check в `issuesService.getIssue()` и `updateIssue()`
- Проверить frontend API-вызовы на совместимость

### Phase 2: HIGH (CVE-02, CVE-03, CVE-07)
- GitLab webhook: `if (!secret) return false` (fail-closed)
- Nginx: подготовить TLS конфиг (443, ssl_protocols, ssl_ciphers)
- Redis: `requirepass` + обновить REDIS_URL

### Phase 3: MEDIUM (CVE-01, CVE-06, CVE-08-11, CVE-13, CVE-16)
- JWT: минимум 32 символа, crash при старте если < 32
- Brute force: account lockout (Redis counter, 5 попыток → 15 min ban)
- Bulk: `issueIds.length > 100` → 400
- Swagger: `requireRole('ADMIN')` middleware в production
- CSP: `Content-Security-Policy: default-src 'self'; ...`
- Password: Zod regex (1 uppercase + 1 digit + 8 chars)
- Search: `take: Math.min(limit, 50)`
- Refresh rate limit: nginx zone или app-level

### Phase 4: LOW (CVE-12, CVE-14, CVE-15, CVE-17)
- Audit: sanitize `details` (удалить password, token поля)
- Cookies: `cookieParser(config.COOKIE_SECRET)`
- CORS: explicit whitelist, не wildcard
- Audit singleton: `import { prisma } from '../prisma'`

---

*Сгенерировано: 2026-03-26 · Claude Code · /tz TTSEC-1*
