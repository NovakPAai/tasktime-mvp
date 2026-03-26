import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireRole } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import { logAudit } from '../../shared/middleware/audit.js';
import {
  createWorkflowDto,
  updateWorkflowDto,
  createWorkflowStepDto,
  updateWorkflowStepDto,
  createWorkflowTransitionDto,
  updateWorkflowTransitionDto,
} from './workflows.dto.js';
import * as service from './workflows.service.js';
import type { AuthRequest } from '../../shared/types/index.js';

const router = Router();

router.use(authenticate);
router.use(requireRole('ADMIN'));

// ─── Workflows CRUD ──────────────────────────────────────────────────────────

router.get('/', async (_req, res, next) => {
  try {
    res.json(await service.listWorkflows());
  } catch (err) {
    next(err);
  }
});

router.post('/', validate(createWorkflowDto), async (req: AuthRequest, res, next) => {
  try {
    const wf = await service.createWorkflow(req.body);
    await logAudit(req, 'workflow.created', 'workflow', wf.id, req.body);
    res.status(201).json(wf);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    res.json(await service.getWorkflow(req.params.id as string));
  } catch (err) {
    next(err);
  }
});

router.put('/:id', validate(updateWorkflowDto), async (req: AuthRequest, res, next) => {
  try {
    const wf = await service.updateWorkflow(req.params.id as string, req.body);
    await logAudit(req, 'workflow.updated', 'workflow', req.params.id as string, req.body);
    res.json(wf);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    await service.deleteWorkflow(req.params.id as string);
    await logAudit(req, 'workflow.deleted', 'workflow', req.params.id as string);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/copy', async (req: AuthRequest, res, next) => {
  try {
    const wf = await service.copyWorkflow(req.params.id as string);
    await logAudit(req, 'workflow.copied', 'workflow', wf.id, { sourceId: req.params.id });
    res.status(201).json(wf);
  } catch (err) {
    next(err);
  }
});

// ─── Steps ───────────────────────────────────────────────────────────────────

router.post('/:id/steps', validate(createWorkflowStepDto), async (req: AuthRequest, res, next) => {
  try {
    const step = await service.addStep(req.params.id as string, req.body);
    await logAudit(req, 'workflow_step.created', 'workflow_step', step.id, { workflowId: req.params.id });
    res.status(201).json(step);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/steps/:stepId', validate(updateWorkflowStepDto), async (req: AuthRequest, res, next) => {
  try {
    const step = await service.updateStep(req.params.id as string, req.params.stepId as string, req.body);
    await logAudit(req, 'workflow_step.updated', 'workflow_step', req.params.stepId as string, req.body);
    res.json(step);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/steps/:stepId', async (req: AuthRequest, res, next) => {
  try {
    await service.deleteStep(req.params.id as string, req.params.stepId as string);
    await logAudit(req, 'workflow_step.deleted', 'workflow_step', req.params.stepId as string);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── Transitions ─────────────────────────────────────────────────────────────

router.get('/:id/transitions', async (req, res, next) => {
  try {
    res.json(await service.listTransitions(req.params.id as string));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/transitions', validate(createWorkflowTransitionDto), async (req: AuthRequest, res, next) => {
  try {
    const t = await service.createTransition(req.params.id as string, req.body);
    await logAudit(req, 'workflow_transition.created', 'workflow_transition', t.id, { workflowId: req.params.id });
    res.status(201).json(t);
  } catch (err) {
    next(err);
  }
});

router.put('/:id/transitions/:tid', validate(updateWorkflowTransitionDto), async (req: AuthRequest, res, next) => {
  try {
    const t = await service.updateTransition(req.params.id as string, req.params.tid as string, req.body);
    await logAudit(req, 'workflow_transition.updated', 'workflow_transition', req.params.tid as string, req.body);
    res.json(t);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/transitions/:tid', async (req: AuthRequest, res, next) => {
  try {
    await service.deleteTransition(req.params.id as string, req.params.tid as string);
    await logAudit(req, 'workflow_transition.deleted', 'workflow_transition', req.params.tid as string);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
