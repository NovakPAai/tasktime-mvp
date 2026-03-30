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
import type { AuthRequest } from '../../shared/types/index.js';

const router = Router();

router.use(authenticate);
router.use(requireRole('ADMIN'));

router.get('/', async (_req, res, next) => {
  try {
    res.json(await service.listWorkflowSchemes());
  } catch (err) {
    next(err);
  }
});

router.post('/', validate(createWorkflowSchemeDto), async (req: AuthRequest, res, next) => {
  try {
    const scheme = await service.createWorkflowScheme(req.body);
    await logAudit(req, 'workflow_scheme.created', 'workflow_scheme', scheme.id, req.body);
    res.status(201).json(scheme);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    res.json(await service.getWorkflowScheme(req.params.id as string));
  } catch (err) {
    next(err);
  }
});

router.put('/:id', validate(updateWorkflowSchemeDto), async (req: AuthRequest, res, next) => {
  try {
    const scheme = await service.updateWorkflowScheme(req.params.id as string, req.body);
    await logAudit(req, 'workflow_scheme.updated', 'workflow_scheme', req.params.id as string, req.body);
    res.json(scheme);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    await service.deleteWorkflowScheme(req.params.id as string);
    await logAudit(req, 'workflow_scheme.deleted', 'workflow_scheme', req.params.id as string);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.put('/:id/items', validate(schemeItemsDto), async (req: AuthRequest, res, next) => {
  try {
    const scheme = await service.replaceItems(req.params.id as string, req.body);
    await logAudit(req, 'workflow_scheme.items_updated', 'workflow_scheme', req.params.id as string, req.body);
    res.json(scheme);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/projects', validate(attachProjectDto), async (req: AuthRequest, res, next) => {
  try {
    const binding = await service.attachProject(req.params.id as string, req.body.projectId);
    await logAudit(req, 'workflow_scheme.project_attached', 'workflow_scheme', req.params.id as string, req.body);
    res.status(201).json(binding);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/projects/:projectId', async (req: AuthRequest, res, next) => {
  try {
    await service.detachProject(req.params.id as string, req.params.projectId as string);
    await logAudit(req, 'workflow_scheme.project_detached', 'workflow_scheme', req.params.id as string, { projectId: req.params.projectId });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
