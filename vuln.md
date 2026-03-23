# Отчёт по безопасности — Flow Universe MVP

**Версия системы:** 0.1
**Дата анализа:** 2026-03-21
**Аналитик:** Claude Code (роль: специалист ИБ)
**Охват:** backend, frontend конфигурация, nginx, CI/CD, скрипты

---

## Методология

Анализ проводился по методологии OWASP Top 10 (2021) с учётом модели угроз для финансового сектора РФ (ФЗ-152, ГОСТ Р 57580).

Уровни риска:
- 🔴 **КРИТИЧЕСКИЙ** — прямая эксплуатация, критическое воздействие (RCE, полный захват аккаунта, утечка всех данных)
- 🟠 **ВЫСОКИЙ** — значительный риск, требует немедленного исправления
- 🟡 **СРЕДНИЙ** — умеренный риск, плановое исправление
- 🔵 **НИЗКИЙ** — минимальный риск, рекомендация

---

## CVE-TTMP-01 — Слабые дефолтные JWT-секреты

**Уровень риска:** 🔴 КРИТИЧЕСКИЙ
**Версия:** 0.1
**OWASP:** A02:2021 Cryptographic Failures

### Описание

Файл `.env.example` содержит слабые дефолтные значения:

```
JWT_SECRET="change-me-in-production"
JWT_REFRESH_SECRET="change-me-refresh-secret"
```

Если эти значения используются в production, атакующий может самостоятельно подписать произвольный JWT-токен с любым `userId` и ролью `SUPER_ADMIN`. Поскольку `verifyAccessToken()` использует `jwt.verify(token, config.JWT_SECRET)` без дополнительных проверок, такой токен будет полностью принят системой.

**Файлы:** `backend/src/shared/utils/jwt.ts:26`, `.env.example`

### Эксплуатация

```js
// Атакующий, зная секрет, создаёт токен:
jwt.sign(
  { userId: 'любой-uuid', email: 'attacker@evil.com', role: 'SUPER_ADMIN' },
  'change-me-in-production'
) // → полный доступ к системе
```

### Рекомендация

Установить криптографически стойкие секреты (минимум 32 байта, base64):

```bash
openssl rand -base64 48  # для JWT_SECRET
openssl rand -base64 48  # для JWT_REFRESH_SECRET
```

Добавить стартовую проверку в `config.ts`, которая завершает процесс при обнаружении дефолтного значения.

---

## CVE-TTMP-02 — GitLab Webhook принимает запросы без аутентификации

**Уровень риска:** 🔴 КРИТИЧЕСКИЙ
**Версия:** 0.1
**OWASP:** A07:2021 Identification and Authentication Failures

### Описание

Функция `verifyGitLabSecret()` в `webhooks.router.ts:14` содержит небезопасный фолбэк:

```typescript
function verifyGitLabSecret(req): boolean {
  const secret = process.env.GITLAB_WEBHOOK_SECRET;
  if (!secret) return true; // ← если не задан — пропускать ВСЕХ
  ...
}
```

При незаданной переменной `GITLAB_WEBHOOK_SECRET` (а это значение не обязательное) любой внешний запрос к `POST /api/webhooks/gitlab` будет принят и обработан. Атакующий может инициировать обновление статусов задач, создание комментариев от имени GitLab, изменение состояния pipeline.

**Файлы:** `backend/src/modules/webhooks/webhooks.router.ts:12-17`

### Эксплуатация

```bash
curl -X POST https://target/api/webhooks/gitlab \
  -H "Content-Type: application/json" \
  -d '{"object_kind":"merge_request","object_attributes":{"state":"merged","title":"TTMP-1"}}'
# → задача обновится без какой-либо аутентификации
```

### Рекомендация

Изменить логику: при отсутствии секрета **отклонять** запрос (fail-secure), а не пропускать:

```typescript
if (!secret) {
  // В production webhook без настроенного секрета недопустим
  return process.env.NODE_ENV !== 'production';
}
```

Добавить `GITLAB_WEBHOOK_SECRET` в обязательные переменные продакшн-конфигурации.

---

## CVE-TTMP-03 — IDOR: любой пользователь может изменить профиль другого пользователя

**Уровень риска:** 🟠 ВЫСОКИЙ
**Версия:** 0.1
**OWASP:** A01:2021 Broken Access Control

