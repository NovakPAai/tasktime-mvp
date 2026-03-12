import { z } from 'zod';

export const issueSplitDto = z.object({
  issueId: z.string().uuid(),
  ratio: z.number().positive().max(1),
});

export const createAiSessionDto = z.object({
  issueId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  model: z.string().min(1).max(200),
  provider: z.string().min(1).max(100),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
  tokensInput: z.number().int().nonnegative(),
  tokensOutput: z.number().int().nonnegative(),
  costMoney: z.number().nonnegative(),
  notes: z.string().max(2000).optional(),
  issueSplits: z.array(issueSplitDto).min(1),
});

export type CreateAiSessionDto = z.infer<typeof createAiSessionDto>;

