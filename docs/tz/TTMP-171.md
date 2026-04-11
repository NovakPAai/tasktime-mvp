# ТЗ: TTMP-171 — Сессия пользователя

**Дата:** 2026-04-07
**Тип:** TASK | **Приоритет:** MEDIUM | **Статус:** IN_PROGRESS
**Проект:** TaskTime MVP (vibe-code) (TTMP)
**Исполнитель:** Георгий Дубовик
**Автор ТЗ:** Claude Code (auto-generated)

---

## 1. Постановка задачи

Текущий механизм сессии — фиксированный TTL на JWT-токенах (access: 1h, refresh: 7d). Пользователь, оставивший браузер открытым, остаётся авторизован 7 дней вне зависимости от активности. Это не соответствует требованиям безопасности финтеха (ФЗ-152, требования ИБ к таймаутам бездействия).

Задача вводит **sliding session** — сессия живёт N минут с момента **последней активности**, а не с момента входа. Время жизни сессии — настраиваемый параметр в разделе "Система" админки, доступный только роли `SUPER_ADMIN`.

### Пользовательский сценарий

**Администратор (SUPER_ADMIN):**
1. Заходит в Админку → Система
2. Видит текущее значение тайм-аута сессии (в минутах)
3. Меняет значение → сохраняет

**Обычный пользователь:**
1. Логинится, работает в системе
2. Пока делает запросы — сессия продлевается автоматически
3. Ушёл на N+ минут без активности — следующий запрос возвращает 401, фронт перенаправляет на логин

---

## 2. Текущее состояние

- **JWT конфиг** — [backend/src/config.ts](../../backend/src/config.ts): `JWT_EXPIRES_IN` (default `1h`), `JWT_REFRESH_EXPIRES_IN` (default `7d`) — хардкод в env
- **Redis-сессия** — [backend/src/shared/redis.ts](../../backend/src/shared/redis.ts): `SESSION_TTL_SECONDS = 7 * 24 * 60 * 60` (хардкод 7 дней), хранит `lastSeenAt`
- **Auth middleware** — [backend/src/shared/middleware/auth.ts](../../backend/src/shared/middleware/auth.ts): синхронная проверка JWT, Redis-сессию **не проверяет**
- **Admin service** — [backend/src/modules/admin/admin.service.ts](../../backend/src/modules/admin/admin.service.ts): уже есть паттерн `SystemSetting` для `registration_enabled`
- **Admin router** — [backend/src/modules/admin/admin.router.ts](../../backend/src/modules/admin/admin.router.ts): эндпоинты `/admin/settings/registration` как образец
- **Prisma** — модель `SystemSetting { key String @id; value String }` уже существует → **миграция не нужна**
- **Frontend admin** — страницы в [frontend/src/pages/admin/](../../frontend/src/pages/admin/), нет раздела "Система"
- **Admin API** — [frontend/src/api/admin.ts](../../frontend/src/api/admin.ts): уже есть `getRegistrationSetting`/`setRegistrationSetting`

---

## 3. Зависимости

### Модули backend
- [x] `auth` — `auth.service.ts`: login/register/refresh должны передавать TTL в `setUserSession`
- [x] `admin` — добавить `getSystemSettings`, `setSessionLifetime`; новые эндпоинты
- [x] `shared/middleware/auth` — сделать `authenticate` async, добавить sliding session check через Redis
- [x] `shared/redis` — добавить `touchUserSession(userId, ttlSeconds)` для обновления TTL

### Компоненты frontend
- [x] `AdminSystemPage.tsx` — новая страница (создать)
- [x] `AdminPage.tsx` (сайдбар/навигация) — добавить пункт "Система", видимый только `SUPER_ADMIN`
- [x] `App.tsx` — добавить роут `/admin/system`
- [x] `frontend/src/api/admin.ts` — добавить `getSystemSettings`, `setSessionLifetime`

### Модели данных (Prisma)
- [x] `SystemSetting` — использовать существующую, новый ключ `session_lifetime_minutes` (строка, значение — число минут). **Миграция не нужна.**

### Внешние зависимости
- Нет новых npm-пакетов

### Блокеры
- Нет

---

## 4. Риски

| # | Риск | Вероятность | Влияние | Митигация |
|---|------|-------------|---------|-----------|
| 1 | `authenticate` становится async — нужно проверить все места, где он используется, и убедиться в корректной обработке ошибок | Средняя | Поломка всего auth | Протестировать все защищённые эндпоинты, покрыть тестами |
| 2 | Redis недоступен — нельзя проверить активность сессии | Средняя | Невозможность авторизации | Fallback: если Redis недоступен — пропускать sliding check, полагаться только на JWT-срок |
| 3 | Конкурентные запросы одновременно обновляют `lastSeenAt` в Redis — гонка | Низкая | Незначительный drift времени | Допустимо: используем `SET EX` — атомарная операция |
| 4 | Существующие access-токены (TTL 1h) остаются валидными даже после тайм-аута бездействия | Высокая | Неполная защита | Sliding check делается в middleware по Redis, не по JWT: если Redis-сессии нет — 401, даже если JWT не истёк |
| 5 | MCP-агент (`agent@flow-universe.internal`) использует долгоживущие токены — может сломаться | Средняя | Падение AI-агента | Системные пользователи (`isSystem=true`) должны быть исключены из sliding check |

---

## 5. Особенности реализации

### Backend

**Новые эндпоинты:**
- `GET /api/admin/settings/system` — получить все системные настройки (в т.ч. `session_lifetime_minutes`). SUPER_ADMIN only.
- `PATCH /api/admin/settings/system` — обновить настройки. Body: `{ sessionLifetimeMinutes: number }`. SUPER_ADMIN only.

