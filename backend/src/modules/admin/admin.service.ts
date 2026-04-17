import type { Prisma, SystemRoleType } from '@prisma/client';
import { ProjectRole } from '@prisma/client';
import { prisma } from '../../prisma/client.js';
import { config } from '../../config.js';
import { getCachedJson, setCachedJson, delCachedJson } from '../../shared/redis.js';
import { UAT_TESTS, type UatRole, type UatTest } from './uat-tests.data.js';
import { hashPassword } from '../../shared/utils/password.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import { invalidateProjectPermissionCache } from '../../shared/middleware/rbac.js';
import { getSchemeForProject } from '../project-role-schemes/project-role-schemes.service.js';
import type { CreateUserDto, UpdateUserAdminDto, AssignProjectRoleDto } from './admin.dto.js';

function flattenRoles<T extends { systemRoles: { role: SystemRoleType }[] }>(
  user: T,
): Omit<T, 'systemRoles'> & { systemRoles: SystemRoleType[] } {
  const { systemRoles, ...rest } = user;
  return { ...rest, systemRoles: systemRoles.map((sr) => sr.role) } as Omit<T, 'systemRoles'> & { systemRoles: SystemRoleType[] };
}

type AdminStats = {
  counts: {
    users: number;
    projects: number;
    issues: number;
    timeLogs: number;
  };
  issuesByStatus: Array<{ status: string; _count: { _all: number } }>;
  issuesByAssignee: Array<{
    assigneeId: string | null;
    assigneeName: string | null;
    _count: { _all: number };
  }>;
  recentActivity: Awaited<ReturnType<typeof getActivity>>;
};

export async function getStats() {
  const cacheKey = 'admin:stats';
  const cached = await getCachedJson<AdminStats>(cacheKey);
  if (cached) {
    return cached;
  }

  const [users, projects, issues, timeLogs] = await Promise.all([
    prisma.user.count(),
    prisma.project.count(),
    prisma.issue.count(),
    prisma.timeLog.count(),
  ]);

  const issuesByStatus = await prisma.issue.groupBy({
    by: ['status'],
    _count: { _all: true },
  });

  // Single query: users with assigned issues count — replaces groupBy + separate findMany + JS map.
  // Fetch unassigned count in parallel to preserve the null-assignee bucket in stats.
  const [usersWithIssues, unassignedCount] = await Promise.all([
    prisma.user.findMany({
      where: { assignedIssues: { some: {} } },
      select: {
        id: true,
        name: true,
        email: true,
        _count: { select: { assignedIssues: true } },
      },
    }),
    prisma.issue.count({ where: { assigneeId: null } }),
  ]);

  const issuesByAssignee: AdminStats['issuesByAssignee'] = [
    ...usersWithIssues.map((u) => ({
      assigneeId: u.id,
      assigneeName: u.name || u.email,
      _count: { _all: u._count.assignedIssues },
    })),
    ...(unassignedCount > 0
      ? [{ assigneeId: null, assigneeName: 'Без исполнителя', _count: { _all: unassignedCount } }]
      : []),
  ].sort((a, b) => b._count._all - a._count._all);

  const recentActivity = await getActivity();

  const stats: AdminStats = {
    counts: { users, projects, issues, timeLogs },
    issuesByStatus,
    issuesByAssignee,
    recentActivity,
  };

  await setCachedJson(cacheKey, stats);

  return stats;
}

export async function listUsersWithMeta(params?: { search?: string; isActive?: boolean; page?: number; pageSize?: number }) {
  const { search, isActive, page = 1, pageSize = 50 } = params ?? {};

  const where: Prisma.UserWhereInput = {};
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }
  if (isActive !== undefined) {
    where.isActive = isActive;
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
        isSystem: true,
        mustChangePassword: true,
        createdAt: true,
        systemRoles: { select: { role: true } },
        _count: {
          select: {
            createdIssues: true,
            assignedIssues: true,
            timeLogs: true,
          },
        },
        projectRoles: {
          select: {
            id: true,
            role: true,
            projectId: true,
            project: { select: { name: true, key: true } },
          },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return { users: users.map(flattenRoles), total, page, pageSize };
}

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  let pwd = '';
  for (let i = 0; i < 12; i++) {
    pwd += chars[Math.floor(Math.random() * chars.length)];
  }
  return pwd;
}

