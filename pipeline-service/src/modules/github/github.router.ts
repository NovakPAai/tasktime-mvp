import { Router } from 'express';
import { prisma } from '../../prisma/client.js';
import { listMergedPrs, getPrChecks } from './github.client.js';
import { config } from '../../config.js';
import { apiKeyAuth } from '../../shared/middleware/api-key-auth.js';

export const githubRouter = Router();
githubRouter.use(apiKeyAuth);

const SYNC_TYPE = 'github-merged-prs';

// POST /api/github/sync — pull merged PRs from configured repo
githubRouter.post('/sync', async (_req, res, next) => {
  try {
    const repo = config.APP_GITHUB_REPOS
      .split(',')
      .map(r => r.trim())
      .find(r => /^[^/\s]+\/[^/\s]+$/.test(r));
    if (!repo) {
      res.status(422).json({ error: 'APP_GITHUB_REPOS not configured or invalid (expected "owner/repo")' });
      return;
    }

    // Fix: record startedAt before GitHub API call to avoid race condition
    const startedAt = new Date();

    let syncState = await prisma.syncState.findUnique({ where: { syncType: SYNC_TYPE } });
    const since = syncState?.lastSyncedAt ?? undefined;

    const { prs, truncated } = await listMergedPrs(repo, since);
    const collectingBatchId = await getOrCreateCollectingBatchId();

    for (const pr of prs) {
      const checks = await getPrChecks(repo, pr.head.sha).catch(() => []);
      const failed = checks.some(c => c.conclusion === 'failure');
      const allSuccess = checks.length > 0 && checks.every(c => c.conclusion === 'success');
      const ciStatus = failed ? 'FAILURE' : allSuccess ? 'SUCCESS' : 'PENDING';

      await prisma.pullRequestSnapshot.upsert({
        where: { source_repo_externalId: { source: 'GITHUB', repo, externalId: pr.number } },
        update: {
          ciStatus,
          mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
          mergedSha: pr.merge_commit_sha ?? null,
          lastSyncedAt: startedAt,
          // stagingBatchId intentionally omitted — preserve manual batch assignment
        },
        create: {
          externalId: pr.number,
          source: 'GITHUB',
          repo,
          title: pr.title,
          author: pr.user.login,
          branch: pr.head.ref,
          baseBranch: pr.base.ref,
          htmlUrl: pr.html_url,
          ciStatus,
          mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
          mergedSha: pr.merge_commit_sha ?? null,
          lastSyncedAt: startedAt,
          linkedIssueIds: [],
          stagingBatchId: collectingBatchId,
        },
      });
    }

    // Do NOT advance the sync cursor when results were truncated — next sync will re-fetch the same range
    if (!truncated) {
      if (syncState) {
        await prisma.syncState.update({
          where: { syncType: SYNC_TYPE },
          data: { lastSyncedAt: startedAt, syncCount: { increment: 1 } },
        });
      } else {
        await prisma.syncState.create({
          data: { syncType: SYNC_TYPE, lastSyncedAt: startedAt, syncCount: 1 },
        });
      }
    }

    res.json({ synced: prs.length, repo, truncated });
  } catch (err) {
    next(err);
  }
});

// GET /api/github/prs — list merged PRs with batch info
githubRouter.get('/prs', async (req, res, next) => {
  try {
    const repo = req.query.repo as string | undefined;
    const prs = await prisma.pullRequestSnapshot.findMany({
      where: { mergedAt: { not: null }, ...(repo ? { repo } : {}) },
      orderBy: { mergedAt: 'desc' },
      include: { stagingBatch: { select: { id: true, name: true, state: true } } },
    });
    res.json(prs);
  } catch (err) {
    next(err);
  }
});

// ── Helper: get or create COLLECTING batch ────────────────────────────────────
async function getOrCreateCollectingBatchId(): Promise<string> {
  const existing = await prisma.stagingBatch.findFirst({
    where: { state: 'COLLECTING' },
    orderBy: { createdAt: 'desc' },
  });
  if (existing) return existing.id;

  const created = await prisma.stagingBatch.create({
    data: {
      name: `Batch ${new Date().toISOString().slice(0, 10)}`,
      createdById: 'system',
    },
  });
  return created.id;
}
