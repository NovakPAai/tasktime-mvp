# ТЗ: TTNOTIF-1 — Notifications Service (Email + In-app Bell)

**Дата:** 2026-04-23
**Тип:** EPIC | **Приоритет:** P0 | **Статус:** OPEN
**Проект:** TaskTime MVP (TTMP)
**Исполнитель:** TBD
**Автор ТЗ:** Claude Code (auto-generated)

---

## 1. Постановка задачи

В системе **полностью отсутствует** исходящая почта и механизм оповещений. Это блокирует базовый пользовательский сценарий трекера — «команда получает уведомление, когда что-то меняется».

Задача реализует:
- **SMTP-настройки** в админке (+ шифрование пароля).
- **Events → Notifications pipeline**: consumer из Kafka (после TTBUS-0).
- **Notification Scheme** per-project — упрощённая матрица «проектная роль × тип события».
- **Шаблоны писем** (RU-only в MVP, EN-заготовки под будущий i18n).
- **Watchers** — модель `IssueWatcher` + кнопка «Наблюдать» в UI.
- **In-app bell** — колокольчик в шапке + список.
- **Per-user preferences** — «не слать мне уведомления о моих собственных изменениях» (default off).
- **Coalescing** — при 10 быстрых изменениях одной задачи одним пользователем в адрес одного получателя → 1 письмо.

### Пользовательские сценарии

**Алиса создаёт задачу, Боб assignee:**
1. Боб получает email «Вам назначена задача TT-123».
2. Боб видит красную точку на колокольчике — «1 новое уведомление».
3. Боб кликает → список с заголовком задачи, именем actor'а, временем, ссылкой.

**Вики добавляет `@алиса` в комментарий:**
1. Алиса получает email «Вас упомянули в TT-123» + запись в bell'е.
2. Алиса автоматически становится watcher задачи.

**Админ:**
1. Идёт в `/admin/notifications/smtp` → настраивает SMTP-сервер.
2. Идёт в `/admin/notifications/schemes` → для роли `DEVELOPER` в проекте X включает получение на `ISSUE_COMMENTED`.
3. Кликает «Отправить тест» → получает тестовое письмо.

---

## 2. Текущее состояние

- **SMTP-клиента нет вообще.**
- **Notification-модуля нет.**
- **`IssueWatcher` модель отсутствует.**
- **Колокольчика в UI нет.**
- `webhook-notifier` для checkpoints — шлёт HTTP без схемы получателей. После TTNOTIF-1 — переводим на универсальную pipeline.
- В `User.preferences: Json?` уже есть поле для пользовательских предпочтений (используется для «тем», можно расширить).

---

## 3. Зависимости

### Модули backend (существующие)
- [ ] `issues` — добавить auto-subscribe assignee в watchers.
- [ ] `comments` — producer события `COMMENT_CREATED` в outbox (TTBUS-0 инфра).
- [ ] `releases` — producer `RELEASE_PUBLISHED`.
- [ ] `releases/checkpoints/webhook-notifier` — переключить на publishing в outbox (унификация).
- [ ] `admin` — добавить smtp-settings endpoints.
- [ ] `auth` — после `createUser` — публикация `USER_CREATED_FOR_YOU` вместо копипасты пароля в модалке.

### Новый процесс
- [ ] `notifications-service/` — отдельный Node.js процесс. Consumer Kafka, свой Prisma-client (shared PG, schema `notifications`). Запускается в docker-compose.

### Новые модули backend
- [ ] `shared/mentions/` — парсер `@username` в markdown → список userId.
- [ ] `modules/watchers/` — CRUD API для watchers (публичный: GET/POST/DELETE `/api/issues/:id/watchers`).
- [ ] `modules/bell/` — API для in-app уведомлений (GET list, PATCH mark-as-read).

### Frontend
- [ ] `components/bell/BellDropdown.tsx` — колокольчик + список.
- [ ] `pages/admin/AdminSmtpPage.tsx` — настройки SMTP.
- [ ] `pages/admin/AdminNotificationSchemePage.tsx` — матрица «роль × событие» per-project.
- [ ] `components/issues/WatchButton.tsx` — кнопка «Наблюдать».
- [ ] `pages/SettingsPage.tsx` — добавить чекбокс «Не уведомлять меня о моих действиях».

