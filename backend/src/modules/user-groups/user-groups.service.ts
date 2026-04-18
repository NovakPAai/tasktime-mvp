import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma/client.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import { invalidateProjectPermissionCache } from '../../shared/middleware/rbac.js';
import type {
  CreateUserGroupDto,
  UpdateUserGroupDto,
  GrantProjectRoleDto,
} from './user-groups.dto.js';

/**
 * Invalidate both the new group-aware effective cache AND the legacy per-permission cache for
 * every (user, project) pair that a group change touches. Pair-based is exact and kills legacy
 * `rbac:perm:*` keys too (AI review #65 round 3 🟡). Used by add/remove member, grant/revoke
 * binding, delete group.
 */
async function invalidatePairs(pairs: Iterable<{ userId: string; projectId: string }>): Promise<void> {
  await Promise.all(
    Array.from(pairs).map(p => invalidateProjectPermissionCache(p.projectId, p.userId)),
  );
}

/**
 * TTSEC-2 Phase 2 user groups.
 *
 * Invariants kept by this module:
 *   - Every membership/binding change invalidates the affected users' effective-permission caches.
 *   - Grouping a user in a project they already have DIRECT role in — both sources contribute
 *     to computeEffectiveRole (max permissions wins). No deduplication at write time.
 *   - DELETE (group / member / binding) returns the list of affected user×project pairs so the
 *     router can log audit and the UI can warn.
 */

const listInclude = {
  _count: { select: { members: true, projectRoles: true } },
} as const;

const detailInclude = {
  members: {
    include: {
      user: { select: { id: true, name: true, email: true, isActive: true } },
      addedBy: { select: { id: true, name: true } },
    },
    orderBy: { addedAt: 'desc' as const },
  },
  projectRoles: {
    include: {
      project: { select: { id: true, key: true, name: true } },
      roleDefinition: { select: { id: true, name: true, key: true, color: true } },
    },
  },
} as const;

export async function listGroups(query?: { search?: string; projectId?: string }) {
  const where: Prisma.UserGroupWhereInput = {};
  if (query?.search) where.name = { contains: query.search, mode: 'insensitive' };
  if (query?.projectId) where.projectRoles = { some: { projectId: query.projectId } };
  return prisma.userGroup.findMany({
    where,
    include: listInclude,
    orderBy: { name: 'asc' },
  });
}

export async function getGroup(id: string) {
  const group = await prisma.userGroup.findUnique({
    where: { id },
    include: detailInclude,
  });
  if (!group) throw new AppError(404, 'Группа не найдена');
  return group;
}

export async function createGroup(dto: CreateUserGroupDto) {
  const existing = await prisma.userGroup.findUnique({ where: { name: dto.name }, select: { id: true } });
  if (existing) throw new AppError(409, 'Группа с таким именем уже существует');
  return prisma.userGroup.create({
    data: { name: dto.name, description: dto.description ?? null },
  });
}

export async function updateGroup(id: string, dto: UpdateUserGroupDto) {
  const existing = await prisma.userGroup.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!existing) throw new AppError(404, 'Группа не найдена');
  if (dto.name && dto.name !== existing.name) {
    const clash = await prisma.userGroup.findUnique({ where: { name: dto.name }, select: { id: true } });
    if (clash && clash.id !== id) throw new AppError(409, 'Группа с таким именем уже существует');
  }
  return prisma.userGroup.update({
    where: { id },
    data: {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
    },
  });
}

/**
 * Delete a group. Returns affected user-project pairs so the caller can audit exactly which
 * permissions were revoked. The DB cascades UserGroupMember/ProjectGroupRole via FK ON DELETE CASCADE.
 *
 * Cache invalidation order: we invalidate AFTER the delete so the DB row (source of truth) is
 * gone before we drop the cache. Any concurrent request reading between delete and invalidation
 * can still see a cached `true`, producing at most a ~ms-scale stale-allow window. Inverting the
 * order (invalidate then delete) doesn't help — a read after invalidation but before delete would
 * recompute and re-cache the still-granted state. Accept the short window; the delete call is
 * synchronous and completes in milliseconds.
 */
export async function deleteGroup(id: string) {
  const group = await prisma.userGroup.findUnique({
    where: { id },
    include: {
      members: { select: { userId: true } },
      projectRoles: { select: { projectId: true, roleId: true } },
    },
  });
  if (!group) throw new AppError(404, 'Группа не найдена');

  // Affected pairs: every member × every project the group bound to.
  const affectedPairs: { userId: string; projectId: string }[] = [];
  for (const m of group.members) {
    for (const pr of group.projectRoles) {
      affectedPairs.push({ userId: m.userId, projectId: pr.projectId });
    }
  }

  await prisma.userGroup.delete({ where: { id } });
  await invalidatePairs(affectedPairs);

  return {
    name: group.name,
    affectedPairs,
    removedMembers: group.members.map(m => m.userId),
    removedBindings: group.projectRoles,
  };
}

