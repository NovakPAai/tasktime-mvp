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

// statusId accepts any non-empty string (not strictly UUID): seeded release statuses
// (see prisma/seed-release-workflow.ts) use short slugs like `rs-draft`. Referential
// integrity is enforced by the service layer (status existence check) and the DB
// foreign key, so the UUID-format constraint was rejecting legitimate seed IDs.
export const createReleaseWorkflowStepDto = z.object({
  statusId: z.string().min(1),
  isInitial: z.boolean().optional(),
  orderIndex: z.number().int().nonnegative().optional(),
});

export const updateReleaseWorkflowStepDto = z.object({
  isInitial: z.boolean().optional(),
  orderIndex: z.number().int().nonnegative().optional(),
  // Позиции хранятся как Float — ReactFlow допускает subpixel значения при drag.
  // Range ±100_000 — практическая граница canvas'а при большом workflow с zoom-out.
  // Более узкий guard раньше молча отбрасывал PATCH при большом разлёте нод (drag-stop
  // catches() ошибку → позиция не сохранялась, пользователь видел snap-back без warning).
  positionX: z.number().min(-100000).max(100000).optional(),
  positionY: z.number().min(-100000).max(100000).optional(),
});

const conditionsField = z.array(z.record(z.unknown())).nullish();

// See comment above createReleaseWorkflowStepDto: from/to statusId are slugs or UUIDs.
export const createReleaseWorkflowTransitionDto = z.object({
  name: z.string().min(1).max(200),
  fromStatusId: z.string().min(1),
  toStatusId: z.string().min(1),
  isGlobal: z.boolean().optional(),
  conditions: conditionsField,
});

export const updateReleaseWorkflowTransitionDto = z.object({
  name: z.string().min(1).max(200).optional(),
  fromStatusId: z.string().min(1).optional(),
  toStatusId: z.string().min(1).optional(),
  isGlobal: z.boolean().optional(),
  conditions: conditionsField,
});

export type CreateReleaseWorkflowDto = z.infer<typeof createReleaseWorkflowDto>;
export type UpdateReleaseWorkflowDto = z.infer<typeof updateReleaseWorkflowDto>;
export type CreateReleaseWorkflowStepDto = z.infer<typeof createReleaseWorkflowStepDto>;
export type UpdateReleaseWorkflowStepDto = z.infer<typeof updateReleaseWorkflowStepDto>;
export type CreateReleaseWorkflowTransitionDto = z.infer<typeof createReleaseWorkflowTransitionDto>;
export type UpdateReleaseWorkflowTransitionDto = z.infer<typeof updateReleaseWorkflowTransitionDto>;
