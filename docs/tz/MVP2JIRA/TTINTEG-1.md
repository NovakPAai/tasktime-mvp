# ТЗ: TTINTEG-1 — Webhooks (system + project-level)

**Дата:** 2026-04-23
**Тип:** EPIC | **Приоритет:** P2 | **Статус:** OPEN
**Проект:** TaskTime MVP (TTMP)
**Исполнитель:** TBD
**Автор ТЗ:** Claude Code (auto-generated)

---

## 1. Постановка задачи

Реализовать универсальный реестр webhook'ов — **ещё один consumer** Kafka-шины (после TTBUS-0), принципиально аналогичный `notifications-service`.

Возможности:
- **Two-level scope:** system-wide (админ регистрирует) + project-level (project ADMIN/MANAGER).
- **Native envelope format** — одинаковый с Kafka-событиями, без Jira-compat.
- **HMAC-SHA256 signing** + **timestamp header** (anti-replay, window ±5 мин).
- **Retry:** 5 попыток с backoff (1s/10s/60s/600s/3600s), **настраивается per-webhook** (override в advanced settings).
- **DLQ:** после 10 fails → `isEnabled=false` автоматически + admin-нотификация.
- **Delivery log:** опционально хранит full payload через `storeFullPayload` флаг (default off).

### Пользовательские сценарии

**Админ подключает SIEM:**
1. `/admin/webhooks` → Add.
2. URL `https://siem.corp.ru/events`, scope=SYSTEM, secret generated, eventTypes=`[ISSUE_CREATED, ISSUE_UPDATED, visibility_changed]`.
3. После save — все system-events идут в SIEM с HMAC-подписью.

**Project admin подключает Slack webhook:**
1. Project settings → Webhooks.
2. URL Slack incoming, scope=PROJECT, eventTypes=`[ISSUE_COMMENTED]`, storeFullPayload=true (для debugging).

**Auto-disable:**
1. Slack URL упал. 10 fails подряд → webhook `isEnabled=false`.
2. Admin получает email «Webhook `slack-main` отключён после 10 ошибок».

---

## 2. Текущее состояние

- `webhook-notifier.service.ts` (checkpoints) — ad-hoc, single purpose. После TTBUS-0 мигрирует на event-bus.
- Kafka + outbox готовы (TTBUS-0).
- Reference consumer pattern в `notifications-service` (TTNOTIF-1).

---

## 3. Зависимости

### Модули backend (новый сервис)
- [ ] `webhooks-service/` — отдельный процесс, consumer `tt.*` топиков.

### Модули backend (в monolith)
- [ ] `modules/webhooks/webhooks.router.ts` — CRUD + delivery-log API.
- [ ] `modules/webhooks/webhooks.service.ts`.

### Frontend
- [ ] `pages/admin/AdminWebhooksPage.tsx` — system-level.
- [ ] `pages/project/ProjectWebhooksPage.tsx` — project-level.
- [ ] `components/webhooks/WebhookForm.tsx` + `DeliveryLogTable.tsx`.

### Модели данных (Prisma, main schema)
- [ ] `Webhook` — новая.
- [ ] `WebhookDelivery` — новая.

### Внешние зависимости
- [ ] `got` — HTTP клиент с retry built-in (альтернатива `fetch`).
- [ ] Уже есть `kafkajs` (от TTBUS-0).

### Блокеры
- **TTBUS-0 + TTNOTIF-1 обязательны** (consumer pattern + event definitions).

---

## 4. Риски

| # | Риск | Вероятность | Влияние | Митигация |
|---|------|-------------|---------|-----------|
| 1 | SSRF: злоумышленник регистрирует webhook на `http://localhost:metadata` или внутреннюю сеть | Высокая | Leak внутренних метаданных | Блок-лист приватных ranges (RFC 1918, 127.0.0.0/8, 169.254.0.0/16), localhost; DNS-резолвинг до запроса; проверка final IP |
| 2 | Retry-storm после длительного сбоя receiver | Средняя | Overload receiver при восстановлении | Auto-disable после 10 fails; exponential backoff; random jitter ±20% |
| 3 | Payload с PII в delivery-log exposed через API | Средняя | Leak | `storeFullPayload=false` default; audit log кто смотрел payload |
| 4 | Webhook owner покинул проект / компания ушла | Низкая | Orphaned webhooks | cleanup-job раз в сутки: отключает webhooks с неактивным `createdById` > 90 дней |
| 5 | Timing-attack на HMAC signature verify | Низкая | Theoretical | Constant-time comparison (`crypto.timingSafeEqual`) на receiver-side (документировать в payload-spec для внешних интеграторов) |
| 6 | Large payload (attachments в issue.updated) > 1MB | Средняя | HTTP-timeout | Max payload 256KB; если больше — отправлять meta-only + URL для pull |

