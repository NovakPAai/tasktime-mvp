import { z } from 'zod';
import { SystemRoleType } from '@prisma/client';

const systemRoleValues = Object.values(SystemRoleType) as [SystemRoleType, ...SystemRoleType[]];

export const createUserGroupDto = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).nullable().optional(),
});

export const updateUserGroupDto = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
});

export const addMembersDto = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(500),
});

export const grantProjectRoleDto = z.object({
  projectId: z.string().uuid(),
  roleId: z.string().uuid(),
});

// TTBULK-1 PR-8 — group-level system role grants.
// Reject USER — оно mandatory у всех участников через seed; назначать его через
// группу семантически бессмысленно (и вызовет @@unique violation после первого юзера).
export const grantGroupSystemRoleDto = z.object({
  role: z.enum(systemRoleValues).refine((r) => r !== 'USER', {
    message: 'USER роль назначается автоматически, не через группы',
  }),
});

export type CreateUserGroupDto = z.infer<typeof createUserGroupDto>;
export type UpdateUserGroupDto = z.infer<typeof updateUserGroupDto>;
export type AddMembersDto = z.infer<typeof addMembersDto>;
export type GrantProjectRoleDto = z.infer<typeof grantProjectRoleDto>;
export type GrantGroupSystemRoleDto = z.infer<typeof grantGroupSystemRoleDto>;
