import { z } from 'zod';

export const createCategoryDto = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional().nullable(),
});

export const updateCategoryDto = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional().nullable(),
});

export type CreateCategoryDto = z.infer<typeof createCategoryDto>;
export type UpdateCategoryDto = z.infer<typeof updateCategoryDto>;
