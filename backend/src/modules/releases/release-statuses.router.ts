import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireRole } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import { logAudit } from '../../shared/middleware/audit.js';
import { createReleaseStatusDto, updateReleaseStatusDto } from './release-statuses.dto.js';
import * as service from './release-statuses.service.js';
import type { AuthRequest } from '../../shared/types/index.js';

const router = Router();

router.use(authenticate);
router.use(requireRole('ADMIN', 'SUPER_ADMIN'));

// GET /api/admin/release-statuses
router.get('/', async (_req, res, next) => {
  try {
    res.json(await service.listReleaseStatuses());
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/release-statuses
router.post('/', validate(createReleaseStatusDto), async (req: AuthRequest, res, next) => {
  try {
    const status = await service.createReleaseStatus(req.body);
    await logAudit(req, 'release_status.created', 'release_status', status.id, req.body);
    res.status(201).json(status);
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/release-statuses/:id
router.get('/:id', async (req, res, next) => {
  try {
    res.json(await service.getReleaseStatus(req.params['id'] as string));
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/release-statuses/:id
router.patch('/:id', validate(updateReleaseStatusDto), async (req: AuthRequest, res, next) => {
  try {
    const status = await service.updateReleaseStatus(req.params['id'] as string, req.body);
    await logAudit(req, 'release_status.updated', 'release_status', req.params['id'] as string, req.body);
    res.json(status);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/release-statuses/:id
router.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    await service.deleteReleaseStatus(req.params['id'] as string);
    await logAudit(req, 'release_status.deleted', 'release_status', req.params['id'] as string);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
