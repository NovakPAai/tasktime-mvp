# Event Bus Architecture

TTBUS-0 introduces a Kafka-backed event bus with a PostgreSQL transactional outbox. Business modules write domain events into `event_outbox` in the same database transaction as the business change. A separate relay process publishes pending rows to Kafka and marks rows as sent only after Kafka accepts the message.

## Envelope

All Kafka messages use the versioned envelope from `backend/src/shared/eventbus/envelope.ts`:

```ts
{
  v: 1,
  messageId: "uuid",
  type: "ISSUE_CREATED",
  occurredAt: "2026-04-28T00:00:00.000Z",
  actor: { userId: "uuid-or-null", ip?: "...", userAgent?: "..." },
  payload: {},
  meta: { tenantId: null, correlationId?: "..." }
}
```

`messageId` is both the Kafka message key and the idempotency key for consumers.

## Topics

Domain topics are intentionally split by business area:

- `tt.issues`
- `tt.comments`
- `tt.releases`
- `tt.workflow`
- `tt.notifications.dlq`

Dev and staging use one partition per topic. Production compose creates three partitions per topic and keeps business events for 7 days. The DLQ topic keeps events for 30 days.

## Producer Flow

Use `publishInTx(tx, topic, type, payload, actor)` from inside the same `prisma.$transaction(...)` callback as the business mutation.

Payloads must not include secrets. `publishInTx` rejects secret-like keys such as `password`, `password_hash`, `token`, `access_token`, `refresh_token`, `api_key`, and `secret`, including nested fields.

## Relay Flow

The relay entrypoint is `backend/src/relay.ts`.

Run locally:

```bash
make events
```

Run after a backend build:

```bash
cd backend
npm run events:relay
```

The relay:

- reads unsent rows with `FOR UPDATE SKIP LOCKED`;
- skips rows whose `attempts` reached `OUTBOX_RELAY_MAX_ATTEMPTS`;
- publishes one Kafka message per outbox row;
- sets `sent_at` only after successful publish;
- increments `attempts` and stores `last_error` after failed publish.

## Consumer Gotchas

Consumers should use `EventBusConsumer` or `processKafkaMessage` so every message goes through envelope validation and `processed_messages` deduplication.

Handler functions must be idempotent. The event bus is at-least-once: retries can publish or deliver a duplicate message, and the dedup table only guarantees one successful handler run per `(consumerGroup, messageId)`.

The current consumer helper marks a message as processed after the handler resolves. If the handler performs side effects and then throws, Kafka can redeliver the message. Consumer handlers should either make side effects idempotent or persist their own progress before external calls.

## Operations

Kafka and the relay are opt-in in Docker Compose via the `events` profile. Kafka is not exposed outside the Docker network in staging or production.

Useful environment variables:

- `NOTIFICATIONS_ENABLED`
- `KAFKA_BROKERS`
- `KAFKA_CLIENT_ID`
- `OUTBOX_RELAY_INTERVAL_MS`
- `OUTBOX_RELAY_BATCH_SIZE`
- `OUTBOX_RELAY_MAX_ATTEMPTS`
- `OUTBOX_RELAY_TRANSACTION_TIMEOUT_MS`
- `OUTBOX_CLEANUP_RETENTION_DAYS`

Tail topics after a backend build:

```bash
cd backend
npm run events:tail -- tt.issues
```

During development:

```bash
cd backend
npm run events:tail:dev -- tt.issues
```
