import { Router } from 'express';
import type { IssuePriority, IssueStatus } from '@prisma/client';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireRole } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import {
  createIssueDto,
  updateIssueDto,
  updateStatusDto,
  assignDto,
  updateAiFlagsDto,
  updateAiStatusDto,
  bulkTransitionDto,
} from './issues.dto.js';
import * as issuesService from './issues.service.js';
import { getKanbanFieldsForIssues } from '../issue-custom-fields/issue-custom-fields.service.js';
import { logAudit } from '../../shared/middleware/audit.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import type { AuthRequest } from '../../shared/types/index.js';
import { isSuperAdmin } from '../../shared/auth/roles.js';
import { prisma } from '../../prisma/client.js';

const router = Router();

router.use(authenticate);

/**
 * Check that the current user has access to the project that owns an issue.
 * ADMIN / SUPER_ADMIN / MANAGER (global) bypass this check.
 * Regular USER/VIEWER must have a project-level role.
 */
async function requireIssueAccess(req: AuthRequest, issueProjectId: string): Promise<void> {
  if (!req.user) return; // authenticate middleware already handles this
  if (isSuperAdmin(req.user.role) || req.user.role === 'ADMIN' || req.user.role === 'MANAGER') return;

  const membership = await prisma.userProjectRole.findFirst({
    where: { userId: req.user.userId, projectId: issueProjectId },
  });
  if (!membership) {
    throw new AppError(403, 'You do not have access to this project');
  }
}

// Global issue search across all projects (for linking)
router.get('/issues/search', async (req: AuthRequest, res, next) => {
  try {
    const { q, excludeId } = req.query as { q?: string; excludeId?: string };
    if (!q || !q.trim()) {
      res.json([]);
      return;
    }
    // Filter by accessible projects unless ADMIN/SUPER_ADMIN
    let projectIds: string[] | undefined;
    if (req.user && !isSuperAdmin(req.user.role) && req.user.role !== 'ADMIN') {
      const memberships = await prisma.userProjectRole.findMany({
        where: { userId: req.user.userId },
        select: { projectId: true },
      });
      projectIds = memberships.map((m) => m.projectId);
    }
    const issues = await issuesService.searchIssuesGlobal(q.trim(), excludeId, projectIds);
    res.json(issues);
  } catch (err) {
    next(err);
  }
});

// List issues for a project with filters
router.get('/projects/:projectId/issues', async (req, res, next) => {
  try {
    const { status, issueTypeConfigId, priority, assigneeId, sprintId, from, to, search, includeKanbanFields } = req.query as {
      status?: string | string[];
      issueTypeConfigId?: string | string[];
      priority?: string | string[];
      assigneeId?: string;
      sprintId?: string;
      from?: string;
      to?: string;
      search?: string;
      includeKanbanFields?: string;
    };

    const toArray = (value?: string | string[]) =>
      typeof value === 'string' ? value.split(',').filter(Boolean) : value;

    const issues = await issuesService.listIssues(req.params.projectId as string, {
      status: toArray(status) as IssueStatus[] | undefined,
      issueTypeConfigId: toArray(issueTypeConfigId),
      priority: toArray(priority) as IssuePriority[] | undefined,
      assigneeId,
      sprintId,
      from,
      to,
      search,
    });

    if (includeKanbanFields === 'true') {
      const kanbanMap = await getKanbanFieldsForIssues(
        issues.map((i) => ({ id: i.id, projectId: i.projectId, issueTypeConfigId: i.issueTypeConfigId ?? null })),
      );
      const issuesWithFields = issues.map((i) => ({
        ...i,
        kanbanFields: kanbanMap.get(i.id) ?? [],
      }));
      res.json(issuesWithFields);
      return;
    }

    res.json(issues);
  } catch (err) {
    next(err);
  }
});

