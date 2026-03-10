import { z } from 'zod';

export const createCommentDto = z.object({
  body: z.string().min(1).max(10000),
});

export const updateCommentDto = z.object({
  body: z.string().min(1).max(10000),
});

export type CreateCommentDto = z.infer<typeof createCommentDto>;
export type UpdateCommentDto = z.infer<typeof updateCommentDto>;
