# ТЗ: TTSEC-4 — Password Policy + Audit Log UI + Announcement Banner

**Дата:** 2026-04-23
**Тип:** TASK | **Приоритет:** P1 | **Статус:** OPEN
**Проект:** TaskTime MVP (TTMP)
**Исполнитель:** TBD
**Автор ТЗ:** Claude Code (auto-generated)

---

## 1. Постановка задачи

Три security/admin-UI фичи в одном ТЗ:

### 1.1 Password Policy
Сейчас правила пароля (CVE-11) захардкожены в коде. Нужна админ-настройка: минимальная длина, требования complexity, email-lockout при брутфорсе.

### 1.2 Audit Log UI
Таблица `audit_logs` растёт, индексы есть, но UI просмотра отсутствует. Нужна страница `/admin/audit-log` с фильтрами, детальным drawer с diff'ом, экспорт CSV/JSON, configurable retention.

### 1.3 Announcement Banner
Нет способа сообщить всем пользователям о запланированных работах. Нужна модель с расписанием (startsAt/endsAt), типами (info/warning/error) и dismissibility (только для info).

### Пользовательские сценарии

**Password Policy:** Админ в `/admin/security/password-policy` ужесточает minLength 8→12 + lockout 5 попыток/30 мин. Существующие юзеры при следующем логине получают `PASSWORD_POLICY_VIOLATION` и требование смены.

**Audit Log:** Security engineer расследует инцидент: фильтрует `entityType=Issue, action=visibility_changed, date [-7d..now]`, кликает событие → drawer с before/after diff.

**Banner:** DevOps за день до maintenance создаёт banner `[warning] Плановые работы 25.04 с 02:00 до 04:00 MSK, startsAt=2026-04-25T02:00Z, endsAt=2026-04-25T04:00Z`. Автоматически появляется и исчезает.

---

## 2. Текущее состояние

- Password-валидация CVE-11 в `modules/auth/auth.service.ts` — `minLength=8`, символы — захардкожены.
- `SystemSetting` модель есть (ключ/строковое значение).
- `audit_logs` таблица с индексами `(entityType, entityId)`, `(userId)`, `(createdAt)`, `(action)`.
- Колокольчик (после TTNOTIF-1) не путать с баннером — баннер глобальный, не per-user.

---

## 3. Зависимости

### Модули backend
- [ ] `modules/security/password-policy.service.ts` — новый, валидация + policy-get/set.
- [ ] `modules/auth/auth.service.ts` — интегрировать policy в login/register/changePassword; добавить lockout через Redis.
- [ ] `modules/admin/audit-log.router.ts` — новый endpoint с фильтрами + экспорт.
- [ ] `modules/admin/announcements.router.ts` — CRUD.
- [ ] `shared/scheduler/retention.cron.ts` — cron очистки старых audit-logs согласно retention.

### Frontend
- [ ] `pages/admin/AdminPasswordPolicyPage.tsx`.
- [ ] `pages/admin/AdminAuditLogPage.tsx` + `components/admin/AuditLogDrawer.tsx` (detail + diff).
- [ ] `pages/admin/AdminAnnouncementsPage.tsx`.
- [ ] `components/layout/AnnouncementBanner.tsx` — рендер в шапке приложения.

### Модели данных (Prisma)
- [ ] `SystemSetting` — ключи: `password_policy`, `audit_retention_days`.
- [ ] `Announcement` — новая таблица.
- [ ] Redis-ключ для lockout-counter: `lockout:{email}` (TTL = lockoutDurationMinutes × 60).

### Внешние зависимости
- Нет новых.

### Блокеры
- Нет.

---

## 4. Риски

