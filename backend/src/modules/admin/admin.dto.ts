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
  roleId: z.string().uuid(),                                              // FK на ProjectRoleDefinition
  role: z.enum(['ADMIN', 'MANAGER', 'USER', 'VIEWER']).optional(),       // обратная совместимость
});

export const updateSystemSettingsDto = z.object({
  sessionLifetimeMinutes: z.number().int().min(5).max(10080),
});

export type CreateUserDto = z.infer<typeof createUserDto>;
export type UpdateUserAdminDto = z.infer<typeof updateUserAdminDto>;
export type AssignProjectRoleDto = z.infer<typeof assignProjectRoleDto>;
export type UpdateSystemSettingsDto = z.infer<typeof updateSystemSettingsDto>;
