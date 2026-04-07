import type { Prisma, SprintState } from '@prisma/client';
import { prisma } from '../../prisma/client.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import type { CreateSprintDto, UpdateSprintDto } from './sprints.dto.js';
import { getCachedJson, setCachedJson, delCacheByPrefix, delCachedJson } from '../../shared/redis.js';
import {
  type PaginationParams,
  paginationToSkipTake,
  buildPaginatedResponse,
} from '../../shared/utils/params.js';

type SprintStatsIssue = {
  estimatedHours: Prisma.Decimal | number | null;
};

type SprintWithStatsSource = {
  issues?: SprintStatsIssue[] | null;
};

function mapSprintWithStats<TSprint extends SprintWithStatsSource>(sprint: TSprint) {
  const totalIssues = sprint.issues?.length ?? 0;
  const estimatedIssues = sprint.issues?.filter((issue) => issue.estimatedHours != null).length ?? 0;
  const planningReadiness =
    totalIssues === 0 ? 0 : Math.round((estimatedIssues / totalIssues) * 100);

  const totalEstimatedHours = sprint.issues?.reduce((sum, issue) => {
    const h = issue.estimatedHours != null ? Number(issue.estimatedHours) : 0;
    return sum + h;
  }, 0) ?? 0;

  const sprintData = { ...sprint };
  delete (sprintData as Partial<TSprint> & SprintWithStatsSource).issues;

  return {
    ...sprintData,
    stats: {
      totalIssues,
      estimatedIssues,
      planningReadiness,
      totalEstimatedHours,
    },
  };
}

