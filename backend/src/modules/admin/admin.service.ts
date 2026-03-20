import type { Prisma } from '@prisma/client';
import { prisma } from '../../prisma/client.js';
import { getCachedJson, setCachedJson } from '../../shared/redis.js';
import { UAT_TESTS, type UatRole, type UatTest } from './uat-tests.data.js';
import { hashPassword } from '../../shared/utils/password.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import type { CreateUserDto, UpdateUserAdminDto, AssignProjectRoleDto } from './admin.dto.js';

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

  const issuesByAssigneeRaw = await prisma.issue.groupBy({
    by: ['assigneeId'],
    _count: { _all: true },
    where: { assigneeId: { not: null } },
  });

  const assigneeIds = issuesByAssigneeRaw
    .map((row) => row.assigneeId)
    .filter((id): id is string => Boolean(id));

  const assignees =
    assigneeIds.length === 0
      ? []
      : await prisma.user.findMany({
          where: { id: { in: assigneeIds } },
          select: { id: true, name: true, email: true },
        });

  const assigneeMap = new Map<string, { name: string | null; email: string }>();
  for (const user of assignees) {
    assigneeMap.set(user.id, { name: user.name, email: user.email });
  }

  const issuesByAssignee = issuesByAssigneeRaw.map((row) => {
    if (!row.assigneeId) {
      return { ...row, assigneeName: null };
    }
    const meta = assigneeMap.get(row.assigneeId);
    const name = meta?.name || meta?.email || row.assigneeId;
    return { ...row, assigneeName: name };
  });

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
        role: true,
        isActive: true,
        isSystem: true,
        mustChangePassword: true,
        createdAt: true,
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

  return { users, total, page, pageSize };
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
  const existing = await prisma.user.findUnique({ where: { email: dto.email } });
  if (existing) throw new AppError(409, 'Email already registered');

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  const user = await prisma.user.create({
    data: {
      email: dto.email,
      name: dto.name,
      passwordHash,
      role: dto.isSuperAdmin ? 'SUPER_ADMIN' : 'USER',
      mustChangePassword: true,
    },
    select: {
      id: true, email: true, name: true, role: true,
      isActive: true, mustChangePassword: true, createdAt: true,
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

  return { user, tempPassword };
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

export async function deactivateUserAdmin(actorId: string, userId: string) {
  if (actorId === userId) throw new AppError(400, 'Cannot deactivate yourself');

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, 'User not found');
  if (user.isSystem) throw new AppError(403, 'Cannot deactivate system users');

  const NA_SUFFIX = ' (N/A)';
  const newName = user.name.endsWith(NA_SUFFIX) ? user.name : user.name + NA_SUFFIX;

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { isActive: false, name: newName },
    select: {
      id: true, email: true, name: true, role: true,
      isActive: true, mustChangePassword: true, createdAt: true, updatedAt: true,
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

  return updated;
}

export async function updateUserAdmin(actorId: string, userId: string, dto: UpdateUserAdminDto) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, 'User not found');

  if (dto.email && dto.email !== user.email) {
    const existing = await prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new AppError(409, 'Email already in use');
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: dto,
    select: {
      id: true, email: true, name: true, role: true,
      isActive: true, mustChangePassword: true, createdAt: true, updatedAt: true,
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

  return updated;
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

  const existing = await prisma.userProjectRole.findFirst({
    where: { userId, projectId: dto.projectId, role: dto.role },
  });
  if (existing) throw new AppError(409, 'Role already assigned');

  const roleEntry = await prisma.userProjectRole.create({
    data: { userId, projectId: dto.projectId, role: dto.role },
    include: { project: { select: { id: true, name: true, key: true } } },
  });

  await prisma.auditLog.create({
    data: {
      action: 'user.role_assigned',
      entityType: 'user',
      entityId: userId,
      userId: actorId,
      details: { projectId: dto.projectId, role: dto.role },
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


