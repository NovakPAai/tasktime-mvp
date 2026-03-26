import { prisma } from '../../prisma/client.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import type { CreateWorkflowStatusDto, UpdateWorkflowStatusDto } from './workflow-statuses.dto.js';

export async function listWorkflowStatuses() {
  return prisma.workflowStatus.findMany({
    orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
    include: {
      _count: { select: { workflowSteps: true, issues: true } },
    },
  });
}

export async function getWorkflowStatus(id: string) {
  const status = await prisma.workflowStatus.findUnique({ where: { id } });
  if (!status) throw new AppError(404, 'Workflow status not found');
  return status;
}

export async function createWorkflowStatus(dto: CreateWorkflowStatusDto) {
  return prisma.workflowStatus.create({
    data: {
      name: dto.name,
      description: dto.description,
      category: dto.category,
      color: dto.color ?? '#9E9E9E',
      iconName: dto.iconName,
    },
  });
}

export async function updateWorkflowStatus(id: string, dto: UpdateWorkflowStatusDto) {
  const status = await prisma.workflowStatus.findUnique({ where: { id } });
  if (!status) throw new AppError(404, 'Workflow status not found');
  if (status.isSystem) throw new AppError(400, 'SYSTEM_STATUS_IMMUTABLE');

  return prisma.workflowStatus.update({
    where: { id },
    data: {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.category !== undefined && { category: dto.category }),
      ...(dto.color !== undefined && { color: dto.color }),
      ...(dto.iconName !== undefined && { iconName: dto.iconName }),
    },
  });
}

export async function deleteWorkflowStatus(id: string) {
  const status = await prisma.workflowStatus.findUnique({ where: { id } });
  if (!status) throw new AppError(404, 'Workflow status not found');
  if (status.isSystem) throw new AppError(400, 'SYSTEM_STATUS_IMMUTABLE');

  const inUse = await prisma.workflowStep.count({ where: { statusId: id } });
  if (inUse > 0) throw new AppError(400, 'STATUS_IN_USE');

  await prisma.workflowStatus.delete({ where: { id } });
  return { ok: true };
}