### Модели данных (Prisma)
- [ ] `IssueWatcher` — main schema.
- [ ] `NotificationScheme` — schema `notifications`.
- [ ] `NotificationSchemeRule` — schema `notifications`.
- [ ] `InAppNotification` — schema `notifications`.
- [ ] `SentEmail` — schema `notifications` (лог отправок для дедупа/аудита).
- [ ] Новые ключи в `SystemSetting`: `smtp_config` (encrypted JSON), `notifications.coalesce_window_sec`.

### Внешние зависимости
- [ ] `nodemailer` — SMTP-клиент.
- [ ] `handlebars` (или `mjml`) — шаблоны писем.
- [ ] `ioredis` — для coalescing-окна (уже есть).

### Блокеры
- [x] **TTBUS-0 должен быть смержён.**

---

## 4. Риски

| # | Риск | Вероятность | Влияние | Митигация |
|---|------|-------------|---------|-----------|
| 1 | SMTP-пароль утекает в логах/аудите | Средняя | Компрометация | Шифрование AES-256-GCM с `SMTP_ENCRYPTION_KEY` из ENV; никогда не отдавать пароль в API-ответах; в логах — `***` |
| 2 | Coalescing теряет события при падении Redis | Низкая | Задержка/пропуск 1 уведомления | Redis-fallback: если недоступен — шлём immediate без coalescing (logged warning) |
| 3 | Пользователь отписывается от всех уведомлений — пропускает важные админ-события | Средняя | Операционный риск | Админ-события (temp-password, role-granted) — **не управляются user preferences**, всегда приходят |
| 4 | Bell-consumer лагает → пользователь не видит «новое» в шапке | Низкая | UX-задержка | Bell работает через WebSocket/SSE для live; при отсутствии — polling каждые 30 сек |
| 5 | Mention-парсер false-positive на email (`info@corp.ru` → `@corp`) | Средняя | Ложные уведомления | Парсер только на `@username` строго по паттерну + lookup в БД; email не матчится |
| 6 | Watcher auto-add засоряет `IssueWatcher` — тысячи строк на популярную задачу | Низкая | Deoptim-список для UI | Индекс на `(issueId, userId)`; UI пагинирует watchers |
| 7 | Email-quota SMTP-провайдера (SendGrid/Yandex 500/day free) | Высокая | Потеря уведомлений | Rate-limit на уровне `notifications-service` + метрики количества отправок; админ видит графики |
| 8 | `notifications-service` падает — events копятся в Kafka | Средняя | Задержка | При перезапуске consumer подхватывает offset, events не теряются; alert на topic lag |

---

## 5. Особенности реализации

### 5.1 Модели (Prisma)

**Main schema:**

```prisma
model IssueWatcher {
  issueId   String   @map("issue_id")
  userId    String   @map("user_id")
  createdAt DateTime @default(now()) @map("created_at")

  issue     Issue    @relation(fields: [issueId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([issueId, userId])
  @@index([userId])
  @@map("issue_watchers")
}
```

**Schema `notifications`:**

