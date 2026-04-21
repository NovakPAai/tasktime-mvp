import { Router } from 'express';
import type { ProjectPermission } from '@prisma/client';
import { authenticate } from '../../shared/middleware/auth.js';
import {
  requireProjectPermission,
  assertProjectPermission,
} from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import {
  createReleaseDto,
  updateReleaseDto,
  listReleasesQueryDto,
  releaseItemsAddDto,
  releaseItemsRemoveDto,
  listReleaseItemsQueryDto,
  cloneReleaseDto,
  manageSprintsInReleaseDto,
  executeTransitionDto,
} from './releases.dto.js';
import * as releasesService from './releases.service.js';
import * as releaseWorkflowEngine from './release-workflow-engine.service.js';
import { logAudit } from '../../shared/middleware/audit.js';
import { hasAnySystemRole } from '../../shared/auth/roles.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import { prisma } from '../../prisma/client.js';
import { asyncHandler, authHandler } from '../../shared/utils/async-handler.js';
import type { AuthRequest } from '../../shared/types/index.js';

const router = Router();
router.use(authenticate);

/**
 * TTSEC-2 Phase 2: gate release mutations on granular `RELEASES_*` permissions.
 *
 * Releases may be project-scoped (ATOMIC) or multi-project (INTEGRATION). When projectId is
 * known, we use `assertProjectPermission`; for INTEGRATION releases (projectId=null) we fall
 * back to the legacy system-role gate (ADMIN / RELEASE_MANAGER).
 */

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

  if (release.projectId) {
    await assertProjectPermission(req.user!, release.projectId, perms);
    return;
  }
  // INTEGRATION release — no single project; keep system-role gate until a multi-project perm
  // model is designed. ADMIN and RELEASE_MANAGER correspond to the existing requireRole set.
  if (!hasAnySystemRole(req.user!.systemRoles, ['ADMIN', 'RELEASE_MANAGER', 'SUPER_ADMIN'])) {
    throw new AppError(403, 'Недостаточно прав для межпроектного релиза');
  }
}

// ─── RM-03.1: GET /releases — global list with filtering ────────────────────

router.get('/releases', authHandler(async (req, res) => {
  const query = listReleasesQueryDto.parse(req.query);
  const result = await releasesService.listReleasesGlobal(query);
  res.json(result);
}));

// ─── RM-03.2: POST /releases — create (ATOMIC | INTEGRATION) ────────────────
// TTSEC-2 Phase 2 (AI review #65 round 2): gate by context, not by one-size-fits-all role.
//   - projectId in body  → ATOMIC release, project-scoped → `RELEASES_CREATE` granular check.
//   - projectId omitted  → INTEGRATION release (multi-project), no single project to gate on →
//     fall back to system-role `requireRole` equivalent until a multi-project perm model exists.
// Combining both (requireRole AND granular) used to narrow access for users who had RELEASES_CREATE
// in a project but no system ADMIN/RELEASE_MANAGER — they could not create project-scoped releases
// through this endpoint, which contradicts the whole premise of granular permissions.
router.post(
  '/releases',
  validate(createReleaseDto),
  authHandler(async (req, res) => {
    if (req.body.projectId) {
      await assertProjectPermission(req.user!, req.body.projectId, ['RELEASES_CREATE']);
    } else if (!hasAnySystemRole(req.user!.systemRoles, ['ADMIN', 'RELEASE_MANAGER', 'SUPER_ADMIN'])) {
      throw new AppError(403, 'Недостаточно прав для межпроектного релиза');
    }
    const release = await releasesService.createReleaseGlobal(req.body, req.user!.userId);
    await logAudit(req, 'release.created', 'release', release.id, {
      name: release.name,
      type: release.type,
      level: release.level,
    });
    res.status(201).json(release);
  }),
);

router.get('/releases/:id', authHandler(async (req, res) => {
  const release = await releasesService.getRelease(req.params.id as string);
  res.json(release);
}));

router.get('/releases/:id/history', authHandler(async (req, res) => {
  const history = await releasesService.getReleaseHistory(req.params.id as string);
  res.json(history);
}));

router.patch('/releases/:id', validate(updateReleaseDto), authHandler(async (req, res) => {
  await assertReleasePermission(req, req.params.id as string, ['RELEASES_EDIT']);
  const release = await releasesService.updateRelease(req.params.id as string, req.body);
  await logAudit(req, 'release.updated', 'release', release.id, req.body);
  res.json(release);
}));

router.delete('/releases/:id', authHandler(async (req, res) => {
  await assertReleasePermission(req, req.params.id as string, ['RELEASES_DELETE']);
  await releasesService.deleteRelease(req.params.id as string);
  await logAudit(req, 'release.deleted', 'release', req.params.id as string);
  res.status(204).send();
}));

router.get('/releases/:id/items', authHandler(async (req, res) => {
  const query = listReleaseItemsQueryDto.parse(req.query);
  const result = await releasesService.listReleaseItems(req.params.id as string, query);
  res.json(result);
}));

