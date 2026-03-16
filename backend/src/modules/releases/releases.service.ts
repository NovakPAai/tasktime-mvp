import { prisma } from '../../prisma/client.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import type { CreateReleaseDto, UpdateReleaseDto } from './releases.dto.js';

export async function listReleases(projectId: string) {
  return prisma.release.findMany({
    where: { projectId },
    include: {
      _count: { select: { issues: true } },
      project: { select: { id: true, name: true, key: true } },
    },
    orderBy: [{ state: 'asc' }, { createdAt: 'desc' }],
  });
}

export async function getReleaseWithIssues(id: string) {
  const release = await prisma.release.findUnique({
    where: { id },
    include: {
      _count: { select: { issues: true } },
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
      project: { select: { id: true, name: true, key: true } },
    },
  });

  if (!release) throw new AppError(404, 'Release not found');
  return release;
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

  return prisma.release.update({
    where: { id },
    data: { state: 'READY' },
  });
}

export async function markReleaseReleased(id: string, releaseDate?: string) {
  const release = await prisma.release.findUnique({ where: { id } });
  if (!release) throw new AppError(404, 'Release not found');
  if (release.state === 'RELEASED') throw new AppError(400, 'Release is already released');

  return prisma.release.update({
    where: { id },
    data: {
      state: 'RELEASED',
      releaseDate: releaseDate ? new Date(releaseDate) : new Date(),
    },
  });
}