```prisma
model NotificationScheme {
  id          String   @id @default(uuid())
  projectId   String   @unique @map("project_id")  // one scheme per project
  // Каждый проект имеет одну схему. Глобального fallback'а нет — default создаётся при создании проекта.
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  rules       NotificationSchemeRule[]

  @@map("notification_schemes")
  @@schema("notifications")
}

model NotificationSchemeRule {
  id          String   @id @default(uuid())
  schemeId    String   @map("scheme_id")
  projectRoleId String @map("project_role_id")  // FK на ProjectRoleDefinition (main schema)
  eventType   String   // 'ISSUE_CREATED', 'ISSUE_COMMENTED', ...
  channel     NotificationChannel  // EMAIL | IN_APP
  enabled     Boolean  @default(true)

  scheme      NotificationScheme @relation(fields: [schemeId], references: [id], onDelete: Cascade)

  @@unique([schemeId, projectRoleId, eventType, channel])
  @@map("notification_scheme_rules")
  @@schema("notifications")
}

enum NotificationChannel {
  EMAIL
  IN_APP
  @@schema("notifications")
}

model InAppNotification {
  id         String   @id @default(uuid())
  recipientId String  @map("recipient_id")   // userId (main schema, логический FK, без REFERENCES для cross-schema)
  eventType  String
  title      String
  body       String
  link       String?  // URL на issue/comment/release
  payload    Json?    // structured data для rendering
  isRead     Boolean  @default(false) @map("is_read")
  readAt     DateTime? @map("read_at")
  createdAt  DateTime @default(now()) @map("created_at")

  @@index([recipientId, isRead, createdAt])
  @@map("in_app_notifications")
  @@schema("notifications")
}

model SentEmail {
  id          String   @id @default(uuid())
  messageId   String   @map("message_id")    // из envelope — для дедупа
  recipientEmail String @map("recipient_email")
  recipientUserId String? @map("recipient_user_id")
  subject     String
  templateName String  @map("template_name")
  status      EmailStatus @default(PENDING)
  attempts    Int      @default(0)
  lastError   String?  @map("last_error")
  sentAt      DateTime? @map("sent_at")
  createdAt   DateTime @default(now())

  @@unique([messageId, recipientEmail])  // защита от двойной отправки
  @@index([status, createdAt])
  @@map("sent_emails")
  @@schema("notifications")
}

enum EmailStatus {
  PENDING
  SENT
  FAILED
  BOUNCED
  @@schema("notifications")
}
```

### 5.2 SMTP-настройки (combined ENV + DB)

ENV-fallback values (используются при отсутствии записи в `SystemSetting`):
```
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM="TaskTime <noreply@tasktime.internal>"
SMTP_SECURE=false
SMTP_ENCRYPTION_KEY=   # 32-byte base64 — обязательно для шифрования БД-значений
```

БД (key в `SystemSetting`): `smtp_config` = JSON:
```json
{
  "host": "smtp.yandex.ru",
  "port": 465,
  "user": "noreply@corp.ru",
  "passwordEncrypted": "base64(aes-256-gcm(password))",
  "from": "TaskTime <noreply@corp.ru>",
  "secure": true
}
```

API:
- `GET /admin/settings/smtp` — возвращает конфиг **без пароля** (маскированный как `***`).
- `PUT /admin/settings/smtp` — принимает пароль, шифрует и сохраняет.
- `POST /admin/settings/smtp/test` — body `{ to: string }` — отправляет тестовое письмо, возвращает результат.
- `DELETE /admin/settings/smtp` — сброс к ENV-fallback.

### 5.3 Notification Scheme (B-вариант)

Каждый проект имеет одну схему (создаётся при создании проекта). Матрица:

| Роль в проекте \ Событие | ISSUE_CREATED | ISSUE_ASSIGNED | ISSUE_STATUS_CHANGED | ISSUE_UPDATED | ISSUE_MENTIONED | ISSUE_DELETED | ISSUE_COMMENTED | RELEASE_PUBLISHED | CHECKPOINT_VIOLATED |
|---|---|---|---|---|---|---|---|---|---|
| ADMIN | ☑ | ☑ | ☐ | ☐ | (auto) | ☐ | ☑ | ☑ | ☑ |
| MANAGER | ☑ | ☑ | ☐ | ☐ | (auto) | ☐ | ☑ | ☑ | ☑ |
| USER | ☐ | ☑ | ☐ | ☐ | (auto) | ☐ | ☐ | ☑ | ☐ |
| VIEWER | ☐ | ☐ | ☐ | ☐ | (auto) | ☐ | ☐ | ☐ | ☐ |