### Описание

Эндпоинт `PATCH /api/users/:id` не проверяет, является ли запрашивающий владельцем ресурса или имеет ли он привилегированную роль:

```typescript
// users.router.ts:32
router.patch('/:id', validate(updateUserDto), async (req: AuthRequest, res, next) => {
  const user = await usersService.updateUser(req.params.id as string, req.body);
  // ← нет проверки req.user.userId === req.params.id и нет requireRole()
```

Любой аутентифицированный пользователь (включая VIEWER) может изменить имя, email и другие поля любого другого пользователя, зная его UUID.

**Файлы:** `backend/src/modules/users/users.router.ts:32-39`

### Эксплуатация

```bash
# Пользователь с ролью VIEWER меняет email администратора:
curl -X PATCH https://target/api/users/<admin-uuid> \
  -H "Authorization: Bearer <viewer-token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "Hacked"}'
```

### Рекомендация

Добавить проверку: разрешать изменение только если `req.user.userId === req.params.id` ИЛИ `req.user.role` является `ADMIN`/`SUPER_ADMIN`.

---

## CVE-TTMP-04 — Отсутствие авторизации на уровне проекта при чтении задач

**Уровень риска:** 🟠 ВЫСОКИЙ
**Версия:** 0.1
**OWASP:** A01:2021 Broken Access Control

### Описание

Эндпоинты чтения задач не проверяют принадлежность пользователя к проекту:

```typescript
// issues.router.ts — только authenticate, без проверки доступа к проекту
router.get('/issues/:id', async (req, res, next) => { ... })
router.get('/issues/key/:key', async (req, res, next) => { ... })
router.get('/issues/:id/history', async (req, res, next) => { ... })
router.get('/issues/:id/children', async (req, res, next) => { ... })
router.get('/issues/search', async (req, res, next) => { ... }) // поиск по ВСЕМ проектам
```

Любой аутентифицированный пользователь может прочитать задачи из любого проекта, даже если у него нет доступа к этому проекту. Для финансовой организации это означает потенциальную утечку конфиденциальной информации между проектами разных бизнес-подразделений.

**Файлы:** `backend/src/modules/issues/issues.router.ts:23-34, 111-131`

### Рекомендация

Для каждого endpoint добавить проверку членства пользователя в проекте через `requireProjectRole()` (middleware уже существует в `rbac.ts:32`). Для поиска `GET /issues/search` — фильтровать результаты по проектам, в которых состоит пользователь.

---

## CVE-TTMP-05 — nginx работает только на HTTP, TLS не настроен

**Уровень риска:** 🟠 ВЫСОКИЙ
**Версия:** 0.1
**OWASP:** A02:2021 Cryptographic Failures

### Описание

Конфигурация nginx слушает только порт 80 (HTTP):

```nginx
# deploy/nginx/nginx.conf
server {
  listen 80;
  # нет listen 443 ssl;
  # нет ssl_certificate;
  # нет ssl_protocols TLSv1.2 TLSv1.3;
```

JWT access token, refresh token и пароли пользователей передаются в открытом тексте. Для финансового сектора (ГОСТ Р 57580, ФЗ-152) обязательна защита канала TLS 1.2+.

**Файлы:** `deploy/nginx/nginx.conf`

### Рекомендация

Настроить TLS с минимальными требованиями:
- `ssl_protocols TLSv1.2 TLSv1.3`
- `ssl_ciphers` с ECDHE+AESGCM профилями
- Добавить `add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always`
- HTTP → HTTPS редирект (301)

---

## CVE-TTMP-06 — Отсутствие блокировки аккаунта при брутфорсе

**Уровень риска:** 🟠 ВЫСОКИЙ
**Версия:** 0.1
**OWASP:** A07:2021 Identification and Authentication Failures

### Описание

Механизм блокировки аккаунта при множестве неудачных попыток входа отсутствует. Rate limiting существует только на уровне nginx (5r/s для `/api/auth/`), но:
1. Если backend доступен напрямую на порту 3000 (минуя nginx) — защиты нет совсем
2. Nginx rate limit ограничивает частоту, но не общее количество попыток — медленный брутфорс (1 запрос/сек) не блокируется
3. При горизонтальном масштабировании за балансировщиком nginx-счётчик не глобальный

