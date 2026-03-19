import { z } from 'zod';

export const createIssueTypeSchemeDto = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

export const updateIssueTypeSchemeDto = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
});

export const updateSchemeItemsDto = z.object({
  items: z.array(
    z.object({
      typeConfigId: z.string().uuid(),
      orderIndex: z.number().int().default(0),
    }),
  ),
});

export const assignProjectDto = z.object({
  projectId: z.string().uuid(),
});
