import { z } from 'zod';

export const createUserDto = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(255),
  isSuperAdmin: z.boolean().optional().default(false),
});

export const updateUserAdminDto = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
  isActive: z.boolean().optional(),
});

export const assignProjectRoleDto = z.object({
  projectId: z.string().uuid(),
  role: z.enum(['ADMIN', 'MANAGER', 'USER', 'VIEWER']),
});

export type CreateUserDto = z.infer<typeof createUserDto>;
export type UpdateUserAdminDto = z.infer<typeof updateUserAdminDto>;
export type AssignProjectRoleDto = z.infer<typeof assignProjectRoleDto>;
