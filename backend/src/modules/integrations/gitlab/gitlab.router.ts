import { Router } from 'express';
import * as gitlabService from './gitlab.service.js';

const router = Router();

/**
 * POST /api/integrations/gitlab/webhook
 * GitLab project webhook. In GitLab: Project → Settings → Webhooks.
 * URL: https://<your-backend>/api/integrations/gitlab/webhook
 * Secret token: set GITLAB_WEBHOOK_SECRET in env; put the same value in GitLab webhook form.
 */
router.post('/integrations/gitlab/webhook', async (req, res, next) => {
  try {
    const token = req.headers['x-gitlab-token'] as string | undefined;
    const secret = process.env.GITLAB_WEBHOOK_SECRET;

    if (secret && token !== secret) {
      res.status(401).json({ error: 'Invalid webhook secret' });
      return;
    }

    await gitlabService.handleWebhook((req.body as Record<string, unknown>) ?? {});
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