| # | Риск | Вероятность | Влияние | Митигация |
|---|------|-------------|---------|-----------|
| 1 | Email-level lockout → DoS: злоумышленник блокирует юзера бесконечно | **Средняя** | Deadlock для пользователя | Компенсация: (a) короткий window = 30 мин default; (b) unlock через email-reset link; (c) SUPER_ADMIN whitelist не блокируется; (d) админ-кнопка «Разблокировать» |
| 2 | Ужесточение policy → все юзеры заблокированы на старте (старые пароли не проходят) | Высокая | Downtime auth | Lazy enforcement: при логине валидируется против текущей политики. При провале — `mustChangePassword=true`, юзер вынужденно меняет |
| 3 | Audit-log UI рендерит 100k записей → браузер фризит | Высокая | UX | Server-side pagination + limit 100 на страницу. Экспорт — async-job для > 10k |
| 4 | Export CSV/JSON с sensitive data (IP, user-agent, payload с email адресами) | Высокая | Compliance | Только SUPER_ADMIN экспортирует; в audit логирование «кто когда экспортировал» |
| 5 | Retention cron удаляет audit раньше, чем админ заметил инцидент | Средняя | Потеря evidence | Default retention = null (хранить вечно); включение — явное действие; alert за 30 дней до первого удаления |
| 6 | Banner показывает устаревшее сообщение (time-drift между server/client) | Низкая | Cosmetic | Сравнение `startsAt/endsAt` на сервере; frontend получает резолвлённый список «активных сейчас» |

---

## 5. Особенности реализации

### 5.1 Password Policy

**Модель (через `SystemSetting`):**

Ключ `password_policy`, значение — JSON:
```json
{
  "minLength": 8,
  "requireUppercase": true,
  "requireLowercase": true,
  "requireDigit": true,
  "requireSpecial": false,
  "lockoutAfterFailedAttempts": 5,
  "lockoutDurationMinutes": 30,
  "mustChangeOnFirstLogin": true,
  "mfaTrustDevice": false
}
```

**Validation helper:**

```typescript
export function validatePassword(password: string, policy: PasswordPolicy): string[] {
  const errors: string[] = [];
  if (password.length < policy.minLength) errors.push(`MIN_LENGTH_${policy.minLength}`);
  if (policy.requireUppercase && !/[A-Z]/.test(password)) errors.push('NEED_UPPER');
  if (policy.requireLowercase && !/[a-z]/.test(password)) errors.push('NEED_LOWER');
  if (policy.requireDigit && !/[0-9]/.test(password)) errors.push('NEED_DIGIT');
  if (policy.requireSpecial && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) errors.push('NEED_SPECIAL');
  return errors;
}
```

**Lockout (Redis):**

```typescript
// On failed login:
const key = `lockout:${email}`;
const attempts = await redis.incr(key);
if (attempts === 1) {
  await redis.expire(key, policy.lockoutDurationMinutes * 60);
}
if (attempts >= policy.lockoutAfterFailedAttempts) {
  const isSuperAdmin = await checkSuperAdmin(email);
  if (!isSuperAdmin) throw new Forbidden('ACCOUNT_LOCKED');
}

// On successful login:
await redis.del(key);
```

**Admin-unlock:** `POST /admin/users/:id/unlock` → `redis.del(lockout:${email})`.

**Lazy enforcement:** при логине — если `validatePassword(password, currentPolicy)` провалилась → `User.mustChangePassword = true`, продолжаем логин, на следующий запрос фронт показывает `/change-password`.

### 5.2 Audit Log UI

**Endpoint:**

```
GET /admin/audit-log
  ?entityType=Issue
  &userId=...
  &entityId=...
  &action=...
  &fromDate=...
  &toDate=...
  &search=  (full-text по details JSON, через to_tsvector)
  &page=1&pageSize=100
```

Response: `{ items: AuditLog[], total: number }`. `items[i]` содержит `{ id, action, entityType, entityId, userId, userName, ipAddress, userAgent, details, createdAt }`.

