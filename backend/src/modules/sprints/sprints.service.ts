import type { Prisma, SprintState } from '@prisma/client';
import { prisma } from '../../prisma/client.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import type { CreateSprintDto, UpdateSprintDto } from './sprints.dto.js';
import { getCachedJson, setCachedJson, delCacheByPrefix, delCachedJson, acquireLock, releaseLock } from '../../shared/redis.js';
import * as aiService from '../ai/ai.service.js';
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
    ...(sprintId ? [
      delCachedJson(`sprint:issues:${sprintId}`),
      delCachedJson(`sprint:burndown:${sprintId}`),
    ] : []),
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

/**
 * Move a batch of issues to a sprint (or to backlog when sprintId is null).
 *
 * TTSEC-2 hardening (AI review #65): `expectedProjectId` forces all issue ids to belong to the
 * caller-approved project. Without it a user authorised to edit sprints in project A could pass
 * issueIds from project B and touch them. Routes that have a clear "target project" — the sprint
 * owner, or the backlog's projectId — MUST supply it.
 */
export async function moveIssuesToSprint(
  sprintId: string | null,
  issueIds: string[],
  expectedProjectId?: string,
) {
  const affectedIssues = issueIds.length > 0
    ? await prisma.issue.findMany({ where: { id: { in: issueIds } }, select: { id: true, projectId: true } })
    : [];

  if (expectedProjectId) {
    if (affectedIssues.length !== issueIds.length) {
      throw new AppError(400, 'Некоторые задачи не найдены');
    }
    const foreign = affectedIssues.filter(i => i.projectId !== expectedProjectId);
    if (foreign.length > 0) {
      throw new AppError(403, 'Задачи принадлежат другому проекту');
    }
  }

  const projectIds = [...new Set(affectedIssues.map((i) => i.projectId))];

  await prisma.issue.updateMany({
    where: { id: { in: issueIds } },
    data: { sprintId },
  });

  await Promise.all([
    ...projectIds.map((pid) => delCacheByPrefix(`backlog:${pid}:`)),
    ...(sprintId ? [delCachedJson(`sprint:issues:${sprintId}`)] : []),
  ]);
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

export type BulkEstimateResult = {
  total: number;
  estimated: number;
  failed: number;
  results: Array<{ issueId: string; estimatedHours?: number; error?: string }>;
};

export async function bulkEstimateIssues(sprintId: string): Promise<BulkEstimateResult> {
  const sprint = await prisma.sprint.findUnique({
    where: { id: sprintId },
    select: { id: true, projectId: true },
  });
  if (!sprint) throw new AppError(404, 'Sprint not found');

  const lockKey = `lock:estimate-all:${sprintId}`;
  const lockToken = await acquireLock(lockKey, 900);
  if (!lockToken) throw new AppError(409, 'Estimation already in progress for this sprint');

  try {
    const issues = await prisma.issue.findMany({
      where: { sprintId },
      select: { id: true },
    });

    const results: BulkEstimateResult['results'] = [];

    for (const issue of issues) {
      try {
        const result = await aiService.estimateIssue({ issueId: issue.id });
        results.push({ issueId: issue.id, estimatedHours: result.estimatedHours });
      } catch (err) {
        console.error('estimate-all issue error:', { sprintId, issueId: issue.id, err });
        const errorType = err instanceof AppError ? err.message : 'Internal error';
        results.push({ issueId: issue.id, error: `Failed: ${errorType}` });
      }
    }

    await invalidateSprintCaches(sprint.projectId, sprintId);

    return {
      total: issues.length,
      estimated: results.filter(r => !r.error).length,
      failed: results.filter(r => !!r.error).length,
      results,
    };
  } finally {
    await releaseLock(lockKey, lockToken);
  }
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

export type BurndownPoint = { date: string; value: number };

export type SprintBurndownResult = {
  sprintId: string;
  totalIssues: number;
  series: BurndownPoint[];
  idealLine: BurndownPoint[];
};

export async function getSprintBurndown(id: string): Promise<SprintBurndownResult> {
  const cacheKey = `sprint:burndown:${id}`;
  const cached = await getCachedJson<SprintBurndownResult>(cacheKey);
  if (cached) return cached;

  const sprint = await prisma.sprint.findUnique({
    where: { id },
    include: {
      issues: {
        select: { id: true, status: true, updatedAt: true },
      },
    },
  });
  if (!sprint) {
    throw new AppError(404, 'Sprint not found');
  }

  const { startDate, endDate, issues } = sprint;
  const empty: SprintBurndownResult = { sprintId: id, totalIssues: issues.length, series: [], idealLine: [] };

  if (!startDate || !endDate) return empty;

  const start = new Date(startDate);
  const end = new Date(endDate);
  const today = new Date();
  const chartEnd = today < end ? today : end;

  const doneStatuses = new Set(['DONE', 'CANCELLED']);
  const completedByDate = new Map<string, Date>();

  const doneIssueIds = issues.filter(i => doneStatuses.has(i.status)).map(i => i.id);
  if (doneIssueIds.length > 0) {
    const logs = await prisma.auditLog.findMany({
      where: {
        entityType: 'issue',
        entityId: { in: doneIssueIds },
        action: 'issue.status_changed',
        createdAt: { gte: start },
      },
      orderBy: { createdAt: 'asc' },
      select: { entityId: true, createdAt: true, details: true },
    });

    for (const log of logs) {
      if (!completedByDate.has(log.entityId)) {
        const details = log.details as Record<string, unknown> | null;
        const newStatus = details?.status as string | undefined;
        if (newStatus && doneStatuses.has(newStatus)) {
          completedByDate.set(log.entityId, log.createdAt);
        }
      }
    }

    // Issues with no audit log entry (pre-logging data) are excluded from
    // completedByDate so they don't corrupt the historical series with updatedAt noise.
  }

  const series: BurndownPoint[] = [];
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const chartEndDay = new Date(chartEnd);
  chartEndDay.setHours(23, 59, 59, 999);

  while (cur <= chartEndDay) {
    const dayEnd = new Date(cur);
    dayEnd.setHours(23, 59, 59, 999);
    const doneCount = [...completedByDate.values()].filter(d => d <= dayEnd).length;
    series.push({
      date: cur.toISOString().slice(0, 10),
      value: issues.length - doneCount,
    });
    cur.setDate(cur.getDate() + 1);
  }

  const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));
  const idealLine: BurndownPoint[] = [];
  const idealCur = new Date(start);
  idealCur.setHours(0, 0, 0, 0);
  const idealEnd = new Date(end);
  idealEnd.setHours(0, 0, 0, 0);

  let dayIdx = 0;
  while (idealCur <= idealEnd) {
    const remaining = Math.round(issues.length * (1 - dayIdx / totalDays));
    idealLine.push({ date: idealCur.toISOString().slice(0, 10), value: Math.max(0, remaining) });
    idealCur.setDate(idealCur.getDate() + 1);
    dayIdx++;
  }

  const result: SprintBurndownResult = { sprintId: id, totalIssues: issues.length, series, idealLine };
  await setCachedJson(cacheKey, result, 60);
  return result;
}
