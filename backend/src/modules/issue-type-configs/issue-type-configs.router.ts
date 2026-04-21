import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireRole } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import { createIssueTypeConfigDto, updateIssueTypeConfigDto } from './issue-type-configs.dto.js';
import * as service from './issue-type-configs.service.js';
import { asyncHandler } from '../../shared/utils/async-handler.js';

const router = Router();
router.use(authenticate);

// GET /admin/issue-type-configs
router.get('/admin/issue-type-configs', requireRole('ADMIN', 'SUPER_ADMIN'), asyncHandler(async (req, res) => {
  const includeDisabled = req.query.includeDisabled === 'true';
  res.json(await service.listIssueTypeConfigs(includeDisabled));
}));

// POST /admin/issue-type-configs
router.post('/admin/issue-type-configs', requireRole('ADMIN', 'SUPER_ADMIN'), validate(createIssueTypeConfigDto), asyncHandler(async (req, res) => {
  res.status(201).json(await service.createIssueTypeConfig(req.body));
}));

// PUT /admin/issue-type-configs/:id
router.put('/admin/issue-type-configs/:id', requireRole('ADMIN', 'SUPER_ADMIN'), validate(updateIssueTypeConfigDto), asyncHandler(async (req, res) => {
  res.json(await service.updateIssueTypeConfig(req.params.id as string, req.body));
}));

// PATCH /admin/issue-type-configs/:id/toggle
router.patch('/admin/issue-type-configs/:id/toggle', requireRole('ADMIN', 'SUPER_ADMIN'), asyncHandler(async (req, res) => {
  res.json(await service.toggleIssueTypeConfig(req.params.id as string));
}));

// DELETE /admin/issue-type-configs/:id
router.delete('/admin/issue-type-configs/:id', requireRole('ADMIN', 'SUPER_ADMIN'), asyncHandler(async (req, res) => {
  await service.deleteIssueTypeConfig(req.params.id as string);
  res.status(204).send();
}));

export default router;
