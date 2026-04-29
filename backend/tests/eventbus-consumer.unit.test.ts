import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EventEnvelope } from '../src/shared/eventbus/envelope.js';
import { processKafkaMessage } from '../src/shared/eventbus/consumer.js';
import * as processedMessages from '../src/shared/outbox/processed-messages.service.js';

const envelope: EventEnvelope = {
  v: 1,
  messageId: '97d6ed68-8bec-43d7-bd71-eb855e11498b',
  type: 'ISSUE_CREATED',
  occurredAt: '2026-04-28T00:00:00.000Z',
  actor: { userId: null },
  payload: { issueId: 'issue-1' },
  meta: { tenantId: null },
};

function message(value: unknown) {
  return {
    value: Buffer.from(JSON.stringify(value)),
    offset: '42',
  };
}

describe('processKafkaMessage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('handles a valid envelope and marks it processed', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(processedMessages, 'hasProcessedMessage').mockResolvedValue(false);
    const mark = vi.spyOn(processedMessages, 'markProcessedOnce').mockResolvedValue(true);

    await expect(
      processKafkaMessage({
        consumerGroup: 'notifications-service',
        topic: 'tt.issues',
        partition: 0,
        message: message(envelope),
        handler,
      }),
    ).resolves.toBe('processed');

    expect(handler).toHaveBeenCalledWith(envelope, envelope.payload, { topic: 'tt.issues', partition: 0, offset: '42' });
    expect(mark).toHaveBeenCalledWith('notifications-service', envelope.messageId);
  });

  it('skips an already processed envelope', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(processedMessages, 'hasProcessedMessage').mockResolvedValue(true);
    const mark = vi.spyOn(processedMessages, 'markProcessedOnce').mockResolvedValue(true);

    await expect(
      processKafkaMessage({
        consumerGroup: 'notifications-service',
        topic: 'tt.issues',
        partition: 0,
        message: message(envelope),
        handler,
      }),
    ).resolves.toBe('skipped');

    expect(handler).not.toHaveBeenCalled();
    expect(mark).not.toHaveBeenCalled();
  });
});
