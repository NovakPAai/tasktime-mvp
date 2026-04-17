import { z } from 'zod';
import { ProjectPermission } from '@prisma/client';

export const createSchemeDto = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  isDefault: z.boolean().optional(),
});

export const updateSchemeDto = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().nullish(),
  isDefault: z.boolean().optional(),
});

export const createRoleDefinitionDto = z.object({
  name: z.string().min(1).max(64),
  key: z.string().min(1).max(32).regex(/^[A-Z_]+$/, 'Только заглавные буквы и _'),
  description: z.string().max(255).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export const updateRoleDefinitionDto = z.object({
  name: z.string().min(1).max(64).optional(),
  description: z.string().max(255).nullish(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullish(),
});

export const updatePermissionsDto = z.object({
  permissions: z.record(z.nativeEnum(ProjectPermission), z.boolean()),
});

export const attachProjectDto = z.object({
  projectId: z.string().uuid(),
});

export type CreateSchemeDto = z.infer<typeof createSchemeDto>;
export type UpdateSchemeDto = z.infer<typeof updateSchemeDto>;
export type CreateRoleDefinitionDto = z.infer<typeof createRoleDefinitionDto>;
export type UpdateRoleDefinitionDto = z.infer<typeof updateRoleDefinitionDto>;
export type UpdatePermissionsDto = z.infer<typeof updatePermissionsDto>;
export type AttachProjectDto = z.infer<typeof attachProjectDto>;
