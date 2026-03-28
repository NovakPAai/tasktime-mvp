import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../prisma/client.js';
import { runSyncSafe } from '../sync/sync.service.js';
import { validate } from '../../shared/middleware/validate.js';
import { apiKeyAuth } from '../../shared/middleware/api-key-auth.js';

const router = Router();

// All pipeline routes require API key
router.use(apiKeyAuth);

// ─── GET /api/pipelines/prs ───────────────────────────────────────────────────

const prsQuery = z.object({
  repo: z.string().optional(),
  ciStatus: z.enum(['PENDING', 'RUNNING', 'SUCCESS', 'FAILURE', 'CANCELLED']).optional(),
  reviewStatus: z.enum(['PENDING', 'APPROVED', 'CHANGES_REQUESTED']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

router.get('/prs', validate(prsQuery, 'query'), async (req, res, next) => {
  try {
    const { repo, ciStatus, reviewStatus, limit, offset } = req.query as unknown as z.infer<typeof prsQuery>;

    const where = {
      ...(repo ? { repo } : {}),
      ...(ciStatus ? { ciStatus } : {}),
      ...(reviewStatus ? { reviewStatus } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.pullRequestSnapshot.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          externalId: true,
          source: true,
          repo: true,
          title: true,
          author: true,
          branch: true,
          baseBranch: true,
          hasConflicts: true,
          ciStatus: true,
          ciMessage: true,
          reviewStatus: true,
          htmlUrl: true,
          mergeQueuePosition: true,
          mergedAt: true,
          linkedIssueIds: true,
          lastSyncedAt: true,
          updatedAt: true,
        },
      }),
      prisma.pullRequestSnapshot.count({ where }),
    ]);

    res.json({ data: items, total, limit, offset });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/pipelines/deploys ───────────────────────────────────────────────

const deploysQuery = z.object({
  target: z.enum(['STAGING', 'PRODUCTION']).optional(),
  status: z.enum(['PENDING', 'RUNNING', 'SUCCESS', 'FAILURE', 'ROLLED_BACK']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

router.get('/deploys', validate(deploysQuery, 'query'), async (req, res, next) => {
  try {
    const { target, status, limit, offset } = req.query as unknown as z.infer<typeof deploysQuery>;

    const where = {
      ...(target ? { target } : {}),
      ...(status ? { status } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.deployEvent.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        take: limit,
        skip: offset,
        include: { stagingBatch: { select: { id: true, name: true, state: true } } },
      }),
      prisma.deployEvent.count({ where }),
    ]);

    res.json({ data: items, total, limit, offset });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/pipelines/sync-state ────────────────────────────────────────────

router.get('/sync-state', async (_req, res, next) => {
  try {
    const state = await prisma.syncState.findUnique({ where: { syncType: 'github' } });
    res.json({ data: state });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/pipelines/sync ─────────────────────────────────────────────────

router.post('/sync', async (_req, res, next) => {
  try {
    const result = await runSyncSafe();
    if ('error' in result) {
      res.status(502).json({ error: result.error });
      return;
    }
    res.json({ synced: result });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/pipelines/batches ───────────────────────────────────────────────

router.get('/batches', async (_req, res, next) => {
  try {
    const batches = await prisma.stagingBatch.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        pullRequests: { select: { id: true, externalId: true, title: true, ciStatus: true, reviewStatus: true } },
        deployEvents: { orderBy: { startedAt: 'desc' }, take: 5 },
      },
    });
    res.json({ data: batches });
  } catch (err) {
    next(err);
  }
});

export { router as pipelinesRouter };
