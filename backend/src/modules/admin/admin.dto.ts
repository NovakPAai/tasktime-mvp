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

export const assignProjectRoleDto = z
  .object({
    projectId: z.string().uuid(),
    roleId: z.string().uuid().optional(),                                   // FK на ProjectRoleDefinition
    role: z.enum(['ADMIN', 'MANAGER', 'USER', 'VIEWER']).optional(),       // обратная совместимость
  })
  .superRefine((data, ctx) => {
    // Legacy clients must keep sending `role`; new clients may send `roleId` instead or both.
    // Reject at validation level instead of surfacing the service-level "role or roleId is required"
    // as a 400 from deeper in the stack.
    if (!data.role && !data.roleId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['role'],
        message: 'Нужно передать role (legacy) или roleId',
      });
    }
  });

export const updateSystemSettingsDto = z.object({
  sessionLifetimeMinutes: z.number().int().min(5).max(10080),
});

export type CreateUserDto = z.infer<typeof createUserDto>;
export type UpdateUserAdminDto = z.infer<typeof updateUserAdminDto>;
export type AssignProjectRoleDto = z.infer<typeof assignProjectRoleDto>;
export type UpdateSystemSettingsDto = z.infer<typeof updateSystemSettingsDto>;
