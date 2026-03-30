import { z } from 'zod';

const categoryEnum = z.enum(['TODO', 'IN_PROGRESS', 'DONE']);
const hexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional();

export const createWorkflowStatusDto = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  category: categoryEnum,
  color: hexColorSchema,
  iconName: z.string().max(100).optional(),
});

export const updateWorkflowStatusDto = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().nullish(),
  category: categoryEnum.optional(),
  color: hexColorSchema,
  iconName: z.string().max(100).nullish(),
});

export type CreateWorkflowStatusDto = z.infer<typeof createWorkflowStatusDto>;
export type UpdateWorkflowStatusDto = z.infer<typeof updateWorkflowStatusDto>;
