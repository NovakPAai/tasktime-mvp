import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireRole } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import {
  createReleaseDto,
  updateReleaseDto,
  moveIssuesToReleaseDto,
  manageSprintsInReleaseDto,
} from './releases.dto.js';
import * as releasesService from './releases.service.js';
import { logAudit } from '../../shared/middleware/audit.js';
import type { AuthRequest } from '../../shared/types/index.js';

const router = Router();
router.use(authenticate);

router.get('/projects/:projectId/releases', async (req, res, next) => {
  try {
    const list = await releasesService.listReleases(req.params.projectId as string);
    res.json(list);
  } catch (err) {
    next(err);
  }
});

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

router.get('/releases/:id/readiness', async (req, res, next) => {
  try {
    const readiness = await releasesService.getReleaseReadiness(req.params.id as string);
    res.json(readiness);
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
      const release = await releasesService.createRelease(
        req.params.projectId as string,
        req.body,
      );
      await logAudit(req, 'release.created', 'release', release.id, { name: release.name, level: release.level });
      res.status(201).json(release);
    } catch (err) {
      next(err);
    }
  },
);

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

router.post(
  '/releases/:id/issues',
  requireRole('ADMIN', 'MANAGER'),
  validate(moveIssuesToReleaseDto),
  async (req: AuthRequest, res, next) => {
    try {
      await releasesService.addIssuesToRelease(req.params.id as string, req.body.issueIds);
      await logAudit(req, 'release.issues_added', 'release', req.params.id as string, {
        issueIds: req.body.issueIds,
      });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/releases/:id/issues/remove',
  requireRole('ADMIN', 'MANAGER'),
  validate(moveIssuesToReleaseDto),
  async (req: AuthRequest, res, next) => {
    try {
      await releasesService.removeIssuesFromRelease(req.params.id as string, req.body.issueIds);
      await logAudit(req, 'release.issues_removed', 'release', req.params.id as string, {
        issueIds: req.body.issueIds,
      });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

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

router.post(
  '/releases/:id/ready',
  requireRole('ADMIN', 'MANAGER'),
  async (req: AuthRequest, res, next) => {
    try {
      const release = await releasesService.markReleaseReady(req.params.id as string);
      await logAudit(req, 'release.ready', 'release', release.id);
      res.json(release);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/releases/:id/released',
  requireRole('ADMIN', 'MANAGER'),
  async (req: AuthRequest, res, next) => {
    try {
      const releaseDate = (req.body as { releaseDate?: string }).releaseDate;
      const release = await releasesService.markReleaseReleased(req.params.id as string, releaseDate);
      await logAudit(req, 'release.released', 'release', release.id);
      res.json(release);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
