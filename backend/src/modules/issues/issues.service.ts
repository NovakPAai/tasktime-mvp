import type {
  IssuePriority,
  IssueStatus,
  Prisma,
  AiAssigneeType,
  UserRole,
} from '@prisma/client';
import { prisma } from '../../prisma/client.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import { getApplicableFields } from '../issue-custom-fields/issue-custom-fields.service.js';
import { resolveWorkflowForIssue, executeTransition } from '../workflow-engine/workflow-engine.service.js';
import type {
  CreateIssueDto,
  UpdateIssueDto,
  UpdateStatusDto,
  AssignDto,
  UpdateAiFlagsDto,
  UpdateAiStatusDto,
} from './issues.dto.js';

// Hierarchy rules keyed by systemKey (null key = custom type, skip validation)
const ALLOWED_PARENT_KEYS: Record<string, string[]> = {
  EPIC: [],
  STORY: ['EPIC'],
  TASK: ['EPIC', 'STORY'],
  SUBTASK: ['STORY', 'TASK'],
  BUG: ['EPIC', 'STORY'],
};

async function validateHierarchy(issueTypeConfigId: string | undefined | null, parentId?: string | null) {
  if (!issueTypeConfigId) return; // custom or unset type — skip hierarchy validation

  const typeConfig = await prisma.issueTypeConfig.findUnique({ where: { id: issueTypeConfigId } });
  if (!typeConfig?.systemKey) return; // custom type — skip

  const systemKey = typeConfig.systemKey;
  const allowedParentKeys = ALLOWED_PARENT_KEYS[systemKey] ?? null;

  if (!parentId) {
    if (systemKey === 'SUBTASK') {
      throw new AppError(400, 'SUBTASK must have a parent');
    }
    return;
  }

  if (allowedParentKeys !== null && allowedParentKeys.length === 0) {
    throw new AppError(400, `${systemKey} cannot have a parent`);
  }

  const parent = await prisma.issue.findUnique({
    where: { id: parentId },
    include: { issueTypeConfig: { select: { systemKey: true } } },
  });
  if (!parent) throw new AppError(404, 'Parent issue not found');

  const parentKey = parent.issueTypeConfig?.systemKey ?? null;
  if (!parentKey || (allowedParentKeys !== null && !allowedParentKeys.includes(parentKey))) {
    throw new AppError(400, `${systemKey} cannot be a child of ${parentKey ?? 'custom type'}`);
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
  issueTypeConfigId?: string[];
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
  if (filters?.issueTypeConfigId && filters.issueTypeConfigId.length > 0) {
    where.issueTypeConfigId = { in: filters.issueTypeConfigId };
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
      issueTypeConfig: true,
      workflowStatus: { select: { id: true, name: true, category: true, color: true, systemKey: true } },
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
      status: true,
      issueTypeConfig: { select: { systemKey: true, name: true, iconName: true, iconColor: true } },
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
      workflowStatus: { select: { id: true, name: true, category: true, color: true, systemKey: true } },
      parent: { select: { id: true, title: true, number: true, projectId: true, issueTypeConfig: { select: { systemKey: true, name: true } } } },
      children: {
        select: { id: true, title: true, status: true, number: true, issueTypeConfig: { select: { systemKey: true, name: true } }, assignee: { select: { id: true, name: true } } },
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
      issueTypeConfig: true,
      workflowStatus: { select: { id: true, name: true, category: true, color: true, systemKey: true } },
      parent: { select: { id: true, title: true, number: true, projectId: true, issueTypeConfig: { select: { systemKey: true, name: true } } } },
      children: {
        select: {
          id: true, title: true, status: true, number: true,
          issueTypeConfig: true,
          assignee: { select: { id: true, name: true } },
        },
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

  // Resolve issueTypeConfigId — accept UUID or legacy systemKey string (e.g. 'TASK', 'EPIC')
  let resolvedTypeConfigId: string | undefined = dto.issueTypeConfigId;
  if (!resolvedTypeConfigId && dto.type) {
    const byKey = await prisma.issueTypeConfig.findUnique({ where: { systemKey: dto.type.toUpperCase() } });
    if (byKey) resolvedTypeConfigId = byKey.id;
  }
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
  } else {
    // Default to TASK
    const taskConfig = await prisma.issueTypeConfig.findUnique({ where: { systemKey: 'TASK' } });
    if (taskConfig) resolvedTypeConfigId = taskConfig.id;
  }

  await validateHierarchy(resolvedTypeConfigId, dto.parentId);

  if (dto.parentId) {
    const parent = await prisma.issue.findUnique({ where: { id: dto.parentId } });
    if (parent && parent.projectId !== projectId) {
      throw new AppError(400, 'Parent issue must be in the same project');
    }
  }

  const number = await getNextNumber(projectId);

  // Backward compat: link to system WorkflowStatus on creation (default = OPEN)
  const initialWfStatus = await prisma.workflowStatus.findFirst({ where: { systemKey: 'OPEN' } });

  const issue = await prisma.issue.create({
    data: {
      projectId,
      number,
      title: dto.title,
      description: dto.description,
      acceptanceCriteria: dto.acceptanceCriteria,
      issueTypeConfigId: resolvedTypeConfigId,
      priority: dto.priority,
      parentId: dto.parentId,
      assigneeId: dto.assigneeId,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      creatorId,
      ...(initialWfStatus && { workflowStatusId: initialWfStatus.id }),
    },
    include: {
      assignee: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true } },
      project: { select: { key: true } },
      issueTypeConfig: true,
      workflowStatus: { select: { id: true, name: true, category: true, color: true, systemKey: true } },
    },
  });

  // Set workflowStatusId to the isInitial step of the project's workflow
  try {
    const workflow = await resolveWorkflowForIssue({ projectId, issueTypeConfigId: resolvedTypeConfigId ?? null });
    const initialStep = workflow.steps.find((s) => s.isInitial);
    if (initialStep && initialStep.statusId !== issue.workflowStatusId) {
      await prisma.issue.update({
        where: { id: issue.id },
        data: { workflowStatusId: initialStep.statusId },
      });
      (issue as { workflowStatusId: string | null }).workflowStatusId = initialStep.statusId;
      (issue as { workflowStatus: unknown }).workflowStatus = initialStep.status;
    }
  } catch {
    // No workflow configured — keep the OPEN fallback
  }

  return issue;
}

export async function updateIssue(id: string, dto: UpdateIssueDto) {
  const issue = await prisma.issue.findUnique({ where: { id } });
  if (!issue) throw new AppError(404, 'Issue not found');

  if (dto.parentId !== undefined) {
    await validateHierarchy(issue.issueTypeConfigId, dto.parentId);
  }

  const { dueDate, ...rest } = dto;
  return prisma.issue.update({
    where: { id },
    data: {
      ...rest,
      ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
    },
    include: {
      assignee: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true } },
      workflowStatus: { select: { id: true, name: true, category: true, color: true, systemKey: true } },
    },
  });
}

