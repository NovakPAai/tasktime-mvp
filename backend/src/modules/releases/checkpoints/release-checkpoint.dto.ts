// TTMP-160 PR-3: release-scoped DTOs for checkpoint apply/preview/add/recompute/sync.

import { z } from 'zod';

export const applyTemplateDto = z.object({
  templateId: z.string().uuid(),
});

export const previewTemplateDto = z.object({
  templateId: z.string().uuid(),
});

export const addCheckpointsDto = z.object({
  checkpointTypeIds: z.array(z.string().uuid()).min(1).max(20),
});

export const syncInstancesDto = z.object({
  releaseIds: z.array(z.string().uuid()).min(1).max(100),
});

// PR-8 / FR-21: bulk-apply template to many releases. Cap 50 per spec §13.3.
export const applyBulkDto = z.object({
  releaseIds: z.array(z.string().uuid()).min(1).max(50),
});

// PR-8 / FR-23: audit log filters. All optional; dates ISO `YYYY-MM-DD`.
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const auditQueryDto = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  projectId: z.string().uuid().optional(),
  releaseId: z.string().uuid().optional(),
  checkpointTypeId: z.string().uuid().optional(),
  onlyOpen: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

export type ApplyTemplateDto = z.infer<typeof applyTemplateDto>;
export type PreviewTemplateDto = z.infer<typeof previewTemplateDto>;
export type AddCheckpointsDto = z.infer<typeof addCheckpointsDto>;
export type SyncInstancesDto = z.infer<typeof syncInstancesDto>;
export type ApplyBulkDto = z.infer<typeof applyBulkDto>;
export type AuditQueryDto = z.infer<typeof auditQueryDto>;
