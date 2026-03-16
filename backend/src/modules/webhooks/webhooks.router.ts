import { Router } from 'express';
import {
  gitlabMergeRequestPayloadSchema,
  gitlabPushPayloadSchema,
  gitlabPipelinePayloadSchema,
} from './webhooks.dto.js';
import { handleMergeRequest, handlePush, handlePipeline } from './gitlab.service.js';

const router = Router();

/** Verify GitLab webhook secret (X-Gitlab-Token header). */
function verifyGitLabSecret(req: { headers: Record<string, string | undefined> }): boolean {
  const secret = process.env.GITLAB_WEBHOOK_SECRET;
  if (!secret) return true; // if not configured, accept (dev); in prod set the secret
  const token = req.headers['x-gitlab-token'];
  return token === secret;
}

/**
 * POST /api/webhooks/gitlab
 * GitLab project webhook. Configure in GitLab: Project -> Settings -> Webhooks.
 * URL: https://your-tasktime-api/api/webhooks/gitlab
 * Secret token: set GITLAB_WEBHOOK_SECRET in env.
 * Trigger: Merge request events, Push events, Pipeline events.
 */
router.post('/webhooks/gitlab', async (req, res, next) => {
  try {
    if (!verifyGitLabSecret({ headers: req.headers as Record<string, string | undefined> })) {
      res.status(401).json({ error: 'Invalid webhook secret' });
      return;
    }

    const raw = req.body as unknown;
    const objectKind = typeof raw === 'object' && raw !== null && 'object_kind' in raw ? (raw as { object_kind: string }).object_kind : undefined;

    switch (objectKind) {
      case 'merge_request': {
        const parsed = gitlabMergeRequestPayloadSchema.safeParse(raw);
        if (!parsed.success) {
          res.status(400).json({ error: 'Invalid merge_request payload', details: parsed.error.flatten() });
          return;
        }
        const result = await handleMergeRequest(parsed.data);
        res.status(200).json({ ok: true, updated: result.updated });
        return;
      }
      case 'push': {
        const parsed = gitlabPushPayloadSchema.safeParse(raw);
        if (!parsed.success) {
          res.status(400).json({ error: 'Invalid push payload', details: parsed.error.flatten() });
          return;
        }
        const result = await handlePush(parsed.data);
        res.status(200).json({ ok: true, updated: result.updated });
        return;
      }
      case 'pipeline': {
        const parsed = gitlabPipelinePayloadSchema.safeParse(raw);
        if (!parsed.success) {
          res.status(400).json({ error: 'Invalid pipeline payload', details: parsed.error.flatten() });
          return;
        }
        const result = await handlePipeline(parsed.data);
        res.status(200).json({ ok: true, updated: result.updated, commented: result.commented });
        return;
      }
      default:
        res.status(200).json({ ok: true, message: 'Event ignored', object_kind: objectKind });
    }
  } catch (err) {
    next(err);
  }
});

export default router;