---

## 5. Особенности реализации

### 5.1 Модели

```prisma
enum WebhookScope {
  SYSTEM
  PROJECT
}

model Webhook {
  id              String         @id @default(uuid())
  name            String
  scope           WebhookScope
  projectId       String?        @map("project_id")  // if PROJECT-scope
  url             String
  secretEnc       String         @map("secret_enc")  // AES-GCM encrypted
  eventTypes      String[]       @map("event_types")  // ['ISSUE_CREATED', ...]
  isEnabled       Boolean        @default(true) @map("is_enabled")
  storeFullPayload Boolean       @default(false) @map("store_full_payload")

  // Retry config (override defaults)
  maxAttempts     Int            @default(5) @map("max_attempts")
  backoffMsJson   String         @default("[1000,10000,60000,600000,3600000]") @map("backoff_ms_json")
  // массив миллисекунд; длина должна быть = maxAttempts

  autoDisabledAt  DateTime?      @map("auto_disabled_at")
  lastDeliveryAt  DateTime?      @map("last_delivery_at")
  createdById     String         @map("created_by_id")
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  project         Project?       @relation(fields: [projectId], references: [id], onDelete: Cascade)
  deliveries      WebhookDelivery[]

  @@index([scope, isEnabled])
  @@index([projectId])
  @@map("webhooks")
}

enum DeliveryStatus {
  PENDING
  DELIVERED
  RETRYING
  FAILED_PERMANENTLY
}

model WebhookDelivery {
  id            String         @id @default(uuid())
  webhookId     String         @map("webhook_id")
  eventId       String         @map("event_id")  // = envelope.messageId
  eventType     String         @map("event_type")
  status        DeliveryStatus @default(PENDING)
  attempts      Int            @default(0)
  requestUrl    String         @map("request_url")
  payloadStored Boolean        @default(false) @map("payload_stored")  // true если копия сохранена для debug
  payloadJson   String?        @map("payload_json")  // только если storeFullPayload + payload < 256KB
  lastError     String?        @map("last_error")
  lastAttemptAt DateTime?      @map("last_attempt_at")
  responseCode  Int?           @map("response_code")
  deliveredAt   DateTime?      @map("delivered_at")
  createdAt     DateTime       @default(now())

  webhook       Webhook        @relation(fields: [webhookId], references: [id], onDelete: Cascade)

  @@unique([webhookId, eventId])
  @@index([webhookId, status])
  @@index([status, createdAt])
  @@map("webhook_deliveries")
}
```

### 5.2 Consumer в webhooks-service

```typescript
// webhooks-service/src/consumer.ts
subscribe('webhooks-service', ['tt.issues', 'tt.comments', 'tt.releases', 'tt.workflow'],
  async (envelope) => {
    const { type, messageId } = envelope;
    const projectId = envelope.payload.projectId as string | undefined;

    // Найти все webhook'и, слушающие это событие
    const webhooks = await prisma.webhook.findMany({
      where: {
        isEnabled: true,
        eventTypes: { has: type },
        OR: [
          { scope: 'SYSTEM' },
          { scope: 'PROJECT', projectId: projectId ?? '___none___' },
        ],
      },
    });

    // Для каждого — создать delivery, добавить job в очередь
    await Promise.all(webhooks.map((wh) => enqueueDelivery(wh.id, envelope)));
  });
```

### 5.3 Delivery worker (BullMQ)

