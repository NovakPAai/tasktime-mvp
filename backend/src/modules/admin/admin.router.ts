import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireRole, requireSuperAdmin } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import * as adminService from './admin.service.js';
import { createUserDto, updateUserAdminDto, assignProjectRoleDto } from './admin.dto.js';
import { logAudit } from '../../shared/middleware/audit.js';
import type { AuthRequest } from '../../shared/types/index.js';
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

router.get('/admin/users', requireRole('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const { search, isActive, page, pageSize } = req.query as {
      search?: string;
      isActive?: string;
      page?: string;
      pageSize?: string;
    };
    const result = await adminService.listUsersWithMeta({
      search,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      page: page ? parseInt(page) : undefined,
      pageSize: pageSize ? parseInt(pageSize) : undefined,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/admin/users', requireSuperAdmin(), validate(createUserDto), async (req: AuthRequest, res, next) => {
  try {
    const result = await adminService.createUser(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.patch('/admin/users/:id', requireRole('ADMIN', 'SUPER_ADMIN'), validate(updateUserAdminDto), async (req: AuthRequest, res, next) => {
  try {
    const result = await adminService.updateUserAdmin(req.user!.userId, req.params.id as string, req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.delete('/admin/users/:id', requireSuperAdmin(), async (req: AuthRequest, res, next) => {
  try {
    await adminService.deleteUser(req.user!.userId, req.params.id as string);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.patch('/admin/users/:id/deactivate', requireRole('ADMIN', 'SUPER_ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    const user = await adminService.deactivateUserAdmin(req.user!.userId, req.params.id as string);
    await logAudit(req, 'user.deactivated', 'user', req.params.id as string);
    res.json(user);
  } catch (err) {
    next(err);
  }
});

router.post('/admin/users/:id/reset-password', requireRole('ADMIN', 'SUPER_ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    const result = await adminService.resetUserPassword(req.user!.userId, req.params.id as string);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/admin/users/:id/roles', requireRole('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const roles = await adminService.getUserProjectRoles(req.params.id as string);
    res.json(roles);
  } catch (err) {
    next(err);
  }
});

router.post('/admin/users/:id/roles', requireSuperAdmin(), validate(assignProjectRoleDto), async (req: AuthRequest, res, next) => {
  try {
    const role = await adminService.assignProjectRole(req.user!.userId, req.params.id as string, req.body);
    res.status(201).json(role);
  } catch (err) {
    next(err);
  }
});

router.delete('/admin/users/:id/roles/:roleId', requireSuperAdmin(), async (req: AuthRequest, res, next) => {
  try {
    await adminService.removeProjectRole(req.user!.userId, req.params.id as string, req.params.roleId as string);
    res.json({ success: true });
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

router.get('/admin/settings/registration', requireRole('ADMIN', 'MANAGER', 'USER', 'VIEWER', 'SUPER_ADMIN'), async (_req, res, next) => {
  try {
    const registrationEnabled = await adminService.getRegistrationSetting();
    res.json({ registrationEnabled });
  } catch (err) {
    next(err);
  }
});

router.patch('/admin/settings/registration', requireSuperAdmin(), async (req: AuthRequest, res, next) => {
  try {
    const { enabled } = req.body as { enabled?: boolean };
    if (typeof enabled !== 'boolean') {
      res.status(400).json({ error: 'enabled (boolean) is required' });
      return;
    }
    const registrationEnabled = await adminService.setRegistrationSetting(req.user!.userId, enabled);
    res.json({ registrationEnabled });
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

export default router;
