import { z } from 'zod';

const fieldTypeEnum = z.enum([
  'TEXT', 'TEXTAREA', 'NUMBER', 'DECIMAL', 'DATE', 'DATETIME',
  'URL', 'CHECKBOX', 'SELECT', 'MULTI_SELECT', 'USER', 'LABEL', 'REFERENCE',
]);

const selectOptionSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
  color: z.string().optional(),
});

const referenceItemSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
  isEnabled: z.boolean().default(true),
});

export const referenceOptionsSchema = z.object({
  maxValues: z.number().int().nonnegative(),
  items: z.array(referenceItemSchema),
});

export const createCustomFieldDto = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  fieldType: fieldTypeEnum,
  options: z.union([z.array(selectOptionSchema), referenceOptionsSchema]).optional(),
});

export const updateCustomFieldDto = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  options: z.union([z.array(selectOptionSchema), referenceOptionsSchema]).optional(),
});

export const reorderCustomFieldsDto = z.object({
  updates: z.array(z.object({
    id: z.string().uuid(),
    orderIndex: z.number().int().nonnegative(),
  })).min(1),
});

export type CreateCustomFieldDto = z.infer<typeof createCustomFieldDto>;
export type UpdateCustomFieldDto = z.infer<typeof updateCustomFieldDto>;
export type ReorderCustomFieldsDto = z.infer<typeof reorderCustomFieldsDto>;
export type ReferenceOptions = z.infer<typeof referenceOptionsSchema>;
