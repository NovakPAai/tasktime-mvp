import { z } from 'zod';

const capitalizeFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const createLinkDto = z.object({
  targetIssueId: z.string().uuid(),
  linkTypeId: z.string().uuid(),
});

export const updateLinkTypeDto = z.object({
  name: z.string().min(1).max(100).optional(),
  outboundName: z.string().min(1).max(100).transform(capitalizeFirst).optional(),
  inboundName: z.string().min(1).max(100).transform(capitalizeFirst).optional(),
  isActive: z.boolean().optional(),
});

export const createLinkTypeDto = z.object({
  name: z.string().min(1).max(100),
  outboundName: z.string().min(1).max(100).transform(capitalizeFirst),
  inboundName: z.string().min(1).max(100).transform(capitalizeFirst),
});
