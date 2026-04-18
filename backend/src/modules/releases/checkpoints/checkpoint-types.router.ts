// TTMP-160 PR-1: CheckpointType CRUD router — mounted at /api/admin/checkpoint-types.
// SEC-1: management restricted to SUPER_ADMIN / ADMIN / RELEASE_MANAGER (FR-1).

import { Router } from 'express';
import { authenticate } from '../../../shared/middleware/auth.js';
import { requireRole } from '../../../shared/middleware/rbac.js';
import { validate } from '../../../shared/middleware/validate.js';
import { logAudit } from '../../../shared/middleware/audit.js';
import type { AuthRequest } from '../../../shared/types/index.js';
import { createCheckpointTypeDto, updateCheckpointTypeDto } from './checkpoint.dto.js';
import * as service from './checkpoint-types.service.js';

const router = Router();

router.use(authenticate);
router.use(requireRole('SUPER_ADMIN', 'ADMIN', 'RELEASE_MANAGER'));

router.get('/', async (req, res, next) => {
  try {
    const isActive =
      req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined;
    res.json(await service.listCheckpointTypes({ isActive }));
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    res.json(await service.getCheckpointType(req.params['id'] as string));
  } catch (err) {
    next(err);
  }
});

router.post('/', validate(createCheckpointTypeDto), async (req: AuthRequest, res, next) => {
  try {
    const type = await service.createCheckpointType(req.body);
    await logAudit(req, 'checkpoint_type.created', 'checkpoint_type', type.id, {
      name: type.name,
      weight: type.weight,
      offsetDays: type.offsetDays,
      criteriaCount: Array.isArray(type.criteria) ? type.criteria.length : 0,
    });
    res.status(201).json(type);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', validate(updateCheckpointTypeDto), async (req: AuthRequest, res, next) => {
  try {
    const id = req.params['id'] as string;
    const type = await service.updateCheckpointType(id, req.body);
    await logAudit(req, 'checkpoint_type.updated', 'checkpoint_type', id, {
      fields: Object.keys(req.body),
    });
    res.json(type);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    const id = req.params['id'] as string;
    await service.deleteCheckpointType(id);
    await logAudit(req, 'checkpoint_type.deleted', 'checkpoint_type', id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
