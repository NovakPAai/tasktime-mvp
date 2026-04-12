import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireRole } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import { logAudit } from '../../shared/middleware/audit.js';
import {
  createReleaseWorkflowDto,
  updateReleaseWorkflowDto,
  createReleaseWorkflowStepDto,
  updateReleaseWorkflowStepDto,
  createReleaseWorkflowTransitionDto,
  updateReleaseWorkflowTransitionDto,
} from './release-workflows-admin.dto.js';
import * as service from './release-workflows-admin.service.js';
import type { AuthRequest } from '../../shared/types/index.js';

const router = Router();

router.use(authenticate);
router.use(requireRole('ADMIN', 'SUPER_ADMIN'));

// ─── Workflows CRUD ───────────────────────────────────────────────────────────

// GET /api/admin/release-workflows
router.get('/', async (_req, res, next) => {
  try {
    res.json(await service.listReleaseWorkflows());
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/release-workflows
router.post('/', validate(createReleaseWorkflowDto), async (req: AuthRequest, res, next) => {
  try {
    const wf = await service.createReleaseWorkflow(req.body);
    await logAudit(req, 'release_workflow.created', 'release_workflow', wf.id, req.body);
    res.status(201).json(wf);
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/release-workflows/:id
router.get('/:id', async (req, res, next) => {
  try {
    res.json(await service.getReleaseWorkflow(req.params['id'] as string));
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/release-workflows/:id
router.put('/:id', validate(updateReleaseWorkflowDto), async (req: AuthRequest, res, next) => {
  try {
    const wf = await service.updateReleaseWorkflow(req.params['id'] as string, req.body);
    await logAudit(req, 'release_workflow.updated', 'release_workflow', req.params['id'] as string, req.body);
    res.json(wf);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/release-workflows/:id
router.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    await service.deleteReleaseWorkflow(req.params['id'] as string);
    await logAudit(req, 'release_workflow.deleted', 'release_workflow', req.params['id'] as string);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── RM-04.3: Graph validation ────────────────────────────────────────────────

// GET /api/admin/release-workflows/:id/validate
router.get('/:id/validate', async (req, res, next) => {
  try {
    const report = await service.validateReleaseWorkflow(req.params['id'] as string);
    res.json(report);
  } catch (err) {
    next(err);
  }
});

// ─── Steps ────────────────────────────────────────────────────────────────────

// POST /api/admin/release-workflows/:id/steps
router.post('/:id/steps', validate(createReleaseWorkflowStepDto), async (req: AuthRequest, res, next) => {
  try {
    const step = await service.addReleaseWorkflowStep(req.params['id'] as string, req.body);
    await logAudit(req, 'release_workflow_step.created', 'release_workflow_step', step.id, { workflowId: req.params['id'] });
    res.status(201).json(step);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/release-workflows/:id/steps/:stepId
router.patch('/:id/steps/:stepId', validate(updateReleaseWorkflowStepDto), async (req: AuthRequest, res, next) => {
  try {
    const step = await service.updateReleaseWorkflowStep(
      req.params['id'] as string,
      req.params['stepId'] as string,
      req.body,
    );
    await logAudit(req, 'release_workflow_step.updated', 'release_workflow_step', req.params['stepId'] as string, req.body);
    res.json(step);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/release-workflows/:id/steps/:stepId
router.delete('/:id/steps/:stepId', async (req: AuthRequest, res, next) => {
  try {
    await service.deleteReleaseWorkflowStep(req.params['id'] as string, req.params['stepId'] as string);
    await logAudit(req, 'release_workflow_step.deleted', 'release_workflow_step', req.params['stepId'] as string);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── Transitions ──────────────────────────────────────────────────────────────

// POST /api/admin/release-workflows/:id/transitions
router.post('/:id/transitions', validate(createReleaseWorkflowTransitionDto), async (req: AuthRequest, res, next) => {
  try {
    const t = await service.createReleaseWorkflowTransition(req.params['id'] as string, req.body);
    await logAudit(req, 'release_workflow_transition.created', 'release_workflow_transition', t.id, { workflowId: req.params['id'] });
    res.status(201).json(t);
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/release-workflows/:id/transitions/:tid
router.put('/:id/transitions/:tid', validate(updateReleaseWorkflowTransitionDto), async (req: AuthRequest, res, next) => {
  try {
    const t = await service.updateReleaseWorkflowTransition(
      req.params['id'] as string,
      req.params['tid'] as string,
      req.body,
    );
    await logAudit(req, 'release_workflow_transition.updated', 'release_workflow_transition', req.params['tid'] as string, req.body);
    res.json(t);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/release-workflows/:id/transitions/:tid
router.delete('/:id/transitions/:tid', async (req: AuthRequest, res, next) => {
  try {
    await service.deleteReleaseWorkflowTransition(req.params['id'] as string, req.params['tid'] as string);
    await logAudit(req, 'release_workflow_transition.deleted', 'release_workflow_transition', req.params['tid'] as string);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
