import { z } from 'zod';

export const createIssueDto = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(10000).optional(),
  acceptanceCriteria: z.string().max(10000).optional(),
  type: z.enum(['EPIC', 'STORY', 'TASK', 'SUBTASK', 'BUG']).optional(),
  issueTypeConfigId: z.string().uuid().optional(),
  priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).default('MEDIUM'),
  parentId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
});

export const updateIssueDto = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(10000).optional(),
  acceptanceCriteria: z.string().max(10000).nullable().optional(),
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

export const updateAiFlagsDto = z.object({
  aiEligible: z.boolean().optional(),
  aiAssigneeType: z.enum(['HUMAN', 'AGENT', 'MIXED']).optional(),
});

export const updateAiStatusDto = z.object({
  aiExecutionStatus: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'DONE', 'FAILED']),
});

export type CreateIssueDto = z.infer<typeof createIssueDto>;
export type UpdateIssueDto = z.infer<typeof updateIssueDto>;
export type UpdateStatusDto = z.infer<typeof updateStatusDto>;
export type AssignDto = z.infer<typeof assignDto>;
export type UpdateAiFlagsDto = z.infer<typeof updateAiFlagsDto>;
export type UpdateAiStatusDto = z.infer<typeof updateAiStatusDto>;