export async function createUser(dto: CreateUserDto) {
  const email = dto.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new AppError(409, 'Email already registered');

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  const systemRolesToCreate: { role: 'SUPER_ADMIN' | 'USER' }[] = dto.isSuperAdmin
    ? [{ role: 'SUPER_ADMIN' }, { role: 'USER' }]
    : [{ role: 'USER' }];

  const user = await prisma.user.create({
    data: {
      email,
      name: dto.name,
      passwordHash,
      mustChangePassword: true,
      systemRoles: { create: systemRolesToCreate },
    },
    select: {
      id: true, email: true, name: true,
      isActive: true, mustChangePassword: true, createdAt: true,
      systemRoles: { select: { role: true } },
    },
  });

  await prisma.auditLog.create({
    data: {
      action: 'user.created',
      entityType: 'user',
      entityId: user.id,
      details: { email: dto.email, name: dto.name },
    },
  });

  return { user: flattenRoles(user), tempPassword };
}

async function checkUserDependencies(userId: string) {
  const [assignedIssues, createdIssues, timeLogs, comments, ownedProjects] = await Promise.all([
    prisma.issue.count({ where: { assigneeId: userId } }),
    prisma.issue.count({ where: { creatorId: userId } }),
    prisma.timeLog.count({ where: { userId } }),
    prisma.comment.count({ where: { authorId: userId } }),
    prisma.project.count({ where: { ownerId: userId } }),
  ]);
  return { assignedIssues, createdIssues, timeLogs, comments, ownedProjects };
}

export async function deleteUser(actorId: string, userId: string) {
  if (actorId === userId) throw new AppError(400, 'Cannot delete yourself');

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, 'User not found');
  if (user.isSystem) throw new AppError(403, 'Cannot delete system users');

  const deps = await checkUserDependencies(userId);
  const hasData = Object.values(deps).some((v) => v > 0);
  if (hasData) {
    throw new AppError(
      409,
      'Нельзя удалить пользователя — есть связанные данные. Вы можете отключить пользователя.',
      { canDeactivate: true, dependencies: deps },
    );
  }

  await prisma.auditLog.create({
    data: {
      action: 'user.deleted',
      entityType: 'user',
      entityId: userId,
      details: { email: user.email, name: user.name },
    },
  });

  await prisma.user.delete({ where: { id: userId } });
}

const NA_SUFFIX = ' (N/A)';
const MAX_NAME_LEN = 255;

function appendNaSuffix(name: string): string {
  if (name.endsWith(NA_SUFFIX)) return name;
  const base = name.length + NA_SUFFIX.length > MAX_NAME_LEN
    ? name.slice(0, MAX_NAME_LEN - NA_SUFFIX.length)
    : name;
  return base + NA_SUFFIX;
}

function stripNaSuffix(name: string): string {
  return name.endsWith(NA_SUFFIX) ? name.slice(0, -NA_SUFFIX.length) : name;
}

export async function deactivateUserAdmin(actorId: string, userId: string) {
  if (actorId === userId) throw new AppError(400, 'Cannot deactivate yourself');

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, 'User not found');
  if (user.isSystem) throw new AppError(403, 'Cannot deactivate system users');

  const newName = appendNaSuffix(user.name);

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { isActive: false, name: newName },
    select: {
      id: true, email: true, name: true,
      isActive: true, mustChangePassword: true, createdAt: true, updatedAt: true,
      systemRoles: { select: { role: true } },
    },
  });

  await prisma.auditLog.create({
    data: {
      action: 'user.deactivated',
      entityType: 'user',
      entityId: userId,
      userId: actorId,
      details: { email: user.email, previousName: user.name, newName },
    },
  });

  return flattenRoles(updated);
}

export async function updateUserAdmin(actorId: string, userId: string, dto: UpdateUserAdminDto) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, 'User not found');

  if (dto.email) {
    dto.email = dto.email.trim().toLowerCase();
    if (dto.email !== user.email) {
      const existing = await prisma.user.findUnique({ where: { email: dto.email } });
      if (existing) throw new AppError(409, 'Email already in use');
    }
  }

  if (dto.isActive === true && !user.isActive) {
    dto.name = stripNaSuffix(dto.name ?? user.name);
  }

  if (dto.isActive === false && user.isActive) {
    dto.name = appendNaSuffix(dto.name ?? user.name);
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: dto,
    select: {
      id: true, email: true, name: true,
      isActive: true, mustChangePassword: true, createdAt: true, updatedAt: true,
      systemRoles: { select: { role: true } },
    },
  });

  await prisma.auditLog.create({
    data: {
      action: 'user.updated',
      entityType: 'user',
      entityId: userId,
      userId: actorId,
      details: { changedFields: Object.keys(dto) },
    },
  });

  return flattenRoles(updated);
}

export async function resetUserPassword(actorId: string, userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, 'User not found');

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, mustChangePassword: true },
  });

  await prisma.auditLog.create({
    data: {
      action: 'user.password_reset',
      entityType: 'user',
      entityId: userId,
      userId: actorId,
      details: {},
    },
  });

  return { tempPassword };
}

export async function getUserProjectRoles(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, 'User not found');

  return prisma.userProjectRole.findMany({
    where: { userId },
    include: { project: { select: { id: true, name: true, key: true } } },
    orderBy: { createdAt: 'asc' },
  });
}

