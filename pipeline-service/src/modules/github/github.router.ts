import { Router } from 'express';
import { prisma } from '../../prisma/client';
import { listMergedPrs, getPrChecks } from './github.client';
import { config } from '../../config';

export const githubRouter = Router();

// POST /api/github/sync — pull merged PRs from all configured repos
githubRouter.post('/sync', async (_req, res, next) => {
  try {
    const repos = config.GITHUB_REPOS.split(',').map(r => r.trim()).filter(Boolean);
    if (!repos.length) {
      res.status(422).json({ error: 'GITHUB_REPOS not configured' });
      return;
    }

    const results: Record<string, number> = {};

    for (const repo of repos) {
      let syncState = await prisma.syncState.findUnique({ where: { repo } });
      if (!syncState) {
        syncState = await prisma.syncState.create({ data: { repo } });
      }

      const prs = await listMergedPrs(repo, syncState.lastSyncAt ?? undefined);
      const merged = prs.filter(pr => pr.merged_at !== null);

      for (const pr of merged) {
        // Resolve CI status from check runs
        const checks = await getPrChecks(repo, pr.head.sha).catch(() => []);
        const failed = checks.some(c => c.conclusion === 'failure');
        const allSuccess = checks.length > 0 && checks.every(c => c.conclusion === 'success');
        const ciStatus = failed ? 'FAILURE' : allSuccess ? 'SUCCESS' : 'PENDING';

        // Upsert into a "COLLECTING" batch for this repo or standalone record
        // (PRs stay unassigned until user adds them to a batch)
        await prisma.prSnapshot.upsert({
          where: { id: `${repo}-${pr.number}` },
          update: { ciStatus, mergedAt: pr.merged_at ? new Date(pr.merged_at) : null },
          create: {
            id: `${repo}-${pr.number}`,
            prNumber: pr.number,
            prTitle: pr.title,
            prUrl: pr.html_url,
            author: pr.user.login,
            headSha: pr.head.sha,
            mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
            ciStatus,
            batchId: await getOrCreateCollectingBatch(repo),
          },
        });
      }

      await prisma.syncState.update({
        where: { repo },
        data: { lastSyncAt: new Date(), lastPrNumber: merged[0]?.number ?? syncState.lastPrNumber },
      });

      results[repo] = merged.length;
    }

    res.json({ synced: results });
  } catch (err) {
    next(err);
  }
});

// GET /api/github/prs?repo=owner/repo — list unassigned merged PRs
githubRouter.get('/prs', async (req, res, next) => {
  try {
    const repo = req.query.repo as string | undefined;
    const prs = await prisma.prSnapshot.findMany({
      where: repo
        ? { batch: { repo } }
        : undefined,
      orderBy: { mergedAt: 'desc' },
      include: { batch: { select: { id: true, title: true, state: true, repo: true } } },
    });
    res.json(prs);
  } catch (err) {
    next(err);
  }
});

// ── Helper: get or create current COLLECTING batch for repo ───────────────────
async function getOrCreateCollectingBatch(repo: string): Promise<string> {
  const existing = await prisma.stagingBatch.findFirst({
    where: { repo, state: 'COLLECTING' },
    orderBy: { createdAt: 'desc' },
  });
  if (existing) return existing.id;

  const created = await prisma.stagingBatch.create({
    data: { title: `Batch ${new Date().toISOString().slice(0, 10)}`, repo, createdBy: 'system' },
  });
  return created.id;
}
