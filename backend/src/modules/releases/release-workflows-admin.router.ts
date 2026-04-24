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
import { asyncHandler, authHandler } from '../../shared/utils/async-handler.js';

const router = Router();

router.use(authenticate);
router.use(requireRole('ADMIN', 'SUPER_ADMIN'));

// ─── Workflows CRUD ───────────────────────────────────────────────────────────

// GET /api/admin/release-workflows
router.get('/', asyncHandler(async (_req, res) => {
  res.json(await service.listReleaseWorkflows());
}));

// POST /api/admin/release-workflows
router.post('/', validate(createReleaseWorkflowDto), authHandler(async (req, res) => {
  const wf = await service.createReleaseWorkflow(req.body);
  await logAudit(req, 'release_workflow.created', 'release_workflow', wf.id, req.body);
  res.status(201).json(wf);
}));

// GET /api/admin/release-workflows/:id
router.get('/:id', asyncHandler(async (req, res) => {
  res.json(await service.getReleaseWorkflow(req.params['id'] as string));
}));

// PATCH /api/admin/release-workflows/:id (PUT kept as alias for backwards compatibility)
const updateReleaseWorkflowHandler = [
  validate(updateReleaseWorkflowDto),
  authHandler(async (req: import('../../shared/types/index.js').AuthRequest, res: import('express').Response) => {
    const wf = await service.updateReleaseWorkflow(req.params['id'] as string, req.body);
    await logAudit(req, 'release_workflow.updated', 'release_workflow', req.params['id'] as string, req.body);
    res.json(wf);
  }),
];
router.patch('/:id', ...updateReleaseWorkflowHandler);
router.put('/:id', ...updateReleaseWorkflowHandler);

// DELETE /api/admin/release-workflows/:id
router.delete('/:id', authHandler(async (req, res) => {
  await service.deleteReleaseWorkflow(req.params['id'] as string);
  await logAudit(req, 'release_workflow.deleted', 'release_workflow', req.params['id'] as string);
  res.json({ ok: true });
}));

// ─── RM-04.3: Graph validation ────────────────────────────────────────────────

// GET /api/admin/release-workflows/:id/validate
router.get('/:id/validate', asyncHandler(async (req, res) => {
  const report = await service.validateReleaseWorkflow(req.params['id'] as string);
  res.json(report);
}));

// ─── Steps ────────────────────────────────────────────────────────────────────

// POST /api/admin/release-workflows/:id/steps
router.post('/:id/steps', validate(createReleaseWorkflowStepDto), authHandler(async (req, res) => {
  const step = await service.addReleaseWorkflowStep(req.params['id'] as string, req.body);
  await logAudit(req, 'release_workflow_step.created', 'release_workflow_step', step.id, { workflowId: req.params['id'] });
  res.status(201).json(step);
}));

// PATCH /api/admin/release-workflows/:id/steps/:stepId
router.patch('/:id/steps/:stepId', validate(updateReleaseWorkflowStepDto), authHandler(async (req, res) => {
  const step = await service.updateReleaseWorkflowStep(
    req.params['id'] as string,
    req.params['stepId'] as string,
    req.body,
  );
  // Position-only updates (drag-stop events from the workflow editor) are UI-only and
  // intentionally skipped by the audit log — they'd flood the table with noise and obscure
  // real changes (isInitial / orderIndex). The service also skips release-workflow-cache
  // invalidation for the same reason (position is not part of the workflow engine state).
  const isPositionOnly =
    (req.body.positionX !== undefined || req.body.positionY !== undefined) &&
    req.body.isInitial === undefined &&
    req.body.orderIndex === undefined;
  if (!isPositionOnly) {
    await logAudit(req, 'release_workflow_step.updated', 'release_workflow_step', req.params['stepId'] as string, req.body);
  }
  res.json(step);
}));

// DELETE /api/admin/release-workflows/:id/steps/:stepId
router.delete('/:id/steps/:stepId', authHandler(async (req, res) => {
  await service.deleteReleaseWorkflowStep(req.params['id'] as string, req.params['stepId'] as string);
  await logAudit(req, 'release_workflow_step.deleted', 'release_workflow_step', req.params['stepId'] as string);
  res.json({ ok: true });
}));

// ─── Transitions ──────────────────────────────────────────────────────────────

// POST /api/admin/release-workflows/:id/transitions
router.post('/:id/transitions', validate(createReleaseWorkflowTransitionDto), authHandler(async (req, res) => {
  const t = await service.createReleaseWorkflowTransition(req.params['id'] as string, req.body);
  await logAudit(req, 'release_workflow_transition.created', 'release_workflow_transition', t.id, { workflowId: req.params['id'] });
  res.status(201).json(t);
}));

// PATCH /api/admin/release-workflows/:id/transitions/:tid (PUT kept as alias)
const updateReleaseWorkflowTransitionHandler = [
  validate(updateReleaseWorkflowTransitionDto),
  authHandler(async (req: import('../../shared/types/index.js').AuthRequest, res: import('express').Response) => {
    const t = await service.updateReleaseWorkflowTransition(
      req.params['id'] as string,
      req.params['tid'] as string,
      req.body,
    );
    await logAudit(req, 'release_workflow_transition.updated', 'release_workflow_transition', req.params['tid'] as string, req.body);
    res.json(t);
  }),
];
router.patch('/:id/transitions/:tid', ...updateReleaseWorkflowTransitionHandler);
router.put('/:id/transitions/:tid', ...updateReleaseWorkflowTransitionHandler);

// DELETE /api/admin/release-workflows/:id/transitions/:tid
router.delete('/:id/transitions/:tid', authHandler(async (req, res) => {
  await service.deleteReleaseWorkflowTransition(req.params['id'] as string, req.params['tid'] as string);
  await logAudit(req, 'release_workflow_transition.deleted', 'release_workflow_transition', req.params['tid'] as string);
  res.json({ ok: true });
}));

export default router;
