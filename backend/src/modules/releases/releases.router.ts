import { Router } from 'express';
import type { ProjectPermission } from '@prisma/client';
import { authenticate } from '../../shared/middleware/auth.js';
import {
  requireRole,
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
import type { AuthRequest } from '../../shared/types/index.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import { prisma } from '../../prisma/client.js';

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

router.get('/releases', async (req: AuthRequest, res, next) => {
  try {
    const query = listReleasesQueryDto.parse(req.query);
    const result = await releasesService.listReleasesGlobal(query);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── RM-03.2: POST /releases — create (INTEGRATION spans projects) ──────────
// Global create retains requireRole — INTEGRATION releases may have no projectId to gate on.
// ATOMIC releases with projectId additionally pass through the granular check below.
router.post(
  '/releases',
  requireRole('ADMIN', 'RELEASE_MANAGER'),
  validate(createReleaseDto),
  async (req: AuthRequest, res, next) => {
    try {
      if (req.body.projectId) {
        await assertProjectPermission(req.user!, req.body.projectId, ['RELEASES_CREATE']);
      }
      const release = await releasesService.createReleaseGlobal(req.body, req.user!.userId);
      await logAudit(req, 'release.created', 'release', release.id, {
        name: release.name,
        type: release.type,
        level: release.level,
      });
      res.status(201).json(release);
    } catch (err) {
      next(err);
    }
  },
);

router.get('/releases/:id', async (req: AuthRequest, res, next) => {
  try {
    const release = await releasesService.getRelease(req.params.id as string);
    res.json(release);
  } catch (err) {
    next(err);
  }
});

router.get('/releases/:id/history', async (req: AuthRequest, res, next) => {
  try {
    const history = await releasesService.getReleaseHistory(req.params.id as string);
    res.json(history);
  } catch (err) {
    next(err);
  }
});

router.patch('/releases/:id', validate(updateReleaseDto), async (req: AuthRequest, res, next) => {
  try {
    await assertReleasePermission(req, req.params.id as string, ['RELEASES_EDIT']);
    const release = await releasesService.updateRelease(req.params.id as string, req.body);
    await logAudit(req, 'release.updated', 'release', release.id, req.body);
    res.json(release);
  } catch (err) {
    next(err);
  }
});

router.delete('/releases/:id', async (req: AuthRequest, res, next) => {
  try {
    await assertReleasePermission(req, req.params.id as string, ['RELEASES_DELETE']);
    await releasesService.deleteRelease(req.params.id as string);
    await logAudit(req, 'release.deleted', 'release', req.params.id as string);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.get('/releases/:id/items', async (req: AuthRequest, res, next) => {
  try {
    const query = listReleaseItemsQueryDto.parse(req.query);
    const result = await releasesService.listReleaseItems(req.params.id as string, query);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/releases/:id/items',
  validate(releaseItemsAddDto),
  async (req: AuthRequest, res, next) => {
    try {
      await assertReleasePermission(req, req.params.id as string, ['RELEASES_EDIT']);
      await releasesService.addReleaseItems(req.params.id as string, req.body, req.user!.userId);
      await logAudit(req, 'release.items_added', 'release', req.params.id as string, {
        issueIds: req.body.issueIds,
      });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/releases/:id/items/remove',
  validate(releaseItemsRemoveDto),
  async (req: AuthRequest, res, next) => {
    try {
      await assertReleasePermission(req, req.params.id as string, ['RELEASES_EDIT']);
      await releasesService.removeReleaseItems(req.params.id as string, req.body.issueIds);
      await logAudit(req, 'release.items_removed', 'release', req.params.id as string, {
        issueIds: req.body.issueIds,
      });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

router.get('/releases/:id/transitions', async (req: AuthRequest, res, next) => {
  try {
    const result = await releaseWorkflowEngine.getAvailableTransitions(
      req.params.id as string,
      req.user!.userId,
      req.user!.systemRoles,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/releases/:id/transitions/:transitionId',
  validate(executeTransitionDto),
  async (req: AuthRequest, res, next) => {
    try {
      await assertReleasePermission(req, req.params.id as string, ['RELEASES_EDIT']);
      await releaseWorkflowEngine.executeTransition(
        req.params.id as string,
        req.params.transitionId as string,
        req.user!.userId,
        req.user!.systemRoles,
        (req.body as { comment?: string }).comment,
      );
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

router.get('/releases/:id/readiness', async (req: AuthRequest, res, next) => {
  try {
    const readiness = await releasesService.getReleaseReadiness(
      req.params.id as string,
      req.user?.userId,
      req.user?.systemRoles,
    );
    res.json(readiness);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/releases/:id/clone',
  validate(cloneReleaseDto),
  async (req: AuthRequest, res, next) => {
    try {
      // Cloning produces a NEW release; gate on CREATE at the source project boundary.
      await assertReleasePermission(req, req.params.id as string, ['RELEASES_CREATE']);
      const cloned = await releasesService.cloneRelease(
        req.params.id as string,
        req.body,
        req.user!.userId,
      );
      res.status(201).json(cloned);
    } catch (err) {
      next(err);
    }
  },
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

router.get('/projects/:projectId/releases', async (req, res, next) => {
  try {
    const list = await releasesService.listReleases(req.params.projectId as string);
    res.json(list);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/projects/:projectId/releases',
  requireProjectPermission((req) => req.params.projectId as string, 'RELEASES_CREATE'),
  validate(createReleaseDto),
  async (req: AuthRequest, res, next) => {
    try {
      const release = await releasesService.createReleaseGlobal(
        { ...req.body, projectId: req.params.projectId, type: 'ATOMIC' },
        req.user!.userId,
      );
      await logAudit(req, 'release.created', 'release', release.id, {
        name: release.name,
        level: release.level,
      });
      res.status(201).json(release);
    } catch (err) {
      next(err);
    }
  },
);

router.get('/releases/:id/issues', async (req, res, next) => {
  try {
    const release = await releasesService.getReleaseWithIssues(req.params.id as string);
    res.json(release);
  } catch (err) {
    next(err);
  }
});

router.get('/releases/:id/sprints', async (req, res, next) => {
  try {
    const sprints = await releasesService.getReleaseSprints(req.params.id as string);
    res.json(sprints);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/releases/:id/sprints',
  validate(manageSprintsInReleaseDto),
  async (req: AuthRequest, res, next) => {
    try {
      await assertReleasePermission(req, req.params.id as string, ['RELEASES_EDIT']);
      await releasesService.addSprintsToRelease(req.params.id as string, req.body.sprintIds);
      await logAudit(req, 'release.sprints_added', 'release', req.params.id as string, {
        sprintIds: req.body.sprintIds,
      });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/releases/:id/sprints/remove',
  validate(manageSprintsInReleaseDto),
  async (req: AuthRequest, res, next) => {
    try {
      await assertReleasePermission(req, req.params.id as string, ['RELEASES_EDIT']);
      await releasesService.removeSprintsFromRelease(req.params.id as string, req.body.sprintIds);
      await logAudit(req, 'release.sprints_removed', 'release', req.params.id as string, {
        sprintIds: req.body.sprintIds,
      });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
