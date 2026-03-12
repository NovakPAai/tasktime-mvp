import { z } from 'zod';

export const reorderBoardDto = z.object({
  updates: z.array(
    z.object({
      id: z.string().uuid(),
      status: z.enum(['OPEN', 'IN_PROGRESS', 'REVIEW', 'DONE', 'CANCELLED']),
      orderIndex: z.number().int().nonnegative(),
    })
  ).min(1),
});

export type ReorderBoardDto = z.infer<typeof reorderBoardDto>;

