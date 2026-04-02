import type { Prisma, SprintState } from '@prisma/client';
import { prisma } from '../../prisma/client.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import type { CreateSprintDto, UpdateSprintDto } from './sprints.dto.js';
import { getCachedJson, setCachedJson } from '../../shared/redis.js';
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

  const sprintData = { ...sprint };
  delete (sprintData as Partial<TSprint> & SprintWithStatsSource).issues;

  return {
    ...sprintData,
    stats: {
      totalIssues,
      estimatedIssues,
      planningReadiness,
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
      estimatedHours: Prisma.Decimal | null; type: string; status: string;
      priority: string; updatedAt: Date;
      assignee: { id: string; name: string } | null;
      project: { id: string; name: string; key: string };
    }>;
  };

  const cached = await getCachedJson<SprintIssuesResult>(cacheKey);
  if (cached) return cached;

  const sprint = await prisma.sprint.findUnique({
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
          type: true,
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
  });

  if (!sprint) throw new AppError(404, 'Sprint not found');

  const result = {
    sprint: mapSprintWithStats(sprint),
    issues: sprint.issues,
  };

  await setCachedJson(cacheKey, result);
  return result;
}

export async function createSprint(projectId: string, dto: CreateSprintDto) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new AppError(404, 'Project not found');

  return prisma.sprint.create({
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
}

export async function updateSprint(id: string, dto: UpdateSprintDto) {
  const sprint = await prisma.sprint.findUnique({ where: { id } });
  if (!sprint) throw new AppError(404, 'Sprint not found');

  return prisma.sprint.update({
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
}

export async function startSprint(id: string) {
  const sprint = await prisma.sprint.findUnique({ where: { id } });
  if (!sprint) throw new AppError(404, 'Sprint not found');
  if (sprint.state !== 'PLANNED') throw new AppError(400, 'Only PLANNED sprints can be started');

  // Multiple active sprints per project are allowed (parallel sprints)

  return prisma.sprint.update({
    where: { id },
    data: { state: 'ACTIVE', startDate: sprint.startDate ?? new Date() },
  });
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

  return prisma.sprint.update({
    where: { id },
    data: { state: 'CLOSED', endDate: sprint.endDate ?? new Date() },
  });
}

export async function moveIssuesToSprint(sprintId: string | null, issueIds: string[]) {
  await prisma.issue.updateMany({
    where: { id: { in: issueIds } },
    data: { sprintId },
  });
}

export async function getBacklog(projectId: string, pagination?: PaginationParams) {
  const p = pagination ?? { page: 1, limit: 100 };
  const { skip, take } = paginationToSkipTake(p);
  const cacheKey = `backlog:${projectId}:pg=${p.page}:lm=${p.limit}`;

  type BacklogItem = Awaited<ReturnType<typeof prisma.issue.findMany<{
    include: { assignee: { select: { id: true; name: true } }; _count: { select: { children: true } } };
  }>>>[number];

  const cached = await getCachedJson<ReturnType<typeof buildPaginatedResponse<BacklogItem>>>(cacheKey);
  if (cached) return cached;

  const where = { projectId, sprintId: null };
  const [items, total] = await Promise.all([
    prisma.issue.findMany({
      where,
      include: {
        assignee: { select: { id: true, name: true } },
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
