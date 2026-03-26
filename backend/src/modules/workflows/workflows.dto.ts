import { z } from 'zod';

export const createWorkflowDto = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  isDefault: z.boolean().optional(),
});

export const updateWorkflowDto = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().nullish(),
  isDefault: z.boolean().optional(),
});

export const createWorkflowStepDto = z.object({
  statusId: z.string().uuid(),
  isInitial: z.boolean().optional(),
  orderIndex: z.number().int().nonnegative().optional(),
});

export const updateWorkflowStepDto = z.object({
  isInitial: z.boolean().optional(),
  orderIndex: z.number().int().nonnegative().optional(),
});

const rulesField = z.array(z.record(z.unknown())).nullish();
const rulesFieldNullish = z.array(z.record(z.unknown())).nullish();

export const createWorkflowTransitionDto = z.object({
  name: z.string().min(1).max(200),
  fromStatusId: z.string().uuid().nullable().optional(),
  toStatusId: z.string().uuid(),
  isGlobal: z.boolean().optional(),
  orderIndex: z.number().int().nonnegative().optional(),
  conditions: rulesField,
  validators: rulesField,
  postFunctions: rulesField,
  screenId: z.string().uuid().nullable().optional(),
});

export const updateWorkflowTransitionDto = z.object({
  name: z.string().min(1).max(200).optional(),
  fromStatusId: z.string().uuid().nullable().optional(),
  toStatusId: z.string().uuid().optional(),
  isGlobal: z.boolean().optional(),
  orderIndex: z.number().int().nonnegative().optional(),
  conditions: rulesFieldNullish,
  validators: rulesFieldNullish,
  postFunctions: rulesFieldNullish,
  screenId: z.string().uuid().nullable().optional(),
});

export type CreateWorkflowDto = z.infer<typeof createWorkflowDto>;
export type UpdateWorkflowDto = z.infer<typeof updateWorkflowDto>;
export type CreateWorkflowStepDto = z.infer<typeof createWorkflowStepDto>;
export type UpdateWorkflowStepDto = z.infer<typeof updateWorkflowStepDto>;
export type CreateWorkflowTransitionDto = z.infer<typeof createWorkflowTransitionDto>;
export type UpdateWorkflowTransitionDto = z.infer<typeof updateWorkflowTransitionDto>;
