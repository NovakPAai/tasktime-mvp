import { z } from 'zod';

// A single field value — value is stored as { v: ... }
const fieldValueSchema = z.object({
  customFieldId: z.string().uuid(),
  value: z.union([
    z.object({ v: z.string() }),
    z.object({ v: z.number() }),
    z.object({ v: z.boolean() }),
    z.object({ v: z.array(z.string()) }),
    z.object({ v: z.null() }),
  ]),
});

export const upsertCustomFieldValuesDto = z.object({
  values: z.array(fieldValueSchema).min(1),
});

export type UpsertCustomFieldValuesDto = z.infer<typeof upsertCustomFieldValuesDto>;
