import { z } from 'zod';

// A single field value — plain value on the API surface; { v: ... } wrapper is a storage detail
const fieldValueSchema = z.object({
  customFieldId: z.string().uuid(),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]),
});

export const upsertCustomFieldValuesDto = z.object({
  values: z.array(fieldValueSchema).min(1),
});

export type UpsertCustomFieldValuesDto = z.infer<typeof upsertCustomFieldValuesDto>;
