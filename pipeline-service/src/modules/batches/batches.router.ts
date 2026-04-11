import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../prisma/client.js';
import { apiKeyAuth } from '../../shared/middleware/api-key-auth.js';
import { validate } from '../../shared/middleware/validate.js';
import type { StagingBatchState } from '@prisma/client';
import { triggerWorkflowDispatch } from '../github/github.client.js';
import { config } from '../../config.js';

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parse APP_GITHUB_REPOS → [owner, repo] or throw */
function getOwnerRepo(): [string, string] {
  const ownerRepo = config.APP_GITHUB_REPOS
    .split(',')
    .map((s: string) => s.trim())
    .find(r => /^[^/\s]+\/[^/\s]+$/.test(r));
  if (!ownerRepo) throw new Error('APP_GITHUB_REPOS is empty or contains no valid "owner/repo" entry');
  const [owner, repo] = ownerRepo.split('/');
  return [owner, repo];
}

/** Latest mergedSha from batch PRs, or '' */
async function getImageTag(batchId: string): Promise<string> {
  const batch = await prisma.stagingBatch.findUnique({
    where: { id: batchId },
    include: { pullRequests: { orderBy: { mergedAt: 'desc' }, take: 1 } },
  });
  return batch?.pullRequests[0]?.mergedSha ?? '';
}

// ─── POST /api/batches/:id/deploy-staging ─────────────────────────────────────

