import { describe, expect, it } from 'vitest';

import type { EventEnvelope } from '../src/shared/eventbus/envelope.js';
import type { OutboxRelayProducer } from '../src/shared/outbox/relay-worker.js';
import { OutboxRelayWorker } from '../src/shared/outbox/relay-worker.js';
import type { OutboxRelayBatchActions, OutboxRelayMessage, OutboxRelayStore } from '../src/shared/outbox/relay-store.js';

const validEnvelope = (messageId: string): EventEnvelope => ({
  v: 1,
  messageId,
  type: 'ISSUE_CREATED',
  occurredAt: '2026-04-28T00:00:00.000Z',
  actor: { userId: null },
  payload: { issueId: 'issue-1' },
  meta: { tenantId: null },
});

class MemoryRelayStore implements OutboxRelayStore {
  sent = new Set<string>();
  failed = new Map<string, unknown>();
  cleanupCutoff: Date | null = null;

  constructor(private readonly messages: OutboxRelayMessage[]) {}

  async withPendingBatch<T>(
    limit: number,
    maxAttempts: number,
    handler: (messages: OutboxRelayMessage[], actions: OutboxRelayBatchActions) => Promise<T>,
  ): Promise<T> {
    const batch = this.messages
      .filter((message) => !this.sent.has(message.id) && !this.failed.has(message.id) && message.attempts < maxAttempts)
      .slice(0, limit);

    return handler(batch, {
      markSent: async (id) => {
        this.sent.add(id);
      },
      markFailed: async (id, error) => {
        this.failed.set(id, error);
      },
    });
  }

  async cleanupSentBefore(cutoff: Date): Promise<number> {
    this.cleanupCutoff = cutoff;
    return 3;
  }
}

class MemoryProducer implements OutboxRelayProducer {
  sent: Array<{ topic: string; envelope: EventEnvelope }> = [];

  constructor(private readonly failingMessageId?: string) {}

  async sendEnvelope(topic: string, envelope: EventEnvelope): Promise<void> {
    if (envelope.messageId === this.failingMessageId) {
      throw new Error('Kafka unavailable');
    }
    this.sent.push({ topic, envelope });
  }
}

function makeWorker(store: OutboxRelayStore, producer: OutboxRelayProducer, now = () => new Date('2026-04-28T00:00:00.000Z')) {
  return new OutboxRelayWorker({
    store,
    producer,
    intervalMs: 500,
    batchSize: 100,
    maxAttempts: 10,
    cleanupRetentionDays: 7,
    now,
  });
}

describe('OutboxRelayWorker', () => {
  it('publishes valid pending messages and marks them sent', async () => {
    const store = new MemoryRelayStore([
      { id: 'row-1', topic: 'tt.issues', messageId: 'm1', envelope: validEnvelope('475161a7-db66-4f70-8a22-4b737a6a6d28'), attempts: 0 },
    ]);
    const producer = new MemoryProducer();

    const stats = await makeWorker(store, producer).runOnce();

    expect(stats).toEqual({ scanned: 1, sent: 1, failed: 0 });
    expect(producer.sent).toHaveLength(1);
    expect(store.sent.has('row-1')).toBe(true);
  });

  it('marks a row failed when publishing throws', async () => {
    const messageId = 'fc3fa374-7e6e-4fe1-a6cf-f6db38244bc5';
    const store = new MemoryRelayStore([
      { id: 'row-1', topic: 'tt.issues', messageId, envelope: validEnvelope(messageId), attempts: 0 },
    ]);
    const producer = new MemoryProducer(messageId);

    const stats = await makeWorker(store, producer).runOnce();

    expect(stats).toEqual({ scanned: 1, sent: 0, failed: 1 });
    expect(store.failed.get('row-1')).toBeInstanceOf(Error);
  });

  it('does not pick messages at max attempts', async () => {
    const store = new MemoryRelayStore([
      { id: 'row-1', topic: 'tt.issues', messageId: 'm1', envelope: validEnvelope('475161a7-db66-4f70-8a22-4b737a6a6d28'), attempts: 10 },
    ]);
    const producer = new MemoryProducer();

    const stats = await makeWorker(store, producer).runOnce();

    expect(stats).toEqual({ scanned: 0, sent: 0, failed: 0 });
    expect(producer.sent).toHaveLength(0);
  });

  it('calculates cleanup cutoff from retention days', async () => {
    const store = new MemoryRelayStore([]);

    await expect(makeWorker(store, new MemoryProducer()).cleanupSent()).resolves.toBe(3);

    expect(store.cleanupCutoff?.toISOString()).toBe('2026-04-21T00:00:00.000Z');
  });
});
