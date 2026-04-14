import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireRole } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import { createSprintDto, updateSprintDto, moveIssuesToSprintDto } from './sprints.dto.js';
import * as sprintsService from './sprints.service.js';
import { logAudit } from '../../shared/middleware/audit.js';
import type { AuthRequest } from '../../shared/types/index.js';
import { parsePagination } from '../../shared/utils/params.js';

const router = Router();
router.use(authenticate);

// Global list of sprints with optional filters
router.get('/sprints', async (req, res, next) => {
  try {
    const { state, projectId, teamId, page, limit } = req.query as {
      state?: string;
      projectId?: string;
      teamId?: string;
      page?: string;
      limit?: string;
    };

    const sprints = await sprintsService.listAllSprints(
      { state, projectId, teamId },
      parsePagination({ page, limit }),
    );
    res.json(sprints);
  } catch (err) {
    next(err);
  }
});

// List sprints
router.get('/projects/:projectId/sprints', async (req, res, next) => {
  try {
    const { page, limit } = req.query as { page?: string; limit?: string };
    const sprints = await sprintsService.listSprints(
      req.params.projectId as string,
      parsePagination({ page, limit }),
    );
    res.json(sprints);
  } catch (err) { next(err); }
});

router.get('/sprints/:id/issues', async (req, res, next) => {
  try {
    const sprintDetails = await sprintsService.getSprintIssues(req.params.id as string);
    res.json(sprintDetails);
  } catch (err) { next(err); }
});

// Backlog (issues without sprint)
router.get('/projects/:projectId/backlog', async (req, res, next) => {
  try {
    const { page, limit } = req.query as { page?: string; limit?: string };
    const issues = await sprintsService.getBacklog(
      req.params.projectId as string,
      parsePagination({ page, limit }),
    );
    res.json(issues);
  } catch (err) { next(err); }
});

// Create sprint
router.post('/projects/:projectId/sprints', requireRole('ADMIN'), validate(createSprintDto), async (req: AuthRequest, res, next) => {
  try {
    const sprint = await sprintsService.createSprint(req.params.projectId as string, req.body);
    await logAudit(req, 'sprint.created', 'sprint', sprint.id, { name: sprint.name });
    res.status(201).json(sprint);
  } catch (err) { next(err); }
});

// Update sprint
router.patch('/sprints/:id', requireRole('ADMIN'), validate(updateSprintDto), async (req: AuthRequest, res, next) => {
  try {
    const sprint = await sprintsService.updateSprint(req.params.id as string, req.body);
    await logAudit(req, 'sprint.updated', 'sprint', sprint.id, req.body);
    res.json(sprint);
  } catch (err) { next(err); }
});

// Start sprint
router.post('/sprints/:id/start', requireRole('ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    const sprint = await sprintsService.startSprint(req.params.id as string);
    await logAudit(req, 'sprint.started', 'sprint', sprint.id);
    res.json(sprint);
  } catch (err) { next(err); }
});

// Close sprint
router.post('/sprints/:id/close', requireRole('ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    const sprint = await sprintsService.closeSprint(req.params.id as string);
    await logAudit(req, 'sprint.closed', 'sprint', sprint.id);
    res.json(sprint);
  } catch (err) { next(err); }
});

// Move issues to sprint (or backlog if sprintId=null in body)
router.post('/sprints/:id/issues', requireRole('ADMIN'), validate(moveIssuesToSprintDto), async (req: AuthRequest, res, next) => {
  try {
    await sprintsService.moveIssuesToSprint(req.params.id as string, req.body.issueIds);
    await logAudit(req, 'sprint.issues_moved', 'sprint', req.params.id as string, { issueIds: req.body.issueIds });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Move issues to backlog
router.post('/projects/:projectId/backlog/issues', requireRole('ADMIN'), validate(moveIssuesToSprintDto), async (req: AuthRequest, res, next) => {
  try {
    await sprintsService.moveIssuesToSprint(null, req.body.issueIds);
    await logAudit(req, 'sprint.issues_moved_to_backlog', 'project', req.params.projectId as string, { issueIds: req.body.issueIds });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Bulk AI estimate all issues in a sprint
router.post('/sprints/:id/ai/estimate-all', requireRole('ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    const sprintId = req.params.id as string;
    const result = await sprintsService.bulkEstimateIssues(sprintId);
    await logAudit(req, 'sprint.ai_estimate_all', 'sprint', sprintId, {
      total: result.total,
      estimated: result.estimated,
    });
    res.json(result);
  } catch (err) { next(err); }
});

export default router;