**Системные получатели (всегда, неконфигурируемо):**
- `ISSUE_CREATED` → project creator (reporter)
- `ISSUE_ASSIGNED` → new assignee
- `ISSUE_COMMENTED` → watchers + assignee
- `ISSUE_MENTIONED` → mentioned users
- `ISSUE_STATUS_CHANGED` → watchers
- `ISSUE_UPDATED` → watchers
- `ISSUE_DELETED` → watchers

**USER_CREATED_FOR_YOU** — получатель = новый юзер, не управляется схемой.

Матрица — канал-специфична: можно включить email, но выключить bell, и наоборот.

### 5.4 Watchers

- Authomatic:
  - При создании комментария → commenter добавляется в watchers issue.
  - При назначении assignee → assignee добавляется.
  - Поле `User.preferences.autoWatchOnComment: boolean` (default `true`).
- Manual: кнопка «Наблюдать / Не наблюдать» в карточке issue.
- Удаление: unwatch (cascade при удалении user/issue).

### 5.5 Mentions parser

```typescript
// shared/mentions/parser.ts
// regex: @([a-zA-Z0-9_-]+) — ник до первого не-идентификатор-символа
const MENTION_RX = /@([a-zA-Z0-9_-]+)/g;

export async function extractMentionedUserIds(
  markdown: string,
  projectId: string,
): Promise<string[]> {
  const candidates = Array.from(markdown.matchAll(MENTION_RX)).map((m) => m[1]);
  if (candidates.length === 0) return [];
  // lookup только среди участников проекта (minimize false-positives на внешние имена)
  const users = await prisma.user.findMany({
    where: {
      name: { in: candidates, mode: 'insensitive' },
      projectRoles: { some: { projectId } },
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}
```

### 5.6 Coalescing

Окно 60 сек, ключ Redis `coalesce:{recipientId}:{issueId}:{eventType}` → list событий. TTL = окно. Когда окно закрывается (через `setTimeout` воркера, не при приёме события) — собираем список в один email.

### 5.7 Self-notification suppression

`User.preferences.notifySelf: boolean` (default `false`). При подготовке получателей: если `event.actor.userId === recipientId` и `notifySelf=false` — skip.

### 5.8 Шаблоны писем

- Handlebars-шаблоны в `notifications-service/templates/ru/*.hbs`.
- По одному шаблону на тип события.
- Common layout с логотипом из TTBRAND-1 (после его реализации — пока текст).

### 5.9 In-app bell delivery

- Consumer при обработке события: если channel `IN_APP` в схеме для получателя — `INSERT INTO in_app_notifications`.
- Frontend: polling `GET /api/bell/notifications?unread=true` каждые 30 сек + badge с количеством.
- PATCH `/api/bell/notifications/:id/read` — помечает прочитанным.
- Retention: запись жива 30 дней, потом cleanup.

---

## 6. Требования к реализации

### Функциональные
- [ ] FR-1: SMTP настраивается через UI; пароль шифруется; test-email работает.
- [ ] FR-2: 10 типов событий доставляются по email согласно Notification Scheme.
- [ ] FR-3: Те же 10 событий пишутся в `InAppNotification` при включённом канале `IN_APP`.
- [ ] FR-4: Watchers: auto-add при assign/comment, manual watch-button в UI, список watchers на задаче.
- [ ] FR-5: Mention-парсер находит `@username` только среди участников проекта.
- [ ] FR-6: Coalescing 60 сек работает — при 10 быстрых изменениях один пользователь получает 1 email.
- [ ] FR-7: `notifySelf=false` подавляет self-уведомления, кроме админских (`USER_CREATED_FOR_YOU`).
- [ ] FR-8: Колокольчик в шапке показывает unread-count и раскрывается в дропдаун.
- [ ] FR-9: `notifications-service` работает как отдельный процесс docker-compose.
- [ ] FR-10: При создании нового проекта — автоматически создаётся NotificationScheme с разумным default (USER ←→ IN_APP для всех событий; EMAIL только для критических).

### Нефункциональные
- [ ] NFR-1: Latency от события → delivered email < 60 сек в 95-м перцентиле (coalescing-окно доминирует).
- [ ] NFR-2: Bell-notifications доставляются в БД < 5 сек после события.
- [ ] NFR-3: `notifications-service` выдерживает 1000 events/hour на single instance.

