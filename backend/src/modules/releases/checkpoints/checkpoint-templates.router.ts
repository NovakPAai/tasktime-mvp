// TTMP-160 PR-1: CheckpointTemplate CRUD + clone router — mounted at /api/admin/checkpoint-templates.
// SEC-1: management restricted to SUPER_ADMIN / ADMIN / RELEASE_MANAGER (FR-2).

import { Router } from 'express';
import { authenticate } from '../../../shared/middleware/auth.js';
import { requireRole } from '../../../shared/middleware/rbac.js';
import { validate } from '../../../shared/middleware/validate.js';
import { logAudit } from '../../../shared/middleware/audit.js';
import type { AuthRequest } from '../../../shared/types/index.js';
import {
  createCheckpointTemplateDto,
  updateCheckpointTemplateDto,
  cloneCheckpointTemplateDto,
} from './checkpoint.dto.js';
import * as service from './checkpoint-templates.service.js';

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

export default router;
