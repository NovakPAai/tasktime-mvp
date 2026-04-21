import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireRole } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import { logAudit } from '../../shared/middleware/audit.js';
import { createReleaseStatusDto, updateReleaseStatusDto } from './release-statuses.dto.js';
import * as service from './release-statuses.service.js';
import { asyncHandler, authHandler } from '../../shared/utils/async-handler.js';

const router = Router();

router.use(authenticate);
router.use(requireRole('ADMIN', 'SUPER_ADMIN'));

// GET /api/admin/release-statuses
router.get('/', asyncHandler(async (_req, res) => {
  res.json(await service.listReleaseStatuses());
}));

// POST /api/admin/release-statuses
router.post('/', validate(createReleaseStatusDto), authHandler(async (req, res) => {
  const status = await service.createReleaseStatus(req.body);
  await logAudit(req, 'release_status.created', 'release_status', status.id, req.body);
  res.status(201).json(status);
}));

// GET /api/admin/release-statuses/:id
router.get('/:id', asyncHandler(async (req, res) => {
  res.json(await service.getReleaseStatus(req.params['id'] as string));
}));

// PATCH /api/admin/release-statuses/:id
router.patch('/:id', validate(updateReleaseStatusDto), authHandler(async (req, res) => {
  const status = await service.updateReleaseStatus(req.params['id'] as string, req.body);
  await logAudit(req, 'release_status.updated', 'release_status', req.params['id'] as string, req.body);
  res.json(status);
}));

// DELETE /api/admin/release-statuses/:id
router.delete('/:id', authHandler(async (req, res) => {
  await service.deleteReleaseStatus(req.params['id'] as string);
  await logAudit(req, 'release_status.deleted', 'release_status', req.params['id'] as string);
  res.json({ ok: true });
}));

export default router;
