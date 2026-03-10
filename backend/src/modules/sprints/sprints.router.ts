import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireRole } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import { createSprintDto, updateSprintDto, moveIssuesToSprintDto } from './sprints.dto.js';
import * as sprintsService from './sprints.service.js';
import { logAudit } from '../../shared/middleware/audit.js';
import type { AuthRequest } from '../../shared/types/index.js';

const router = Router();
router.use(authenticate);

// List sprints
router.get('/projects/:projectId/sprints', async (req, res, next) => {
  try {
    const sprints = await sprintsService.listSprints(req.params.projectId as string);
    res.json(sprints);
  } catch (err) { next(err); }
});

// Backlog (issues without sprint)
router.get('/projects/:projectId/backlog', async (req, res, next) => {
  try {
    const issues = await sprintsService.getBacklog(req.params.projectId as string);
    res.json(issues);
  } catch (err) { next(err); }
});

// Create sprint
router.post('/projects/:projectId/sprints', requireRole('ADMIN', 'MANAGER'), validate(createSprintDto), async (req: AuthRequest, res, next) => {
  try {
    const sprint = await sprintsService.createSprint(req.params.projectId as string, req.body);
    await logAudit(req, 'sprint.created', 'sprint', sprint.id, { name: sprint.name });
    res.status(201).json(sprint);
  } catch (err) { next(err); }
});

// Update sprint
router.patch('/sprints/:id', requireRole('ADMIN', 'MANAGER'), validate(updateSprintDto), async (req: AuthRequest, res, next) => {
  try {
    const sprint = await sprintsService.updateSprint(req.params.id as string, req.body);
    await logAudit(req, 'sprint.updated', 'sprint', sprint.id, req.body);
    res.json(sprint);
  } catch (err) { next(err); }
});

// Start sprint
router.post('/sprints/:id/start', requireRole('ADMIN', 'MANAGER'), async (req: AuthRequest, res, next) => {
  try {
    const sprint = await sprintsService.startSprint(req.params.id as string);
    await logAudit(req, 'sprint.started', 'sprint', sprint.id);
    res.json(sprint);
  } catch (err) { next(err); }
});

// Close sprint
router.post('/sprints/:id/close', requireRole('ADMIN', 'MANAGER'), async (req: AuthRequest, res, next) => {
  try {
    const sprint = await sprintsService.closeSprint(req.params.id as string);
    await logAudit(req, 'sprint.closed', 'sprint', sprint.id);
    res.json(sprint);
  } catch (err) { next(err); }
});

// Move issues to sprint (or backlog if sprintId=null in body)
router.post('/sprints/:id/issues', requireRole('ADMIN', 'MANAGER'), validate(moveIssuesToSprintDto), async (req: AuthRequest, res, next) => {
  try {
    await sprintsService.moveIssuesToSprint(req.params.id as string, req.body.issueIds);
    await logAudit(req, 'sprint.issues_moved', 'sprint', req.params.id as string, { issueIds: req.body.issueIds });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Move issues to backlog
router.post('/projects/:projectId/backlog/issues', validate(moveIssuesToSprintDto), async (req: AuthRequest, res, next) => {
  try {
    await sprintsService.moveIssuesToSprint(null, req.body.issueIds);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
