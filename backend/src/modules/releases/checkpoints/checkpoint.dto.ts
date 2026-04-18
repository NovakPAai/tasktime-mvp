// TTMP-160: Zod DTOs for CheckpointType and CheckpointTemplate CRUD.
// CheckpointCriterion is a discriminated union; AND-combined within a type (FR-24).
// See docs/tz/TTMP-160.md §12.3.

import { StatusCategory } from '@prisma/client';
import { z } from 'zod';

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a #RRGGBB hex code');

const issueTypesOpt = z.array(z.string().min(1)).max(20).optional();

const criterionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('STATUS_IN'),
    categories: z.array(z.nativeEnum(StatusCategory)).min(1),
    issueTypes: issueTypesOpt,
  }),
  z.object({
    type: z.literal('DUE_BEFORE'),
    days: z.number().int().min(-365).max(365),
    issueTypes: issueTypesOpt,
  }),
  z.object({
    type: z.literal('ASSIGNEE_SET'),
    issueTypes: issueTypesOpt,
  }),
  z.object({
    type: z.literal('CUSTOM_FIELD_VALUE'),
    customFieldId: z.string().uuid(),
    operator: z.enum(['EQUALS', 'NOT_EMPTY', 'IN']),
    value: z.unknown().optional(),
    issueTypes: issueTypesOpt,
  }),
  z.object({
    type: z.literal('ALL_SUBTASKS_DONE'),
    issueTypes: issueTypesOpt,
  }),
  z.object({
    type: z.literal('NO_BLOCKING_LINKS'),
    linkTypeKeys: z.array(z.string().min(1)).max(20).optional(),
    issueTypes: issueTypesOpt,
  }),
]);

export const checkpointCriterionSchema = criterionSchema;

// ─── CheckpointType ──────────────────────────────────────────────────────────

export const createCheckpointTypeDto = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
  color: hexColor.default('#888888'),
  weight: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).default('MEDIUM'),
  offsetDays: z.number().int().min(-365).max(365),
  warningDays: z.number().int().min(0).max(30).default(3),
  criteria: z.array(criterionSchema).min(1).max(10),
  webhookUrl: z.string().url().nullable().optional(),
  minStableSeconds: z.number().int().min(0).max(3600).default(300),
  isActive: z.boolean().default(true),
});

export const updateCheckpointTypeDto = createCheckpointTypeDto.partial();

// ─── CheckpointTemplate ──────────────────────────────────────────────────────

const templateItemInputSchema = z.object({
  checkpointTypeId: z.string().uuid(),
  orderIndex: z.number().int().min(0).max(10000).default(0),
});

export const createCheckpointTemplateDto = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
  items: z
    .array(templateItemInputSchema)
    .min(1)
    .max(20)
    .refine(
      (items) => new Set(items.map((i) => i.checkpointTypeId)).size === items.length,
      'items.checkpointTypeId must be unique within a template',
    ),
});

export const updateCheckpointTemplateDto = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  items: z
    .array(templateItemInputSchema)
    .min(1)
    .max(20)
    .refine(
      (items) => new Set(items.map((i) => i.checkpointTypeId)).size === items.length,
      'items.checkpointTypeId must be unique within a template',
    )
    .optional(),
});

export const cloneCheckpointTemplateDto = z.object({
  name: z.string().min(1).max(100).optional(),
});

// ─── Inferred TS types ───────────────────────────────────────────────────────

export type CreateCheckpointTypeDto = z.infer<typeof createCheckpointTypeDto>;
export type UpdateCheckpointTypeDto = z.infer<typeof updateCheckpointTypeDto>;
export type CreateCheckpointTemplateDto = z.infer<typeof createCheckpointTemplateDto>;
export type UpdateCheckpointTemplateDto = z.infer<typeof updateCheckpointTemplateDto>;
export type CloneCheckpointTemplateDto = z.infer<typeof cloneCheckpointTemplateDto>;
