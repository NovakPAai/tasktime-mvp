import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireRole, requireSuperAdmin } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import * as adminService from './admin.service.js';
import { createUserDto, updateUserAdminDto, assignProjectRoleDto, updateSystemSettingsDto } from './admin.dto.js';
import { logAudit } from '../../shared/middleware/audit.js';
import type { AuthRequest } from '../../shared/types/index.js';
import { rotateUserPassword } from '../users/password-rotation.service.js';
import type { UatRole } from './uat-tests.data.js';
import * as usersService from '../users/users.service.js';
import { assignSystemRoleDto, setSystemRolesDto } from '../users/users.dto.js';
import type { SystemRoleType } from '@prisma/client';

const router = Router();

router.use(authenticate);

router.get('/admin/stats', requireRole('ADMIN', 'AUDITOR'), async (_req, res, next) => {
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

// ─── System Roles endpoints ───────────────────────────────────────────────────

router.get('/admin/users/:id/system-roles', requireRole('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const systemRoles = await usersService.getSystemRoles(req.params.id as string);
    res.json({ systemRoles });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/admin/users/:id/system-roles',
  requireRole('ADMIN', 'SUPER_ADMIN'),
  validate(assignSystemRoleDto),
  async (req: AuthRequest, res, next) => {
    try {
      const entry = await usersService.addSystemRole(
        { userId: req.user!.userId, systemRoles: req.user!.systemRoles as SystemRoleType[] },
        req.params.id as string,
        req.body.role as SystemRoleType,
      );
      res.status(201).json(entry);
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/admin/users/:id/system-roles/:role',
  requireRole('ADMIN', 'SUPER_ADMIN'),
  async (req: AuthRequest, res, next) => {
    try {
      await usersService.removeSystemRole(
        { userId: req.user!.userId, systemRoles: req.user!.systemRoles as SystemRoleType[] },
        req.params.id as string,
        req.params.role as SystemRoleType,
      );
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  '/admin/users/:id/system-roles',
  requireRole('ADMIN', 'SUPER_ADMIN'),
  validate(setSystemRolesDto),
  async (req: AuthRequest, res, next) => {
    try {
      const user = await usersService.setSystemRoles(
        { userId: req.user!.userId, systemRoles: req.user!.systemRoles as SystemRoleType[] },
        req.params.id as string,
        req.body.roles as SystemRoleType[],
      );
      res.json(user);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Project Roles endpoints ──────────────────────────────────────────────────

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

// ─── Reports & Activity ───────────────────────────────────────────────────────

router.get('/admin/activity', requireRole('ADMIN', 'AUDITOR'), async (_req, res, next) => {
  try {
    const activity = await adminService.getActivity();
    res.json(activity);
  } catch (err) {
    next(err);
  }
});

router.get('/admin/settings/registration', requireRole('ADMIN', 'SUPER_ADMIN', 'USER', 'AUDITOR', 'RELEASE_MANAGER'), async (_req, res, next) => {
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

router.get('/admin/settings/system', requireSuperAdmin(), async (_req, res, next) => {
  try {
    const settings = await adminService.getSystemSettings();
    res.json(settings);
  } catch (err) {
    next(err);
  }
});

router.patch('/admin/settings/system', requireSuperAdmin(), validate(updateSystemSettingsDto), async (req: AuthRequest, res, next) => {
  try {
    const { sessionLifetimeMinutes } = req.body as { sessionLifetimeMinutes: number };
    await adminService.setSessionLifetime(req.user!.userId, sessionLifetimeMinutes);
    const settings = await adminService.getSystemSettings();
    res.json(settings);
  } catch (err) {
    next(err);
  }
});

router.get('/admin/uat-tests', requireRole('ADMIN', 'USER', 'AUDITOR'), async (req, res, next) => {
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
  requireRole('ADMIN', 'AUDITOR'),
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
  requireRole('ADMIN', 'AUDITOR'),
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

router.post('/admin/users/reset-password', requireRole('SUPER_ADMIN', 'ADMIN'), async (req, res, next) => {
  try {
    const { email, newPassword } = req.body as { email?: unknown; newPassword?: unknown };
    if (typeof email !== 'string' || email.trim().length === 0) {
      res.status(400).json({ error: 'email is required and must be a non-empty string' });
      return;
    }
    if (typeof newPassword !== 'string' || newPassword.trim().length === 0) {
      res.status(400).json({ error: 'newPassword is required and must be a non-empty string' });
      return;
    }
    const user = await rotateUserPassword({ email: email.trim(), newPassword: newPassword.trim() });
    res.json({ success: true, userId: user.id, email: user.email });
  } catch (err) {
    next(err);
  }
});

export default router;
