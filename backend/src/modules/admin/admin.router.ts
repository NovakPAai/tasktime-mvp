import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireRole } from '../../shared/middleware/rbac.js';
import * as adminService from './admin.service.js';
import { rotateUserPassword } from '../users/password-rotation.service.js';
import type { UatRole } from './uat-tests.data.js';

const router = Router();

router.use(authenticate);

router.get('/admin/stats', requireRole('ADMIN', 'MANAGER', 'VIEWER'), async (_req, res, next) => {
  try {
    const stats = await adminService.getStats();
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

router.get('/admin/users', requireRole('ADMIN'), async (_req, res, next) => {
  try {
    const users = await adminService.listUsersWithMeta();
    res.json(users);
  } catch (err) {
    next(err);
  }
});

router.get('/admin/activity', requireRole('ADMIN', 'MANAGER', 'VIEWER'), async (_req, res, next) => {
  try {
    const activity = await adminService.getActivity();
    res.json(activity);
  } catch (err) {
    next(err);
  }
});

router.get('/admin/uat-tests', requireRole('ADMIN', 'MANAGER', 'USER', 'VIEWER'), async (req, res, next) => {
  try {
    const { role } = req.query as { role?: UatRole };
    const tests = await adminService.listUatTests({ role });
    res.json(tests);
  } catch (err) {
    next(err);
  }
});

router.get(
  '/admin/reports/issues-by-status',
  requireRole('ADMIN', 'MANAGER', 'VIEWER'),
  async (req, res, next) => {
    try {
      const { projectId, sprintId, from, to } = req.query as {
        projectId?: string;
        sprintId?: string;
        from?: string;
        to?: string;
      };

      if (!projectId) {
        res.status(400).json({ error: 'projectId is required' });
        return;
      }

      const data = await adminService.getIssuesByStatusReport({ projectId, sprintId, from, to });
      res.json(data);
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/admin/reports/issues-by-assignee',
  requireRole('ADMIN', 'MANAGER', 'VIEWER'),
  async (req, res, next) => {
    try {
      const { projectId, sprintId, from, to } = req.query as {
        projectId?: string;
        sprintId?: string;
        from?: string;
        to?: string;
      };

      if (!projectId) {
        res.status(400).json({ error: 'projectId is required' });
        return;
      }

      const data = await adminService.getIssuesByAssigneeReport({ projectId, sprintId, from, to });
      res.json(data);
    } catch (err) {
      next(err);
    }
  }
);

router.post('/admin/users/:email/reset-password', requireRole('SUPER_ADMIN', 'ADMIN'), async (req, res, next) => {
  try {
    const { email } = req.params;
    const { newPassword } = req.body as { newPassword?: unknown };
    if (typeof newPassword !== 'string' || newPassword.trim().length === 0) {
      res.status(400).json({ error: 'newPassword is required and must be a non-empty string' });
      return;
    }
    const user = await rotateUserPassword({ email, newPassword: newPassword.trim() });
    res.json({ success: true, userId: user.id, email: user.email });
  } catch (err) {
    next(err);
  }
});

export default router;

