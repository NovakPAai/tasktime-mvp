import type { Prisma } from '@prisma/client';
import { prisma } from '../../prisma/client.js';
import { getCachedJson, setCachedJson } from '../../shared/redis.js';
import { UAT_TESTS, type UatRole, type UatTest } from './uat-tests.data.js';

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

export async function listUsersWithMeta() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
      _count: {
        select: {
          createdIssues: true,
          assignedIssues: true,
          timeLogs: true,
        },
      },
    },
  });

  return users;
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


