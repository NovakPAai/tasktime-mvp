import { z } from 'zod';
import { SystemRoleType } from '@prisma/client';

const systemRoleValues = Object.values(SystemRoleType) as [SystemRoleType, ...SystemRoleType[]];

export const updateUserDto = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
});

// TTSRH-1 PR-7: per-user UI preferences (search columns, page size).
// We keep the shape versioned-by-object (`searchDefaults`) to allow future keys
// (`checkpointDefaults`, etc.) without migrating existing rows.
export const updatePreferencesDto = z
  .object({
    searchDefaults: z
      .object({
        columns: z.array(z.string().min(1).max(100)).max(50).optional(),
        pageSize: z.number().int().min(10).max(100).optional(),
      })
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one preference section must be provided' });

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
export type UpdatePreferencesDto = z.infer<typeof updatePreferencesDto>;
export type AssignSystemRoleDto = z.infer<typeof assignSystemRoleDto>;
export type SetSystemRolesDto = z.infer<typeof setSystemRolesDto>;
