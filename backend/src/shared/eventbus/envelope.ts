import { z } from 'zod';

export const EVENT_TOPICS = {
  issues: 'tt.issues',
  comments: 'tt.comments',
  releases: 'tt.releases',
  workflow: 'tt.workflow',
  notificationsDlq: 'tt.notifications.dlq',
} as const;

export type EventTopic = (typeof EVENT_TOPICS)[keyof typeof EVENT_TOPICS];

export const eventActorSchema = z.object({
  userId: z.string().uuid().nullable(),
  ip: z.string().optional(),
  userAgent: z.string().optional(),
});

export type EventActor = z.infer<typeof eventActorSchema>;

export const eventEnvelopeSchema = z.object({
  v: z.literal(1),
  messageId: z.string().uuid(),
  type: z.string().min(1),
  occurredAt: z.string().datetime(),
  actor: eventActorSchema,
  payload: z.record(z.unknown()),
  meta: z.object({
    tenantId: z.string().nullable(),
    correlationId: z.string().optional(),
  }),
});

export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;
