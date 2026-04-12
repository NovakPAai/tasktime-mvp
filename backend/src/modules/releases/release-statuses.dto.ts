import { z } from 'zod';

export const createReleaseStatusDto = z.object({
  name: z.string().min(1).max(200),
  category: z.enum(['PLANNING', 'IN_PROGRESS', 'DONE', 'CANCELLED']),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  description: z.string().max(500).optional(),
  orderIndex: z.number().int().nonnegative().optional(),
});

export const updateReleaseStatusDto = z.object({
  name: z.string().min(1).max(200).optional(),
  category: z.enum(['PLANNING', 'IN_PROGRESS', 'DONE', 'CANCELLED']).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  description: z.string().max(500).nullish(),
  orderIndex: z.number().int().nonnegative().optional(),
});

export type CreateReleaseStatusDto = z.infer<typeof createReleaseStatusDto>;
export type UpdateReleaseStatusDto = z.infer<typeof updateReleaseStatusDto>;
