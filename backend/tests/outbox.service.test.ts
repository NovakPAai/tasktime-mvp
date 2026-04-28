import { describe, expect, it } from 'vitest';

import { prisma } from '../src/prisma/client.js';
import { EVENT_TOPICS, eventEnvelopeSchema } from '../src/shared/eventbus/envelope.js';
import { publishInTx } from '../src/shared/outbox/outbox.service.js';
import { markProcessedOnce } from '../src/shared/outbox/processed-messages.service.js';

describe('transactional outbox', () => {
  it('writes a valid envelope inside the caller transaction', async () => {
    const messageId = await prisma.$transaction((tx) =>
      publishInTx(
        tx,
        EVENT_TOPICS.issues,
        'ISSUE_CREATED',
        { issueId: 'issue-1', projectId: 'project-1' },
        { userId: null },
        { occurredAt: new Date('2026-04-26T00:00:00.000Z'), correlationId: 'corr-1' },
      ),
    );

    const row = await prisma.eventOutbox.findUniqueOrThrow({ where: { messageId } });
    expect(row.topic).toBe(EVENT_TOPICS.issues);
    expect(row.type).toBe('ISSUE_CREATED');
    expect(row.sentAt).toBeNull();
    expect(row.attempts).toBe(0);

    const envelope = eventEnvelopeSchema.parse(row.envelope);
    expect(envelope).toMatchObject({
      v: 1,
      messageId,
      type: 'ISSUE_CREATED',
      occurredAt: '2026-04-26T00:00:00.000Z',
      actor: { userId: null },
      payload: { issueId: 'issue-1', projectId: 'project-1' },
      meta: { tenantId: null, correlationId: 'corr-1' },
    });
  });

  it('rolls back the outbox row when the caller transaction fails', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await publishInTx(
          tx,
          EVENT_TOPICS.issues,
          'ISSUE_UPDATED',
          { issueId: 'rollback-issue' },
          { userId: null },
        );
        throw new Error('force rollback');
      }),
    ).rejects.toThrow('force rollback');

    await expect(
      prisma.eventOutbox.findFirstOrThrow({
        where: {
          type: 'ISSUE_UPDATED',
          envelope: { path: ['payload', 'issueId'], equals: 'rollback-issue' },
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects payloads with secret-like fields before writing', async () => {
    await expect(
      prisma.$transaction((tx) =>
        publishInTx(
          tx,
          EVENT_TOPICS.issues,
          'ISSUE_UPDATED',
          { issueId: 'issue-1', actorSnapshot: { password_hash: 'secret' } },
          { userId: null },
        ),
      ),
    ).rejects.toThrow('payload.actorSnapshot.password_hash');
  });
});

describe('processed message deduplication', () => {
  it('marks the first message and skips duplicates for the same consumer group', async () => {
    const messageId = '8d6763ae-ded0-4cb7-9cc5-8bb6cbbd5f87';

    await expect(markProcessedOnce('notifications-service', messageId)).resolves.toBe(true);
    await expect(markProcessedOnce('notifications-service', messageId)).resolves.toBe(false);
    await expect(markProcessedOnce('webhooks-service', messageId)).resolves.toBe(true);
  });
});