**Full-text search по JSON:** добавить generated column + GIN:
```sql
ALTER TABLE audit_logs ADD COLUMN details_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce(details::text, ''))) STORED;
CREATE INDEX audit_logs_details_tsv_idx ON audit_logs USING GIN (details_tsv);
```

**Drawer с diff:**

Для actions c явной before/after семантикой (update, visibility_changed, role_changed, etc.) — `details.before` и `details.after` + рендер с библиотекой `deep-object-diff` (показ removed/added/changed).

Для create/delete — просто full payload.

**Retention:**

Ключ `audit_retention_days` в `SystemSetting` (default null = бесконечно).

Cron раз в сутки:
```sql
DELETE FROM audit_logs WHERE created_at < NOW() - (INTERVAL '1 day' * $1)
  AND action NOT IN ('user_deleted', 'role_granted', 'visibility_changed')  -- «never-delete»
```

Never-delete список — hard-coded в коде (ADMIN не может ослабить).

**Export:**

- CSV (< 10 000 строк): синхронный download.
- CSV/JSON (> 10 000): async-job в BullMQ (или Redis queue), возвращает ссылку на temp-файл.

### 5.3 Announcement Banner

**Модель:**

```prisma
enum AnnouncementType {
  INFO
  WARNING
  ERROR
}

model Announcement {
  id          String           @id @default(uuid())
  type        AnnouncementType @default(INFO)
  title       String
  body        String
  startsAt    DateTime         @map("starts_at")
  endsAt      DateTime         @map("ends_at")
  dismissible Boolean          @default(false)  // computed: true только если type=INFO (валидация)
  priority    Int              @default(0)  // для выбора одного при overlapping schedule
  createdBy   String           @map("created_by")
  createdAt   DateTime         @default(now())

  @@index([startsAt, endsAt])
  @@map("announcements")
}
```

**Validation:** если `type != INFO`, форсим `dismissible=false` на сохранении.

**API:**

- `GET /api/announcements/active` — публичный (любой аутентифицированный): возвращает одно сообщение, активное **сейчас** (`startsAt <= NOW() <= endsAt`, `isEnabled=true`), с наивысшим `priority`. Клиент-кеш на 60 сек.
- `GET /admin/announcements` — админский, все.
- `POST/PUT/DELETE /admin/announcements/:id` — SUPER_ADMIN only.

**Dismiss per-user:**

Для `type=INFO` при клике X — записываем в `User.preferences.dismissedAnnouncements: string[]` (array of announcement IDs). В `GET /api/announcements/active` исключаем dismissed для текущего юзера.

**Frontend:**

- `AnnouncementBanner.tsx` — fetch `/api/announcements/active` при маунте + refetch каждые 60 сек.
- Рендер фиксированной полосой сверху (`position: sticky`), цвет по типу.
- Если dismissible — кнопка X.

### 5.4 Admin UI pages

**AdminPasswordPolicyPage:** форма с полями policy + preview-попытка «Проверить пример пароля» (non-saved).

**AdminAuditLogPage:** таблица с фильтрами сверху, клик по строке → drawer с deep-diff.

**AdminAnnouncementsPage:** таблица (name, type, schedule, isActive-now) + create/edit modal с date-pickers.

---

## 6. Требования к реализации

### Функциональные
- [ ] FR-1: `/admin/security/password-policy` CRUD политики (SUPER_ADMIN only).
- [ ] FR-2: Login-endpoint применяет текущую политику: lockout после N fails.
- [ ] FR-3: Lazy-enforcement: пароль не соответствует policy → `mustChangePassword=true` при логине.
- [ ] FR-4: SUPER_ADMIN не блокируется по email-lockout.
- [ ] FR-5: `/admin/users/:id/unlock` сбрасывает lockout-counter.
- [ ] FR-6: `/admin/audit-log` с 6 фильтрами + pagination + full-text search.
- [ ] FR-7: Detail-drawer показывает deep-diff для update-actions.
- [ ] FR-8: Export CSV/JSON, > 10k через async-job.
- [ ] FR-9: Configurable retention через `SystemSetting`; never-delete список захардкожен.
- [ ] FR-10: `/admin/announcements` CRUD + preview.
- [ ] FR-11: `GET /api/announcements/active` возвращает текущий активный с учётом dismiss.
- [ ] FR-12: Banner в шапке, auto-refresh 60 сек.