Пароль минимальной длины 8 символов без требований к сложности — пространство перебора ограничено.

**Файлы:** `backend/src/modules/auth/auth.service.ts:49-87`, `deploy/nginx/nginx.conf:1-3`

### Рекомендация

Реализовать счётчик неудачных попыток в Redis с TTL, блокировку после N попыток (рекомендуется 5-10) с экспоненциальной задержкой или временной блокировкой аккаунта. Уведомление владельца аккаунта по email при блокировке.

---

## CVE-TTMP-07 — Redis без аутентификации

**Уровень риска:** 🟠 ВЫСОКИЙ
**Версия:** 0.1
**OWASP:** A02:2021 Cryptographic Failures

### Описание

Redis запускается без пароля и без TLS:

```yaml
# docker-compose.yml (по данным анализа)
redis:
  image: redis:7-alpine
  # нет: command: redis-server --requirepass <password>
  # нет: --tls-port, --tls-cert-file
```

В Redis хранятся сессионные данные пользователей (email, role, timestamps). Любой, кто имеет сетевой доступ к контейнеру или хосту, может прочитать и модифицировать данные сессий, что позволяет подменить роль пользователя в сессии.

**Файлы:** `docker-compose.yml`, `backend/src/shared/redis.ts`

### Рекомендация

В production:
- Установить `requirepass` в Redis конфигурации
- Bind Redis только на localhost или внутреннюю Docker-сеть
- Использовать TLS для Redis-соединения
- Передавать пароль через env-переменную `REDIS_PASSWORD`

---

## CVE-TTMP-08 — Bulk-операции над задачами без ограничения размера

**Уровень риска:** 🟠 ВЫСОКИЙ
**Версия:** 0.1
**OWASP:** A05:2021 Security Misconfiguration / DoS

### Описание

Эндпоинты `POST /projects/:projectId/issues/bulk` и `DELETE /projects/:projectId/issues/bulk` принимают массив `issueIds` без ограничения по количеству элементов:

```typescript
// issues.router.ts:206
const { issueIds, status, assigneeId } = req.body as {
  issueIds?: string[];
  // нет проверки issueIds.length <= MAX_BULK_SIZE
```

Пользователь с ролью MANAGER может отправить запрос с 100 000 UUID, что вызовет длинную транзакцию в PostgreSQL, деградацию производительности и потенциальный отказ в обслуживании (DoS). `DELETE` bulk работает аналогично — ADMIN может случайно или намеренно удалить весь проект одним запросом.

**Файлы:** `backend/src/modules/issues/issues.router.ts:201-261`

### Рекомендация

Добавить ограничение через Zod:
```typescript
issueIds: z.array(z.string().uuid()).min(1).max(100)
```

Добавить транзакционный таймаут для bulk-операций.

---

## CVE-TTMP-09 — Swagger/OpenAPI публично доступен без аутентификации

**Уровень риска:** 🟡 СРЕДНИЙ
**Версия:** 0.1
**OWASP:** A05:2021 Security Misconfiguration

### Описание

Эндпоинты документации API не защищены:

```typescript
// app.ts:58-62
app.get('/api/docs/json', (_req, res) => { res.json(swaggerSpec); });
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
```

Полная спецификация API (все endpoints, параметры, схемы данных, включая внутренние) доступна анонимному пользователю. Это существенно упрощает разведку (OSINT) для атакующего: он получает полную карту атаки без необходимости фаззинга.

**Файлы:** `backend/src/app.ts:57-62`

### Рекомендация

Ограничить `/api/docs` через `authenticate` + `requireRole('ADMIN', 'MANAGER')`, либо закрыть через nginx в production (`deny all` для `/api/docs` из внешних IP).

---

## CVE-TTMP-10 — /api/features раскрывает конфигурацию системы

**Уровень риска:** 🟡 СРЕДНИЙ
**Версия:** 0.1
**OWASP:** A05:2021 Security Misconfiguration

### Описание

Эндпоинт `GET /api/features` возвращает конфигурацию feature flags без аутентификации:

```typescript
// app.ts:53-55
app.get('/api/features', (_req, res) => {
  res.json(features); // ai: true, gitlab: true, AI_PROVIDER: 'anthropic', ...
});
```

