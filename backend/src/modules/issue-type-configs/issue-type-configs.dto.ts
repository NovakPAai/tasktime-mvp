import { z } from 'zod';

export const createIssueTypeConfigDto = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  iconName: z.string().min(1).max(100),
  iconColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  isSubtask: z.boolean().default(false),
  orderIndex: z.number().int().default(0),
});

export const updateIssueTypeConfigDto = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  iconName: z.string().min(1).max(100).optional(),
  iconColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  isSubtask: z.boolean().optional(),
  orderIndex: z.number().int().optional(),
});
