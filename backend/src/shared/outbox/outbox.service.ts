import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';

import { type EventActor, type EventEnvelope, eventEnvelopeSchema } from '../eventbus/envelope.js';

export type PublishInTxOptions = {
  correlationId?: string;
  occurredAt?: Date;
};

const FORBIDDEN_PAYLOAD_KEYS = new Set([
  'password',
  'passwordHash',
  'password_hash',
  'token',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'apiKey',
  'api_key',
  'secret',
]);

const FORBIDDEN_PAYLOAD_KEYS_NORMALIZED = new Set(
  [...FORBIDDEN_PAYLOAD_KEYS].map((key) => key.replace(/[_-]/g, '').toLowerCase()),
);

function toJsonPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const serialized = JSON.stringify(payload);
  if (serialized === undefined) {
    throw new Error('Event payload must be JSON-serializable');
  }
  return JSON.parse(serialized) as Record<string, unknown>;
}

function assertNoSecretKeys(value: unknown, path = 'payload') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSecretKeys(item, `${path}[${index}]`));
    return;
  }

  if (typeof value !== 'object' || value === null) {
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const normalizedKey = key.replace(/[_-]/g, '').toLowerCase();
    if (FORBIDDEN_PAYLOAD_KEYS_NORMALIZED.has(normalizedKey)) {
      throw new Error(`Event payload must not contain secret field "${path}.${key}"`);
    }
    assertNoSecretKeys(nestedValue, `${path}.${key}`);
  }
}

export async function publishInTx(
  tx: Prisma.TransactionClient,
  topic: string,
  type: string,
  payload: Record<string, unknown>,
  actor: EventActor,
  options: PublishInTxOptions = {},
): Promise<string> {
  assertNoSecretKeys(payload);
  const jsonPayload = toJsonPayload(payload);

  const messageId = randomUUID();
  const envelope: EventEnvelope = eventEnvelopeSchema.parse({
    v: 1,
    messageId,
    type,
    occurredAt: (options.occurredAt ?? new Date()).toISOString(),
    actor,
    payload: jsonPayload,
    meta: {
      tenantId: null,
      ...(options.correlationId && { correlationId: options.correlationId }),
    },
  });

  await tx.eventOutbox.create({
    data: {
      topic,
      messageId,
      type,
      envelope: envelope as unknown as Prisma.InputJsonObject,
    },
  });

  return messageId;
}
