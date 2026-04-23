import { Router } from 'express';
import { z } from 'zod';
import type { SystemRoleType } from '@prisma/client';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireRole } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import { logAudit } from '../../shared/middleware/audit.js';
import {
  createUserGroupDto,
  updateUserGroupDto,
  addMembersDto,
  grantProjectRoleDto,
  grantGroupSystemRoleDto,
} from './user-groups.dto.js';
import * as service from './user-groups.service.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import { asyncHandler, authHandler } from '../../shared/utils/async-handler.js';

const VALID_SYSTEM_ROLES: readonly SystemRoleType[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'RELEASE_MANAGER',
  'AUDITOR',
  'USER',
  'BULK_OPERATOR',
];

const listQuerySchema = z.object({
  search: z.string().optional(),
  projectId: z.string().uuid().optional(),
});

/**
 * TTSEC-2 Phase 2 router. Mounted at /api/admin/user-groups.
 *
 * TODO Phase 4: migrate gate from `requireRole('ADMIN')` (system ADMIN) to a proper
 * system-level permission check (`USER_GROUP_VIEW` / `USER_GROUP_MANAGE`) once the helper is
 * extracted. For now system ADMIN gets full access — same pattern as teams/*.
 */

const router = Router();
router.use(authenticate);
router.use(requireRole('ADMIN'));

router.get('/', asyncHandler(async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError(400, 'Некорректные параметры фильтра', parsed.error.flatten());
  }
  res.json(await service.listGroups(parsed.data));
}));

router.post('/', validate(createUserGroupDto), authHandler(async (req, res) => {
  const group = await service.createGroup(req.body);
  await logAudit(req, 'user_group.created', 'user_group', group.id, { name: group.name });
  res.status(201).json(group);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  res.json(await service.getGroup(req.params.id as string));
}));

router.patch('/:id', validate(updateUserGroupDto), authHandler(async (req, res) => {
  const groupId = req.params.id as string;
  const before = await service.getGroup(groupId);
  const updated = await service.updateGroup(groupId, req.body);
  const action = req.body.name && req.body.name !== before.name
    ? 'user_group.renamed'
    : 'user_group.updated';
  await logAudit(req, action, 'user_group', groupId, {
    before: { name: before.name, description: before.description },
    after: req.body,
  });
  res.json(updated);
}));

router.get('/:id/impact', asyncHandler(async (req, res) => {
  res.json(await service.getGroupImpact(req.params.id as string));
}));

router.delete('/:id', authHandler(async (req, res) => {
  // confirm=true is mandatory for destructive group delete — without it return 412 + impact.
  // This matches spec §5.6 / FR-A9: DELETE group requires confirm + list of affected.
  if (req.query.confirm !== 'true') {
    const impact = await service.getGroupImpact(req.params.id as string);
    throw new AppError(412, 'CONFIRM_REQUIRED: добавьте ?confirm=true', { impact });
  }
  const result = await service.deleteGroup(req.params.id as string);
  await logAudit(req, 'user_group.deleted', 'user_group', req.params.id as string, {
    name: result.name,
    removedMembers: result.removedMembers,
    removedBindings: result.removedBindings,
  });
  res.json(result);
}));

router.post('/:id/members', validate(addMembersDto), authHandler(async (req, res) => {
  const groupId = req.params.id as string;
  const result = await service.addMembers(groupId, req.body.userIds, req.user!.userId);
  await logAudit(req, 'user_group.members_changed', 'user_group', groupId, {
    added: req.body.userIds,
    removed: [],
  });
  res.json(result);
}));

router.delete('/:id/members/:userId', authHandler(async (req, res) => {
  const groupId = req.params.id as string;
  const userId = req.params.userId as string;
  const result = await service.removeMember(groupId, userId);
  await logAudit(req, 'user_group.members_changed', 'user_group', groupId, {
    added: [],
    removed: [userId],
  });
  res.json(result);
}));

router.post('/:id/project-roles', validate(grantProjectRoleDto), authHandler(async (req, res) => {
  const groupId = req.params.id as string;
  const binding = await service.grantProjectRole(groupId, req.body);
  await logAudit(req, 'project_group_role.granted', 'user_group', groupId, {
    projectId: req.body.projectId,
    roleId: req.body.roleId,
  });
  res.status(201).json(binding);
}));

router.delete('/:id/project-roles/:projectId', authHandler(async (req, res) => {
  const groupId = req.params.id as string;
  const projectId = req.params.projectId as string;
  const result = await service.revokeProjectRole(groupId, projectId);
  await logAudit(req, 'project_group_role.revoked', 'user_group', groupId, { projectId });
  res.json(result);
}));

// ──── TTBULK-1 PR-8 — group-level system roles ───────────────────────────────

// Audit actions `system_role.granted|revoked` зеркалят TZ §7.2 соглашение для
// group-source событий. Direct-user path использует `user.system_role_added|removed`
// (в `users.service`). Cross-path audit-запрос обязан OR'ить оба префикса.
router.post(
  '/:id/system-roles',
  validate(grantGroupSystemRoleDto),
  authHandler(async (req, res) => {
    const groupId = req.params.id as string;
    const role = req.body.role as SystemRoleType;
    const created = await service.grantSystemRoleToGroup(groupId, role, {
      userId: req.user!.userId,
      systemRoles: req.user!.systemRoles as SystemRoleType[],
    });
    await logAudit(req, 'system_role.granted', 'user_group', groupId, {
      role,
      source: 'group',
    });
    res.status(201).json(created);
  }),
);

router.delete(
  '/:id/system-roles/:role',
  authHandler(async (req, res) => {
    const groupId = req.params.id as string;
    const role = req.params.role as SystemRoleType;
    if (!VALID_SYSTEM_ROLES.includes(role)) {
      throw new AppError(400, `Invalid system role: ${role}`);
    }
    const result = await service.revokeSystemRoleFromGroup(groupId, role, {
      userId: req.user!.userId,
      systemRoles: req.user!.systemRoles as SystemRoleType[],
    });
    await logAudit(req, 'system_role.revoked', 'user_group', groupId, {
      role,
      source: 'group',
    });
    res.json(result);
  }),
);

export default router;