Атакующий получает информацию о включённых интеграциях, AI провайдере, наличии GitLab-интеграции — что позволяет сфокусировать атаку на конкретных векторах (например, webhook endpoint при `gitlab: true`).

**Файлы:** `backend/src/app.ts:53-55`

### Рекомендация

Добавить `authenticate` middleware. При необходимости фронтенду знать feature flags до логина — возвращать только подмножество нечувствительных флагов.

---

## CVE-TTMP-11 — Отсутствует Content-Security-Policy (CSP)

**Уровень риска:** 🟡 СРЕДНИЙ
**Версия:** 0.1
**OWASP:** A03:2021 Injection (XSS)

### Описание

nginx не устанавливает заголовок `Content-Security-Policy`. Helmet на backend устанавливает CSP для API-ответов, но фронтенд отдаётся через nginx как статика без CSP. При наличии XSS-уязвимости в React-компонентах (например, через `dangerouslySetInnerHTML` или небезопасный рендер markdown) отсутствие CSP позволяет выполнить произвольный JavaScript.

Текущие заголовки nginx:
```nginx
add_header X-Frame-Options "SAMEORIGIN";
add_header X-Content-Type-Options "nosniff";
# Content-Security-Policy отсутствует
```

**Файлы:** `deploy/nginx/nginx.conf:13-16`

### Рекомендация

```nginx
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://api.anthropic.com; frame-ancestors 'none';" always;
```

---

## CVE-TTMP-12 — Слабая политика паролей

**Уровень риска:** 🟡 СРЕДНИЙ
**Версия:** 0.1
**OWASP:** A07:2021 Identification and Authentication Failures

### Описание

Валидация пароля при регистрации проверяет только длину:

```typescript
// auth.dto.ts:5
password: z.string().min(8).max(128)
```

Пароль `12345678` или `aaaaaaaa` успешно проходит проверку. Для финансового сектора требования к сложности пароля регламентированы: ГОСТ Р 57580.1-2017 требует наличия букв разного регистра, цифр и спецсимволов. ФЗ-152 предполагает соответствие лучшим практикам защиты ПДн.

**Файлы:** `backend/src/modules/auth/auth.dto.ts:5`

### Рекомендация

```typescript
password: z.string()
  .min(8).max(128)
  .regex(/[A-Z]/, 'Минимум одна заглавная буква')
  .regex(/[a-z]/, 'Минимум одна строчная буква')
  .regex(/[0-9]/, 'Минимум одна цифра')
  .regex(/[^A-Za-z0-9]/, 'Минимум один специальный символ')
```

Дополнительно: проверка по словарю распространённых паролей (библиотека `zxcvbn`).

---

## CVE-TTMP-13 — Логирование пользовательских URL через Web Vitals endpoint

**Уровень риска:** 🟡 СРЕДНИЙ
**Версия:** 0.1
**OWASP:** A09:2021 Security Logging and Monitoring Failures

### Описание

Эндпоинт `POST /api/monitoring/page-metrics` принимает произвольный `url` из тела запроса фронтенда и записывает его в `console.log`:

```typescript
// monitoring.router.ts:35-39
const { url, metrics } = req.body as { url: string; metrics: unknown };
console.log(`[Web Vitals] ${authReq.user?.email ?? 'unknown'} - ${url}`, metrics);
```

URL может содержать чувствительные данные: токены в query params, идентификаторы, фрагменты. Данные попадают в системные логи без санации. Логи в `console.log` могут агрегироваться внешними системами (ELK, CloudWatch) и храниться дольше, чем требует политика хранения данных (ФЗ-152).

Кроме того, `metrics: unknown` принимается без валидации — потенциал для log injection.

**Файлы:** `backend/src/modules/monitoring/monitoring.router.ts:35-39`

### Рекомендация

Не логировать URL и метрики от пользователя напрямую. Санировать входные данные, добавить Zod-схему для `metrics`. Если логирование необходимо — использовать структурированный logger с настраиваемым уровнем, не `console.log`.

---

## CVE-TTMP-14 — Параметр `minutes` в Monitoring API без валидации диапазона

**Уровень риска:** 🟡 СРЕДНИЙ
**Версия:** 0.1
**OWASP:** A03:2021 Injection

### Описание