export async function assignProjectRole(actorId: string, userId: string, dto: AssignProjectRoleDto) {
  const [user, project] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.project.findUnique({ where: { id: dto.projectId } }),
  ]);
  if (!user) throw new AppError(404, 'User not found');
  if (!project) throw new AppError(404, 'Project not found');

  // Resolve legacy role enum value AND resolvedSchemeId. New clients send `roleId`; legacy clients
  // send `role`; we always resolve the active project scheme so that `roleId` and `schemeId` are
  // stored together on the UserProjectRole row — otherwise a legacy-only assignment would leave
  // the row unlinked from the active scheme and later remapping/permission checks would have to
  // rely on fragile legacy fallback.
  const legacyRoles = Object.values(ProjectRole) as string[]; // Prisma-generated enum — kept in sync automatically.
  let legacyRole = dto.role as ProjectRole | undefined;
  let resolvedSchemeId: string | undefined;
  let resolvedRoleId: string | undefined;
  const projectScheme = await getSchemeForProject(dto.projectId);
  if (dto.roleId) {
    const roleDef = projectScheme.roles.find(r => r.id === dto.roleId);
    if (!roleDef) {
      throw new AppError(400, 'roleId не принадлежит схеме, привязанной к проекту');
    }
    resolvedSchemeId = projectScheme.id;
    resolvedRoleId = dto.roleId;
    const derivedKey = legacyRoles.includes(roleDef.key) ? (roleDef.key as ProjectRole) : undefined;
    if (dto.role && derivedKey && dto.role !== derivedKey) {
      throw new AppError(400, `Ключ роли "${roleDef.key}" не совпадает с legacy role "${dto.role}"`);
    }
    legacyRole = derivedKey ?? dto.role;
  } else if (dto.role) {
    // Legacy path: resolve the role in the active project scheme by key, so roleId/schemeId are
    // still populated. If the active scheme doesn't define a role with this key, reject instead
    // of silently creating a half-linked row.
    const roleDef = projectScheme.roles.find(r => r.key === dto.role);
    if (!roleDef) {
      throw new AppError(400, `В схеме проекта нет роли с ключом "${dto.role}" — используйте roleId`);
    }
    legacyRole = dto.role;
    resolvedSchemeId = projectScheme.id;
    resolvedRoleId = roleDef.id;
  }
  if (!legacyRole) throw new AppError(400, 'Нужно передать role или roleId');

  const existing = await prisma.userProjectRole.findFirst({
    where: { userId, projectId: dto.projectId },
  });
  if (existing) throw new AppError(409, 'У пользователя уже есть роль в этом проекте — удалите её перед назначением новой');

  const roleEntry = await prisma.userProjectRole.create({
    data: {
      userId,
      projectId: dto.projectId,
      role: legacyRole,
      // roleId and schemeId must be set together (enforced by CHECK constraint on the DB side).
      ...(resolvedRoleId && resolvedSchemeId ? { roleId: resolvedRoleId, schemeId: resolvedSchemeId } : {}),
    },
    include: { project: { select: { id: true, name: true, key: true } } },
  });
  await invalidateProjectPermissionCache(dto.projectId, userId);

  await prisma.auditLog.create({
    data: {
      action: 'user.role_assigned',
      entityType: 'user',
      entityId: userId,
      userId: actorId,
      details: { projectId: dto.projectId, role: legacyRole, roleId: resolvedRoleId, schemeId: resolvedSchemeId },
    },
  });

  return roleEntry;
}

export async function removeProjectRole(actorId: string, userId: string, roleId: string) {
  const roleEntry = await prisma.userProjectRole.findFirst({
    where: { id: roleId, userId },
  });
  if (!roleEntry) throw new AppError(404, 'Role assignment not found');

  await prisma.userProjectRole.delete({ where: { id: roleId } });
  await invalidateProjectPermissionCache(roleEntry.projectId, userId);

  await prisma.auditLog.create({
    data: {
      action: 'user.role_removed',
      entityType: 'user',
      entityId: userId,
      userId: actorId,
      details: { projectId: roleEntry.projectId, role: roleEntry.role },
    },
  });
}

export async function getActivity() {
  return prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { user: { select: { id: true, name: true, email: true } } },
  });
}

type IssuesReportParams = {
  projectId: string;
  sprintId?: string;
  from?: string;
  to?: string;
};

type IssuesByStatusRow = { status: string; _count: { _all: number } };
type IssuesByAssigneeRow = { assigneeId: string | null; _count: { _all: number } };

