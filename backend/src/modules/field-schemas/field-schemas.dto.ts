import { z } from 'zod';

export const createFieldSchemaDto = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
});

export const updateFieldSchemaDto = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
});

export const copyFieldSchemaDto = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  copyBindings: z.boolean().default(false),
});

export const addFieldSchemaItemDto = z.object({
  customFieldId: z.string().uuid(),
  orderIndex: z.number().int().nonnegative().optional(),
  isRequired: z.boolean(),
  showOnKanban: z.boolean().default(false),
});

export const updateFieldSchemaItemDto = z.object({
  isRequired: z.boolean().optional(),
  showOnKanban: z.boolean().optional(),
  orderIndex: z.number().int().nonnegative().optional(),
});

export const reorderFieldSchemaItemsDto = z.object({
  updates: z.array(z.object({
    id: z.string().uuid(),
    orderIndex: z.number().int().nonnegative(),
  })).min(1),
});

export const replaceFieldSchemaItemsDto = z.object({
  items: z.array(z.object({
    customFieldId: z.string().uuid(),
    orderIndex: z.number().int().nonnegative(),
    isRequired: z.boolean(),
    showOnKanban: z.boolean().default(false),
  })),
});

const scopeTypeEnum = z.enum(['GLOBAL', 'PROJECT', 'ISSUE_TYPE', 'PROJECT_ISSUE_TYPE']);

export const createFieldSchemaBindingDto = z.object({
  scopeType: scopeTypeEnum,
  projectId: z.string().uuid().optional(),
  issueTypeConfigId: z.string().uuid().optional(),
}).refine((data) => {
  if (data.scopeType === 'GLOBAL') return !data.projectId && !data.issueTypeConfigId;
  if (data.scopeType === 'PROJECT') return !!data.projectId && !data.issueTypeConfigId;
  if (data.scopeType === 'ISSUE_TYPE') return !data.projectId && !!data.issueTypeConfigId;
  if (data.scopeType === 'PROJECT_ISSUE_TYPE') return !!data.projectId && !!data.issueTypeConfigId;
  return false;
}, { message: 'projectId/issueTypeConfigId must match scopeType' });

export type CreateFieldSchemaDto = z.infer<typeof createFieldSchemaDto>;
export type UpdateFieldSchemaDto = z.infer<typeof updateFieldSchemaDto>;
export type CopyFieldSchemaDto = z.infer<typeof copyFieldSchemaDto>;
export type AddFieldSchemaItemDto = z.infer<typeof addFieldSchemaItemDto>;
export type UpdateFieldSchemaItemDto = z.infer<typeof updateFieldSchemaItemDto>;
export type ReorderFieldSchemaItemsDto = z.infer<typeof reorderFieldSchemaItemsDto>;
export type ReplaceFieldSchemaItemsDto = z.infer<typeof replaceFieldSchemaItemsDto>;
export type CreateFieldSchemaBindingDto = z.infer<typeof createFieldSchemaBindingDto>;
