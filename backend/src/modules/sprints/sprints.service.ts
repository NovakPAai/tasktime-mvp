import { prisma } from '../../prisma/client.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import type { CreateSprintDto, UpdateSprintDto } from './sprints.dto.js';

export async function listSprints(projectId: string) {
  return prisma.sprint.findMany({
    where: { projectId },
    include: { _count: { select: { issues: true } } },
    orderBy: { createdAt: 'desc' },
  });
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
    },
  });
}

export async function startSprint(id: string) {
  const sprint = await prisma.sprint.findUnique({ where: { id } });
  if (!sprint) throw new AppError(404, 'Sprint not found');
  if (sprint.state !== 'PLANNED') throw new AppError(400, 'Only PLANNED sprints can be started');

  // Only one active sprint per project
  const active = await prisma.sprint.findFirst({
    where: { projectId: sprint.projectId, state: 'ACTIVE' },
  });
  if (active) throw new AppError(400, `Sprint "${active.name}" is already active`);

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

export async function getBacklog(projectId: string) {
  return prisma.issue.findMany({
    where: { projectId, sprintId: null },
    include: {
      assignee: { select: { id: true, name: true } },
      _count: { select: { children: true } },
    },
    orderBy: [{ orderIndex: 'asc' }, { createdAt: 'desc' }],
  });
}
