# ТЗ: TTBUS-0 — Event Bus (Kafka + Transactional Outbox)

**Дата:** 2026-04-23
**Тип:** EPIC | **Приоритет:** P0-prerequisite | **Статус:** OPEN
**Проект:** TaskTime MVP (TTMP)
**Исполнитель:** TBD
**Автор ТЗ:** Claude Code (auto-generated)

---

## 1. Постановка задачи

В системе нужна **шина событий** как фундамент для асинхронных consumer'ов: notifications-service, будущего automation-runner'а (асинхронный аналог ScriptRunner), webhooks-service, возможных аналитических стрим-пайплайнов.

Ключевые требования:
- Producer (бизнес-модули) не должен знать о consumer'ах.
- Гарантия доставки at-least-once даже при падении Kafka (transactional outbox).
- Consumer'ы умеют дедупликацию идемпотентно (по `message_id`).
- Domain-oriented топики, не один общий `tt.events`.

### Пользовательский сценарий

**Разработчик TTNOTIF-1:**
1. Подписывает notifications-service на топики `tt.issues`, `tt.releases`, `tt.comments`.
2. Получает envelope: `{ v, messageId, type, occurredAt, payload, meta }`.
3. Проверяет `messageId` в `processed_messages` — если уже обработано, skip (идемпотентность).

**Разработчик TTAUTO-1 (будущее):**
1. Подписывается на тот же топик с другим `consumerGroup` — получает свои offset.
2. Automation-правило триггерится без модификации issues-модуля.

---

## 2. Текущее состояние

- В стеке уже есть **Redis** (BullMQ/session) и **PostgreSQL** (основная БД).
- Отдельный процесс **`pipeline-service`** создаёт прецедент микросервис-split — команда с этим знакома.
- **Webhook-notifier** для release-checkpoints (`backend/src/modules/releases/checkpoints/webhook-notifier.service.ts`) сейчас посылает HTTP прямо из бизнес-логики — после TTBUS-0 должен быть переведён на consume из Kafka.
- **Kafka в инфре отсутствует.**
- **Схема `event_outbox` отсутствует.**

---

## 3. Зависимости

### Модули backend
- [ ] `shared/eventbus/` (новый) — обёртка над kafkajs: `EventBusProducer`, `EventBusConsumer`, envelope schema.
- [ ] `shared/outbox/` (новый) — service для записи в `event_outbox`, `RelayWorker` (отдельный процесс или in-process cron).
- [ ] `modules/issues/issues.service.ts` — интеграция outbox-паттерна как reference implementation (create/update/delete/status change → запись в outbox в одной транзакции с БД-операцией).

### Новый процесс
- [ ] `backend-relay/` — worker-процесс, читает `event_outbox` pollingом, публикует в Kafka, помечает строки как `sent`. Можно в docker-compose как отдельный service.

### Инфра
- [ ] **Kafka** в `docker-compose.yml` (KRaft mode, single-broker для dev).
- [ ] **Kafka** в staging/prod docker-compose (single-broker MVP, multi-broker — отдельное ТЗ).
- [ ] Переменные окружения: `KAFKA_BROKERS`, `KAFKA_CLIENT_ID`.

### Frontend
- Нет изменений.

### Модели данных (Prisma)
- [ ] `event_outbox` — новая таблица.
- [ ] `processed_messages` — новая таблица (для consumer-side dedup).

### Внешние зависимости
- [ ] `kafkajs` — клиент.
- [ ] `@apache/kafka` docker-image `bitnami/kafka:3.7` (KRaft mode).

### Блокеры
- Нет.

---

## 4. Риски

