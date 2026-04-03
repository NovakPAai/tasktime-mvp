import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireRole } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import { createIssueTypeConfigDto, updateIssueTypeConfigDto } from './issue-type-configs.dto.js';
import * as service from './issue-type-configs.service.js';

const router = Router();
router.use(authenticate);

// GET /admin/issue-type-configs
router.get('/admin/issue-type-configs', requireRole('ADMIN', 'MANAGER', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const includeDisabled = req.query.includeDisabled === 'true';
    res.json(await service.listIssueTypeConfigs(includeDisabled));
  } catch (err) { next(err); }
});

// POST /admin/issue-type-configs
router.post('/admin/issue-type-configs', requireRole('ADMIN', 'SUPER_ADMIN'), validate(createIssueTypeConfigDto), async (req, res, next) => {
  try {
    res.status(201).json(await service.createIssueTypeConfig(req.body));
  } catch (err) { next(err); }
});

// PUT /admin/issue-type-configs/:id
router.put('/admin/issue-type-configs/:id', requireRole('ADMIN', 'SUPER_ADMIN'), validate(updateIssueTypeConfigDto), async (req, res, next) => {
  try {
    res.json(await service.updateIssueTypeConfig(req.params.id as string, req.body));
  } catch (err) { next(err); }
});

// PATCH /admin/issue-type-configs/:id/toggle
router.patch('/admin/issue-type-configs/:id/toggle', requireRole('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    res.json(await service.toggleIssueTypeConfig(req.params.id as string));
  } catch (err) { next(err); }
});

// DELETE /admin/issue-type-configs/:id
router.delete('/admin/issue-type-configs/:id', requireRole('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    await service.deleteIssueTypeConfig(req.params.id as string);
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
