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

// TTSRH-1 §5.12.3: conditionMode governs how КТ evaluates issues.
//   • STRUCTURED — уже-существующий путь через criteria[].
//   • TTQL       — criteria[] игнорируются; evaluate через compiled TTQL-query.
//   • COMBINED   — оба пути; issue должен пройти обе проверки (§5.12.5).
const conditionModeEnum = z.enum(['STRUCTURED', 'TTQL', 'COMBINED']);

// TTQL limit: 10K chars (matches /search/issues body DTO). Pragmatic guard —
// a 10K-char TTS-QL expression is already unreadable and likely a bug.
const ttqlConditionSchema = z.string().min(1).max(10_000).nullable().optional();

const checkpointTypeBase = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
  color: hexColor.default('#888888'),
  weight: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).default('MEDIUM'),
  offsetDays: z.number().int().min(-365).max(365),
  warningDays: z.number().int().min(0).max(30).default(3),
  criteria: z.array(criterionSchema).max(10),
  conditionMode: conditionModeEnum.default('STRUCTURED'),
  ttqlCondition: ttqlConditionSchema,
  webhookUrl: z.string().url().nullable().optional(),
  minStableSeconds: z.number().int().min(0).max(3600).default(300),
  isActive: z.boolean().default(true),
});

// superRefine enforces cross-field contract (§5.12.3):
//   STRUCTURED → criteria required (min 1), ttqlCondition forbidden.
//   TTQL       → ttqlCondition required, criteria forbidden (but we relax to
//                "empty array allowed" since old callers may still send [] по
//                PATCH-семантике — безопасно для evaluator'а, он игнорирует).
//   COMBINED   → оба обязательны.
export const createCheckpointTypeDto = checkpointTypeBase.superRefine((val, ctx) => {
  const mode = val.conditionMode ?? 'STRUCTURED';
  if (mode === 'STRUCTURED') {
    if (val.criteria.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['criteria'], message: 'STRUCTURED mode requires at least one criterion.' });
    }
    if (val.ttqlCondition != null && val.ttqlCondition.length > 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ttqlCondition'], message: 'ttqlCondition must be empty in STRUCTURED mode.' });
    }
  } else if (mode === 'TTQL') {
    if (!val.ttqlCondition || val.ttqlCondition.trim().length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ttqlCondition'], message: 'TTQL mode requires a non-empty ttqlCondition.' });
    }
  } else if (mode === 'COMBINED') {
    if (val.criteria.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['criteria'], message: 'COMBINED mode requires at least one criterion.' });
    }
    if (!val.ttqlCondition || val.ttqlCondition.trim().length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ttqlCondition'], message: 'COMBINED mode requires a non-empty ttqlCondition.' });
    }
  }
});

// updateCheckpointTypeDto — same schema but all top-level fields optional.
// superRefine applies only when `conditionMode` is being changed (or all fields
// are present) — otherwise PATCH-семантика работает (caller may patch name
// only). We skip the cross-field check if `conditionMode` is absent.
export const updateCheckpointTypeDto = checkpointTypeBase.partial().superRefine((val, ctx) => {
  if (val.conditionMode === undefined) return; // plain PATCH — skip cross-field
  const mode = val.conditionMode;
  if (mode === 'STRUCTURED') {
    if (val.ttqlCondition != null && val.ttqlCondition.length > 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ttqlCondition'], message: 'ttqlCondition must be empty in STRUCTURED mode.' });
    }
  } else if (mode === 'TTQL' || mode === 'COMBINED') {
    const needsTtql = val.ttqlCondition === undefined || val.ttqlCondition == null || val.ttqlCondition.trim().length === 0;
    if (needsTtql) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ttqlCondition'], message: `${mode} mode requires a non-empty ttqlCondition.` });
    }
    if (mode === 'COMBINED' && val.criteria !== undefined && val.criteria.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['criteria'], message: 'COMBINED mode requires at least one criterion.' });
    }
  }
});

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

// TTSRH-1 PR-17: dry-run preview для TTQL/STRUCTURED/COMBINED condition.
// Caller передаёт either `criteria` либо `ttqlCondition` (или оба для COMBINED).
// Валидация соответствия mode ↔ payload — в сервисе (чтобы не дублировать
// superRefine правила из createCheckpointTypeDto).
export const previewCheckpointConditionDto = z.object({
  releaseId: z.string().uuid(),
  conditionMode: conditionModeEnum.default('STRUCTURED'),
  criteria: z.array(criterionSchema).max(10).optional(),
  ttqlCondition: z.string().min(1).max(10_000).nullable().optional(),
  offsetDays: z.number().int().min(-365).max(365).optional(),
  warningDays: z.number().int().min(0).max(30).optional(),
});

// ─── Inferred TS types ───────────────────────────────────────────────────────

export type CreateCheckpointTypeDto = z.infer<typeof createCheckpointTypeDto>;
export type UpdateCheckpointTypeDto = z.infer<typeof updateCheckpointTypeDto>;
export type CreateCheckpointTemplateDto = z.infer<typeof createCheckpointTemplateDto>;
export type UpdateCheckpointTemplateDto = z.infer<typeof updateCheckpointTemplateDto>;
export type CloneCheckpointTemplateDto = z.infer<typeof cloneCheckpointTemplateDto>;
export type PreviewCheckpointConditionDto = z.infer<typeof previewCheckpointConditionDto>;