**Ключ в SystemSetting:** `session_lifetime_minutes`, значение — строка с числом минут. Default: `60`.

**Sliding session в `authenticate` middleware:**
1. Верифицировать JWT (текущее поведение)
2. Получить Redis-сессию для `userId`
3. Если Redis недоступен (null) → пропустить проверку (fallback)
4. Если сессии нет (истекла) → 401 `Session expired`
5. Прочитать `session_lifetime_minutes` из Redis-кэша (кэшировать на 60 сек, чтобы не ходить в БД на каждый запрос)
6. Проверить: `now - lastSeenAt > sessionLifetimeMinutes * 60 * 1000` → 401
7. Обновить `lastSeenAt = now` и сбросить Redis TTL (`EXPIRE key ttlSeconds`) — `touchUserSession`

**Исключение для системных пользователей:** при `isSystem=true` (хранится в JWT payload или проверяется из кэша) — не применять sliding check. Либо проще: выдавать системным пользователям сессию с `isSystem: true` в Redis и пропускать проверку.

**Zod-валидация:**
```ts
const setSessionLifetimeDto = z.object({
  sessionLifetimeMinutes: z.number().int().min(5).max(10080), // 5 min – 7 days
});
```

**RBAC:** все новые эндпоинты — `requireSuperAdmin()`

### Frontend

**`AdminSystemPage.tsx`:**
- Получает текущее значение `sessionLifetimeMinutes` через `GET /admin/settings/system`
- Форма с `<InputNumber>` (AntD), min=5, step=5, suffix="мин"
- Кнопка "Сохранить" → `PATCH /admin/settings/system`
- Уведомление об успехе/ошибке через `message.success/error`

**Видимость в сайдбаре:** пункт "Система" показывать только если `user.role === 'SUPER_ADMIN'`

**Роут:** `/admin/system`

### База данных
- Миграция: **не требуется** — `SystemSetting` уже есть
- При первом запросе `GET /admin/settings/system` — создаётся запись `session_lifetime_minutes = '60'` если отсутствует (upsert-on-read или return default)

### Кэширование
- Настройка `session_lifetime_minutes` кэшируется в Redis по ключу `settings:session_lifetime_minutes`, TTL=60 секунд
- При `PATCH` — инвалидировать кэш
- В `touchUserSession` — обновлять TTL Redis-сессии равным `sessionLifetimeMinutes * 60`

---

## 6. Требования к реализации

### Функциональные
- [x] FR-1: Системная настройка `session_lifetime_minutes` хранится в `SystemSetting`, читается/пишется через API
- [x] FR-2: Раздел "Система" в Админке виден и доступен только роли `SUPER_ADMIN`
- [x] FR-3: На каждый аутентифицированный запрос — обновление `lastSeenAt` в Redis и сброс TTL
- [x] FR-4: Если пользователь не делал запросов дольше `session_lifetime_minutes` — следующий запрос → 401
- [x] FR-5: Фронт при получении 401 с `code: SESSION_EXPIRED` — перенаправляет на логин с уведомлением "Сессия истекла"
- [x] FR-6: Системные пользователи (`isSystem=true`) не подпадают под sliding check

### Нефункциональные
- [x] API response < 200ms (p95) — Redis round-trip должен укладываться
- [x] Значение `session_lifetime_minutes` кэшируется в Redis 60 сек, не ходим в БД на каждый запрос
- [x] При недоступности Redis — деградация: только JWT-срок, без sliding check (logged warning)

### Безопасность
- [x] SEC-1: Только `SUPER_ADMIN` может читать и менять системные настройки
- [x] SEC-2: Минимальный тайм-аут — 5 минут (защита от блокировки всех пользователей)
- [x] SEC-3: Изменение настройки логируется в `AuditLog` (`system.session_lifetime_changed`)

### Тестирование
- [x] Unit-тесты: `touchUserSession`, логика sliding check в middleware, `getSystemSettings`/`setSessionLifetime`
- [x] Integration-тесты: `GET /admin/settings/system` (403 для не-SUPER_ADMIN, 200 для SUPER_ADMIN), `PATCH` с валидацией, 401 при истёкшей сессии
- [x] Покрытие >= 60%

---

## 7. Критерии приёмки (Definition of Done)

- [x] AC-1: В Админке есть раздел "Система", видимый только для `SUPER_ADMIN`
- [x] AC-2: В разделе "Система" есть настройка времени жизни сессии в минутах
- [x] AC-3: `SUPER_ADMIN` может изменить значение и сохранить
- [x] AC-4: После N минут бездействия пользователь получает 401 и перенаправляется на логин
- [x] AC-5: Активный пользователь не получает 401 (сессия продлевается автоматически)
- [x] AC-6: Системный агент (`agent@flow-universe.internal`) не выбрасывается по тайм-ауту
- [x] Все тесты зелёные (`make test`)
- [x] Lint проходит (`make lint`)
- [x] Code review пройден

---

## 8. Оценка трудоёмкости

| Этап | Часы (оценка) |
|------|---------------|
| Анализ и план | 0.5 |
| Backend (redis, middleware, admin service+router) | 3 |
| Frontend (AdminSystemPage, сайдбар, axios interceptor) | 2.5 |
| Тесты | 2 |
| Code review + fixes | 1 |
| **Итого** | **9** |

---

## 9. Связанные задачи

- Родитель: нет
- Дочерние: нет
- Блокирует: нет
- Зависит от: нет

---

## 10. Иерархия задач

```
TTMP-171 (TASK) — Сессия пользователя
```
