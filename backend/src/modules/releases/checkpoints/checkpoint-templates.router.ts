// TTMP-160 PR-1: CheckpointTemplate CRUD + clone router — mounted at /api/admin/checkpoint-templates.
// SEC-1: management restricted to SUPER_ADMIN / ADMIN / RELEASE_MANAGER (FR-2).

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
  createCheckpointTemplateDto,
  updateCheckpointTemplateDto,
  cloneCheckpointTemplateDto,
} from './checkpoint.dto.js';
import { applyBulkDto } from './release-checkpoint.dto.js';
import * as service from './checkpoint-templates.service.js';
import { applyTemplate } from './release-checkpoints.service.js';

const router = Router();

router.use(authenticate);
router.use(requireRole('SUPER_ADMIN', 'ADMIN', 'RELEASE_MANAGER'));

router.get('/', async (_req, res, next) => {
  try {
    res.json(await service.listCheckpointTemplates());
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    res.json(await service.getCheckpointTemplate(req.params['id'] as string));
  } catch (err) {
    next(err);
  }
});

router.post('/', validate(createCheckpointTemplateDto), async (req: AuthRequest, res, next) => {
  try {
    const template = await service.createCheckpointTemplate(req.body, req.user!.userId);
    await logAudit(req, 'checkpoint_template.created', 'checkpoint_template', template.id, {
      name: template.name,
      itemsCount: template.items.length,
    });
    res.status(201).json(template);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', validate(updateCheckpointTemplateDto), async (req: AuthRequest, res, next) => {
  try {
    const id = req.params['id'] as string;
    const template = await service.updateCheckpointTemplate(id, req.body);
    await logAudit(req, 'checkpoint_template.updated', 'checkpoint_template', id, {
      fields: Object.keys(req.body),
    });
    res.json(template);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    const id = req.params['id'] as string;
    await service.deleteCheckpointTemplate(id);
    await logAudit(req, 'checkpoint_template.deleted', 'checkpoint_template', id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/:id/clone',
  validate(cloneCheckpointTemplateDto),
  async (req: AuthRequest, res, next) => {
    try {
      const sourceId = req.params['id'] as string;
      const clone = await service.cloneCheckpointTemplate(sourceId, req.body, req.user!.userId);
      await logAudit(req, 'checkpoint_template.cloned', 'checkpoint_template', clone.id, {
        fromTemplateId: sourceId,
        name: clone.name,
      });
      res.status(201).json(clone);
    } catch (err) {
      next(err);
    }
  },
);

// FR-21: apply one template to many releases, partitioning by per-release permission.
// Returns 207 Multi-Status — `successful` releases actually got the template applied,
// `forbidden` were denied, and `failed` hit some other error (e.g. plannedDate missing).
router.post(
  '/:id/apply-bulk',
  validate(applyBulkDto),
  async (req: AuthRequest, res, next) => {
    try {
      const templateId = req.params['id'] as string;
      const { releaseIds } = req.body as { releaseIds: string[] };

      // Resolve all releases upfront so we can batch the permission checks and give a
      // stable ordering in the response.
      const releases = await prisma.release.findMany({
        where: { id: { in: releaseIds } },
        select: { id: true, projectId: true, name: true },
      });
      const releaseById = new Map(releases.map((r) => [r.id, r]));

      const hasGlobalRole = hasAnySystemRole(req.user!.systemRoles, [
        'ADMIN',
        'RELEASE_MANAGER',
        'SUPER_ADMIN',
      ]);

      const successful: Array<{ releaseId: string; releaseName: string }> = [];
      const forbidden: Array<{ releaseId: string; reason: string }> = [];
      const failed: Array<{ releaseId: string; reason: string }> = [];

      for (const releaseId of releaseIds) {
        const release = releaseById.get(releaseId);
        if (!release) {
          forbidden.push({ releaseId, reason: 'RELEASE_NOT_FOUND' });
          continue;
        }

        // SEC-5: check every release individually. Global role short-circuits.
        if (!hasGlobalRole) {
          if (!release.projectId) {
            forbidden.push({
              releaseId,
              reason: 'INTEGRATION_REQUIRES_GLOBAL_ROLE',
            });
            continue;
          }
          try {
            const perms: ProjectPermission[] = ['RELEASES_EDIT'];
            await assertProjectPermission(req.user!, release.projectId, perms);
          } catch {
            forbidden.push({ releaseId, reason: 'FORBIDDEN' });
            continue;
          }
        }

        try {
          await applyTemplate(releaseId, templateId);
          successful.push({ releaseId, releaseName: release.name });
        } catch (err) {
          const code =
            err instanceof AppError ? err.code || err.message : 'APPLY_FAILED';
          failed.push({ releaseId, reason: code });
        }
      }

      await logAudit(req, 'checkpoint_template.applied_bulk', 'checkpoint_template', templateId, {
        templateId,
        successfulReleaseIds: successful.map((s) => s.releaseId),
        forbiddenReleaseIds: forbidden.map((f) => f.releaseId),
        failedReleaseIds: failed.map((f) => f.releaseId),
      });

      // 207 Multi-Status when mixed outcomes; 200 when all green. Never 403 here — the
      // per-release permission failure is surfaced in the `forbidden` array, not the status.
      const statusCode = forbidden.length > 0 || failed.length > 0 ? 207 : 200;
      res.status(statusCode).json({ successful, forbidden, failed });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
