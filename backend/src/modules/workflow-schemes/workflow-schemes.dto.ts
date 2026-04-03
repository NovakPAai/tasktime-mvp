import { z } from 'zod';

export const createWorkflowSchemeDto = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  isDefault: z.boolean().optional(),
});

export const updateWorkflowSchemeDto = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().nullish(),
  isDefault: z.boolean().optional(),
});

export const schemeItemsDto = z.object({
  items: z
    .array(
      z.object({
        workflowId: z.string().uuid(),
        issueTypeConfigId: z.string().uuid().nullable().optional(),
      }),
    )
    .min(1),
});

export const attachProjectDto = z.object({
  projectId: z.string().uuid(),
});

export type CreateWorkflowSchemeDto = z.infer<typeof createWorkflowSchemeDto>;
export type UpdateWorkflowSchemeDto = z.infer<typeof updateWorkflowSchemeDto>;
export type SchemeItemsDto = z.infer<typeof schemeItemsDto>;
export type AttachProjectDto = z.infer<typeof attachProjectDto>;