```typescript
// webhooks-service/src/delivery.worker.ts
async function processDelivery(job: Job<{ deliveryId: string }>) {
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: job.data.deliveryId },
    include: { webhook: true },
  });
  if (!delivery || !delivery.webhook.isEnabled) return;

  const wh = delivery.webhook;
  const envelope = JSON.parse(delivery.payloadJson ?? ''); // или ре-fetch из outbox

  // Build signature
  const ts = Math.floor(Date.now() / 1000);
  const body = JSON.stringify(envelope);
  const payloadToSign = `${ts}.${body}`;
  const secret = decrypt(wh.secretEnc);
  const signature = crypto.createHmac('sha256', secret).update(payloadToSign).digest('hex');

  try {
    const res = await got.post(wh.url, {
      body,
      headers: {
        'Content-Type': 'application/json',
        'X-TT-Signature': `sha256=${signature}`,
        'X-TT-Timestamp': String(ts),
        'X-TT-Event-Type': envelope.type,
        'X-TT-Delivery-Id': delivery.id,
        'X-TT-Webhook-Id': wh.id,
      },
      timeout: { request: 30_000 },
      retry: { limit: 0 },  // retry вручную ниже
    });

    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: 'DELIVERED',
        attempts: delivery.attempts + 1,
        deliveredAt: new Date(),
        responseCode: res.statusCode,
        lastAttemptAt: new Date(),
      },
    });
    await prisma.webhook.update({
      where: { id: wh.id },
      data: { lastDeliveryAt: new Date() },
    });
  } catch (err) {
    const backoffs = JSON.parse(wh.backoffMsJson) as number[];
    const nextAttempts = delivery.attempts + 1;
    const canRetry = nextAttempts < wh.maxAttempts;

    if (canRetry) {
      const delayMs = backoffs[nextAttempts - 1] + jitter(delayMs, 0.2);
      await job.queue.add('deliver', { deliveryId: delivery.id }, { delay: delayMs });
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: { status: 'RETRYING', attempts: nextAttempts, lastError: String(err), lastAttemptAt: new Date() },
      });
    } else {
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: { status: 'FAILED_PERMANENTLY', attempts: nextAttempts, lastError: String(err), lastAttemptAt: new Date() },
      });
      await maybeAutoDisableWebhook(wh.id);
    }
  }
}

async function maybeAutoDisableWebhook(webhookId: string): Promise<void> {
  const recent = await prisma.webhookDelivery.count({
    where: {
      webhookId,
      status: 'FAILED_PERMANENTLY',
      createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) },
    },
  });
  if (recent >= 10) {
    await prisma.webhook.update({
      where: { id: webhookId },
      data: { isEnabled: false, autoDisabledAt: new Date() },
    });
    // публикуем событие для notifications
    await publishInTx(prisma, 'tt.webhooks', 'WEBHOOK_AUTO_DISABLED', { webhookId }, { userId: null });
  }
}
```

### 5.4 SSRF защита

```typescript
function isDisallowedUrl(url: string): boolean {
  const u = new URL(url);
  if (!['http:', 'https:'].includes(u.protocol)) return true;
  // блокировка служебных host'ов
  const blocklist = ['localhost', '127.0.0.1', '0.0.0.0', '169.254.169.254', 'metadata.google.internal'];
  if (blocklist.some((b) => u.hostname.toLowerCase().includes(b))) return true;
  // приватные IP-диапазоны — проверяем через DNS-резолв и ip-range-check
  // ... (отдельная функция)
  return false;
}
```

При create/update webhook — валидация + пре-резолв DNS, отказ если приватный IP.

### 5.5 API

**System-level (SUPER_ADMIN):**
- `GET /admin/webhooks` — list.
- `POST /admin/webhooks` — create.
- `PUT /admin/webhooks/:id` — update.
- `DELETE /admin/webhooks/:id`.
- `POST /admin/webhooks/:id/test` — отправляет тестовый event `WEBHOOK_TEST`.
- `GET /admin/webhooks/:id/deliveries` — delivery log (payload только если storeFullPayload).
- `POST /admin/webhooks/:id/deliveries/:deliveryId/retry` — manual retry.
- `POST /admin/webhooks/:id/enable` — re-enable after auto-disable.

**Project-level (requires `PROJECT_SETTINGS_EDIT`):**
- `/api/projects/:projectId/webhooks` — те же операции в scope проекта.

**Новый permission:** `WEBHOOKS_MANAGE` в `ProjectPermission` — для project-level webhooks.

### 5.6 Admin UI

`/admin/webhooks`:
- Таблица: name, url, eventTypes count, status (enabled/auto-disabled), last delivery, success rate.
- Actions: edit, test, view log, re-enable.

Form:
- name, URL (с SSRF-валидацией при blur).
- Scope (system/project selection).
- Event types — мультиселект с группировкой по домену.
- Secret — generated, shown once на create.
- Advanced settings (collapsed):
  - Max attempts: 1–10 (default 5).
  - Backoff array — JSON-input с валидацией длины.
  - Store full payload: toggle.

### 5.7 Миграция webhook-notifier (checkpoints)

