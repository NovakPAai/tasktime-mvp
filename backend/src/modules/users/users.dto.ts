import { z } from 'zod';
import { SystemRoleType } from '@prisma/client';

const systemRoleValues = Object.values(SystemRoleType) as [SystemRoleType, ...SystemRoleType[]];

export const updateUserDto = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
});

export const assignSystemRoleDto = z.object({
  role: z.enum(systemRoleValues),
});

export const setSystemRolesDto = z.object({
  roles: z
    .array(z.enum(systemRoleValues))
    .min(1)
    .refine((roles) => roles.includes('USER'), { message: 'USER role is mandatory and must be included' }),
});

export type UpdateUserDto = z.infer<typeof updateUserDto>;
export type AssignSystemRoleDto = z.infer<typeof assignSystemRoleDto>;
export type SetSystemRolesDto = z.infer<typeof setSystemRolesDto>;
