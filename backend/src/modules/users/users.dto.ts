import { z } from 'zod';

export const updateUserDto = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
});

export const assignSystemRoleDto = z.object({
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'RELEASE_MANAGER', 'USER', 'AUDITOR']),
});

export const setSystemRolesDto = z.object({
  roles: z
    .array(z.enum(['SUPER_ADMIN', 'ADMIN', 'RELEASE_MANAGER', 'USER', 'AUDITOR']))
    .min(1)
    .refine((roles) => roles.includes('USER'), { message: 'USER role is mandatory and must be included' }),
});

export type UpdateUserDto = z.infer<typeof updateUserDto>;
export type AssignSystemRoleDto = z.infer<typeof assignSystemRoleDto>;
export type SetSystemRolesDto = z.infer<typeof setSystemRolesDto>;