export async function getIssuesByStatusReport(params: IssuesReportParams) {
  const where: Prisma.IssueWhereInput = { projectId: params.projectId };
  if (params.sprintId) {
    where.sprintId = params.sprintId;
  }
  if (params.from || params.to) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (params.from) createdAt.gte = new Date(params.from);
    if (params.to) createdAt.lte = new Date(params.to);
    where.createdAt = createdAt;
  }

  const cacheKey = `admin:report:issuesByStatus:${params.projectId}:${params.sprintId ?? 'all'}:${params.from ?? 'none'}:${
    params.to ?? 'none'
  }`;

  const cached = await getCachedJson<IssuesByStatusRow[]>(cacheKey);
  if (cached) {
    return cached;
  }

  const data = await prisma.issue.groupBy({
    by: ['status'],
    _count: { _all: true },
    where,
  });

  await setCachedJson(cacheKey, data);

  return data;
}

export async function getIssuesByAssigneeReport(params: IssuesReportParams) {
  const where: Prisma.IssueWhereInput = { projectId: params.projectId };
  if (params.sprintId) {
    where.sprintId = params.sprintId;
  }
  if (params.from || params.to) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (params.from) createdAt.gte = new Date(params.from);
    if (params.to) createdAt.lte = new Date(params.to);
    where.createdAt = createdAt;
  }

  const cacheKey = `admin:report:issuesByAssignee:${params.projectId}:${params.sprintId ?? 'all'}:${params.from ?? 'none'}:${
    params.to ?? 'none'
  }`;

  const cached = await getCachedJson<IssuesByAssigneeRow[]>(cacheKey);
  if (cached) {
    return cached;
  }

  const data = await prisma.issue.groupBy({
    by: ['assigneeId'],
    _count: { _all: true },
    where,
  });

  await setCachedJson(cacheKey, data);

  return data;
}

export async function listUatTests(params: { role?: UatRole }): Promise<UatTest[]> {
  const { role } = params;
  if (!role) {
    return UAT_TESTS;
  }
  return UAT_TESTS.filter((test) => test.role === role);
}

// ===== SYSTEM SETTINGS =====

const REGISTRATION_KEY = 'registration_enabled';

export async function getRegistrationSetting(): Promise<boolean> {
  const setting = await prisma.systemSetting.findUnique({ where: { key: REGISTRATION_KEY } });
  if (!setting) return true; // default: enabled
  return setting.value !== 'false';
}

export async function setRegistrationSetting(actorId: string, enabled: boolean): Promise<boolean> {
  await prisma.systemSetting.upsert({
    where: { key: REGISTRATION_KEY },
    create: { key: REGISTRATION_KEY, value: String(enabled) },
    update: { value: String(enabled) },
  });

  await prisma.auditLog.create({
    data: {
      action: 'system.registration_toggled',
      entityType: 'system',
      entityId: REGISTRATION_KEY,
      userId: actorId,
      details: { enabled },
    },
  });

  return enabled;
}

// ===== SESSION SETTINGS =====

const SESSION_LIFETIME_KEY = 'session_lifetime_minutes';
const SESSION_LIFETIME_CACHE_KEY = `settings:${SESSION_LIFETIME_KEY}`;
const SESSION_LIFETIME_DEFAULT = 60;

export type SystemSettings = {
  sessionLifetimeMinutes: number;
  registrationEnabled: boolean;
  /** JWT access-token TTL — read from JWT_EXPIRES_IN env var, read-only at runtime. */
  jwtExpiresIn: string;
};

export async function getSystemSettings(): Promise<SystemSettings> {
  const [sessionSetting, regSetting] = await Promise.all([
    prisma.systemSetting.findUnique({ where: { key: SESSION_LIFETIME_KEY } }),
    prisma.systemSetting.findUnique({ where: { key: REGISTRATION_KEY } }),
  ]);

  const raw = sessionSetting ? parseInt(sessionSetting.value, 10) : SESSION_LIFETIME_DEFAULT;
  return {
    sessionLifetimeMinutes: isNaN(raw) || raw < 1 ? SESSION_LIFETIME_DEFAULT : raw,
    registrationEnabled: regSetting ? regSetting.value !== 'false' : true,
    jwtExpiresIn: config.JWT_EXPIRES_IN,
  };
}

export async function setSessionLifetime(actorId: string, minutes: number): Promise<number> {
  await prisma.systemSetting.upsert({
    where: { key: SESSION_LIFETIME_KEY },
    create: { key: SESSION_LIFETIME_KEY, value: String(minutes) },
    update: { value: String(minutes) },
  });

  // Invalidate the Redis cache so auth middleware picks up the new value immediately
  await delCachedJson(SESSION_LIFETIME_CACHE_KEY);

  await prisma.auditLog.create({
    data: {
      action: 'system.session_lifetime_changed',
      entityType: 'system',
      entityId: SESSION_LIFETIME_KEY,
      userId: actorId,
      details: { sessionLifetimeMinutes: minutes },
    },
  });

  return minutes;
}