// Active MVP LiveCode issues (meta-project LIVE)
router.get('/mvp-livecode/issues/active', async (req, res, next) => {
  try {
    const { onlyAiEligible, assigneeType } = req.query as {
      onlyAiEligible?: string;
      assigneeType?: string;
    };

    const onlyAi = onlyAiEligible === 'true';
    const assignee =
      assigneeType === 'HUMAN' || assigneeType === 'AGENT' || assigneeType === 'MIXED'
        ? assigneeType
        : 'ALL';

    const issues = await issuesService.listActiveIssuesForMvpLivecode({
      onlyAiEligible: onlyAi,
      assigneeType: assignee,
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

// Get issue by key (e.g. TTMP-83) — for agents and automation
router.get('/issues/key/:key', async (req: AuthRequest, res, next) => {
  try {
    const issue = await issuesService.getIssueByKey(req.params.key as string);
    await requireIssueAccess(req, issue.projectId);
    res.json(issue);
  } catch (err) {
    next(err);
  }
});

// Get issue detail
router.get('/issues/:id', async (req: AuthRequest, res, next) => {
  try {
    const issue = await issuesService.getIssue(req.params.id as string);
    await requireIssueAccess(req, issue.projectId);
    res.json(issue);
  } catch (err) {
    next(err);
  }
});

// Update issue
router.patch('/issues/:id', validate(updateIssueDto), async (req: AuthRequest, res, next) => {
  try {
    // Pre-check access before mutation
    const existing = await issuesService.getIssue(req.params.id as string);
    await requireIssueAccess(req, existing.projectId);
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
    const existing = await issuesService.getIssue(req.params.id as string);
    await requireIssueAccess(req, existing.projectId);
    const issue = await issuesService.updateStatus(req.params.id as string, req.body, req.user?.userId, req.user?.role);
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

// Update AI flags (eligibility and assignee type)
router.patch(
  '/issues/:id/ai-flags',
  requireRole('ADMIN', 'MANAGER'),
  validate(updateAiFlagsDto),
  async (req: AuthRequest, res, next) => {
    try {
      const issue = await issuesService.updateAiFlags(req.params.id as string, req.body);
      await logAudit(req, 'issue.ai_flags_updated', 'issue', req.params.id as string, req.body);
      res.json(issue);
    } catch (err) {
      next(err);
    }
  },
);

// Update AI execution status
router.patch(
  '/issues/:id/ai-status',
  requireRole('ADMIN', 'MANAGER'),
  validate(updateAiStatusDto),
  async (req: AuthRequest, res, next) => {
    try {
      const issue = await issuesService.updateAiStatus(req.params.id as string, req.body);
      await logAudit(req, 'issue.ai_status_updated', 'issue', req.params.id as string, req.body);
      res.json(issue);
    } catch (err) {
      next(err);
    }
  },
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

      // CVE-08: cap bulk operations at 100 items
      if (issueIds.length > 100) {
        res.status(400).json({ error: 'Maximum 100 issues per bulk operation' });
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

// Bulk transition issues via workflow engine
router.post(
  '/projects/:projectId/issues/bulk-transition',
  validate(bulkTransitionDto),
  async (req: AuthRequest, res, next) => {
    try {
      const { issueIds, transitionId } = req.body as { issueIds: string[]; transitionId: string };
      const result = await issuesService.bulkTransitionIssues(
        req.params.projectId as string,
        issueIds,
        transitionId,
        req.user!.userId,
        req.user!.role,
      );
      const status = result.failed.length > 0 && result.succeeded.length > 0 ? 207 : 200;
      await logAudit(req, 'issues.bulk_transitioned', 'project', req.params.projectId as string, {
        issueIds,
        transitionId,
        succeeded: result.succeeded.length,
        failed: result.failed.length,
      });
      res.status(status).json(result);
    } catch (err) {
      next(err);
    }
  },
);

// Bulk delete issues (ADMIN / SUPER_ADMIN only)
router.delete(
  '/projects/:projectId/issues/bulk',
  requireRole('ADMIN', 'SUPER_ADMIN'),
  async (req: AuthRequest, res, next) => {
    try {
      const { issueIds } = req.body as { issueIds?: string[] };

      if (!issueIds || !Array.isArray(issueIds) || issueIds.length === 0) {
        res.status(400).json({ error: 'issueIds is required' });
        return;
      }

      // CVE-08: cap bulk operations at 100 items
      if (issueIds.length > 100) {
        res.status(400).json({ error: 'Maximum 100 issues per bulk operation' });
        return;
      }

      const result = await issuesService.bulkDeleteIssues(req.params.projectId as string, issueIds);

      await logAudit(req, 'issues.bulk_deleted', 'project', req.params.projectId as string, {
        issueIds,
        deletedCount: result.deletedCount,
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// Delete issue
router.delete('/issues/:id', requireRole('ADMIN', 'SUPER_ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    await issuesService.deleteIssue(req.params.id as string);
    await logAudit(req, 'issue.deleted', 'issue', req.params.id as string);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// Get children
router.get('/issues/:id/children', async (req: AuthRequest, res, next) => {
  try {
    const issue = await issuesService.getIssue(req.params.id as string);
    await requireIssueAccess(req, issue.projectId);
    const children = await issuesService.getChildren(req.params.id as string);
    res.json(children);
  } catch (err) {
    next(err);
  }
});

// Issue history from audit_log (2.10)
router.get('/issues/:id/history', async (req: AuthRequest, res, next) => {
  try {
    const issue = await issuesService.getIssue(req.params.id as string);
    await requireIssueAccess(req, issue.projectId);
    const history = await issuesService.getHistory(req.params.id as string);
    res.json(history);
  } catch (err) {
    next(err);
  }
});

export default router;