router.post('/:id/deploy-staging', async (req, res, next) => {
  try {
    const batchId = req.params.id as string;
    const batch = await prisma.stagingBatch.findUnique({ where: { id: batchId } });
    if (!batch) { res.status(404).json({ error: 'Batch not found' }); return; }
    if (!['COLLECTING', 'MERGING'].includes(batch.state)) {
      res.status(422).json({ error: `Batch must be COLLECTING or MERGING to deploy staging (current: ${batch.state})` });
      return;
    }

    const imageTag = (req.body?.imageTag as string | undefined) || await getImageTag(batchId);
    if (!imageTag) {
      res.status(422).json({ error: 'No imageTag available — batch has no merged PRs with a SHA' });
      return;
    }

    const [owner, repo] = getOwnerRepo();
    const prevState = batch.state;

    // Duplicate-protection + event creation in a single interactive transaction
    // to close the check-then-insert race window.
    let deployEvent: import('@prisma/client').DeployEvent;
    let updatedBatch: import('@prisma/client').StagingBatch & { pullRequests: { id: string; externalId: number; title: string; ciStatus: string }[]; deployEvents: import('@prisma/client').DeployEvent[] };
    try {
      [deployEvent, updatedBatch] = await prisma.$transaction(async (tx) => {
        const running = await tx.deployEvent.findFirst({
          where: { stagingBatchId: batchId, target: 'STAGING', status: 'RUNNING' },
        });
        if (running) throw Object.assign(new Error('ALREADY_RUNNING'), { code: 'ALREADY_RUNNING' });

        const event = await tx.deployEvent.create({
          data: { target: 'STAGING', status: 'RUNNING', imageTag, gitSha: imageTag, triggeredById: req.caller?.userId ?? 'unknown', stagingBatchId: batchId },
        });
        const btch = await tx.stagingBatch.update({
          where: { id: batchId },
          data: { state: 'DEPLOYING' },
          include: { pullRequests: { select: { id: true, externalId: true, title: true, ciStatus: true } }, deployEvents: { orderBy: { startedAt: 'desc' }, take: 5 } },
        });
        return [event, btch];
      });
    } catch (txErr: unknown) {
      if ((txErr as { code?: string }).code === 'ALREADY_RUNNING') {
        res.status(409).json({ error: 'A staging deploy is already in progress for this batch' });
        return;
      }
      throw txErr;
    }

    try {
      await triggerWorkflowDispatch(owner, repo, 'deploy-staging.yml', config.PIPELINE_GITHUB_REF, {
        image_tag: imageTag,
        batch_id: batchId,
      });
    } catch (dispatchErr) {
      // Revert batch to previous state so operator can retry
      await prisma.$transaction([
        prisma.deployEvent.update({ where: { id: deployEvent.id }, data: { status: 'FAILURE', finishedAt: new Date() } }),
        prisma.stagingBatch.update({ where: { id: batchId }, data: { state: prevState } }),
      ]);
      throw dispatchErr;
    }

    res.json({ data: updatedBatch, deployEvent });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/batches/:id/deploy-production ──────────────────────────────────

router.post('/:id/deploy-production', async (req, res, next) => {
  try {
    const batchId = req.params.id as string;
    const batch = await prisma.stagingBatch.findUnique({ where: { id: batchId } });
    if (!batch) { res.status(404).json({ error: 'Batch not found' }); return; }
    if (batch.state !== 'PASSED') {
      res.status(422).json({ error: `Batch must be PASSED to deploy production (current: ${batch.state})` });
      return;
    }

    const imageTag = (req.body?.imageTag as string | undefined) || await getImageTag(batchId);
    if (!imageTag) {
      res.status(422).json({ error: 'No imageTag available — batch has no merged PRs with a SHA' });
      return;
    }

    const [owner, repo] = getOwnerRepo();

    // Duplicate-protection + event creation in a single interactive transaction
    // to close the check-then-insert race window.
    let deployEvent: import('@prisma/client').DeployEvent;
    let updatedBatch: import('@prisma/client').StagingBatch & { pullRequests: { id: string; externalId: number; title: string; ciStatus: string }[]; deployEvents: import('@prisma/client').DeployEvent[] };
    try {
      [deployEvent, updatedBatch] = await prisma.$transaction(async (tx) => {
        const running = await tx.deployEvent.findFirst({
          where: { stagingBatchId: batchId, target: 'PRODUCTION', status: 'RUNNING' },
        });
        if (running) throw Object.assign(new Error('ALREADY_RUNNING'), { code: 'ALREADY_RUNNING' });

        const event = await tx.deployEvent.create({
          data: { target: 'PRODUCTION', status: 'RUNNING', imageTag, gitSha: imageTag, triggeredById: req.caller?.userId ?? 'unknown', stagingBatchId: batchId },
        });
        const btch = await tx.stagingBatch.update({
          where: { id: batchId },
          data: {},  // state stays PASSED until callback confirms success
          include: { pullRequests: { select: { id: true, externalId: true, title: true, ciStatus: true } }, deployEvents: { orderBy: { startedAt: 'desc' }, take: 5 } },
        });
        return [event, btch];
      });
    } catch (txErr: unknown) {
      if ((txErr as { code?: string }).code === 'ALREADY_RUNNING') {
        res.status(409).json({ error: 'A production deploy is already in progress for this batch' });
        return;
      }
      throw txErr;
    }

    try {
      await triggerWorkflowDispatch(owner, repo, 'deploy-production.yml', config.PIPELINE_GITHUB_REF, {
        image_tag: imageTag,
        batch_id: batchId,
      });
    } catch (dispatchErr) {
      await prisma.deployEvent.update({ where: { id: deployEvent.id }, data: { status: 'FAILURE', finishedAt: new Date() } });
      throw dispatchErr;
    }

    res.json({ data: updatedBatch, deployEvent });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/batches/:id/cancel-deploy ─────────────────────────────────────

router.post('/:id/cancel-deploy', async (req, res, next) => {
  try {
    const batchId = req.params.id as string;
    const batch = await prisma.stagingBatch.findUnique({
      where: { id: batchId },
      include: { deployEvents: { where: { status: 'RUNNING' }, orderBy: { startedAt: 'desc' }, take: 1 } },
    });
    if (!batch) { res.status(404).json({ error: 'Batch not found' }); return; }
    if (batch.state !== 'DEPLOYING') {
      res.status(422).json({ error: `Batch must be DEPLOYING to cancel (current: ${batch.state})` });
      return;
    }

    const runningEvent = batch.deployEvents[0];
    const finishedAt = new Date();

    const updates = runningEvent
      ? [
          prisma.deployEvent.update({
            where: { id: runningEvent.id },
            data: {
              status: 'FAILURE',
              finishedAt,
              durationMs: runningEvent.startedAt ? finishedAt.getTime() - runningEvent.startedAt.getTime() : null,
              errorMessage: 'Cancelled manually',
            },
          }),
          prisma.stagingBatch.update({
            where: { id: batchId },
            data: { state: 'FAILED' },
            include: { pullRequests: { select: { id: true, externalId: true, title: true, ciStatus: true } }, deployEvents: { orderBy: { startedAt: 'desc' }, take: 5 } },
          }),
        ]
      : [
          prisma.stagingBatch.update({
            where: { id: batchId },
            data: { state: 'FAILED' },
            include: { pullRequests: { select: { id: true, externalId: true, title: true, ciStatus: true } }, deployEvents: { orderBy: { startedAt: 'desc' }, take: 5 } },
          }),
        ];

    const results = await prisma.$transaction(updates);
    const updatedBatch = results[results.length - 1];

    res.json({ data: updatedBatch });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/batches/:id/deploy-callback ────────────────────────────────────

const callbackBody = z.object({
  status: z.enum(['SUCCESS', 'FAILURE']),
  target: z.enum(['STAGING', 'PRODUCTION']).optional(),
  workflowRunId: z.number().optional(),
  workflowRunUrl: z.string().url().optional(),
  errorMessage: z.string().optional(),
});

router.post('/:id/deploy-callback', validate(callbackBody), async (req, res, next) => {
  try {
    const batchId = req.params.id as string;
    const { status, target: callbackTarget, workflowRunId, workflowRunUrl, errorMessage } = req.body as z.infer<typeof callbackBody>;

    const batch = await prisma.stagingBatch.findUnique({
      where: { id: batchId },
      include: { deployEvents: { where: { status: 'RUNNING' }, orderBy: { startedAt: 'desc' }, take: 1 } },
    });
    if (!batch) { res.status(404).json({ error: 'Batch not found' }); return; }

    // If the batch was already manually cancelled, ignore late callbacks silently
    if (batch.state === 'FAILED' && !batch.deployEvents[0]) {
      res.json({ data: batch, deployEvent: null });
      return;
    }

    const runningEvent = batch.deployEvents[0];
    const finishedAt = new Date();

    // Determine new batch state based on deploy target + result
    let newBatchState: import('@prisma/client').StagingBatchState | null = null;
    if (runningEvent) {
      if (runningEvent.target === 'STAGING') {
        newBatchState = status === 'SUCCESS' ? 'TESTING' : 'FAILED';
      } else if (runningEvent.target === 'PRODUCTION') {
        // On production failure, keep batch in PASSED state so deploy can be retried
        // (PASSED → FAILED is not a valid transition)
        newBatchState = status === 'SUCCESS' ? 'RELEASED' : null;
      }
    }

    const [updatedEvent, updatedBatch] = await prisma.$transaction([
      runningEvent
        ? prisma.deployEvent.update({
            where: { id: runningEvent.id },
            data: {
              status: status === 'SUCCESS' ? 'SUCCESS' : 'FAILURE',
              finishedAt,
              durationMs: runningEvent.startedAt ? finishedAt.getTime() - runningEvent.startedAt.getTime() : null,
              workflowRunId: workflowRunId ?? null,
              workflowRunUrl: workflowRunUrl ?? null,
              errorMessage: errorMessage ?? null,
            },
          })
        : prisma.deployEvent.create({
            data: { target: callbackTarget ?? 'STAGING', status: 'FAILURE', imageTag: 'unknown', triggeredById: 'callback', stagingBatchId: batchId, errorMessage: 'No running deploy found' },
          }),
      prisma.stagingBatch.update({
        where: { id: batchId },
        data: newBatchState ? { state: newBatchState } : {},
        include: { pullRequests: { select: { id: true, externalId: true, title: true, ciStatus: true } }, deployEvents: { orderBy: { startedAt: 'desc' }, take: 5 } },
      }),
    ]);

    res.json({ data: updatedBatch, deployEvent: updatedEvent });
  } catch (err) {
    next(err);
  }
});
