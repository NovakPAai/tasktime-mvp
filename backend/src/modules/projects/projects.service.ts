import { prisma } from '../../prisma/client.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import { getCachedJson, setCachedJson } from '../../shared/redis.js';
import { hasGlobalProjectReadAccess } from '../../shared/auth/roles.js';
import type { SystemRoleType } from '@prisma/client';
import type { CreateProjectDto, UpdateProjectDto } from './projects.dto.js';

const projectInclude = {
  _count: { select: { issues: true } },
  owner: { select: { id: true, name: true, email: true } },
  category: { select: { id: true, name: true } },
} as const;

export async function listProjects() {
  return prisma.project.findMany({
    include: projectInclude,
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
}

export async function listProjectsForUser(userId: string, systemRoles: SystemRoleType[]) {
  if (hasGlobalProjectReadAccess(systemRoles)) {
    return listProjects();
  }

  const memberships = await prisma.userProjectRole.findMany({
    where: { userId },
    select: { projectId: true },
  });

  const projectIds = [...new Set(memberships.map((m) => m.projectId))];

  return prisma.project.findMany({
    where: { id: { in: projectIds } },
    include: projectInclude,
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
}

export async function checkProjectAccess(projectId: string, userId: string, systemRoles: SystemRoleType[]) {
  if (hasGlobalProjectReadAccess(systemRoles)) return;

  const membership = await prisma.userProjectRole.findFirst({
    where: { userId, projectId },
  });
  if (!membership) throw new AppError(403, 'You do not have access to this project');
}

export async function getProject(id: string) {
  const project = await prisma.project.findUnique({
    where: { id },
    include: projectInclude,
  });
  if (!project) throw new AppError(404, 'Project not found');
  return project;
}

export async function createProject(dto: CreateProjectDto) {
  const existing = await prisma.project.findUnique({ where: { key: dto.key } });
  if (existing) throw new AppError(409, 'Project key already exists');

  return prisma.project.create({ data: dto, include: projectInclude });
}

export async function updateProject(id: string, dto: UpdateProjectDto) {
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) throw new AppError(404, 'Project not found');

  return prisma.project.update({ where: { id }, data: dto, include: projectInclude });
}

export async function deleteProject(id: string) {
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) throw new AppError(404, 'Project not found');

  await prisma.project.delete({ where: { id } });
}

async function fetchProjectsForUser(userId: string, systemRoles: SystemRoleType[]) {
  if (hasGlobalProjectReadAccess(systemRoles)) {
    return prisma.project.findMany({
      include: projectInclude,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }
  const memberships = await prisma.userProjectRole.findMany({
    where: { userId },
    select: { projectId: true },
  });
  const projectIds = [...new Set(memberships.map((m) => m.projectId))];
  return prisma.project.findMany({
    where: { id: { in: projectIds } },
    include: projectInclude,
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
}

export async function listProjectsWithDashboardsForUser(userId: string, systemRoles: SystemRoleType[]) {
  const projects = await fetchProjectsForUser(userId, systemRoles);

  if (projects.length === 0) return [];

  const projectIds = projects.map((p) => p.id);

  const [totalCounts, doneCounts, activeSprints] = await Promise.all([
    prisma.issue.groupBy({
      by: ['projectId'],
      _count: { _all: true },
      where: { projectId: { in: projectIds } },
    }),
    prisma.issue.groupBy({
      by: ['projectId'],
      _count: { _all: true },
      where: { projectId: { in: projectIds }, status: 'DONE' },
    }),
    prisma.sprint.findMany({
      where: { projectId: { in: projectIds }, state: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        state: true,
        projectId: true,
        _count: { select: { issues: true } },
      },
    }),
  ]);

  const activeSprintIds = activeSprints.map((s) => s.id);
  const doneInSprints =
    activeSprintIds.length > 0
      ? await prisma.issue.groupBy({
          by: ['sprintId'],
          _count: { _all: true },
          where: { sprintId: { in: activeSprintIds }, status: 'DONE' },
        })
      : [];

  const totalByProject: Record<string, number> = Object.fromEntries(
    totalCounts.map((r) => [r.projectId, r._count._all]),
  );
  const doneByProject: Record<string, number> = Object.fromEntries(
    doneCounts.map((r) => [r.projectId, r._count._all]),
  );
  const sprintByProject: Record<string, (typeof activeSprints)[number]> = Object.fromEntries(
    activeSprints.map((s) => [s.projectId, s]),
  );
  const doneBySprintId: Record<string, number> = Object.fromEntries(
    doneInSprints.map((r) => [r.sprintId as string, r._count._all]),
  );

  return projects.map((project) => {
    const sprint = sprintByProject[project.id];
    return {
      ...project,
      dashboard: {
        totals: {
          totalIssues: totalByProject[project.id] ?? 0,
          doneIssues: doneByProject[project.id] ?? 0,
        },
        activeSprint: sprint
          ? {
              id: sprint.id,
              name: sprint.name,
              state: sprint.state,
              totalIssues: sprint._count.issues,
              doneIssues: doneBySprintId[sprint.id] ?? 0,
            }
          : null,
      },
    };
  });
}

export async function getProjectDashboard(projectId: string) {
  const cacheKey = `project:dashboard:${projectId}`;
  const cached = await getCachedJson<{
    project: { id: string; name: string; key: string };
    issuesByStatus: unknown[];
    issuesByType: unknown[];
    issuesByPriority: unknown[];
    totals: { totalIssues: number; doneIssues: number };
    activeSprint: {
      id: string;
      name: string;
      state: string;
      totalIssues: number;
      doneIssues: number;
    } | null;
  }>(cacheKey);

  if (cached) {
    return cached;
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new AppError(404, 'Project not found');

  const [issuesByStatus, issuesByType, issuesByPriority, activeSprint, totalIssues, doneIssues] =
    await Promise.all([
      prisma.issue.groupBy({
        by: ['status'],
        _count: { _all: true },
        where: { projectId },
      }),
      prisma.issue.groupBy({
        by: ['issueTypeConfigId'],
        _count: { _all: true },
        where: { projectId },
      }),
      prisma.issue.groupBy({
        by: ['priority'],
        _count: { _all: true },
        where: { projectId },
      }),
      prisma.sprint.findFirst({
        where: { projectId, state: 'ACTIVE' },
        select: {
          id: true,
          name: true,
          state: true,
          _count: { select: { issues: true } },
        },
      }),
      prisma.issue.count({ where: { projectId } }),
      prisma.issue.count({ where: { projectId, status: 'DONE' } }),
    ]);

  let activeSprintSummary: {
    id: string;
    name: string;
    state: string;
    totalIssues: number;
    doneIssues: number;
  } | null = null;

  if (activeSprint) {
    const doneInSprint = await prisma.issue.count({
      where: { sprintId: activeSprint.id, status: 'DONE' },
    });
    activeSprintSummary = {
      id: activeSprint.id,
      name: activeSprint.name,
      state: activeSprint.state,
      totalIssues: activeSprint._count.issues,
      doneIssues: doneInSprint,
    };
  }

  const dashboard = {
    project: {
      id: project.id,
      name: project.name,
      key: project.key,
    },
    issuesByStatus,
    issuesByType,
    issuesByPriority,
    totals: {
      totalIssues,
      doneIssues,
    },
    activeSprint: activeSprintSummary,
  };

  await setCachedJson(cacheKey, dashboard);

  return dashboard;
}