| # | Риск | Вероятность | Влияние | Митигация |
|---|------|-------------|---------|-----------|
| 1 | Kafka down при публикации из outbox-relay → события не доставляются | Средняя | Задержка доставки | Relay-worker ретраит с backoff; outbox не очищается до успешной публикации; DLQ-топик для permanent failures |
| 2 | Dev-окружение поднимается медленно из-за Kafka | Высокая | Замедление DX | ENV-флаг `NOTIFICATIONS_ENABLED=false` — producer пишет в outbox, но relay не запускается; никаких consumer'ов не стартует |
| 3 | Двойная публикация события при retry — consumer получает дубль | Средняя | Двойные уведомления | Envelope содержит `messageId` UUID; consumer-side dedup через `processed_messages` с TTL 7 дней |
| 4 | Outbox-таблица разрастается (не чистится) | Высокая | Разрастание БД | Relay-worker помечает `sent_at`; cleanup-cron удаляет строки старше 7 дней с `sent_at != null` |
| 5 | Transaction-граница Prisma: `prisma.$transaction` vs запись в outbox в том же callback'е | Низкая | Non-atomic write | Обязательное использование `prisma.$transaction` во всех producer-методах с чётким API `publishInTx(tx, event)` |
| 6 | Schema envelope меняется — несовместимость с существующими событиями в очереди | Низкая | Broken consume | `v` (version) в envelope; consumer разбирает по версии; legacy-events поддерживаются в read-only режиме до их вычитки |
| 7 | `pipeline-service` и будущие consumer'ы конкурируют за одну Kafka — ресурсы | Низкая | Ограничение пропускной способности | Мониторинг topic lag; при необходимости scale broker'ов (отдельное ТЗ) |

---

## 5. Особенности реализации

### 5.1 Envelope schema

```typescript
export const eventEnvelopeSchema = z.object({
  v: z.literal(1),                        // schema version
  messageId: z.string().uuid(),           // server-generated UUID
  type: z.string(),                       // 'ISSUE_CREATED', 'ISSUE_ASSIGNED', etc.
  occurredAt: z.string().datetime(),      // ISO-8601 UTC
  actor: z.object({
    userId: z.string().uuid().nullable(), // null для system-триггеров
    ip: z.string().optional(),
    userAgent: z.string().optional(),
  }),
  payload: z.record(z.unknown()),         // event-specific
  meta: z.object({
    tenantId: z.string().nullable(),      // для будущей мульти-тенантности
    correlationId: z.string().optional(), // для цепочек событий
  }),
});
export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;
```

### 5.2 Топики (domain-oriented)

- `tt.issues` — `ISSUE_CREATED`, `ISSUE_UPDATED`, `ISSUE_DELETED`, `ISSUE_ASSIGNED`, `ISSUE_STATUS_CHANGED`, `ISSUE_MENTIONED`.
- `tt.comments` — `COMMENT_CREATED`, `COMMENT_UPDATED`, `COMMENT_DELETED` *(producer будет добавлен в TTNOTIF-1)*.
- `tt.releases` — `RELEASE_CREATED`, `RELEASE_PUBLISHED`, `RELEASE_STATUS_CHANGED`, `CHECKPOINT_VIOLATED` *(producer в release-модуле после TTBUS-0)*.
- `tt.workflow` — `WORKFLOW_TRANSITION_EXECUTED` *(TTCORE-1)*.
- `tt.notifications.dlq` — dead-letter для событий, которые consumer не смог обработать.
- Partitioning: 3 partitions на prod, 1 на dev (достаточно для consumer-scaling).
- Retention: 7 дней для бизнес-топиков, 30 дней для DLQ.

### 5.3 Модели Prisma

```prisma
model EventOutbox {
  id          String    @id @default(uuid())
  topic       String    // 'tt.issues' и т.д.
  messageId   String    @unique @default(uuid()) @map("message_id")
  type        String    // 'ISSUE_CREATED'
  envelope    Json      // весь envelope целиком
  createdAt   DateTime  @default(now()) @map("created_at")
  sentAt      DateTime? @map("sent_at")
  attempts    Int       @default(0)
  lastError   String?   @map("last_error")

  @@index([sentAt, createdAt])  // для relay-worker: WHERE sent_at IS NULL
  @@index([messageId])
  @@map("event_outbox")
}

model ProcessedMessage {
  consumerGroup String   @map("consumer_group")
  messageId     String   @map("message_id")
  processedAt   DateTime @default(now()) @map("processed_at")

  @@id([consumerGroup, messageId])
  @@index([processedAt])  // для cleanup-cron
  @@map("processed_messages")
}
```

### 5.4 Producer API

