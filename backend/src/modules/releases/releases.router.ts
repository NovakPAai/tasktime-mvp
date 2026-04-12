import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireRole } from '../../shared/middleware/rbac.js';
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
import type { AuthRequest } from '../../shared/types/index.js';

const router = Router();
router.use(authenticate);

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

// ─── RM-03.2: POST /releases — create with type ATOMIC/INTEGRATION ──────────

router.post(
  '/releases',
  requireRole('ADMIN', 'MANAGER'),
  validate(createReleaseDto),
  async (req: AuthRequest, res, next) => {
    try {
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

// ─── GET /releases/:id — single release ──────────────────────────────────────

router.get('/releases/:id', async (req: AuthRequest, res, next) => {
  try {
    const release = await releasesService.getRelease(req.params.id as string);
    res.json(release);
  } catch (err) {
    next(err);
  }
});

// ─── GET /releases/:id/history — audit log ───────────────────────────────────

router.get('/releases/:id/history', async (req: AuthRequest, res, next) => {
  try {
    const history = await releasesService.getReleaseHistory(req.params.id as string);
    res.json(history);
  } catch (err) {
    next(err);
  }
});

// ─── RM-03.3: PATCH /releases/:id — update (immutable: type, projectId) ─────

router.patch(
  '/releases/:id',
  requireRole('ADMIN', 'MANAGER'),
  validate(updateReleaseDto),
  async (req: AuthRequest, res, next) => {
    try {
      const release = await releasesService.updateRelease(req.params.id as string, req.body);
      await logAudit(req, 'release.updated', 'release', release.id, req.body);
      res.json(release);
    } catch (err) {
      next(err);
    }
  },
);

// ─── RM-03.4: DELETE /releases/:id ───────────────────────────────────────────

router.delete(
  '/releases/:id',
  requireRole('ADMIN', 'MANAGER'),
  async (req: AuthRequest, res, next) => {
    try {
      await releasesService.deleteRelease(req.params.id as string);
      await logAudit(req, 'release.deleted', 'release', req.params.id as string);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

// ─── RM-03.5: ReleaseItem CRUD ────────────────────────────────────────────────

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
  requireRole('ADMIN', 'MANAGER'),
  validate(releaseItemsAddDto),
  async (req: AuthRequest, res, next) => {
    try {
      await releasesService.addReleaseItems(
        req.params.id as string,
        req.body,
        req.user!.userId,
      );
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
  requireRole('ADMIN', 'MANAGER'),
  validate(releaseItemsRemoveDto),
  async (req: AuthRequest, res, next) => {
    try {
      await releasesService.removeReleaseItems(
        req.params.id as string,
        req.body.issueIds,
      );
      await logAudit(req, 'release.items_removed', 'release', req.params.id as string, {
        issueIds: req.body.issueIds,
      });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// ─── RM-03.6: Transitions ────────────────────────────────────────────────────

router.get(
  '/releases/:id/transitions',
  requireRole('ADMIN', 'MANAGER', 'USER'),
  async (req: AuthRequest, res, next) => {
    try {
      const result = await releaseWorkflowEngine.getAvailableTransitions(
        req.params.id as string,
        req.user!.userId,
        req.user!.role,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/releases/:id/transitions/:transitionId',
  requireRole('ADMIN', 'MANAGER', 'USER'),
  validate(executeTransitionDto),
  async (req: AuthRequest, res, next) => {
    try {
      await releaseWorkflowEngine.executeTransition(
        req.params.id as string,
        req.params.transitionId as string,
        req.user!.userId,
        req.user!.role,
        (req.body as { comment?: string }).comment,
      );
      // audit is written inside executeTransition via prisma.$transaction
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// ─── RM-03.7: GET /releases/:id/readiness — extended ─────────────────────────

router.get('/releases/:id/readiness', async (req, res, next) => {
  try {
    const readiness = await releasesService.getReleaseReadiness(req.params.id as string);
    res.json(readiness);
  } catch (err) {
    next(err);
  }
});

// ─── RM-03.8: POST /releases/:id/clone ───────────────────────────────────────

router.post(
  '/releases/:id/clone',
  requireRole('ADMIN', 'MANAGER'),
  validate(cloneReleaseDto),
  async (req: AuthRequest, res, next) => {
    try {
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

// ─── RM-03.9: Deprecated endpoints → 410 Gone ────────────────────────────────

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
  requireRole('ADMIN', 'MANAGER'),
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
  requireRole('ADMIN', 'MANAGER'),
  validate(manageSprintsInReleaseDto),
  async (req: AuthRequest, res, next) => {
    try {
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
  requireRole('ADMIN', 'MANAGER'),
  validate(manageSprintsInReleaseDto),
  async (req: AuthRequest, res, next) => {
    try {
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
