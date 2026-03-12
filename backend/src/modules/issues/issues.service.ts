import type { IssueType } from '@prisma/client';
import { prisma } from '../../prisma/client.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import type { CreateIssueDto, UpdateIssueDto, UpdateStatusDto, AssignDto } from './issues.dto.js';

// Which types can be children (and their allowed parent types)
const ALLOWED_PARENTS: Record<IssueType, IssueType[]> = {
  EPIC: [], // top-level only
  STORY: ['EPIC'],
  TASK: ['EPIC', 'STORY'],
  SUBTASK: ['STORY', 'TASK'],
  BUG: ['EPIC', 'STORY'],
};

async function validateHierarchy(type: IssueType, parentId?: string | null) {
  if (!parentId) {
    if (ALLOWED_PARENTS[type].length > 0 && type === 'SUBTASK') {
      throw new AppError(400, 'SUBTASK must have a parent');
    }
    return;
  }

  const parent = await prisma.issue.findUnique({ where: { id: parentId } });
  if (!parent) throw new AppError(404, 'Parent issue not found');

  const allowedParents = ALLOWED_PARENTS[type];
  if (allowedParents.length === 0) {
    throw new AppError(400, `${type} cannot have a parent`);
  }
  if (!allowedParents.includes(parent.type)) {
    throw new AppError(400, `${type} cannot be a child of ${parent.type}`);
  }
}

async function getNextNumber(projectId: string): Promise<number> {
  const last = await prisma.issue.findFirst({
    where: { projectId },
    orderBy: { number: 'desc' },
    select: { number: true },
  });
  return (last?.number ?? 0) + 1;
}

type ListIssuesFilters = {
  status?: string[];
  type?: string[];
  priority?: string[];
  assigneeId?: string;
  sprintId?: string;
  from?: string;
  to?: string;
  search?: string;
};

export async function listIssues(projectId: string, filters?: ListIssuesFilters) {
  const where: Record<string, unknown> = { projectId };

  if (filters?.status && filters.status.length > 0) {
    where.status = { in: filters.status };
  }
  if (filters?.type && filters.type.length > 0) {
    where.type = { in: filters.type };
  }
  if (filters?.priority && filters.priority.length > 0) {
    where.priority = { in: filters.priority };
  }
  if (filters?.assigneeId) {
    where.assigneeId = filters.assigneeId === 'UNASSIGNED' ? null : filters.assigneeId;
  }
  if (filters?.sprintId) {
    where.sprintId = filters.sprintId === 'BACKLOG' ? null : filters.sprintId;
  }
  if (filters?.from || filters?.to) {
    where.createdAt = {};
    if (filters.from) {
      where.createdAt.gte = new Date(filters.from);
    }
    if (filters.to) {
      where.createdAt.lte = new Date(filters.to);
    }
  }
  if (filters?.search) {
    where.OR = [
      { title: { contains: filters.search, mode: 'insensitive' } },
      { description: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  return prisma.issue.findMany({
    where,
    include: {
      assignee: { select: { id: true, name: true, email: true } },
      creator: { select: { id: true, name: true } },
      _count: { select: { children: true } },
    },
    orderBy: [{ orderIndex: 'asc' }, { createdAt: 'desc' }],
  });
}

export async function bulkUpdateIssues(projectId: string, params: {
  issueIds: string[];
  status?: string;
  assigneeId?: string | null;
}) {
  if (!params.status && params.assigneeId === undefined) {
    throw new AppError(400, 'No bulk update fields provided');
  }

  const issues = await prisma.issue.findMany({
    where: { id: { in: params.issueIds }, projectId },
    select: { id: true },
  });

  if (issues.length !== params.issueIds.length) {
    throw new AppError(400, 'Some issues not found in this project');
  }

  if (params.assigneeId) {
    const user = await prisma.user.findUnique({ where: { id: params.assigneeId } });
    if (!user) {
      throw new AppError(404, 'Assignee not found');
    }
  }

  const data: Record<string, unknown> = {};
  if (params.status) data.status = params.status;
  if (params.assigneeId !== undefined) data.assigneeId = params.assigneeId;

  await prisma.issue.updateMany({
    where: { id: { in: params.issueIds } },
    data,
  });

  return { updatedCount: params.issueIds.length };
}

export async function getIssue(id: string) {
  const issue = await prisma.issue.findUnique({
    where: { id },
    include: {
      assignee: { select: { id: true, name: true, email: true } },
      creator: { select: { id: true, name: true } },
      parent: { select: { id: true, title: true, type: true, number: true, projectId: true } },
      children: {
        select: { id: true, title: true, type: true, status: true, number: true, assignee: { select: { id: true, name: true } } },
        orderBy: { orderIndex: 'asc' },
      },
      project: { select: { id: true, name: true, key: true } },
    },
  });
  if (!issue) throw new AppError(404, 'Issue not found');
  return issue;
}

export async function createIssue(projectId: string, creatorId: string, dto: CreateIssueDto) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new AppError(404, 'Project not found');

  await validateHierarchy(dto.type, dto.parentId);

  if (dto.parentId) {
    const parent = await prisma.issue.findUnique({ where: { id: dto.parentId } });
    if (parent && parent.projectId !== projectId) {
      throw new AppError(400, 'Parent issue must be in the same project');
    }
  }

  const number = await getNextNumber(projectId);

  return prisma.issue.create({
    data: {
      projectId,
      number,
      title: dto.title,
      description: dto.description,
      type: dto.type,
      priority: dto.priority,
      parentId: dto.parentId,
      assigneeId: dto.assigneeId,
      creatorId,
    },
    include: {
      assignee: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true } },
      project: { select: { key: true } },
    },
  });
}

