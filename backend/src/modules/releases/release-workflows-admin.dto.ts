import { z } from 'zod';

export const createReleaseWorkflowDto = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  releaseType: z.enum(['ATOMIC', 'INTEGRATION']).nullable().optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const updateReleaseWorkflowDto = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(500).nullish(),
  releaseType: z.enum(['ATOMIC', 'INTEGRATION']).nullable().optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const createReleaseWorkflowStepDto = z.object({
  statusId: z.string().uuid(),
  isInitial: z.boolean().optional(),
  orderIndex: z.number().int().nonnegative().optional(),
});

export const updateReleaseWorkflowStepDto = z.object({
  isInitial: z.boolean().optional(),
  orderIndex: z.number().int().nonnegative().optional(),
});

const conditionsField = z.array(z.record(z.unknown())).nullish();

export const createReleaseWorkflowTransitionDto = z.object({
  name: z.string().min(1).max(200),
  fromStatusId: z.string().uuid(),
  toStatusId: z.string().uuid(),
  isGlobal: z.boolean().optional(),
  conditions: conditionsField,
});

export const updateReleaseWorkflowTransitionDto = z.object({
  name: z.string().min(1).max(200).optional(),
  fromStatusId: z.string().uuid().optional(),
  toStatusId: z.string().uuid().optional(),
  isGlobal: z.boolean().optional(),
  conditions: conditionsField,
});

export type CreateReleaseWorkflowDto = z.infer<typeof createReleaseWorkflowDto>;
export type UpdateReleaseWorkflowDto = z.infer<typeof updateReleaseWorkflowDto>;
export type CreateReleaseWorkflowStepDto = z.infer<typeof createReleaseWorkflowStepDto>;
export type UpdateReleaseWorkflowStepDto = z.infer<typeof updateReleaseWorkflowStepDto>;
export type CreateReleaseWorkflowTransitionDto = z.infer<typeof createReleaseWorkflowTransitionDto>;
export type UpdateReleaseWorkflowTransitionDto = z.infer<typeof updateReleaseWorkflowTransitionDto>;