### Нефункциональные
- [ ] NFR-1: Audit-log query < 500ms p95 на БД с 1M записей (GIN-индекс на details_tsv).
- [ ] NFR-2: Password-validate < 5ms.
- [ ] NFR-3: Banner-fetch не превышает 10 req/мин на одного юзера.

### Безопасность
- [ ] SEC-1: Password policy — только SUPER_ADMIN.
- [ ] SEC-2: Audit-log чтение — SUPER_ADMIN + AUDITOR.
- [ ] SEC-3: Export — только SUPER_ADMIN, audit-logged.
- [ ] SEC-4: Announcements — SUPER_ADMIN only.
- [ ] SEC-5: Lockout-counter в Redis защищён от внешнего доступа.

### Тестирование
- [ ] Unit: `validatePassword`, lockout-counter logic, announcement active-resolver.
- [ ] Integration: failed logins → lockout → admin-unlock.
- [ ] Integration: update policy → next login triggers `mustChangePassword`.
- [ ] Integration: audit-search with full-text (to_tsvector).
- [ ] E2E: banner появляется/исчезает по расписанию.
- [ ] Покрытие ≥ 70%.

---

## 7. Критерии приёмки

- [ ] AC-1: `/admin/security/password-policy` работает, SUPER_ADMIN может менять параметры.
- [ ] AC-2: 5 failed logins → 6-й получает 403 `ACCOUNT_LOCKED`.
- [ ] AC-3: SUPER_ADMIN не попадает под lockout.
- [ ] AC-4: `/admin/users/:id/unlock` сбрасывает lockout.
- [ ] AC-5: `/admin/audit-log` с фильтрами + deep-diff drawer.
- [ ] AC-6: Export CSV на 100 строк работает (sync); 50k строк — async-job.
- [ ] AC-7: Retention cron удаляет старше N дней, never-delete actions остаются.
- [ ] AC-8: Banner создаётся с расписанием, появляется/исчезает автоматически.
- [ ] AC-9: INFO-banner — dismissible; WARNING/ERROR — нет.
- [ ] AC-10: Тесты зелёные.

---

## 8. Оценка трудоёмкости

| Этап | Часы |
|------|------|
| Password policy: service + validation + lockout (Redis) | 8 |
| Password policy: admin-UI page | 4 |
| Audit-log: generated column + GIN migration | 2 |
| Audit-log: router с фильтрами + full-text | 6 |
| Audit-log: admin-UI + drawer с diff | 10 |
| Audit-log: export CSV/JSON + async-job | 6 |
| Audit-log: retention cron + never-delete list | 3 |
| Announcements: model + CRUD + active-resolver | 5 |
| Announcements: banner component + dismiss-logic | 5 |
| Tests | 10 |
| Code review | 4 |
| **Итого** | **63** (~1 спринт) |

---

## 9. Связанные задачи

- **Зависит от:** нет.
- **Блокирует:** TTMFA-1 (переиспользует re-auth из password-policy).
- **Связано:** TTSEC-2 (user management), TTMP-171 (session).

---

## 10. Иерархия задач

```
TTSEC-4 (TASK) — Password Policy + Audit Log UI + Banner
  ├─ TTSEC-4.1 — Password policy service + lockout
  ├─ TTSEC-4.2 — Audit log router + GIN + drawer
  ├─ TTSEC-4.3 — Audit log export + retention
  ├─ TTSEC-4.4 — Announcements CRUD + banner
  └─ TTSEC-4.5 — Tests + review
```