Эндпоинт `GET /api/monitoring/endpoints` принимает параметр `minutes` без проверки диапазона:

```typescript
// monitoring.router.ts:17
const minutes = req.query.minutes ? parseInt(req.query.minutes as string) : 10;
```

`parseInt` возвращает `NaN` при некорректном вводе, `Infinity` не проверяется. Передача `minutes=99999999` или `minutes=NaN` может вызвать избыточное потребление памяти при выборке метрик или непредвиденное поведение в `monitoringService.getMetrics()`.

**Файлы:** `backend/src/modules/monitoring/monitoring.router.ts:17`

### Рекомендация

```typescript
const minutes = Math.min(Math.max(parseInt(req.query.minutes as string) || 10, 1), 1440);
```

---

## CVE-TTMP-15 — Потенциальный IP-spoofing через X-Forwarded-For

**Уровень риска:** 🔵 НИЗКИЙ
**Версия:** 0.1
**OWASP:** A05:2021 Security Misconfiguration

### Описание

nginx добавляет заголовки `X-Real-IP` и `X-Forwarded-For` к проксируемым запросам. Backend записывает `ipAddress` в `audit_log` для ФЗ-152 compliance. Если перед nginx стоит ещё один прокси или CDN, клиент может передать поддельный `X-Forwarded-For`, который дойдёт до audit_log:

```
Клиент → [X-Forwarded-For: 1.2.3.4] → nginx → [X-Forwarded-For: 1.2.3.4, nginx-ip] → backend
```

В audit_log фиксируется поддельный IP, что нарушает юридическую значимость журнала аудита.

**Файлы:** `deploy/nginx/nginx.conf:33, 43`, `backend/src/shared/middleware/audit.ts`

### Рекомендация

В Express установить `app.set('trust proxy', 1)` только если nginx — единственный доверенный proxy. Настроить `real_ip_header` и `set_real_ip_from` в nginx для правильного определения IP клиента.

---

## CVE-TTMP-16 — Credentials могут попасть в bash history

**Уровень риска:** 🔵 НИЗКИЙ
**Версия:** 0.1
**OWASP:** A02:2021 Cryptographic Failures

### Описание

Скрипты `backend/scripts/sync-issue-with-battle.mjs` и `backend/scripts/rotate-password.ts` принимают чувствительные данные через аргументы командной строки и переменные окружения:

```bash
# Из CLAUDE.md — пример использования:
TASKTIME_BASE_URL=http://5.129.242.171 TASKTIME_ACCESS_TOKEN=<token> node scripts/sync-issue-with-battle.mjs pull TTMP-82
```

Токен доступа и другие credentials могут быть видны в `ps aux`, `history`, системных логах и инструментах мониторинга процессов.

**Файлы:** `backend/scripts/sync-issue-with-battle.mjs`, `backend/scripts/rotate-password.ts`

### Рекомендация

Хранить credentials только в `.env`-файлах (не в аргументах). Использовать `HISTCONTROL=ignorespace` в shell-сессиях при работе с секретами. Для production — использовать vault-решения (HashiCorp Vault, AWS Secrets Manager).

---

## CVE-TTMP-17 — console.error выводит полный stack trace в production

**Уровень риска:** 🔵 НИЗКИЙ
**Версия:** 0.1
**OWASP:** A09:2021 Security Logging and Monitoring Failures

### Описание

Обработчик ошибок выводит полный объект ошибки через `console.error`:

```typescript
// error-handler.ts:21
console.error('Unhandled error:', err);
```

В production это может включать stack trace с путями файловой системы, версиями пакетов, внутренней архитектурой. Если логи агрегируются и доступны через `/api/monitoring`, эта информация может стать вектором разведки.

**Файлы:** `backend/src/shared/middleware/error-handler.ts:21`

### Рекомендация

Использовать структурированный logger (например, `pino`) с уровнями, который в production выводит только `message` без stack trace в стандартный вывод, доступный внешним системам.

---

## Сводная таблица