router.post(
  '/releases/:id/items',
  validate(releaseItemsAddDto),
  authHandler(async (req, res) => {
    await assertReleasePermission(req, req.params.id as string, ['RELEASES_EDIT']);
    await releasesService.addReleaseItems(req.params.id as string, req.body, req.user!.userId);
    await logAudit(req, 'release.items_added', 'release', req.params.id as string, {
      issueIds: req.body.issueIds,
    });
    res.json({ ok: true });
  }),
);

router.post(
  '/releases/:id/items/remove',
  validate(releaseItemsRemoveDto),
  authHandler(async (req, res) => {
    await assertReleasePermission(req, req.params.id as string, ['RELEASES_EDIT']);
    await releasesService.removeReleaseItems(req.params.id as string, req.body.issueIds);
    await logAudit(req, 'release.items_removed', 'release', req.params.id as string, {
      issueIds: req.body.issueIds,
    });
    res.json({ ok: true });
  }),
);

router.get('/releases/:id/transitions', authHandler(async (req, res) => {
  const result = await releaseWorkflowEngine.getAvailableTransitions(
    req.params.id as string,
    req.user!.userId,
    req.user!.systemRoles,
  );
  res.json(result);
}));

router.post(
  '/releases/:id/transitions/:transitionId',
  validate(executeTransitionDto),
  authHandler(async (req, res) => {
    await assertReleasePermission(req, req.params.id as string, ['RELEASES_EDIT']);
    await releaseWorkflowEngine.executeTransition(
      req.params.id as string,
      req.params.transitionId as string,
      req.user!.userId,
      req.user!.systemRoles,
      (req.body as { comment?: string }).comment,
    );
    res.json({ ok: true });
  }),
);

router.get('/releases/:id/readiness', authHandler(async (req, res) => {
  const readiness = await releasesService.getReleaseReadiness(
    req.params.id as string,
    req.user?.userId,
    req.user?.systemRoles,
  );
  res.json(readiness);
}));

router.post(
  '/releases/:id/clone',
  validate(cloneReleaseDto),
  authHandler(async (req, res) => {
    // Cloning produces a NEW release; gate on CREATE at the source project boundary.
    await assertReleasePermission(req, req.params.id as string, ['RELEASES_CREATE']);
    const cloned = await releasesService.cloneRelease(
      req.params.id as string,
      req.body,
      req.user!.userId,
    );
    res.status(201).json(cloned);
  }),
);

router.post('/releases/:id/ready', (_req, res) => {
  res.status(410).json({
    error: 'Deprecated',
    message: 'Use POST /api/releases/:id/transitions/:transitionId',
  });
});

router.post('/releases/:id/released', (_req, res) => {
  res.status(410).json({
    error: 'Deprecated',
    message: 'Use POST /api/releases/:id/transitions/:transitionId',
  });
});

// ─── Legacy project-scoped routes ────────────────────────────────────────────

router.get('/projects/:projectId/releases', asyncHandler(async (req, res) => {
  const list = await releasesService.listReleases(req.params.projectId as string);
  res.json(list);
}));

router.post(
  '/projects/:projectId/releases',
  requireProjectPermission((req) => req.params.projectId as string, 'RELEASES_CREATE'),
  validate(createReleaseDto),
  authHandler(async (req, res) => {
    const release = await releasesService.createReleaseGlobal(
      { ...req.body, projectId: req.params.projectId, type: 'ATOMIC' },
      req.user!.userId,
    );
    await logAudit(req, 'release.created', 'release', release.id, {
      name: release.name,
      level: release.level,
    });
    res.status(201).json(release);
  }),
);

router.get('/releases/:id/issues', asyncHandler(async (req, res) => {
  const release = await releasesService.getReleaseWithIssues(req.params.id as string);
  res.json(release);
}));

router.get('/releases/:id/sprints', asyncHandler(async (req, res) => {
  const sprints = await releasesService.getReleaseSprints(req.params.id as string);
  res.json(sprints);
}));

router.post(
  '/releases/:id/sprints',
  validate(manageSprintsInReleaseDto),
  authHandler(async (req, res) => {
    await assertReleasePermission(req, req.params.id as string, ['RELEASES_EDIT']);
    await releasesService.addSprintsToRelease(req.params.id as string, req.body.sprintIds);
    await logAudit(req, 'release.sprints_added', 'release', req.params.id as string, {
      sprintIds: req.body.sprintIds,
    });
    res.json({ ok: true });
  }),
);

router.post(
  '/releases/:id/sprints/remove',
  validate(manageSprintsInReleaseDto),
  authHandler(async (req, res) => {
    await assertReleasePermission(req, req.params.id as string, ['RELEASES_EDIT']);
    await releasesService.removeSprintsFromRelease(req.params.id as string, req.body.sprintIds);
    await logAudit(req, 'release.sprints_removed', 'release', req.params.id as string, {
      sprintIds: req.body.sprintIds,
    });
    res.json({ ok: true });
  }),
);

export default router;
