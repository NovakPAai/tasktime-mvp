// TTMP-160 PR-1: CheckpointType CRUD router — mounted at /api/admin/checkpoint-types.
// SEC-1: management restricted to SUPER_ADMIN / ADMIN / RELEASE_MANAGER (FR-1).

import { Router } from 'express';
import { authenticate } from '../../../shared/middleware/auth.js';
import { requireRole } from '../../../shared/middleware/rbac.js';
import { validate } from '../../../shared/middleware/validate.js';
import { logAudit } from '../../../shared/middleware/audit.js';
import {
  createCheckpointTypeDto,
  previewCheckpointConditionDto,
  updateCheckpointTypeDto,
} from './checkpoint.dto.js';
import * as service from './checkpoint-types.service.js';
import { previewCheckpointCondition } from './checkpoint-preview.service.js';
import { asyncHandler, authHandler } from '../../../shared/utils/async-handler.js';

const router = Router();

router.use(authenticate);
router.use(requireRole('SUPER_ADMIN', 'ADMIN', 'RELEASE_MANAGER'));

router.get('/', asyncHandler(async (req, res) => {
  const isActive =
    req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined;
  res.json(await service.listCheckpointTypes({ isActive }));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  res.json(await service.getCheckpointType(req.params['id'] as string));
}));

// PR-5 FR-15: list release instances that currently use this type (for sync-instances modal).
router.get('/:id/instances', asyncHandler(async (req, res) => {
  res.json(await service.listActiveInstances(req.params['id'] as string));
}));

router.post('/', validate(createCheckpointTypeDto), authHandler(async (req, res) => {
  const type = await service.createCheckpointType(req.body);
  await logAudit(req, 'checkpoint_type.created', 'checkpoint_type', type.id, {
    name: type.name,
    weight: type.weight,
    offsetDays: type.offsetDays,
    criteriaCount: Array.isArray(type.criteria) ? type.criteria.length : 0,
  });
  res.status(201).json(type);
}));

router.patch('/:id', validate(updateCheckpointTypeDto), authHandler(async (req, res) => {
  const id = req.params['id'] as string;
  const type = await service.updateCheckpointType(id, req.body);
  await logAudit(req, 'checkpoint_type.updated', 'checkpoint_type', id, {
    fields: Object.keys(req.body),
  });
  res.json(type);
}));

router.delete('/:id', authHandler(async (req, res) => {
  const id = req.params['id'] as string;
  await service.deleteCheckpointType(id);
  await logAudit(req, 'checkpoint_type.deleted', 'checkpoint_type', id);
  res.json({ ok: true });
}));

// TTSRH-1 PR-17: dry-run preview для проверки TTQL-condition на реальных
// данных релиза перед сохранением. Не пишет в БД, не триггерит webhooks.
router.post(
  '/preview',
  validate(previewCheckpointConditionDto),
  asyncHandler(async (req, res) => {
    const result = await previewCheckpointCondition(req.body);
    res.json(result);
  }),
);

export default router;
