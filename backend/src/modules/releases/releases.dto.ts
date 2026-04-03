import { z } from 'zod';

export const createReleaseDto = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(5000).optional(),
  level: z.enum(['MINOR', 'MAJOR']),
});

export const updateReleaseDto = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(5000).nullable().optional(),
  level: z.enum(['MINOR', 'MAJOR']).optional(),
  state: z.enum(['DRAFT', 'READY', 'RELEASED']).optional(),
  releaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export const moveIssuesToReleaseDto = z.object({
  issueIds: z.array(z.string().uuid()).min(1),
});

export const manageSprintsInReleaseDto = z.object({
  sprintIds: z.array(z.string().uuid()).min(1),
});

export type CreateReleaseDto = z.infer<typeof createReleaseDto>;
export type UpdateReleaseDto = z.infer<typeof updateReleaseDto>;
export type MoveIssuesToReleaseDto = z.infer<typeof moveIssuesToReleaseDto>;
export type ManageSprintsInReleaseDto = z.infer<typeof manageSprintsInReleaseDto>;