export async function updateIssue(id: string, dto: UpdateIssueDto) {
  const issue = await prisma.issue.findUnique({ where: { id } });
  if (!issue) throw new AppError(404, 'Issue not found');

  if (dto.parentId !== undefined) {
    await validateHierarchy(issue.type, dto.parentId);
  }

  return prisma.issue.update({
    where: { id },
    data: dto,
    include: {
      assignee: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true } },
    },
  });
}

export async function updateStatus(id: string, dto: UpdateStatusDto) {
  const issue = await prisma.issue.findUnique({ where: { id } });
  if (!issue) throw new AppError(404, 'Issue not found');

  return prisma.issue.update({
    where: { id },
    data: { status: dto.status },
  });
}

export async function assignIssue(id: string, dto: AssignDto) {
  const issue = await prisma.issue.findUnique({ where: { id } });
  if (!issue) throw new AppError(404, 'Issue not found');

  if (dto.assigneeId) {
    const user = await prisma.user.findUnique({ where: { id: dto.assigneeId } });
    if (!user) throw new AppError(404, 'Assignee not found');
  }

  return prisma.issue.update({
    where: { id },
    data: { assigneeId: dto.assigneeId },
    include: { assignee: { select: { id: true, name: true } } },
  });
}

export async function deleteIssue(id: string) {
  const issue = await prisma.issue.findUnique({ where: { id } });
  if (!issue) throw new AppError(404, 'Issue not found');

  await prisma.issue.delete({ where: { id } });
}

export async function getHistory(id: string) {
  const issue = await prisma.issue.findUnique({ where: { id } });
  if (!issue) throw new AppError(404, 'Issue not found');

  return prisma.auditLog.findMany({
    where: { entityType: 'issue', entityId: id },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}

export async function getChildren(id: string) {
  const issue = await prisma.issue.findUnique({ where: { id } });
  if (!issue) throw new AppError(404, 'Issue not found');

  return prisma.issue.findMany({
    where: { parentId: id },
    include: {
      assignee: { select: { id: true, name: true } },
      _count: { select: { children: true } },
    },
    orderBy: { orderIndex: 'asc' },
  });
}
