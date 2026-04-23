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
      // Form-level issue: the rule "role OR roleId" isn't specific to either field.
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [],
        message: 'Нужно передать role (legacy) или roleId',
      });
    }
  });

export const updateSystemSettingsDto = z.object({
  sessionLifetimeMinutes: z.number().int().min(5).max(10080),
});

// TTBULK-1 PR-7 — bulk operations runtime limits.
export const updateBulkOpsSettingsDto = z
  .object({
    maxConcurrentPerUser: z.number().int().min(1).max(20).optional(),
    maxItems: z.number().int().min(100).max(50_000).optional(),
  })
  .refine(
    (v) => v.maxConcurrentPerUser !== undefined || v.maxItems !== undefined,
    { message: 'Нужно передать хотя бы одно поле (maxConcurrentPerUser или maxItems)' },
  );

export type CreateUserDto = z.infer<typeof createUserDto>;
export type UpdateUserAdminDto = z.infer<typeof updateUserAdminDto>;
export type AssignProjectRoleDto = z.infer<typeof assignProjectRoleDto>;
export type UpdateSystemSettingsDto = z.infer<typeof updateSystemSettingsDto>;
export type UpdateBulkOpsSettingsDto = z.infer<typeof updateBulkOpsSettingsDto>;