async function validateRequiredFieldsForDone(issueId: string): Promise<void> {
  const fields = await getApplicableFields(issueId);
  const required = fields.filter((f) => f.isRequired);
  if (required.length === 0) return;

  const values = await prisma.issueCustomFieldValue.findMany({
    where: { issueId, customFieldId: { in: required.map((f) => f.customFieldId) } },
    select: { customFieldId: true, value: true },
  });

  const valueMap = new Map(values.map((v) => [v.customFieldId, v.value]));

  const missing = required.filter((f) => {
    const val = valueMap.get(f.customFieldId);
    if (val === undefined || val === null) return true;
    // Empty string / empty array also counts as unfilled
    if (typeof val === 'string' && val.trim() === '') return true;
    if (Array.isArray(val) && val.length === 0) return true;
    // Unwrap { v: ... } JSONB wrapper if present
    if (typeof val === 'object' && !Array.isArray(val) && 'v' in (val as object)) {
      const inner = (val as { v: unknown }).v;
      if (inner === null || inner === undefined) return true;
      if (typeof inner === 'string' && inner.trim() === '') return true;
      if (Array.isArray(inner) && inner.length === 0) return true;
    }
    return false;
  });

  if (missing.length > 0) {
    throw new AppError(422, 'REQUIRED_FIELDS_MISSING', {
      fields: missing.map((f) => ({
        customFieldId: f.customFieldId,
        name: f.name,
        fieldType: f.fieldType,
      })),
    });
  }
}

export async function updateStatus(id: string, dto: UpdateStatusDto, actorId?: string, actorRole?: UserRole) {
  const issue = await prisma.issue.findUnique({ where: { id } });
  if (!issue) throw new AppError(404, 'Issue not found');

  // Workflow-mode: if project has a scheme, route through the engine (bypassConditions=true for backward compat)
  const schemeProject = await prisma.workflowSchemeProject.findUnique({ where: { projectId: issue.projectId } });
  if (schemeProject) {
    const workflow = await resolveWorkflowForIssue(issue);
    const transition = workflow.transitions.find(
      (t) =>
        t.toStatus?.systemKey === dto.status &&
        (t.isGlobal || t.fromStatusId === issue.workflowStatusId),
    );
    if (transition) {
      return executeTransition(id, transition.id, actorId ?? 'system', actorRole ?? 'USER', undefined, true);
    }
    // No matching transition in workflow — fall through to legacy direct update
  }

  // Legacy path: map string status → workflowStatusId for backward compat
  if (dto.status === 'DONE') {
    await validateRequiredFieldsForDone(id);
  }

  const wfStatus = await prisma.workflowStatus.findFirst({ where: { systemKey: dto.status } });

  return prisma.issue.update({
    where: { id },
    data: {
      status: dto.status,
      ...(wfStatus && { workflowStatusId: wfStatus.id }),
    },
    include: {
      workflowStatus: { select: { id: true, name: true, category: true, color: true, systemKey: true } },
    },
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

export async function bulkDeleteIssues(projectId: string, issueIds: string[]): Promise<{ deletedCount: number }> {
  const issues = await prisma.issue.findMany({
    where: { id: { in: issueIds }, projectId },
    select: { id: true },
  });

  if (issues.length !== issueIds.length) {
    throw new AppError(400, 'Some issues do not belong to this project');
  }

  const { count } = await prisma.issue.deleteMany({
    where: { id: { in: issueIds }, projectId },
  });

  return { deletedCount: count };
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
      workflowStatus: { select: { id: true, name: true, category: true, color: true, systemKey: true } },
      _count: { select: { children: true } },
    },
    orderBy: { orderIndex: 'asc' },
  });
}

export async function bulkTransitionIssues(
  projectId: string,
  issueIds: string[],
  transitionId: string,
  actorId: string,
  actorRole: UserRole,
): Promise<{ succeeded: string[]; failed: Array<{ id: string; error: string }> }> {
  if (issueIds.length > 50) {
    throw new AppError(400, 'TOO_MANY_ISSUES', { max: 50 });
  }

  const succeeded: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];

  for (const id of issueIds) {
    try {
      await executeTransition(id, transitionId, actorId, actorRole, undefined, true);
      succeeded.push(id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'UNKNOWN_ERROR';
      failed.push({ id, error: message });
    }
  }

  return { succeeded, failed };
}
