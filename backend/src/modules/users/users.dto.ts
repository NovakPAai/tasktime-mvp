import { z } from 'zod';

export const updateUserDto = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
});

export const changeRoleDto = z.object({
  role: z.enum(['ADMIN', 'MANAGER', 'USER', 'VIEWER']),
});

export type UpdateUserDto = z.infer<typeof updateUserDto>;
export type ChangeRoleDto = z.infer<typeof changeRoleDto>;