```typescript
// shared/outbox/outbox.service.ts
export async function publishInTx(
  tx: Prisma.TransactionClient,
  topic: string,
  type: string,
  payload: Record<string, unknown>,
  actor: { userId: string | null; ip?: string; userAgent?: string }
): Promise<string /* messageId */> {
  const messageId = crypto.randomUUID();
  const envelope: EventEnvelope = {
    v: 1,
    messageId,
    type,
    occurredAt: new Date().toISOString(),
    actor,
    payload,
    meta: { tenantId: null },
  };

  await tx.eventOutbox.create({
    data: { topic, messageId, type, envelope: envelope as unknown as Prisma.JsonObject },
  });

  return messageId;
}
```

Использование в issues.service:
```typescript
await prisma.$transaction(async (tx) => {
  const issue = await tx.issue.create({ data });
  await publishInTx(tx, 'tt.issues', 'ISSUE_CREATED', { issueId: issue.id, ... }, actor);
  return issue;
});
```

### 5.5 Relay Worker

Отдельный процесс (или in-process cron при `NOTIFICATIONS_ENABLED=true`):

1. Цикл каждые 500ms:
   - `SELECT * FROM event_outbox WHERE sent_at IS NULL ORDER BY created_at LIMIT 100 FOR UPDATE SKIP LOCKED`
   - Для каждой строки: `producer.send({ topic, messages: [{ key: messageId, value: JSON.stringify(envelope) }] })`
   - При успехе: `UPDATE event_outbox SET sent_at = NOW() WHERE id = $1`
   - При ошибке: `UPDATE event_outbox SET attempts = attempts + 1, last_error = $1 WHERE id = $2`
2. После `attempts > 10` — событие не удаляется, но логируется как `permanent_failure` (метрика). Админ вручную решает.
3. Cleanup-cron: раз в час удаляет строки с `sent_at IS NOT NULL AND sent_at < now() - interval '7 days'`.

### 5.6 Consumer API

```typescript
// shared/eventbus/consumer.ts
export function subscribe<T>(
  consumerGroup: string,
  topics: string[],
  handler: (env: EventEnvelope, payload: T) => Promise<void>
) {
  const consumer = kafka.consumer({ groupId: consumerGroup });
  // ... run:
  //   1. parse + validate envelope
  //   2. check ProcessedMessage — skip if exists
  //   3. await handler()
  //   4. insert into ProcessedMessage
  //   5. commit offset
}
```

### 5.7 Docker-compose для dev

```yaml
services:
  kafka:
    image: bitnami/kafka:3.7
    environment:
      KAFKA_CFG_NODE_ID: 0
      KAFKA_CFG_PROCESS_ROLES: controller,broker
      KAFKA_CFG_LISTENERS: PLAINTEXT://:9092,CONTROLLER://:9093
      KAFKA_CFG_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092
      KAFKA_CFG_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_CFG_LISTENER_SECURITY_PROTOCOL_MAP: CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT
      KAFKA_CFG_CONTROLLER_QUORUM_VOTERS: 0@kafka:9093
      KAFKA_CFG_AUTO_CREATE_TOPICS_ENABLE: "true"  # только для dev
    ports:
      - "9092:9092"

  backend-relay:
    build: ./backend
    command: node dist/relay.js
    environment:
      NOTIFICATIONS_ENABLED: "true"
      KAFKA_BROKERS: kafka:9092
    depends_on: [kafka, postgres]
```

### 5.8 Топики auto-create

- Dev: `KAFKA_CFG_AUTO_CREATE_TOPICS_ENABLE=true` для удобства.
- Prod: отдельная one-time init-job создаёт топики с нужными partitions/retention.

---

## 6. Требования к реализации

### Функциональные
- [ ] FR-1: `publishInTx(tx, topic, type, payload, actor)` доступен из любого service-модуля.
- [ ] FR-2: Событие, записанное в outbox, гарантированно попадает в Kafka или остаётся в outbox с `sent_at IS NULL`.
- [ ] FR-3: Consumer получает события в порядке публикации в рамках одной partition.
- [ ] FR-4: Consumer-side dedup через `ProcessedMessage` — повторная обработка одного `messageId` тем же `consumerGroup` невозможна.
- [ ] FR-5: Reference implementation — issues-модуль публикует 6 событий: `ISSUE_CREATED`, `ISSUE_UPDATED`, `ISSUE_DELETED`, `ISSUE_ASSIGNED`, `ISSUE_STATUS_CHANGED`, `ISSUE_MENTIONED`.
- [ ] FR-6: `NOTIFICATIONS_ENABLED=false` → publisher продолжает писать в outbox, но relay не стартует, consumer'ы тоже — система работает без Kafka локально.

