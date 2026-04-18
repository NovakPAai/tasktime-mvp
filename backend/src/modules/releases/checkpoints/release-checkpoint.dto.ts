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

export type ApplyTemplateDto = z.infer<typeof applyTemplateDto>;
export type PreviewTemplateDto = z.infer<typeof previewTemplateDto>;
export type AddCheckpointsDto = z.infer<typeof addCheckpointsDto>;
export type SyncInstancesDto = z.infer<typeof syncInstancesDto>;
