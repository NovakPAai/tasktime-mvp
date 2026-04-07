import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireRole } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import { createSprintDto, updateSprintDto, moveIssuesToSprintDto } from './sprints.dto.js';
import * as sprintsService from './sprints.service.js';
import * as aiService from '../ai/ai.service.js';
import { logAudit } from '../../shared/middleware/audit.js';
import type { AuthRequest } from '../../shared/types/index.js';
import { parsePagination } from '../../shared/utils/params.js';
import { prisma } from '../../prisma/client.js';
import { delCachedJson, delCacheByPrefix, acquireLock, releaseLock } from '../../shared/redis.js';

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
router.post('/projects/:projectId/backlog/issues', requireRole('ADMIN', 'MANAGER'), validate(moveIssuesToSprintDto), async (req: AuthRequest, res, next) => {
  try {
    await sprintsService.moveIssuesToSprint(null, req.body.issueIds);
    await logAudit(req, 'sprint.issues_moved_to_backlog', 'project', req.params.projectId as string, { issueIds: req.body.issueIds });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Bulk AI estimate all issues in a sprint
router.post('/sprints/:id/ai/estimate-all', requireRole('ADMIN', 'MANAGER'), async (req: AuthRequest, res, next) => {
  try {
    const sprintId = req.params.id as string;

    const sprint = await prisma.sprint.findUnique({
      where: { id: sprintId },
      select: { id: true, projectId: true },
    });
    if (!sprint) { res.status(404).json({ error: 'Sprint not found' }); return; }

    // Per-sprint distributed lock with owner token to prevent concurrent bulk estimates
    const lockKey = `lock:estimate-all:${sprintId}`;
    const lockToken = await acquireLock(lockKey, 300);
    if (!lockToken) {
      res.status(409).json({ error: 'Estimation already in progress for this sprint' });
      return;
    }

    try {
      const issues = await prisma.issue.findMany({
        where: { sprintId },
        select: { id: true },
      });

      const results: Array<{ issueId: string; estimatedHours?: number; error?: string }> = [];

      for (const issue of issues) {
        try {
          const result = await aiService.estimateIssue({ issueId: issue.id });
          results.push({ issueId: issue.id, estimatedHours: result.estimatedHours });
        } catch (err) {
          console.error('estimate-all issue error:', { sprintId, issueId: issue.id, err });
          results.push({ issueId: issue.id, error: 'Failed to estimate issue' });
        }
      }

      // Best-effort: invalidate caches and audit — don't fail the response if Redis/DB is flaky
      try {
        await Promise.all([
          delCachedJson(`sprint:issues:${sprintId}`),
          delCacheByPrefix(`sprints:project:${sprint.projectId}:`),
          delCacheByPrefix('sprints:all:'),
          logAudit(req, 'sprint.ai_estimate_all', 'sprint', sprintId, {
            total: issues.length,
            estimated: results.filter(r => !r.error).length,
          }),
        ]);
      } catch (cleanupErr) {
        console.error('estimate-all post-cleanup error:', cleanupErr);
      }

      res.json({
        total: issues.length,
        estimated: results.filter(r => !r.error).length,
        failed: results.filter(r => !!r.error).length,
        results,
      });
    } finally {
      await releaseLock(lockKey, lockToken);
    }
  } catch (err) { next(err); }
});

export default router;
