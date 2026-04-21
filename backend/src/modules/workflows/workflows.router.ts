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
import { asyncHandler, authHandler } from '../../shared/utils/async-handler.js';

// Helper: wrap response with _isDraft flag if Copy-on-Write created a draft
function maybeWithDraft<T extends object>(data: T, isDraft: boolean, draftId: string): T & { _isDraft?: boolean; _draftWorkflowId?: string } {
  if (!isDraft) return data;
  return { ...data, _isDraft: true, _draftWorkflowId: draftId };
}

const router = Router();

router.use(authenticate);
router.use(requireRole('ADMIN'));

// ─── Workflows CRUD ──────────────────────────────────────────────────────────

router.get('/', asyncHandler(async (_req, res) => {
  res.json(await service.listWorkflows());
}));

router.post('/', validate(createWorkflowDto), authHandler(async (req, res) => {
  const wf = await service.createWorkflow(req.body);
  await logAudit(req, 'workflow.created', 'workflow', wf.id, req.body);
  res.status(201).json(wf);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  res.json(await service.getWorkflow(req.params.id as string));
}));

router.put('/:id', validate(updateWorkflowDto), authHandler(async (req, res) => {
  const wf = await service.updateWorkflow(req.params.id as string, req.body);
  await logAudit(req, 'workflow.updated', 'workflow', req.params.id as string, req.body);
  res.json(wf);
}));

router.delete('/:id', authHandler(async (req, res) => {
  await service.deleteWorkflow(req.params.id as string);
  await logAudit(req, 'workflow.deleted', 'workflow', req.params.id as string);
  res.json({ ok: true });
}));

router.post('/:id/copy', authHandler(async (req, res) => {
  const wf = await service.copyWorkflow(req.params.id as string);
  await logAudit(req, 'workflow.copied', 'workflow', wf.id, { sourceId: req.params.id });
  res.status(201).json(wf);
}));

router.get('/:id/validate', asyncHandler(async (req, res) => {
  const report = await service.validateWorkflow(req.params.id as string);
  res.json(report);
}));

// ─── Steps ───────────────────────────────────────────────────────────────────

router.post('/:id/steps', validate(createWorkflowStepDto), authHandler(async (req, res) => {
  const { id: workflowId, isDraft } = await service.ensureWorkflowEditable(req.params.id as string);
  if (isDraft) res.setHeader('X-Draft-Workflow-Id', workflowId);
  const step = await service.addStep(workflowId, req.body);
  await logAudit(req, 'workflow_step.created', 'workflow_step', step.id, { workflowId });
  res.status(201).json(maybeWithDraft(step, isDraft, workflowId));
}));

router.patch('/:id/steps/:stepId', validate(updateWorkflowStepDto), authHandler(async (req, res) => {
  const { id: workflowId, isDraft } = await service.ensureWorkflowEditable(req.params.id as string);
  if (isDraft) res.setHeader('X-Draft-Workflow-Id', workflowId);
  const step = await service.updateStep(workflowId, req.params.stepId as string, req.body);
  await logAudit(req, 'workflow_step.updated', 'workflow_step', req.params.stepId as string, req.body);
  res.json(maybeWithDraft(step, isDraft, workflowId));
}));

router.delete('/:id/steps/:stepId', authHandler(async (req, res) => {
  const { id: workflowId, isDraft } = await service.ensureWorkflowEditable(req.params.id as string);
  if (isDraft) res.setHeader('X-Draft-Workflow-Id', workflowId);
  await service.deleteStep(workflowId, req.params.stepId as string);
  await logAudit(req, 'workflow_step.deleted', 'workflow_step', req.params.stepId as string);
  res.json(maybeWithDraft({ ok: true }, isDraft, workflowId));
}));

// ─── Transitions ─────────────────────────────────────────────────────────────

router.get('/:id/transitions', asyncHandler(async (req, res) => {
  res.json(await service.listTransitions(req.params.id as string));
}));

router.post('/:id/transitions', validate(createWorkflowTransitionDto), authHandler(async (req, res) => {
  const { id: workflowId, isDraft } = await service.ensureWorkflowEditable(req.params.id as string);
  if (isDraft) res.setHeader('X-Draft-Workflow-Id', workflowId);
  const t = await service.createTransition(workflowId, req.body);
  await logAudit(req, 'workflow_transition.created', 'workflow_transition', t.id, { workflowId });
  res.status(201).json(maybeWithDraft(t, isDraft, workflowId));
}));

router.put('/:id/transitions/:tid', validate(updateWorkflowTransitionDto), authHandler(async (req, res) => {
  const { id: workflowId, isDraft } = await service.ensureWorkflowEditable(req.params.id as string);
  if (isDraft) res.setHeader('X-Draft-Workflow-Id', workflowId);
  const t = await service.updateTransition(workflowId, req.params.tid as string, req.body);
  await logAudit(req, 'workflow_transition.updated', 'workflow_transition', req.params.tid as string, req.body);
  res.json(maybeWithDraft(t, isDraft, workflowId));
}));

router.delete('/:id/transitions/:tid', authHandler(async (req, res) => {
  const { id: workflowId, isDraft } = await service.ensureWorkflowEditable(req.params.id as string);
  if (isDraft) res.setHeader('X-Draft-Workflow-Id', workflowId);
  await service.deleteTransition(workflowId, req.params.tid as string);
  await logAudit(req, 'workflow_transition.deleted', 'workflow_transition', req.params.tid as string);
  res.json(maybeWithDraft({ ok: true }, isDraft, workflowId));
}));

export default router;
