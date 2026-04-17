import { z } from 'zod';

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

export type CreateUserGroupDto = z.infer<typeof createUserGroupDto>;
export type UpdateUserGroupDto = z.infer<typeof updateUserGroupDto>;
export type AddMembersDto = z.infer<typeof addMembersDto>;
export type GrantProjectRoleDto = z.infer<typeof grantProjectRoleDto>;
