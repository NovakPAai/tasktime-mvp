import type {
  IssuePriority,
  IssueStatus,
  IssueType,
  Prisma,
  AiAssigneeType,
} from '@prisma/client';
import { prisma } from '../../prisma/client.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import type {
  CreateIssueDto,
  UpdateIssueDto,
  UpdateStatusDto,
  AssignDto,
  UpdateAiFlagsDto,
  UpdateAiStatusDto,
} from './issues.dto.js';

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
  const parentType = parent.type as IssueType | null;
  if (!parentType || !allowedParents.includes(parentType)) {
    throw new AppError(400, `${type} cannot be a child of ${parentType ?? 'custom type'}`);
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
  status?: IssueStatus[];
  type?: IssueType[];
  priority?: IssuePriority[];
  assigneeId?: string;
  sprintId?: string;
  from?: string;
  to?: string;
  search?: string;
};

export async function listIssues(projectId: string, filters?: ListIssuesFilters) {
  const where: Prisma.IssueWhereInput = { projectId };

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
    const createdAt: Prisma.DateTimeFilter = {};
    if (filters.from) createdAt.gte = new Date(filters.from);
    if (filters.to) createdAt.lte = new Date(filters.to);
    where.createdAt = createdAt;
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

export async function searchIssuesGlobal(q: string, excludeId?: string) {
  const where: Prisma.IssueWhereInput = {};

  if (excludeId) {
    where.id = { not: excludeId };
  }

  const keyNumberMatch = q.match(/^([A-Za-z]+)-(\d+)$/);
  if (keyNumberMatch) {
    const [, keyPart, numberPart] = keyNumberMatch;
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      {
        project: { key: { equals: keyPart.toUpperCase() } },
        number: parseInt(numberPart, 10),
      },
    ];
  } else {
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { project: { key: { startsWith: q.toUpperCase() } } },
    ];
  }

  return prisma.issue.findMany({
    where,
    select: {
      id: true,
      number: true,
      title: true,
      type: true,
      status: true,
      project: { select: { key: true } },
    },
    take: 20,
    orderBy: [{ project: { key: 'asc' } }, { number: 'asc' }],
  });
}

type MvpLivecodeFilters = {
  onlyAiEligible?: boolean;
  assigneeType?: AiAssigneeType | 'ALL';
};

