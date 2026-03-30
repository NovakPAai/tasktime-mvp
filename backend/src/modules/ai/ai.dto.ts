import { z } from 'zod';

const issueKeySchema = z.string().regex(/^[A-Za-z]{2,10}-\d+$/, 'Invalid issue key (e.g. TTMP-83)');

export const aiEstimateDto = z
  .object({
    issueId: z.string().uuid().optional(),
    issueKey: issueKeySchema.optional(),
  })
  .refine((d) => d.issueId != null || d.issueKey != null, {
    message: 'Either issueId or issueKey is required',
    path: ['issueId'],
  });

export const aiDecomposeDto = z
  .object({
    issueId: z.string().uuid().optional(),
    issueKey: issueKeySchema.optional(),
  })
  .refine((d) => d.issueId != null || d.issueKey != null, {
    message: 'Either issueId or issueKey is required',
    path: ['issueId'],
  });

export const aiSuggestAssigneeDto = z
  .object({
    issueId: z.string().uuid().optional(),
    issueKey: issueKeySchema.optional(),
  })
  .refine((d) => d.issueId != null || d.issueKey != null, {
    message: 'Either issueId or issueKey is required',
    path: ['issueId'],
  });

export type AiEstimateDto = z.infer<typeof aiEstimateDto>;
export type AiDecomposeDto = z.infer<typeof aiDecomposeDto>;
export type AiSuggestAssigneeDto = z.infer<typeof aiSuggestAssigneeDto>;
