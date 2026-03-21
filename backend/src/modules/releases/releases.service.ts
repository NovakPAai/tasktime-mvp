import { prisma } from '../../prisma/client.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import type { CreateReleaseDto, UpdateReleaseDto } from './releases.dto.js';

export async function listReleases(projectId: string) {
  return prisma.release.findMany({
    where: { projectId },
    include: {
      _count: { select: { issues: true, sprints: true } },
      project: { select: { id: true, name: true, key: true } },
    },
    orderBy: [{ state: 'asc' }, { createdAt: 'desc' }],
  });
}

export async function getReleaseWithIssues(id: string) {
  const release = await prisma.release.findUnique({
    where: { id },
    include: {
      _count: { select: { issues: true, sprints: true } },
      issues: {
        select: {
          id: true,
          projectId: true,
          number: true,
          title: true,
          type: true,
          status: true,
          priority: true,
          updatedAt: true,
          assignee: { select: { id: true, name: true } },
          project: { select: { id: true, name: true, key: true } },
        },
        orderBy: [{ orderIndex: 'asc' }, { createdAt: 'desc' }],
      },
      sprints: {
        select: {
          id: true,
          name: true,
          state: true,
          startDate: true,
          endDate: true,
          _count: { select: { issues: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
      project: { select: { id: true, name: true, key: true } },
    },
  });

  if (!release) throw new AppError(404, 'Release not found');
  return release;
}

export async function getReleaseSprints(id: string) {
  const release = await prisma.release.findUnique({ where: { id } });
  if (!release) throw new AppError(404, 'Release not found');

  return prisma.sprint.findMany({
    where: { releaseId: id },
    include: {
      _count: { select: { issues: true } },
      issues: {
        select: { id: true, status: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
}

export async function createRelease(projectId: string, dto: CreateReleaseDto) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new AppError(404, 'Project not found');

  const existing = await prisma.release.findUnique({
    where: { projectId_name: { projectId, name: dto.name } },
  });
  if (existing) throw new AppError(409, 'Release with this name already exists');

  return prisma.release.create({
    data: {
      projectId,
      name: dto.name,
      description: dto.description,
      level: dto.level,
    },
  });
}

export async function updateRelease(id: string, dto: UpdateReleaseDto) {
  const release = await prisma.release.findUnique({ where: { id } });
  if (!release) throw new AppError(404, 'Release not found');

  if (dto.name !== undefined && dto.name !== release.name) {
    const existing = await prisma.release.findUnique({
      where: { projectId_name: { projectId: release.projectId, name: dto.name } },
    });
    if (existing) throw new AppError(409, 'Release with this name already exists');
  }

  return prisma.release.update({
    where: { id },
    data: {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.level !== undefined && { level: dto.level }),
      ...(dto.state !== undefined && { state: dto.state }),
      ...(dto.releaseDate !== undefined && {
        releaseDate: dto.releaseDate ? new Date(dto.releaseDate) : null,
      }),
    },
  });
}

export async function addSprintsToRelease(releaseId: string, sprintIds: string[]) {
  const release = await prisma.release.findUnique({ where: { id: releaseId } });
  if (!release) throw new AppError(404, 'Release not found');
  if (release.state === 'RELEASED') throw new AppError(400, 'Cannot modify a released release');

  // Check sprints exist in same project and are not already in another release
  const sprints = await prisma.sprint.findMany({
    where: { id: { in: sprintIds } },
    select: { id: true, name: true, projectId: true, releaseId: true },
  });

  if (sprints.length !== sprintIds.length) {
    throw new AppError(404, 'One or more sprints not found');
  }

  for (const sprint of sprints) {
    if (sprint.projectId !== release.projectId) {
      throw new AppError(400, `Sprint "${sprint.name}" belongs to a different project`);
    }
    if (sprint.releaseId && sprint.releaseId !== releaseId) {
      throw new AppError(400, `Sprint "${sprint.name}" is already assigned to another release`);
    }
  }

  await prisma.sprint.updateMany({
    where: { id: { in: sprintIds } },
    data: { releaseId },
  });
}

export async function removeSprintsFromRelease(releaseId: string, sprintIds: string[]) {
  const release = await prisma.release.findUnique({ where: { id: releaseId } });
  if (!release) throw new AppError(404, 'Release not found');
  if (release.state === 'RELEASED') throw new AppError(400, 'Cannot modify a released release');

  await prisma.sprint.updateMany({
    where: { id: { in: sprintIds }, releaseId },
    data: { releaseId: null },
  });
}

export async function addIssuesToRelease(releaseId: string, issueIds: string[]) {
  const release = await prisma.release.findUnique({ where: { id: releaseId } });
  if (!release) throw new AppError(404, 'Release not found');
  if (release.state === 'RELEASED') throw new AppError(400, 'Cannot add issues to a released release');

  await prisma.issue.updateMany({
    where: { id: { in: issueIds }, projectId: release.projectId },
    data: { releaseId },
  });
}

export async function removeIssuesFromRelease(releaseId: string, issueIds: string[]) {
  await prisma.issue.updateMany({
    where: { id: { in: issueIds }, releaseId },
    data: { releaseId: null },
  });
}

export async function markReleaseReady(id: string) {
  const release = await prisma.release.findUnique({ where: { id } });
  if (!release) throw new AppError(404, 'Release not found');
  if (release.state !== 'DRAFT') throw new AppError(400, 'Only DRAFT releases can be marked READY');

  // Guard: must have at least one sprint with at least one issue
  const sprintCount = await prisma.sprint.count({ where: { releaseId: id } });
  if (sprintCount === 0) {
    throw new AppError(400, 'Release must have at least one sprint before marking ready');
  }

  const issueInSprintCount = await prisma.issue.count({
    where: { sprint: { releaseId: id } },
  });
  if (issueInSprintCount === 0) {
    throw new AppError(400, 'Release sprints must contain at least one issue before marking ready');
  }

  return prisma.release.update({
    where: { id },
    data: { state: 'READY' },
  });
}

export async function markReleaseReleased(id: string, releaseDate?: string) {
  const release = await prisma.release.findUnique({ where: { id } });
  if (!release) throw new AppError(404, 'Release not found');
  if (release.state === 'RELEASED') throw new AppError(400, 'Release is already released');

  // Guard: all sprints must be CLOSED
  const openSprintCount = await prisma.sprint.count({
    where: { releaseId: id, state: { not: 'CLOSED' } },
  });
  if (openSprintCount > 0) {
    throw new AppError(
      400,
      `Cannot release: ${openSprintCount} sprint(s) are not closed yet`,
    );
  }

  // Guard: all issues in release sprints must be DONE or CANCELLED
  const openIssueCount = await prisma.issue.count({
    where: {
      sprint: { releaseId: id },
      status: { notIn: ['DONE', 'CANCELLED'] },
    },
  });
  if (openIssueCount > 0) {
    throw new AppError(
      400,
      `Cannot release: ${openIssueCount} issue(s) in release sprints are not done`,
    );
  }

  return prisma.release.update({
    where: { id },
    data: {
      state: 'RELEASED',
      releaseDate: releaseDate ? new Date(releaseDate) : new Date(),
    },
  });
}

export async function getReleaseReadiness(id: string) {
  const release = await prisma.release.findUnique({ where: { id } });
  if (!release) throw new AppError(404, 'Release not found');

  const [totalSprints, closedSprints, totalIssues, doneIssues] = await Promise.all([
    prisma.sprint.count({ where: { releaseId: id } }),
    prisma.sprint.count({ where: { releaseId: id, state: 'CLOSED' } }),
    prisma.issue.count({ where: { sprint: { releaseId: id } } }),
    prisma.issue.count({
      where: { sprint: { releaseId: id }, status: { in: ['DONE', 'CANCELLED'] } },
    }),
  ]);

  const canMarkReady = totalSprints > 0 && totalIssues > 0;
  const canRelease = totalSprints > 0 && totalSprints === closedSprints && totalIssues === doneIssues;

  return {
    totalSprints,
    closedSprints,
    totalIssues,
    doneIssues,
    canMarkReady,
    canRelease,
  };
}
