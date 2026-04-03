import { z } from 'zod';

export const ExecuteTransitionDto = z.object({
  transitionId: z.string().uuid(),
  screenFieldValues: z.record(z.string().uuid(), z.unknown()).optional(),
});

export type ExecuteTransitionDto = z.infer<typeof ExecuteTransitionDto>;
