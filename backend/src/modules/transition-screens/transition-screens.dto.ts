import { z } from 'zod';

export const createTransitionScreenDto = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
});

export const updateTransitionScreenDto = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().nullish(),
});

export const screenItemsDto = z.object({
  items: z
    .array(
      z.object({
        customFieldId: z.string().uuid(),
        isRequired: z.boolean().optional(),
        orderIndex: z.number().int().nonnegative().optional(),
      }),
    )
    .min(1),
});

export type CreateTransitionScreenDto = z.infer<typeof createTransitionScreenDto>;
export type UpdateTransitionScreenDto = z.infer<typeof updateTransitionScreenDto>;
export type ScreenItemsDto = z.infer<typeof screenItemsDto>;