| ID | Уязвимость | Уровень | OWASP | Файл |
|----|-----------|---------|-------|------|
| CVE-TTMP-01 | Слабые дефолтные JWT-секреты | 🔴 КРИТИЧЕСКИЙ | A02 | `.env.example`, `jwt.ts` |
| CVE-TTMP-02 | Webhook без аутентификации (fail-open) | 🔴 КРИТИЧЕСКИЙ | A07 | `webhooks.router.ts` |
| CVE-TTMP-03 | IDOR: изменение профиля чужого пользователя | 🟠 ВЫСОКИЙ | A01 | `users.router.ts` |
| CVE-TTMP-04 | Нет авторизации на уровне проекта при чтении задач | 🟠 ВЫСОКИЙ | A01 | `issues.router.ts` |
| CVE-TTMP-05 | nginx без TLS (HTTP-only) | 🟠 ВЫСОКИЙ | A02 | `nginx.conf` |
| CVE-TTMP-06 | Нет блокировки аккаунта при брутфорсе | 🟠 ВЫСОКИЙ | A07 | `auth.service.ts` |
| CVE-TTMP-07 | Redis без аутентификации | 🟠 ВЫСОКИЙ | A02 | `docker-compose.yml` |
| CVE-TTMP-08 | Bulk-операции без ограничения размера | 🟠 ВЫСОКИЙ | A05 | `issues.router.ts` |
| CVE-TTMP-09 | Swagger публично доступен | 🟡 СРЕДНИЙ | A05 | `app.ts` |
| CVE-TTMP-10 | /api/features раскрывает конфигурацию | 🟡 СРЕДНИЙ | A05 | `app.ts` |
| CVE-TTMP-11 | Отсутствует Content-Security-Policy | 🟡 СРЕДНИЙ | A03 | `nginx.conf` |
| CVE-TTMP-12 | Слабая политика паролей | 🟡 СРЕДНИЙ | A07 | `auth.dto.ts` |
| CVE-TTMP-13 | Логирование пользовательских URL | 🟡 СРЕДНИЙ | A09 | `monitoring.router.ts` |
| CVE-TTMP-14 | Параметр minutes без валидации диапазона | 🟡 СРЕДНИЙ | A03 | `monitoring.router.ts` |
| CVE-TTMP-15 | IP-spoofing через X-Forwarded-For | 🔵 НИЗКИЙ | A05 | `nginx.conf` |
| CVE-TTMP-16 | Credentials в bash history | 🔵 НИЗКИЙ | A02 | `scripts/` |
| CVE-TTMP-17 | Stack trace в production логах | 🔵 НИЗКИЙ | A09 | `error-handler.ts` |

---

## Что реализовано корректно

- ✅ Refresh token rotation (идемпотентная, race-condition safe — `deleteMany` с проверкой `count`)
- ✅ bcryptjs с 12 раундами соли
- ✅ SHA-256 хеш refresh token в БД (не хранится в открытом виде)
- ✅ Zod валидация на всех входящих DTO
- ✅ RBAC 5-уровневая система (VIEWER, USER, MANAGER, ADMIN, SUPER_ADMIN)
- ✅ Helmet.js для security headers на API-ответах
- ✅ Prisma ORM — параметризованные запросы, SQL injection исключён
- ✅ Audit log с IP, userAgent, userId — основа для ФЗ-152
- ✅ Общие сообщения об ошибках auth ("Invalid credentials", без раскрытия причины)
- ✅ Проверка `isActive` при логине и refresh
- ✅ Feature flags для отключения GitLab/AI в production
- ✅ Rate limiting для auth-эндпоинтов в nginx

---

## Приоритет исправлений

### Немедленно (до production-деплоя)
1. **CVE-TTMP-01** — Сменить JWT-секреты (< 1 час работы)
2. **CVE-TTMP-02** — Исправить fail-open в webhook (< 30 мин)
3. **CVE-TTMP-05** — Настроить TLS в nginx (< 2 часа)

### Sprint 6 (плановые)
4. **CVE-TTMP-03** — IDOR в users.router
5. **CVE-TTMP-04** — Авторизация на уровне проекта для issues
6. **CVE-TTMP-06** — Брутфорс-защита через Redis counter
7. **CVE-TTMP-07** — Redis requirepass
8. **CVE-TTMP-08** — Лимит bulk-операций

### Backlog
9. CVE-TTMP-09 — Защита Swagger
10. CVE-TTMP-10 — Защита /features
11. CVE-TTMP-11 — CSP header
12. CVE-TTMP-12 — Политика паролей
13. CVE-TTMP-13..17 — Прочие средние/низкие