export async function getGroupImpact(id: string) {
  const group = await prisma.userGroup.findUnique({
    where: { id },
    select: {
      _count: { select: { members: true, projectRoles: true } },
      members: { select: { user: { select: { id: true, name: true, email: true } } } },
      projectRoles: {
        select: {
          project: { select: { id: true, key: true, name: true } },
          roleDefinition: { select: { id: true, name: true, key: true } },
        },
      },
    },
  });
  if (!group) throw new AppError(404, 'Группа не найдена');
  return {
    memberCount: group._count.members,
    projectCount: group._count.projectRoles,
    members: group.members.map(m => m.user),
    projects: group.projectRoles,
  };
}

export async function addMembers(groupId: string, userIds: string[], addedById: string) {
  const group = await prisma.userGroup.findUnique({
    where: { id: groupId },
    include: { projectRoles: { select: { projectId: true } } },
  });
  if (!group) throw new AppError(404, 'Группа не найдена');

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true },
  });
  const foundIds = new Set(users.map(u => u.id));
  const missing = userIds.filter(id => !foundIds.has(id));
  if (missing.length > 0) {
    throw new AppError(400, `Некоторые пользователи не найдены: ${missing.length}`);
  }

  // Batch insert; skip duplicates via composite PK + createMany skipDuplicates.
  const result = await prisma.userGroupMember.createMany({
    data: userIds.map(userId => ({ groupId, userId, addedById })),
    skipDuplicates: true,
  });

  // Only the projects this group is bound to are affected by the new members — exact invalidation.
  const pairs = userIds.flatMap(uid => group.projectRoles.map(pr => ({ userId: uid, projectId: pr.projectId })));
  await invalidatePairs(pairs);
  return { added: result.count };
}

export async function removeMember(groupId: string, userId: string) {
  const existing = await prisma.userGroupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
    select: { groupId: true },
  });
  if (!existing) throw new AppError(404, 'Пользователь не является участником группы');

  // Capture the projects bound to this group BEFORE deleting membership — those are the projects
  // where the removed user is losing access.
  const bindings = await prisma.projectGroupRole.findMany({
    where: { groupId },
    select: { projectId: true },
  });

  await prisma.userGroupMember.delete({
    where: { groupId_userId: { groupId, userId } },
  });

  await invalidatePairs(bindings.map(b => ({ userId, projectId: b.projectId })));
  return { ok: true };
}

/**
 * Grant a project role to a group. The role must belong to the project's ACTIVE role scheme —
 * otherwise the binding would be useless at permission-resolution time (see computeEffectiveRole
 * active-scheme filter). We also persist `schemeId` for the composite FK.
 */
export async function grantProjectRole(groupId: string, dto: GrantProjectRoleDto) {
  const group = await prisma.userGroup.findUnique({ where: { id: groupId }, select: { id: true } });
  if (!group) throw new AppError(404, 'Группа не найдена');

  const project = await prisma.project.findUnique({ where: { id: dto.projectId }, select: { id: true } });
  if (!project) throw new AppError(404, 'Проект не найден');

  const role = await prisma.projectRoleDefinition.findUnique({
    where: { id: dto.roleId },
    select: { id: true, schemeId: true },
  });
  if (!role) throw new AppError(404, 'Роль не найдена');

  // Resolve the project's active scheme. Accept a role from this scheme OR from the default
  // scheme when the project has no explicit binding. Reject roles from unrelated schemes —
  // they would never resolve at runtime and only confuse admins.
  const projectBinding = await prisma.projectRoleSchemeProject.findUnique({
    where: { projectId: dto.projectId },
    select: { schemeId: true },
  });
  const activeSchemeId = projectBinding?.schemeId
    ?? (await prisma.projectRoleScheme.findFirst({ where: { isDefault: true }, select: { id: true } }))?.id;
  if (!activeSchemeId) throw new AppError(500, 'Не настроена дефолтная схема ролей');
  if (role.schemeId !== activeSchemeId) {
    throw new AppError(400, 'Роль принадлежит другой схеме — выберите роль из схемы проекта');
  }

  const existing = await prisma.projectGroupRole.findUnique({
    where: { groupId_projectId: { groupId, projectId: dto.projectId } },
    select: { id: true, roleId: true },
  });
  if (existing && existing.roleId === dto.roleId) {
    return existing; // idempotent
  }

  const result = existing
    ? await prisma.projectGroupRole.update({
        where: { id: existing.id },
        data: { roleId: dto.roleId, schemeId: role.schemeId },
      })
    : await prisma.projectGroupRole.create({
        data: {
          groupId,
          projectId: dto.projectId,
          roleId: dto.roleId,
          schemeId: role.schemeId,
        },
      });

  const members = await prisma.userGroupMember.findMany({
    where: { groupId },
    select: { userId: true },
  });
  await Promise.all(members.map(m => invalidateProjectPermissionCache(dto.projectId, m.userId)));

  return result;
}

export async function revokeProjectRole(groupId: string, projectId: string) {
  const existing = await prisma.projectGroupRole.findUnique({
    where: { groupId_projectId: { groupId, projectId } },
    select: { id: true },
  });
  if (!existing) throw new AppError(404, 'Группа не привязана к этому проекту');

  await prisma.projectGroupRole.delete({ where: { id: existing.id } });

  const members = await prisma.userGroupMember.findMany({
    where: { groupId },
    select: { userId: true },
  });
  await Promise.all(members.map(m => invalidateProjectPermissionCache(projectId, m.userId)));

  return { ok: true };
}
