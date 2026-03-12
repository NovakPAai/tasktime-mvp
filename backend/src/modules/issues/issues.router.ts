import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireRole } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import { createIssueDto, updateIssueDto, updateStatusDto, assignDto } from './issues.dto.js';
import * as issuesService from './issues.service.js';
import { logAudit } from '../../shared/middleware/audit.js';
import type { AuthRequest } from '../../shared/types/index.js';

const router = Router();

router.use(authenticate);

// List issues for a project with filters
router.get('/projects/:projectId/issues', async (req, res, next) => {
  try {
    const { status, type, priority, assigneeId, sprintId, from, to, search } = req.query as {
      status?: string | string[];
      type?: string | string[];
      priority?: string | string[];
      assigneeId?: string;
      sprintId?: string;
      from?: string;
      to?: string;
      search?: string;
    };

    const toArray = (value?: string | string[]) =>
      typeof value === 'string' ? value.split(',').filter(Boolean) : value;

    const issues = await issuesService.listIssues(req.params.projectId as string, {
      status: toArray(status),
      type: toArray(type),
      priority: toArray(priority),
      assigneeId,
      sprintId,
      from,
      to,
      search,
    });
    res.json(issues);
  } catch (err) {
    next(err);
  }
});

// Create issue in a project
router.post('/projects/:projectId/issues', validate(createIssueDto), async (req: AuthRequest, res, next) => {
  try {
    const issue = await issuesService.createIssue(req.params.projectId as string, req.user!.userId, req.body);
    await logAudit(req, 'issue.created', 'issue', issue.id, {
      type: req.body.type,
      title: req.body.title,
    });
    res.status(201).json(issue);
  } catch (err) {
    next(err);
  }
});

// Get issue detail
router.get('/issues/:id', async (req, res, next) => {
  try {
    const issue = await issuesService.getIssue(req.params.id as string);
    res.json(issue);
  } catch (err) {
    next(err);
  }
});

// Update issue
router.patch('/issues/:id', validate(updateIssueDto), async (req: AuthRequest, res, next) => {
  try {
    const issue = await issuesService.updateIssue(req.params.id as string, req.body);
    await logAudit(req, 'issue.updated', 'issue', req.params.id as string, req.body);
    res.json(issue);
  } catch (err) {
    next(err);
  }
});

// Change status
router.patch('/issues/:id/status', validate(updateStatusDto), async (req: AuthRequest, res, next) => {
  try {
    const issue = await issuesService.updateStatus(req.params.id as string, req.body);
    await logAudit(req, 'issue.status_changed', 'issue', req.params.id as string, req.body);
    res.json(issue);
  } catch (err) {
    next(err);
  }
});

// Assign issue
router.patch(
  '/issues/:id/assign',
  requireRole('ADMIN', 'MANAGER'),
  validate(assignDto),
  async (req: AuthRequest, res, next) => {
    try {
      const issue = await issuesService.assignIssue(req.params.id as string, req.body);
      await logAudit(req, 'issue.assigned', 'issue', req.params.id as string, req.body);
      res.json(issue);
    } catch (err) {
      next(err);
    }
  }
);

// Bulk operations on issues (status / assignee)
router.post(
  '/projects/:projectId/issues/bulk',
  requireRole('ADMIN', 'MANAGER'),
  async (req: AuthRequest, res, next) => {
    try {
      const { issueIds, status, assigneeId } = req.body as {
        issueIds?: string[];
        status?: string;
        assigneeId?: string | null;
      };

      if (!issueIds || !Array.isArray(issueIds) || issueIds.length === 0) {
        res.status(400).json({ error: 'issueIds is required' });
        return;
      }

      const result = await issuesService.bulkUpdateIssues(req.params.projectId as string, {
        issueIds,
        status,
        assigneeId,
      });

      await logAudit(req, 'issues.bulk_updated', 'project', req.params.projectId as string, {
        issueIds,
        status,
        assigneeId,
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// Delete issue
router.delete('/issues/:id', requireRole('ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    await issuesService.deleteIssue(req.params.id as string);
    await logAudit(req, 'issue.deleted', 'issue', req.params.id as string);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// Get children
router.get('/issues/:id/children', async (req, res, next) => {
  try {
    const children = await issuesService.getChildren(req.params.id as string);
    res.json(children);
  } catch (err) {
    next(err);
  }
});

// Issue history from audit_log (2.10)
router.get('/issues/:id/history', async (req, res, next) => {
  try {
    const history = await issuesService.getHistory(req.params.id as string);
    res.json(history);
  } catch (err) {
    next(err);
  }
});

export default router;
