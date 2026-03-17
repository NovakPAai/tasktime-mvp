import { z } from 'zod';

export const createLinkDto = z.object({
  targetIssueId: z.string().uuid(),
  linkTypeId: z.string().uuid(),
});

export const updateLinkTypeDto = z.object({
  name: z.string().min(1).max(100).optional(),
  outboundName: z.string().min(1).max(100).optional(),
  inboundName: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
});

export const createLinkTypeDto = z.object({
  name: z.string().min(1).max(100),
  outboundName: z.string().min(1).max(100),
  inboundName: z.string().min(1).max(100),
});
