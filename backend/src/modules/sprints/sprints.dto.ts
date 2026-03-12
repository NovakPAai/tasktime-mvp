import { z } from 'zod';

export const createSprintDto = z.object({
  name: z.string().min(1).max(200),
  goal: z.string().max(2000).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  projectTeamId: z.string().uuid().optional(),
  businessTeamId: z.string().uuid().optional(),
  flowTeamId: z.string().uuid().optional(),
});

export const updateSprintDto = z.object({
  name: z.string().min(1).max(200).optional(),
  goal: z.string().max(2000).nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
  projectTeamId: z.string().uuid().nullable().optional(),
  businessTeamId: z.string().uuid().nullable().optional(),
  flowTeamId: z.string().uuid().nullable().optional(),
});

export const moveIssuesToSprintDto = z.object({
  issueIds: z.array(z.string().uuid()).min(1),
});

export type CreateSprintDto = z.infer<typeof createSprintDto>;
export type UpdateSprintDto = z.infer<typeof updateSprintDto>;
export type MoveIssuesToSprintDto = z.infer<typeof moveIssuesToSprintDto>;