### Безопасность
- [ ] SEC-1: SMTP-пароль шифруется AES-256-GCM, ключ только в ENV.
- [ ] SEC-2: API не возвращает пароль никогда.
- [ ] SEC-3: Unsubscribe-link в каждом email → one-click без логина (signed JWT в URL, TTL 30 дней).
- [ ] SEC-4: Bell показывает только уведомления текущего пользователя (RBAC).
- [ ] SEC-5: Email-получатели — только пользователи с `isActive=true`.

### Тестирование
- [ ] Unit: SMTP-wrapper, mention-parser, coalescing, scheme-resolver.
- [ ] Integration: event in Kafka → email sent + bell created + coalesced correctly.
- [ ] E2E: User creates issue → assignee gets email + bell.
- [ ] Покрытие ≥ 70% для notifications-service.

---

## 7. Критерии приёмки

- [ ] AC-1: Админ настраивает SMTP через UI, получает test-email.
- [ ] AC-2: При assign-операции Боб получает email и bell.
- [ ] AC-3: Вики `@алиса` в комментарии → Алиса mentioned + watcher.
- [ ] AC-4: Страница `/admin/notifications/schemes` редактирует матрицу per-project.
- [ ] AC-5: Пользователь в Settings выключает `notifySelf` → не получает уведомления о своих изменениях.
- [ ] AC-6: Bell-dropdown показывает 10 последних unread, mark-as-read работает.
- [ ] AC-7: Watcher-страница на issue показывает список, add/remove работает.
- [ ] AC-8: `notifications-service` перезапускается без потери событий (integration-тест).
- [ ] AC-9: Тесты зелёные.
- [ ] AC-10: Docs: `docs/architecture/notifications.md` с диаграммой pipeline.

---

## 8. Оценка трудоёмкости

| Этап | Часы |
|------|------|
| Дизайн (schemes, shapes, matrix UI) | 6 |
| Prisma-миграции (notifications.*, IssueWatcher) | 4 |
| SMTP-wrapper + encryption | 6 |
| notifications-service скелет + consumer | 10 |
| Scheme-resolver (кому слать) | 8 |
| Coalescing через Redis | 4 |
| Mention-parser | 3 |
| Watchers-модуль (API + UI) | 6 |
| Шаблоны писем (10 шт) | 8 |
| In-app bell (backend API + frontend component) | 10 |
| Admin-UI: SMTP page + Scheme matrix + test-button | 14 |
| Миграция `checkpoints/webhook-notifier` на новый pipeline | 4 |
| Producer `USER_CREATED_FOR_YOU` + RELEASE_PUBLISHED + comments | 4 |
| Tests | 14 |
| Docs | 3 |
| Code review | 6 |
| **Итого** | **110** (~2 спринта) |

---

## 9. Связанные задачи

- **Родитель:** нет
- **Зависит от:** TTBUS-0.
- **Блокирует:** TTINTEG-1 (он использует ту же pipeline).
- **Связано:** TTATTACH-1 (attachments в email — фаза 2), TTBRAND-1 (email-logo).

---

## 10. Иерархия задач

```
TTNOTIF-1 (EPIC) — Notifications Service
  ├─ TTNOTIF-1.1 — Prisma models (notifications.*, IssueWatcher)
  ├─ TTNOTIF-1.2 — SMTP config + encryption + admin UI
  ├─ TTNOTIF-1.3 — notifications-service процесс
  ├─ TTNOTIF-1.4 — Scheme-resolver + matrix UI
  ├─ TTNOTIF-1.5 — Mentions parser + watchers модуль
  ├─ TTNOTIF-1.6 — Coalescing
  ├─ TTNOTIF-1.7 — Email templates (10)
  ├─ TTNOTIF-1.8 — In-app bell (backend + frontend)
  ├─ TTNOTIF-1.9 — Migrate existing producers (comments, releases, checkpoints, user-create)
  └─ TTNOTIF-1.10 — Tests + docs
```