export async function listSprints(projectId: string, pagination?: PaginationParams) {
  const p = pagination ?? { page: 1, limit: 100 };
  const { skip, take } = paginationToSkipTake(p);
  const cacheKey = `sprints:project:${projectId}:pg=${p.page}:lm=${p.limit}`;

  type SprintItem = ReturnType<typeof mapSprintWithStats>;
  const cached = await getCachedJson<ReturnType<typeof buildPaginatedResponse<SprintItem>>>(cacheKey);
  if (cached) return cached;

  const [sprints, total] = await Promise.all([
    prisma.sprint.findMany({
      where: { projectId },
      include: {
        _count: { select: { issues: true } },
        issues: { select: { id: true, estimatedHours: true } },
        project: { select: { id: true, name: true, key: true } },
        projectTeam: { select: { id: true, name: true } },
        businessTeam: { select: { id: true, name: true } },
        flowTeam: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.sprint.count({ where: { projectId } }),
  ]);

  const result = buildPaginatedResponse(sprints.map(mapSprintWithStats), total, p);
  await setCachedJson(cacheKey, result);
  return result;
}

export async function getSprintIssues(id: string) {
  const cacheKey = `sprint:issues:${id}`;
  type SprintIssuesResult = {
    sprint: ReturnType<typeof mapSprintWithStats>;
    issues: Array<{
      id: string; projectId: string; number: number; title: string;
      estimatedHours: Prisma.Decimal | null; type: string | null; status: string;
      priority: string; updatedAt: Date;
      assignee: { id: string; name: string } | null;
      project: { id: string; name: string; key: string };
      issueTypeConfig: { id: string; name: string; systemKey: string | null; iconName: string | null; iconColor: string | null } | null;
    }>;
  };

  const cached = await getCachedJson<SprintIssuesResult>(cacheKey);
  if (cached) return cached;

  const [sprint, hoursAgg, estimatedIssueCount] = await Promise.all([
    prisma.sprint.findUnique({
      where: { id },
      include: {
        _count: { select: { issues: true } },
        issues: {
          select: {
            id: true,
            projectId: true,
            number: true,
            title: true,
            estimatedHours: true,
            issueTypeConfig: { select: { id: true, name: true, systemKey: true, iconName: true, iconColor: true } },
            status: true,
            priority: true,
            updatedAt: true,
            assignee: { select: { id: true, name: true } },
            project: { select: { id: true, name: true, key: true } },
          },
          orderBy: [{ orderIndex: 'asc' }, { createdAt: 'desc' }],
          take: 200,
        },
        project: { select: { id: true, name: true, key: true } },
        projectTeam: { select: { id: true, name: true } },
        businessTeam: { select: { id: true, name: true } },
        flowTeam: { select: { id: true, name: true } },
      },
    }),
    prisma.issue.aggregate({
      where: { sprintId: id },
      _sum: { estimatedHours: true },
    }),
    prisma.issue.count({
      where: { sprintId: id, estimatedHours: { not: null } },
    }),
  ]);

  if (!sprint) throw new AppError(404, 'Sprint not found');

  const sprintWithStats = mapSprintWithStats(sprint);
  // Override stats with accurate values from _count and aggregates (not limited by take: 200)
  const totalIssues = sprint._count.issues;
  sprintWithStats.stats.totalIssues = totalIssues;
  sprintWithStats.stats.estimatedIssues = estimatedIssueCount;
  sprintWithStats.stats.planningReadiness =
    totalIssues === 0 ? 0 : Math.round((estimatedIssueCount / totalIssues) * 100);
  sprintWithStats.stats.totalEstimatedHours = Number(hoursAgg._sum.estimatedHours ?? 0);

  const result = {
    sprint: sprintWithStats,
    issues: sprint.issues.map((issue) => ({
      ...issue,
      type: issue.issueTypeConfig?.systemKey ?? null,
    })),
  };

  await setCachedJson(cacheKey, result);
  return result;
}

/** Invalidate all sprint-related caches for a project. */
async function invalidateSprintCaches(projectId: string, sprintId?: string): Promise<void> {
  await Promise.all([
    delCacheByPrefix(`sprints:project:${projectId}:`),
    delCacheByPrefix('sprints:all:'),
    ...(sprintId ? [delCachedJson(`sprint:issues:${sprintId}`)] : []),
  ]);
}

export async function createSprint(projectId: string, dto: CreateSprintDto) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new AppError(404, 'Project not found');

  const sprint = await prisma.sprint.create({
    data: {
      projectId,
      name: dto.name,
      goal: dto.goal,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      projectTeamId: dto.projectTeamId,
      businessTeamId: dto.businessTeamId,
      flowTeamId: dto.flowTeamId,
    },
  });

  await invalidateSprintCaches(projectId);
  return sprint;
}

export async function updateSprint(id: string, dto: UpdateSprintDto) {
  const sprint = await prisma.sprint.findUnique({ where: { id } });
  if (!sprint) throw new AppError(404, 'Sprint not found');

  const updated = await prisma.sprint.update({
    where: { id },
    data: {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.goal !== undefined && { goal: dto.goal }),
      ...(dto.startDate !== undefined && { startDate: dto.startDate ? new Date(dto.startDate) : null }),
      ...(dto.endDate !== undefined && { endDate: dto.endDate ? new Date(dto.endDate) : null }),
      ...(dto.projectTeamId !== undefined && { projectTeamId: dto.projectTeamId }),
      ...(dto.businessTeamId !== undefined && { businessTeamId: dto.businessTeamId }),
      ...(dto.flowTeamId !== undefined && { flowTeamId: dto.flowTeamId }),
    },
  });

  await invalidateSprintCaches(sprint.projectId, id);
  return updated;
}

export async function startSprint(id: string) {
  const sprint = await prisma.sprint.findUnique({ where: { id } });
  if (!sprint) throw new AppError(404, 'Sprint not found');
  if (sprint.state !== 'PLANNED') throw new AppError(400, 'Only PLANNED sprints can be started');

  // Multiple active sprints per project are allowed (parallel sprints)

  const updated = await prisma.sprint.update({
    where: { id },
    data: { state: 'ACTIVE', startDate: sprint.startDate ?? new Date() },
  });

  await invalidateSprintCaches(sprint.projectId, id);
  return updated;
}

export async function closeSprint(id: string) {
  const sprint = await prisma.sprint.findUnique({ where: { id } });
  if (!sprint) throw new AppError(404, 'Sprint not found');
  if (sprint.state !== 'ACTIVE') throw new AppError(400, 'Only ACTIVE sprints can be closed');

  // Move incomplete issues back to backlog
  await prisma.issue.updateMany({
    where: { sprintId: id, status: { notIn: ['DONE', 'CANCELLED'] } },
    data: { sprintId: null },
  });

  const updated = await prisma.sprint.update({
    where: { id },
    data: { state: 'CLOSED', endDate: sprint.endDate ?? new Date() },
  });

  // Invalidate sprint caches and backlog (issues moved back to backlog)
  await Promise.all([
    invalidateSprintCaches(sprint.projectId, id),
    delCacheByPrefix(`backlog:${sprint.projectId}:`),
  ]);
  return updated;
}

export async function moveIssuesToSprint(sprintId: string | null, issueIds: string[]) {
  // Need projectId for backlog cache invalidation — fetch one of the issues
  const sample = issueIds.length > 0
    ? await prisma.issue.findUnique({ where: { id: issueIds[0] }, select: { projectId: true } })
    : null;

  await prisma.issue.updateMany({
    where: { id: { in: issueIds } },
    data: { sprintId },
  });

  if (sample) {
    await Promise.all([
      delCacheByPrefix(`backlog:${sample.projectId}:`),
      ...(sprintId ? [delCachedJson(`sprint:issues:${sprintId}`)] : []),
    ]);
  }
}

export async function getBacklog(projectId: string, pagination?: PaginationParams) {
  const p = pagination ?? { page: 1, limit: 100 };
  const { skip, take } = paginationToSkipTake(p);
  const cacheKey = `backlog:${projectId}:pg=${p.page}:lm=${p.limit}`;

  type BacklogItem = Awaited<ReturnType<typeof prisma.issue.findMany<{
    include: {
      assignee: { select: { id: true; name: true } };
      issueTypeConfig: true;
      _count: { select: { children: true } };
    };
  }>>>[number];

  const cached = await getCachedJson<ReturnType<typeof buildPaginatedResponse<BacklogItem>>>(cacheKey);
  if (cached) return cached;

  const where = { projectId, sprintId: null };
  const [items, total] = await Promise.all([
    prisma.issue.findMany({
      where,
      include: {
        assignee: { select: { id: true, name: true } },
        issueTypeConfig: true,
        _count: { select: { children: true } },
      },
      orderBy: [{ orderIndex: 'asc' }, { createdAt: 'desc' }],
      skip,
      take,
    }),
    prisma.issue.count({ where }),
  ]);

  const result = buildPaginatedResponse(items, total, p);
  await setCachedJson(cacheKey, result);
  return result;
}

interface ListAllSprintsFilters {
  state?: string;
  projectId?: string;
  teamId?: string;
}

export async function listAllSprints(filters: ListAllSprintsFilters, pagination?: PaginationParams) {
  const where: Prisma.SprintWhereInput = {};

  if (filters.state) {
    where.state = filters.state as SprintState;
  }

  if (filters.projectId) {
    where.projectId = filters.projectId;
  }

  if (filters.teamId) {
    where.OR = [
      { projectTeamId: filters.teamId },
      { businessTeamId: filters.teamId },
      { flowTeamId: filters.teamId },
    ];
  }

  const p = pagination ?? { page: 1, limit: 100 };
  const { skip, take } = paginationToSkipTake(p);
  const cacheKey =
    `sprints:all:st=${filters.state ?? ''}:pr=${filters.projectId ?? ''}` +
    `:tm=${filters.teamId ?? ''}:pg=${p.page}:lm=${p.limit}`;

  type SprintItem = ReturnType<typeof mapSprintWithStats>;
  const cached = await getCachedJson<ReturnType<typeof buildPaginatedResponse<SprintItem>>>(cacheKey);
  if (cached) return cached;

  const [sprints, total] = await Promise.all([
    prisma.sprint.findMany({
      where,
      include: {
        _count: { select: { issues: true } },
        issues: { select: { id: true, estimatedHours: true } },
        project: { select: { id: true, name: true, key: true } },
        projectTeam: { select: { id: true, name: true } },
        businessTeam: { select: { id: true, name: true } },
        flowTeam: { select: { id: true, name: true } },
      },
      orderBy: [{ state: 'asc' }, { createdAt: 'desc' }],
      skip,
      take,
    }),
    prisma.sprint.count({ where }),
  ]);

  const result = buildPaginatedResponse(sprints.map(mapSprintWithStats), total, p);
  await setCachedJson(cacheKey, result);
  return result;
}
