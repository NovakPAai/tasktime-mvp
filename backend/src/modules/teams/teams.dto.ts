import { z } from 'zod';

export const createTeamDto = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
});

export const updateTeamDto = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
});

export const updateMembersDto = z.object({
  userIds: z.array(z.string().uuid()).min(1),
});

export type CreateTeamDto = z.infer<typeof createTeamDto>;
export type UpdateTeamDto = z.infer<typeof updateTeamDto>;
export type UpdateMembersDto = z.infer<typeof updateMembersDto>;