export async function listActiveIssuesForMvpLivecode(filters?: MvpLivecodeFilters) {
  const project = await prisma.project.findUnique({ where: { key: 'LIVE' } });
  if (!project) {
    throw new AppError(404, 'MVP LiveCode project (LIVE) not found');
  }

  const where: Prisma.IssueWhereInput = {
    projectId: project.id,
    status: { in: ['OPEN', 'IN_PROGRESS', 'REVIEW'] },
  };

  if (filters?.onlyAiEligible) {
    where.aiEligible = true;
  }

  if (filters?.assigneeType && filters.assigneeType !== 'ALL') {
    where.aiAssigneeType = filters.assigneeType;
  }

  return prisma.issue.findMany({
    where,
    include: {
      assignee: { select: { id: true, name: true, email: true } },
      creator: { select: { id: true, name: true } },
      project: { select: { id: true, name: true, key: true } },
      _count: { select: { children: true } },
    },
    orderBy: [{ status: 'asc' }, { priority: 'desc' }, { createdAt: 'asc' }],
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

const ISSUE_KEY_REGEX = /^([A-Z]{2,10})-(\d+)$/;

export function parseIssueKey(issueKey: string): { projectKey: string; number: number } | null {
  const m = issueKey.trim().toUpperCase().match(ISSUE_KEY_REGEX);
  if (!m) return null;
  return { projectKey: m[1], number: parseInt(m[2], 10) };
}

export async function getIssueByKey(issueKey: string) {
  const parsed = parseIssueKey(issueKey);
  if (!parsed) throw new AppError(400, `Invalid issue key: ${issueKey}`);

  const project = await prisma.project.findUnique({ where: { key: parsed.projectKey } });
  if (!project) throw new AppError(404, `Project ${parsed.projectKey} not found`);

  const issue = await prisma.issue.findUnique({
    where: { projectId_number: { projectId: project.id, number: parsed.number } },
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
  if (!issue) throw new AppError(404, `Issue ${issueKey} not found`);
  return issue;
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

  // Resolve issueTypeConfig and type
  let resolvedTypeConfigId: string | undefined = dto.issueTypeConfigId;
  let resolvedType: IssueType | undefined = dto.type;

  if (resolvedTypeConfigId) {
    const typeConfig = await prisma.issueTypeConfig.findUnique({ where: { id: resolvedTypeConfigId } });
    if (!typeConfig) throw new AppError(404, 'Issue type not found');
    if (!typeConfig.isEnabled) throw new AppError(400, 'Issue type is disabled');

    // Validate against project scheme
    const binding = await prisma.issueTypeSchemeProject.findUnique({
      where: { projectId },
      include: { scheme: { include: { items: { select: { typeConfigId: true } } } } },
    });
    if (binding) {
      const allowed = binding.scheme.items.map((i) => i.typeConfigId);
      if (!allowed.includes(resolvedTypeConfigId)) {
        throw new AppError(400, 'Issue type is not allowed in this project scheme');
      }
    }

    // Map to legacy enum if system type
    if (typeConfig.systemKey) {
      resolvedType = typeConfig.systemKey as IssueType;
    } else {
      resolvedType = undefined;
    }
  } else if (!resolvedType) {
    resolvedType = 'TASK';
    // Try to find default config for TASK
    const taskConfig = await prisma.issueTypeConfig.findUnique({ where: { systemKey: 'TASK' } });
    if (taskConfig) resolvedTypeConfigId = taskConfig.id;
  } else {
    // Legacy: type provided without configId, look up by systemKey
    const typeConfig = await prisma.issueTypeConfig.findUnique({ where: { systemKey: resolvedType } });
    if (typeConfig) resolvedTypeConfigId = typeConfig.id;
  }

  if (resolvedType) {
    await validateHierarchy(resolvedType, dto.parentId);
  }

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
      acceptanceCriteria: dto.acceptanceCriteria,
      type: resolvedType ?? null,
      issueTypeConfigId: resolvedTypeConfigId,
      priority: dto.priority,
      parentId: dto.parentId,
      assigneeId: dto.assigneeId,
      creatorId,
    },
    include: {
      assignee: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true } },
      project: { select: { key: true } },
      issueTypeConfig: true,
    },
  });
}

export async function updateIssue(id: string, dto: UpdateIssueDto) {
  const issue = await prisma.issue.findUnique({ where: { id } });
  if (!issue) throw new AppError(404, 'Issue not found');

  if (dto.parentId !== undefined && issue.type) {
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

export async function updateAiFlags(id: string, dto: UpdateAiFlagsDto) {
  const issue = await prisma.issue.findUnique({ where: { id } });
  if (!issue) throw new AppError(404, 'Issue not found');

  const data: Prisma.IssueUpdateInput = {};
  if (dto.aiEligible !== undefined) {
    data.aiEligible = dto.aiEligible;
  }
  if (dto.aiAssigneeType !== undefined) {
    data.aiAssigneeType = dto.aiAssigneeType;
  }

  return prisma.issue.update({
    where: { id },
    data,
    include: {
      assignee: { select: { id: true, name: true, email: true } },
      creator: { select: { id: true, name: true } },
      project: { select: { id: true, name: true, key: true } },
    },
  });
}

export async function updateAiStatus(id: string, dto: UpdateAiStatusDto) {
  const issue = await prisma.issue.findUnique({ where: { id } });
  if (!issue) throw new AppError(404, 'Issue not found');

  return prisma.issue.update({
    where: { id },
    data: { aiExecutionStatus: dto.aiExecutionStatus },
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
