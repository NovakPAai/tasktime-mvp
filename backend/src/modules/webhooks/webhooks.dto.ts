import { z } from 'zod';

/** Issue key format: PROJECT_KEY-NUMBER, e.g. DEMO-42 */
export const ISSUE_KEY_REGEX = /[A-Z][A-Z0-9]*-(\d+)/g;

/** Extract issue keys from text (branch name, commit message, MR title). Returns unique keys like ["DEMO-42", "BACK-1"]. */
export function parseIssueKeys(text: string): string[] {
  if (!text || typeof text !== 'string') return [];
  const keys = new Set<string>();
  const re = /[A-Z][A-Z0-9]*-\d+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) keys.add(m[0]);
  return Array.from(keys);
}

/** GitLab merge_request event object_kind */
export const gitlabMergeRequestPayloadSchema = z.object({
  object_kind: z.literal('merge_request'),
  object_attributes: z.object({
    state: z.string(),
    action: z.string().optional(),
    title: z.string().optional(),
    source_branch: z.string().optional(),
    target_branch: z.string().optional(),
    iid: z.number().optional(),
  }),
  project: z.object({ id: z.number(), web_url: z.string().optional() }).optional(),
});

/** GitLab push event */
export const gitlabPushPayloadSchema = z.object({
  object_kind: z.literal('push'),
  ref: z.string(),
  commits: z
    .array(
      z.object({
        message: z.string().optional(),
        title: z.string().optional(),
      })
    )
    .optional(),
  project: z.object({ id: z.number() }).optional(),
});

/** GitLab pipeline event */
export const gitlabPipelinePayloadSchema = z.object({
  object_kind: z.literal('pipeline'),
  object_attributes: z.object({
    status: z.string(),
    ref: z.string().optional(),
    id: z.number().optional(),
  }),
  project: z.object({ id: z.number() }).optional(),
  commits: z
    .array(
      z.object({
        message: z.string().optional(),
        title: z.string().optional(),
      })
    )
    .optional(),
});

export type GitLabMergeRequestPayload = z.infer<typeof gitlabMergeRequestPayloadSchema>;
export type GitLabPushPayload = z.infer<typeof gitlabPushPayloadSchema>;
export type GitLabPipelinePayload = z.infer<typeof gitlabPipelinePayloadSchema>;