`checkpoints/webhook-notifier.service.ts` — упраздняется. Вместо него:
- При violation — publishInTx `CHECKPOINT_VIOLATED` в `tt.releases` (TTNOTIF-1 уже делает).
- Webhook-consumer принимает эту событие наравне со всеми.

---

## 6. Требования к реализации

### Функциональные
- [ ] FR-1: CRUD webhooks в admin UI (system) и project-settings.
- [ ] FR-2: HMAC-SHA256 + timestamp подпись.
- [ ] FR-3: SSRF-блокировка приватных адресов.
- [ ] FR-4: Retry с exp backoff + jitter.
- [ ] FR-5: Auto-disable после 10 fails за 24 часа.
- [ ] FR-6: Delivery log с опциональным storeFullPayload.
- [ ] FR-7: Test-button отправляет `WEBHOOK_TEST` event.
- [ ] FR-8: Manual retry из UI.
- [ ] FR-9: Re-enable button после auto-disable.
- [ ] FR-10: Миграция checkpoints-notifier на универсальный pipeline.
- [ ] FR-11: Permission `WEBHOOKS_MANAGE` в ProjectPermission.

### Нефункциональные
- [ ] NFR-1: Delivery latency < 30 сек p95 при живом receiver.
- [ ] NFR-2: Consumer работает на 100 webhooks × 1000 events/hour без drop'ов.
- [ ] NFR-3: Delivery log хранит последние 1000 записей per webhook (cleanup cron старше).

### Безопасность
- [ ] SEC-1: Secret encrypted at rest.
- [ ] SEC-2: SSRF-validation на create/update.
- [ ] SEC-3: storeFullPayload + view delivery-log — audit-logged.
- [ ] SEC-4: timing-safe HMAC verify в документации для integrators.

### Тестирование
- [ ] Unit: HMAC generation + verification.
- [ ] Unit: SSRF validator (edge-cases).
- [ ] Unit: retry + auto-disable logic.
- [ ] Integration: event → webhook → receiver (mock HTTP server).
- [ ] E2E: создать webhook в UI → событие → проверка в delivery log.
- [ ] Security: попытка регистрации SSRF-URL отклоняется.
- [ ] Покрытие ≥ 75%.

---

## 7. Критерии приёмки

- [ ] AC-1: System + project webhooks работают.
- [ ] AC-2: Подпись валидируется на тестовом receiver.
- [ ] AC-3: Receiver упал → retry согласно backoff → auto-disable после 10 fails.
- [ ] AC-4: SSRF: `http://169.254.169.254/` — 400 DISALLOWED_URL.
- [ ] AC-5: Test-button рабочий.
- [ ] AC-6: Delivery log показывает last 100 попыток.
- [ ] AC-7: Checkpoints-notifier заменён на универсальный pipeline.
- [ ] AC-8: Tests + security review пройдены.

---

## 8. Оценка трудоёмкости

| Этап | Часы |
|------|------|
| Prisma models | 3 |
| Webhooks CRUD router (admin + project) | 6 |
| SSRF-validator | 3 |
| webhooks-service skeleton (Kafka consumer) | 6 |
| Delivery worker (BullMQ + retry + auto-disable) | 10 |
| Frontend admin page + form | 10 |
| Frontend project-settings webhooks | 4 |
| Delivery log UI | 4 |
| Migration checkpoints-notifier | 3 |
| Permission `WEBHOOKS_MANAGE` + seed | 2 |
| Tests (unit + integration + security) | 10 |
| Docs (integration guide + HMAC spec) | 4 |
| Code review | 5 |
| **Итого** | **70** (~1 спринт) |

---

## 9. Связанные задачи

- **Зависит от:** TTBUS-0, TTNOTIF-1.
- **Связано:** TTSEC-2 (permissions), TTMP-160 (checkpoints — мигрирует).

---

## 10. Иерархия задач

```
TTINTEG-1 (EPIC) — Webhooks
  ├─ TTINTEG-1.1 — Prisma models
  ├─ TTINTEG-1.2 — CRUD + SSRF-validation
  ├─ TTINTEG-1.3 — webhooks-service + consumer
  ├─ TTINTEG-1.4 — Delivery worker + retry + auto-disable
  ├─ TTINTEG-1.5 — Admin & project UI
  ├─ TTINTEG-1.6 — Migrate checkpoints-notifier
  └─ TTINTEG-1.7 — Tests + docs
```
