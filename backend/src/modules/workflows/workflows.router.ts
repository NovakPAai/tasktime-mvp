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

// Helper: wrap response with _isDraft flag if Copy-on-Write created a draft
function maybeWithDraft<T extends object>(data: T, isDraft: boolean, draftId: string): T & { _isDraft?: boolean; _draftWorkflowId?: string } {
  if (!isDraft) return data;
  return { ...data, _isDraft: true, _draftWorkflowId: draftId };
}

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

router.get('/:id/validate', async (req, res, next) => {
  try {
    const report = await service.validateWorkflow(req.params.id as string);
    res.json(report);
  } catch (err) {
    next(err);
  }
});

// ─── Steps ───────────────────────────────────────────────────────────────────

router.post('/:id/steps', validate(createWorkflowStepDto), async (req: AuthRequest, res, next) => {
  try {
    const { id: workflowId, isDraft } = await service.ensureWorkflowEditable(req.params.id as string);
    if (isDraft) res.setHeader('X-Draft-Workflow-Id', workflowId);
    const step = await service.addStep(workflowId, req.body);
    await logAudit(req, 'workflow_step.created', 'workflow_step', step.id, { workflowId });
    res.status(201).json(maybeWithDraft(step, isDraft, workflowId));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/steps/:stepId', validate(updateWorkflowStepDto), async (req: AuthRequest, res, next) => {
  try {
    const { id: workflowId, isDraft } = await service.ensureWorkflowEditable(req.params.id as string);
    if (isDraft) res.setHeader('X-Draft-Workflow-Id', workflowId);
    const step = await service.updateStep(workflowId, req.params.stepId as string, req.body);
    await logAudit(req, 'workflow_step.updated', 'workflow_step', req.params.stepId as string, req.body);
    res.json(maybeWithDraft(step, isDraft, workflowId));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/steps/:stepId', async (req: AuthRequest, res, next) => {
  try {
    const { id: workflowId, isDraft } = await service.ensureWorkflowEditable(req.params.id as string);
    if (isDraft) res.setHeader('X-Draft-Workflow-Id', workflowId);
    await service.deleteStep(workflowId, req.params.stepId as string);
    await logAudit(req, 'workflow_step.deleted', 'workflow_step', req.params.stepId as string);
    res.json(maybeWithDraft({ ok: true }, isDraft, workflowId));
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
    const { id: workflowId, isDraft } = await service.ensureWorkflowEditable(req.params.id as string);
    if (isDraft) res.setHeader('X-Draft-Workflow-Id', workflowId);
    const t = await service.createTransition(workflowId, req.body);
    await logAudit(req, 'workflow_transition.created', 'workflow_transition', t.id, { workflowId });
    res.status(201).json(maybeWithDraft(t, isDraft, workflowId));
  } catch (err) {
    next(err);
  }
});

router.put('/:id/transitions/:tid', validate(updateWorkflowTransitionDto), async (req: AuthRequest, res, next) => {
  try {
    const { id: workflowId, isDraft } = await service.ensureWorkflowEditable(req.params.id as string);
    if (isDraft) res.setHeader('X-Draft-Workflow-Id', workflowId);
    const t = await service.updateTransition(workflowId, req.params.tid as string, req.body);
    await logAudit(req, 'workflow_transition.updated', 'workflow_transition', req.params.tid as string, req.body);
    res.json(maybeWithDraft(t, isDraft, workflowId));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/transitions/:tid', async (req: AuthRequest, res, next) => {
  try {
    const { id: workflowId, isDraft } = await service.ensureWorkflowEditable(req.params.id as string);
    if (isDraft) res.setHeader('X-Draft-Workflow-Id', workflowId);
    await service.deleteTransition(workflowId, req.params.tid as string);
    await logAudit(req, 'workflow_transition.deleted', 'workflow_transition', req.params.tid as string);
    res.json(maybeWithDraft({ ok: true }, isDraft, workflowId));
  } catch (err) {
    next(err);
  }
});

export default router;
