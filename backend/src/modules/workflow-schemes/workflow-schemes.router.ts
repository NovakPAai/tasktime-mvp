import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireRole } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import { logAudit } from '../../shared/middleware/audit.js';
import {
  createWorkflowSchemeDto,
  updateWorkflowSchemeDto,
  schemeItemsDto,
  attachProjectDto,
} from './workflow-schemes.dto.js';
import * as service from './workflow-schemes.service.js';
import { asyncHandler, authHandler } from '../../shared/utils/async-handler.js';

const router = Router();

router.use(authenticate);
router.use(requireRole('ADMIN'));

router.get('/', asyncHandler(async (_req, res) => {
  res.json(await service.listWorkflowSchemes());
}));

router.post('/', validate(createWorkflowSchemeDto), authHandler(async (req, res) => {
  const scheme = await service.createWorkflowScheme(req.body);
  await logAudit(req, 'workflow_scheme.created', 'workflow_scheme', scheme.id, req.body);
  res.status(201).json(scheme);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  res.json(await service.getWorkflowScheme(req.params.id as string));
}));

router.put('/:id', validate(updateWorkflowSchemeDto), authHandler(async (req, res) => {
  const scheme = await service.updateWorkflowScheme(req.params.id as string, req.body);
  await logAudit(req, 'workflow_scheme.updated', 'workflow_scheme', req.params.id as string, req.body);
  res.json(scheme);
}));

router.delete('/:id', authHandler(async (req, res) => {
  await service.deleteWorkflowScheme(req.params.id as string);
  await logAudit(req, 'workflow_scheme.deleted', 'workflow_scheme', req.params.id as string);
  res.json({ ok: true });
}));

router.put('/:id/items', validate(schemeItemsDto), authHandler(async (req, res) => {
  const scheme = await service.replaceItems(req.params.id as string, req.body);
  await logAudit(req, 'workflow_scheme.items_updated', 'workflow_scheme', req.params.id as string, req.body);
  res.json(scheme);
}));

router.post('/:id/projects', validate(attachProjectDto), authHandler(async (req, res) => {
  const binding = await service.attachProject(req.params.id as string, req.body.projectId);
  await logAudit(req, 'workflow_scheme.project_attached', 'workflow_scheme', req.params.id as string, req.body);
  res.status(201).json(binding);
}));

router.delete('/:id/projects/:projectId', authHandler(async (req, res) => {
  await service.detachProject(req.params.id as string, req.params.projectId as string);
  await logAudit(req, 'workflow_scheme.project_detached', 'workflow_scheme', req.params.id as string, { projectId: req.params.projectId });
  res.json({ ok: true });
}));

export default router;
