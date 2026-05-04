import { eventEnvelopeSchema, type EventEnvelope } from '../eventbus/envelope.js';
import type { OutboxRelayStore } from './relay-store.js';

export type OutboxRelayProducer = {
  connect?(): Promise<void>;
  disconnect?(): Promise<void>;
  sendEnvelope(topic: string, envelope: EventEnvelope): Promise<void>;
};

export type OutboxRelayStats = {
  scanned: number;
  sent: number;
  failed: number;
};

export type OutboxRelayWorkerOptions = {
  store: OutboxRelayStore;
  producer: OutboxRelayProducer;
  intervalMs: number;
  batchSize: number;
  maxAttempts: number;
  cleanupRetentionDays: number;
  now?: () => Date;
};

export class OutboxRelayWorker {
  private timer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly options: OutboxRelayWorkerOptions) {}

  async runOnce(): Promise<OutboxRelayStats> {
    return this.options.store.withPendingBatch(this.options.batchSize, this.options.maxAttempts, async (messages, actions) => {
      const stats: OutboxRelayStats = { scanned: messages.length, sent: 0, failed: 0 };

      for (const message of messages) {
        try {
          const envelope = eventEnvelopeSchema.parse(message.envelope);
          await this.options.producer.sendEnvelope(message.topic, envelope);
          await actions.markSent(message.id);
          stats.sent += 1;
        } catch (err) {
          await actions.markFailed(message.id, err);
          stats.failed += 1;
        }
      }

      return stats;
    });
  }

  async cleanupSent(): Promise<number> {
    const now = this.options.now?.() ?? new Date();
    const cutoff = new Date(now.getTime() - this.options.cleanupRetentionDays * 24 * 60 * 60 * 1000);
    return this.options.store.cleanupSentBefore(cutoff);
  }

  async start(): Promise<void> {
    if (this.timer) return;
    await this.options.producer.connect?.();
    this.timer = setInterval(() => {
      void this.tick().catch((err) => {
        console.error('Outbox relay tick failed', err);
      });
    }, this.options.intervalMs);
    this.cleanupTimer = setInterval(() => {
      void this.cleanupSent().catch((err) => {
        console.error('Outbox relay cleanup failed', err);
      });
    }, 60 * 60 * 1000);
    await this.tick();
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    await this.options.producer.disconnect?.();
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.runOnce();
    } finally {
      this.running = false;
    }
  }
}
