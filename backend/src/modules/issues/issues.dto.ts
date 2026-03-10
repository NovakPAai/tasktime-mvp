import { z } from 'zod';

export const createIssueDto = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(10000).optional(),
  type: z.enum(['EPIC', 'STORY', 'TASK', 'SUBTASK', 'BUG']).default('TASK'),
  priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).default('MEDIUM'),
  parentId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
});

export const updateIssueDto = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(10000).optional(),
  priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
});

export const updateStatusDto = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'REVIEW', 'DONE', 'CANCELLED']),
});

export const assignDto = z.object({
  assigneeId: z.string().uuid().nullable(),
});

export type CreateIssueDto = z.infer<typeof createIssueDto>;
export type UpdateIssueDto = z.infer<typeof updateIssueDto>;
export type UpdateStatusDto = z.infer<typeof updateStatusDto>;
export type AssignDto = z.infer<typeof assignDto>;
