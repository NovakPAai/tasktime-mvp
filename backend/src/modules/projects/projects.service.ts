import { prisma } from '../../prisma/client.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import { getCachedJson, setCachedJson } from '../../shared/redis.js';
import type { CreateProjectDto, UpdateProjectDto } from './projects.dto.js';

export async function listProjects() {
  return prisma.project.findMany({
    include: { _count: { select: { issues: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getProject(id: string) {
  const project = await prisma.project.findUnique({
    where: { id },
    include: { _count: { select: { issues: true } } },
  });
  if (!project) throw new AppError(404, 'Project not found');
  return project;
}

export async function createProject(dto: CreateProjectDto) {
  const existing = await prisma.project.findUnique({ where: { key: dto.key } });
  if (existing) throw new AppError(409, 'Project key already exists');

  return prisma.project.create({ data: dto });
}

export async function updateProject(id: string, dto: UpdateProjectDto) {
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) throw new AppError(404, 'Project not found');

  return prisma.project.update({ where: { id }, data: dto });
}

export async function deleteProject(id: string) {
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) throw new AppError(404, 'Project not found');

  await prisma.project.delete({ where: { id } });
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
        by: ['type'],
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
        include: {
          _count: { select: { issues: true } },
          issues: {
            select: { status: true },
          },
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
    const doneInSprint = activeSprint.issues.filter((i) => i.status === 'DONE').length;
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
