// TTMP-160 PR-3: release-scoped checkpoint endpoints.
// Mounted at /api under app.ts — routes include the release id in the path.
//
//   GET    /api/releases/:releaseId/checkpoints
//   POST   /api/releases/:releaseId/checkpoints                { checkpointTypeIds }
//   POST   /api/releases/:releaseId/checkpoints/apply-template { templateId }
//   POST   /api/releases/:releaseId/checkpoints/preview-template { templateId }
//   POST   /api/releases/:releaseId/checkpoints/recompute
//   DELETE /api/releases/:releaseId/checkpoints/:checkpointId
//   GET    /api/issues/:issueId/checkpoints
//   POST   /api/checkpoint-types/:id/sync-instances            { releaseIds }

import type { ProjectPermission } from '@prisma/client';
import { Router } from 'express';
import { prisma } from '../../../prisma/client.js';
import { authenticate } from '../../../shared/middleware/auth.js';
import {
  assertProjectPermission,
  requireRole,
} from '../../../shared/middleware/rbac.js';
import { validate } from '../../../shared/middleware/validate.js';
import { logAudit } from '../../../shared/middleware/audit.js';
import { AppError } from '../../../shared/middleware/error-handler.js';
import { hasAnySystemRole } from '../../../shared/auth/roles.js';
import type { AuthRequest } from '../../../shared/types/index.js';
import {
  addCheckpointsDto,
  applyTemplateDto,
  previewTemplateDto,
  syncInstancesDto,
} from './release-checkpoint.dto.js';
import * as service from './release-checkpoints.service.js';

const router = Router();
router.use(authenticate);

// SEC-2: for ATOMIC releases, either RELEASES_EDIT project permission OR the global
// SUPER_ADMIN / ADMIN / RELEASE_MANAGER system role passes. For INTEGRATION, only the
// system role path — there's no single project to check.
async function assertReleaseMutate(req: AuthRequest, releaseId: string): Promise<void> {
  await assertReleasePermission(req, releaseId, ['RELEASES_EDIT']);
}

// Read gate for the checkpoint/risk endpoints — anyone who can see the release sees its
// checkpoints. Global project-read roles bypass project membership via assertProjectPermission.
async function assertReleaseRead(req: AuthRequest, releaseId: string): Promise<void> {
  await assertReleasePermission(req, releaseId, ['RELEASES_VIEW']);
}

// Read gate for /api/issues/:id/checkpoints — any authenticated user in the issue's project
// (or with a global project-read role) can see the checkpoints touching their issue.
async function assertIssueRead(req: AuthRequest, issueId: string): Promise<void> {
  const issue = await prisma.issue.findUnique({
    where: { id: issueId },
    select: { projectId: true },
  });
  if (!issue) throw new AppError(404, 'Задача не найдена');

  const hasGlobalRole = hasAnySystemRole(req.user!.systemRoles, [
    'ADMIN',
    'RELEASE_MANAGER',
    'SUPER_ADMIN',
    'AUDITOR',
  ]);
  if (hasGlobalRole) return;

  await assertProjectPermission(req.user!, issue.projectId, ['ISSUES_VIEW']);
}

async function assertReleasePermission(
  req: AuthRequest,
  releaseId: string,
  perms: ProjectPermission[],
): Promise<void> {
  const release = await prisma.release.findUnique({
    where: { id: releaseId },
    select: { projectId: true },
  });
  if (!release) throw new AppError(404, 'Релиз не найден');

  const hasGlobalRole = hasAnySystemRole(req.user!.systemRoles, [
    'ADMIN',
    'RELEASE_MANAGER',
    'SUPER_ADMIN',
  ]);
  if (hasGlobalRole) return;

  if (release.projectId) {
    await assertProjectPermission(req.user!, release.projectId, perms);
    return;
  }
  throw new AppError(403, 'Недостаточно прав для межпроектного релиза');
}

