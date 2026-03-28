import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../prisma/client.js';
import { apiKeyAuth } from '../../shared/middleware/api-key-auth.js';
import { validate } from '../../shared/middleware/validate.js';
import type { StagingBatchState } from '@prisma/client';

const router = Router();
router.use(apiKeyAuth);

// ─── State machine ────────────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<StagingBatchState, StagingBatchState[]> = {
  COLLECTING: ['DEPLOYING', 'FAILED'],
  MERGING:    ['DEPLOYING', 'FAILED'],
  DEPLOYING:  ['TESTING', 'FAILED'],
  TESTING:    ['PASSED', 'FAILED'],
  PASSED:     ['RELEASED'],
  FAILED:     ['COLLECTING'],   // restart: add fixes, retry
  RELEASED:   [],
};

function canTransition(from: StagingBatchState, to: StagingBatchState): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ─── POST /api/batches — create batch ─────────────────────────────────────────

const createBatchBody = z.object({
  name: z.string().min(1).max(120),
  notes: z.string().optional(),
  prIds: z.array(z.string().uuid()).optional(),
});

router.post('/', validate(createBatchBody), async (req, res, next) => {
  try {
    const { name, notes, prIds } = req.body as z.infer<typeof createBatchBody>;
    const createdById = req.caller?.userId ?? 'unknown';

    const batch = await prisma.stagingBatch.create({
      data: {
        name,
        notes,
        createdById,
        state: 'COLLECTING',
        pullRequests: prIds?.length
          ? { connect: prIds.map(id => ({ id })) }
          : undefined,
      },
      include: {
        pullRequests: { select: { id: true, externalId: true, title: true, ciStatus: true, reviewStatus: true } },
        deployEvents: true,
      },
    });

    res.status(201).json({ data: batch });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/batches — list batches ──────────────────────────────────────────

const listQuery = z.object({
  state: z.enum(['COLLECTING','MERGING','DEPLOYING','TESTING','PASSED','FAILED','RELEASED']).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

router.get('/', validate(listQuery, 'query'), async (req, res, next) => {
  try {
    const { state, limit, offset } = req.query as unknown as z.infer<typeof listQuery>;

    const where = state ? { state } : {};
    const [items, total] = await Promise.all([
      prisma.stagingBatch.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          pullRequests: { select: { id: true, externalId: true, title: true, ciStatus: true, reviewStatus: true } },
          deployEvents: { orderBy: { startedAt: 'desc' }, take: 3 },
        },
      }),
      prisma.stagingBatch.count({ where }),
    ]);

    res.json({ data: items, total, limit, offset });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/batches/:id ─────────────────────────────────────────────────────

router.get('/:id', async (req, res, next) => {
  try {
    const batch = await prisma.stagingBatch.findUnique({
      where: { id: req.params.id },
      include: {
        pullRequests: true,
        deployEvents: { orderBy: { startedAt: 'desc' } },
      },
    });
    if (!batch) { res.status(404).json({ error: 'Batch not found' }); return; }
    res.json({ data: batch });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/batches/:id/state — transition state ─────────────────────────

const transitionBody = z.object({
  state: z.enum(['COLLECTING','MERGING','DEPLOYING','TESTING','PASSED','FAILED','RELEASED']),
  notes: z.string().optional(),
  releaseId: z.string().optional(),
  releaseName: z.string().optional(),
});

router.patch('/:id/state', validate(transitionBody), async (req, res, next) => {
  try {
    const { state: toState, notes, releaseId, releaseName } = req.body as z.infer<typeof transitionBody>;

    const batchId = req.params.id as string;
    const batch = await prisma.stagingBatch.findUnique({ where: { id: batchId } });
    if (!batch) { res.status(404).json({ error: 'Batch not found' }); return; }

    if (!canTransition(batch.state, toState)) {
      res.status(422).json({
        error: `Cannot transition from ${batch.state} to ${toState}`,
        allowedNext: VALID_TRANSITIONS[batch.state],
      });
      return;
    }

    const updated = await prisma.stagingBatch.update({
      where: { id: batchId },
      data: {
        state: toState,
        ...(notes !== undefined ? { notes } : {}),
        ...(releaseId ? { releaseId } : {}),
        ...(releaseName ? { releaseName } : {}),
      },
      include: {
        pullRequests: { select: { id: true, externalId: true, title: true, ciStatus: true } },
        deployEvents: { orderBy: { startedAt: 'desc' }, take: 3 },
      },
    });

    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/batches/:id/prs — add PRs to batch ────────────────────────────

const addPrsBody = z.object({
  prIds: z.array(z.string().uuid()).min(1),
});

router.post('/:id/prs', validate(addPrsBody), async (req, res, next) => {
  try {
    const { prIds } = req.body as z.infer<typeof addPrsBody>;

    const batch = await prisma.stagingBatch.findUnique({ where: { id: req.params.id as string } });
    if (!batch) { res.status(404).json({ error: 'Batch not found' }); return; }
    if (!['COLLECTING', 'MERGING'].includes(batch.state)) {
      res.status(422).json({ error: `Cannot add PRs to batch in state ${batch.state}` });
      return;
    }

    const updated = await prisma.stagingBatch.update({
      where: { id: req.params.id as string },
      data: { pullRequests: { connect: prIds.map(id => ({ id })) } },
      include: { pullRequests: { select: { id: true, externalId: true, title: true, ciStatus: true } } },
    });

    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/batches/:id/prs/:prId — remove PR from batch ────────────────

router.delete('/:id/prs/:prId', async (req, res, next) => {
  try {
    const batch = await prisma.stagingBatch.findUnique({ where: { id: req.params.id as string } });
    if (!batch) { res.status(404).json({ error: 'Batch not found' }); return; }
    if (!['COLLECTING', 'MERGING'].includes(batch.state)) {
      res.status(422).json({ error: `Cannot remove PRs from batch in state ${batch.state}` });
      return;
    }

    const updated = await prisma.stagingBatch.update({
      where: { id: req.params.id as string },
      data: { pullRequests: { disconnect: { id: req.params.prId as string } } },
      include: { pullRequests: { select: { id: true, externalId: true, title: true, ciStatus: true } } },
    });

    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

export { router as batchesRouter };