### Нефункциональные
- [ ] NFR-1: Publish latency (insert в outbox в рамках tx) — добавляет не более 5ms к бизнес-операции.
- [ ] NFR-2: Relay-worker batch-size 100, interval 500ms — выдерживает 200 events/sec устойчиво.
- [ ] NFR-3: Consumer-side dedup-lookup — по индексу `(consumer_group, message_id)` p99 < 5ms.
- [ ] NFR-4: При падении relay-worker outbox не теряется — relay перезапускается, все несемпленные события доставляются.

### Безопасность
- [ ] SEC-1: Payload не должен содержать секретов (passwords, API-keys) — sanitize в producer.
- [ ] SEC-2: Kafka-порт не проксируется наружу — только из internal docker-network.
- [ ] SEC-3: Будущая интеграция (когда будет Broker-over-TLS) — не в MVP.

### Тестирование
- [ ] Unit: `publishInTx` — rollback транзакции откатывает и issue, и outbox-row.
- [ ] Unit: Relay-worker — retry на Kafka-error, increment attempts, ограничение повторов.
- [ ] Unit: Consumer-dedup — второй вызов с тем же messageId скипается.
- [ ] Integration: 100 параллельных `ISSUE_CREATED` → все 100 events в топике, без дубликатов.
- [ ] Integration: kill relay-worker, reboot → pending outbox-rows подхватываются.
- [ ] Покрытие ≥ 70%.

---

## 7. Критерии приёмки (Definition of Done)

- [ ] AC-1: Kafka поднимается в docker-compose одной командой `make up`.
- [ ] AC-2: В миграциях Prisma есть `event_outbox` и `processed_messages`.
- [ ] AC-3: Issues-модуль публикует все 6 событий через `publishInTx`.
- [ ] AC-4: relay-worker процесс работает в отдельном docker-service, устойчив к падению Kafka.
- [ ] AC-5: Админ-consumer-чек: вспомогательный скрипт `npm run events:tail -- tt.issues` печатает envelope'ы в stdout.
- [ ] AC-6: Флаг `NOTIFICATIONS_ENABLED=false` полностью отключает Kafka-producer и relay, тесты бизнес-логики проходят без Kafka.
- [ ] AC-7: Документация `docs/architecture/event-bus.md` с описанием envelope, топиков, consumer-gotchas.
- [ ] Тесты зелёные (`make test`).
- [ ] Lint проходит.
- [ ] Code review + AI-review пройдены.

---

## 8. Оценка трудоёмкости

| Этап | Часы |
|------|------|
| Анализ + дизайн envelope/outbox/relay | 4 |
| Prisma-миграции | 2 |
| `shared/eventbus/` wrapper + producer/consumer | 8 |
| `shared/outbox/` + relay-worker процесс | 10 |
| Integration в issues-модуле (6 событий) | 6 |
| Docker-compose updates (dev + staging + prod) | 3 |
| Init-job для топиков в prod | 2 |
| Tests (unit + integration) | 12 |
| Документация | 3 |
| Code-review fixes | 4 |
| **Итого** | **54** (~1.5 спринта) |

---

## 9. Связанные задачи

- **Блокирует:** TTNOTIF-1 (consumer notifications-service), TTINTEG-1 (consumer webhooks-service), будущий TTAUTO-1.
- **Зависит от:** нет.
- **Переводит на новые рельсы:** `checkpoints/webhook-notifier.service.ts` — в рамках этого ТЗ или следующего (TTNOTIF-1 — решим по приоритетам после).

---

## 10. Иерархия задач

```
TTBUS-0 (EPIC) — Event Bus
  ├─ TTBUS-0.1 — Prisma models (outbox, processed_messages)
  ├─ TTBUS-0.2 — shared/eventbus (kafkajs wrapper)
  ├─ TTBUS-0.3 — shared/outbox (publishInTx + relay)
  ├─ TTBUS-0.4 — docker-compose infra (dev/staging/prod)
  ├─ TTBUS-0.5 — issues-producer integration (reference impl)
  └─ TTBUS-0.6 — tests + docs
```
