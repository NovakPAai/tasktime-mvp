import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireProjectPermission, assertProjectPermission } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import { createSprintDto, updateSprintDto, moveIssuesToSprintDto } from './sprints.dto.js';
import * as sprintsService from './sprints.service.js';
import { logAudit } from '../../shared/middleware/audit.js';
import { parsePagination } from '../../shared/utils/params.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import { prisma } from '../../prisma/client.js';
import { asyncHandler, authHandler } from '../../shared/utils/async-handler.js';

const router = Router();
router.use(authenticate);

async function projectIdFromSprint(sprintId: string): Promise<string> {
  const sprint = await prisma.sprint.findUnique({ where: { id: sprintId }, select: { projectId: true } });
  if (!sprint) throw new AppError(404, 'Sprint not found');
  return sprint.projectId;
}

// Global list of sprints with optional filters
router.get('/sprints', asyncHandler(async (req, res) => {
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
}));

// List sprints
router.get('/projects/:projectId/sprints', asyncHandler(async (req, res) => {
  const { page, limit } = req.query as { page?: string; limit?: string };
  const sprints = await sprintsService.listSprints(
    req.params.projectId as string,
    parsePagination({ page, limit }),
  );
  res.json(sprints);
}));

router.get('/sprints/:id/issues', asyncHandler(async (req, res) => {
  const sprintDetails = await sprintsService.getSprintIssues(req.params.id as string);
  res.json(sprintDetails);
}));

// Backlog (issues without sprint)
router.get('/projects/:projectId/backlog', asyncHandler(async (req, res) => {
  const { page, limit } = req.query as { page?: string; limit?: string };
  const issues = await sprintsService.getBacklog(
    req.params.projectId as string,
    parsePagination({ page, limit }),
  );
  res.json(issues);
}));

// Create sprint — TTSEC-2: SPRINTS_CREATE
router.post(
  '/projects/:projectId/sprints',
  requireProjectPermission((req) => req.params.projectId as string, 'SPRINTS_CREATE'),
  validate(createSprintDto),
  authHandler(async (req, res) => {
    const sprint = await sprintsService.createSprint(req.params.projectId as string, req.body);
    await logAudit(req, 'sprint.created', 'sprint', sprint.id, { name: sprint.name });
    res.status(201).json(sprint);
  }),
);

// Update sprint — TTSEC-2: SPRINTS_EDIT (projectId looked up from sprint)
router.patch('/sprints/:id', validate(updateSprintDto), authHandler(async (req, res) => {
  const projectId = await projectIdFromSprint(req.params.id as string);
  await assertProjectPermission(req.user!, projectId, ['SPRINTS_EDIT']);
  const sprint = await sprintsService.updateSprint(req.params.id as string, req.body);
  await logAudit(req, 'sprint.updated', 'sprint', sprint.id, req.body);
  res.json(sprint);
}));

router.post('/sprints/:id/start', authHandler(async (req, res) => {
  const projectId = await projectIdFromSprint(req.params.id as string);
  await assertProjectPermission(req.user!, projectId, ['SPRINTS_EDIT']);
  const sprint = await sprintsService.startSprint(req.params.id as string);
  await logAudit(req, 'sprint.started', 'sprint', sprint.id);
  res.json(sprint);
}));

router.post('/sprints/:id/close', authHandler(async (req, res) => {
  const projectId = await projectIdFromSprint(req.params.id as string);
  await assertProjectPermission(req.user!, projectId, ['SPRINTS_EDIT']);
  const sprint = await sprintsService.closeSprint(req.params.id as string);
  await logAudit(req, 'sprint.closed', 'sprint', sprint.id);
  res.json(sprint);
}));

// Move issues to a sprint — edit-level change on the target sprint.
// Pass expectedProjectId = sprint.projectId so the service rejects foreign-project ids.
router.post('/sprints/:id/issues', validate(moveIssuesToSprintDto), authHandler(async (req, res) => {
  const projectId = await projectIdFromSprint(req.params.id as string);
  await assertProjectPermission(req.user!, projectId, ['SPRINTS_EDIT']);
  await sprintsService.moveIssuesToSprint(req.params.id as string, req.body.issueIds, projectId);
  await logAudit(req, 'sprint.issues_moved', 'sprint', req.params.id as string, { issueIds: req.body.issueIds });
  res.json({ ok: true });
}));

// Move issues to backlog — affects sprint membership in a project.
// Pass expectedProjectId = req.params.projectId so issueIds from other projects are rejected.
router.post(
  '/projects/:projectId/backlog/issues',
  requireProjectPermission((req) => req.params.projectId as string, 'SPRINTS_EDIT'),
  validate(moveIssuesToSprintDto),
  authHandler(async (req, res) => {
    const projectId = req.params.projectId as string;
    await sprintsService.moveIssuesToSprint(null, req.body.issueIds, projectId);
    await logAudit(req, 'sprint.issues_moved_to_backlog', 'project', projectId, { issueIds: req.body.issueIds });
    res.json({ ok: true });
  }),
);

router.post('/sprints/:id/ai/estimate-all', authHandler(async (req, res) => {
  const sprintId = req.params.id as string;
  const projectId = await projectIdFromSprint(sprintId);
  await assertProjectPermission(req.user!, projectId, ['SPRINTS_EDIT']);
  const result = await sprintsService.bulkEstimateIssues(sprintId);
  await logAudit(req, 'sprint.ai_estimate_all', 'sprint', sprintId, {
    total: result.total,
    estimated: result.estimated,
  });
  res.json(result);
}));

export default router;
