import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireRole } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import { logAudit } from '../../shared/middleware/audit.js';
import { createWorkflowStatusDto, updateWorkflowStatusDto } from './workflow-statuses.dto.js';
import * as service from './workflow-statuses.service.js';
import { asyncHandler, authHandler } from '../../shared/utils/async-handler.js';

const router = Router();

router.use(authenticate);
router.use(requireRole('ADMIN'));

router.get('/', asyncHandler(async (_req, res) => {
  res.json(await service.listWorkflowStatuses());
}));

router.post('/', validate(createWorkflowStatusDto), authHandler(async (req, res) => {
  const status = await service.createWorkflowStatus(req.body);
  await logAudit(req, 'workflow_status.created', 'workflow_status', status.id, req.body);
  res.status(201).json(status);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  res.json(await service.getWorkflowStatus(req.params.id as string));
}));

router.patch('/:id', validate(updateWorkflowStatusDto), authHandler(async (req, res) => {
  const status = await service.updateWorkflowStatus(req.params.id as string, req.body);
  await logAudit(req, 'workflow_status.updated', 'workflow_status', req.params.id as string, req.body);
  res.json(status);
}));

router.delete('/:id', authHandler(async (req, res) => {
  await service.deleteWorkflowStatus(req.params.id as string);
  await logAudit(req, 'workflow_status.deleted', 'workflow_status', req.params.id as string);
  res.json({ ok: true });
}));

export default router;
