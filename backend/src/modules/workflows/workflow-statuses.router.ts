import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireRole } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import { logAudit } from '../../shared/middleware/audit.js';
import { createWorkflowStatusDto, updateWorkflowStatusDto } from './workflow-statuses.dto.js';
import * as service from './workflow-statuses.service.js';
import type { AuthRequest } from '../../shared/types/index.js';

const router = Router();

router.use(authenticate);
router.use(requireRole('ADMIN'));

router.get('/', async (_req, res, next) => {
  try {
    res.json(await service.listWorkflowStatuses());
  } catch (err) {
    next(err);
  }
});

router.post('/', validate(createWorkflowStatusDto), async (req: AuthRequest, res, next) => {
  try {
    const status = await service.createWorkflowStatus(req.body);
    await logAudit(req, 'workflow_status.created', 'workflow_status', status.id, req.body);
    res.status(201).json(status);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    res.json(await service.getWorkflowStatus(req.params.id as string));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', validate(updateWorkflowStatusDto), async (req: AuthRequest, res, next) => {
  try {
    const status = await service.updateWorkflowStatus(req.params.id as string, req.body);
    await logAudit(req, 'workflow_status.updated', 'workflow_status', req.params.id as string, req.body);
    res.json(status);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    await service.deleteWorkflowStatus(req.params.id as string);
    await logAudit(req, 'workflow_status.deleted', 'workflow_status', req.params.id as string);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