// ─── Read ────────────────────────────────────────────────────────────────────

router.get('/releases/:releaseId/checkpoints', async (req: AuthRequest, res, next) => {
  try {
    const releaseId = req.params.releaseId as string;
    await assertReleaseRead(req, releaseId);
    res.json(await service.listForRelease(releaseId));
  } catch (err) {
    next(err);
  }
});

router.get('/issues/:issueId/checkpoints', async (req: AuthRequest, res, next) => {
  try {
    const issueId = req.params.issueId as string;
    await assertIssueRead(req, issueId);
    res.json(await service.listForIssue(issueId));
  } catch (err) {
    next(err);
  }
});

// ─── Write ───────────────────────────────────────────────────────────────────

router.post(
  '/releases/:releaseId/checkpoints',
  validate(addCheckpointsDto),
  async (req: AuthRequest, res, next) => {
    try {
      const releaseId = req.params.releaseId as string;
      await assertReleaseMutate(req, releaseId);
      const result = await service.addCheckpoints(releaseId, req.body.checkpointTypeIds);
      await logAudit(req, 'release_checkpoint.added', 'release', releaseId, {
        checkpointTypeIds: req.body.checkpointTypeIds,
      });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/releases/:releaseId/checkpoints/apply-template',
  validate(applyTemplateDto),
  async (req: AuthRequest, res, next) => {
    try {
      const releaseId = req.params.releaseId as string;
      await assertReleaseMutate(req, releaseId);
      const result = await service.applyTemplate(releaseId, req.body.templateId);
      await logAudit(req, 'checkpoint_template.applied', 'release', releaseId, {
        templateId: req.body.templateId,
        createdCheckpointIds: result.checkpoints.map((c) => c.id),
      });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/releases/:releaseId/checkpoints/preview-template',
  validate(previewTemplateDto),
  async (req: AuthRequest, res, next) => {
    try {
      const releaseId = req.params.releaseId as string;
      // FR-14: dry-run, no writes — read-level gate is enough. A VIEWER on the project can
      // preview what would happen if a template were applied.
      await assertReleaseRead(req, releaseId);
      res.json(await service.previewTemplate(releaseId, req.body.templateId));
    } catch (err) {
      next(err);
    }
  },
);

router.post('/releases/:releaseId/checkpoints/recompute', async (req: AuthRequest, res, next) => {
  try {
    const releaseId = req.params.releaseId as string;
    await assertReleaseMutate(req, releaseId);
    const stats = await service.recomputeForRelease(releaseId);
    await logAudit(req, 'release_checkpoint.recomputed', 'release', releaseId, {
      trigger: 'manual',
      ...stats,
    });
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

router.delete(
  '/releases/:releaseId/checkpoints/:checkpointId',
  async (req: AuthRequest, res, next) => {
    try {
      const releaseId = req.params.releaseId as string;
      const checkpointId = req.params.checkpointId as string;
      await assertReleaseMutate(req, releaseId);
      await service.removeCheckpoint(releaseId, checkpointId);
      await logAudit(req, 'release_checkpoint.removed', 'release', releaseId, { checkpointId });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Sync-instances (FR-15): SUPER_ADMIN / ADMIN / RELEASE_MANAGER ───────────

const syncRouter = Router();
syncRouter.use(authenticate);
syncRouter.use(requireRole('SUPER_ADMIN', 'ADMIN', 'RELEASE_MANAGER'));

syncRouter.post(
  '/:id/sync-instances',
  validate(syncInstancesDto),
  async (req: AuthRequest, res, next) => {
    try {
      const typeId = req.params.id as string;
      const result = await service.syncInstances(typeId, req.body.releaseIds);
      await logAudit(req, 'checkpoint_type.instances_synced', 'checkpoint_type', typeId, {
        releaseIds: req.body.releaseIds,
        syncedCount: result.syncedCount,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
export { syncRouter };
