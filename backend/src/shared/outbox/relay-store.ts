import { prisma } from '../../prisma/client.js';

export type OutboxRelayMessage = {
  id: string;
  topic: string;
  messageId: string;
  envelope: unknown;
  attempts: number;
};

export type OutboxRelayBatchActions = {
  markSent(id: string): Promise<void>;
  markFailed(id: string, error: unknown): Promise<void>;
};

export type OutboxRelayStore = {
  withPendingBatch<T>(
    limit: number,
    maxAttempts: number,
    handler: (messages: OutboxRelayMessage[], actions: OutboxRelayBatchActions) => Promise<T>,
  ): Promise<T>;
  cleanupSentBefore(cutoff: Date): Promise<number>;
};

function formatRelayError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 2000);
}

export class PrismaOutboxRelayStore implements OutboxRelayStore {
  constructor(private readonly transactionTimeoutMs: number) {}

  async withPendingBatch<T>(
    limit: number,
    maxAttempts: number,
    handler: (messages: OutboxRelayMessage[], actions: OutboxRelayBatchActions) => Promise<T>,
  ): Promise<T> {
    return prisma.$transaction(
      async (tx) => {
        const messages = await tx.$queryRaw<OutboxRelayMessage[]>`
          SELECT
            id,
            topic,
            message_id AS "messageId",
            envelope,
            attempts
          FROM event_outbox
          WHERE sent_at IS NULL
            AND attempts < ${maxAttempts}
          ORDER BY created_at ASC
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        `;

        const actions: OutboxRelayBatchActions = {
          markSent: async (id: string) => {
            await tx.eventOutbox.update({
              where: { id },
              data: { sentAt: new Date(), lastError: null },
            });
          },
          markFailed: async (id: string, error: unknown) => {
            await tx.eventOutbox.update({
              where: { id },
              data: {
                attempts: { increment: 1 },
                lastError: formatRelayError(error),
              },
            });
          },
        };

        return handler(messages, actions);
      },
      { timeout: this.transactionTimeoutMs },
    );
  }

  async cleanupSentBefore(cutoff: Date): Promise<number> {
    const result = await prisma.eventOutbox.deleteMany({
      where: {
        sentAt: { lt: cutoff },
      },
    });
    return result.count;
  }
}
