import { config } from './config.js';
import { createEventBusProducer } from './shared/eventbus/producer.js';
import { PrismaOutboxRelayStore } from './shared/outbox/relay-store.js';
import { OutboxRelayWorker } from './shared/outbox/relay-worker.js';

if (!config.NOTIFICATIONS_ENABLED) {
  console.log('Outbox relay disabled: NOTIFICATIONS_ENABLED=false');
  process.exit(0);
}

const worker = new OutboxRelayWorker({
  store: new PrismaOutboxRelayStore(config.OUTBOX_RELAY_TRANSACTION_TIMEOUT_MS),
  producer: createEventBusProducer(),
  intervalMs: config.OUTBOX_RELAY_INTERVAL_MS,
  batchSize: config.OUTBOX_RELAY_BATCH_SIZE,
  maxAttempts: config.OUTBOX_RELAY_MAX_ATTEMPTS,
  cleanupRetentionDays: config.OUTBOX_CLEANUP_RETENTION_DAYS,
});

async function shutdown(signal: string) {
  console.log(`Outbox relay received ${signal}, shutting down`);
  await worker.stop();
  process.exit(0);
}

process.once('SIGINT', () => {
  void shutdown('SIGINT');
});
process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});

worker.start().catch((err) => {
  console.error('Outbox relay failed to start', err);
  process.exit(1);
});
