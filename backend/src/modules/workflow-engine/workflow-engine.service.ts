import { Prisma } from '@prisma/client';
import type { UserRole, IssueStatus } from '@prisma/client';
import { prisma } from '../../prisma/client.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import { getCachedJson, setCachedJson, deleteCachedByPattern } from '../../shared/redis.js';
import { evaluateConditions } from './conditions/index.js';
import { runValidators } from './validators/index.js';
import { runPostFunctions } from './post-functions/index.js';
import type { ConditionRule, ValidatorRule, PostFunctionRule, AvailableTransitionsResponse, TransitionResponse } from './types.js';

// ─── Redis cache helpers ──────────────────────────────────────────────────────

const WORKFLOW_CACHE_TTL = 300; // 5 minutes

const wfCacheKey = (projectId: string, typeId: string | null): string =>
  `wf:${projectId}:${typeId ?? 'default'}`;

export async function invalidateWorkflowCache(projectId: string): Promise<void> {
  await deleteCachedByPattern(`wf:${projectId}:*`);
}

async function getProjectIdsForWorkflow(workflowId: string): Promise<string[]> {
  const items = await prisma.workflowSchemeItem.findMany({
    where: { workflowId },
    include: { scheme: { include: { projects: { select: { projectId: true } } } } },
  });
  return items.flatMap((item) => item.scheme.projects.map((p) => p.projectId));
}

export async function invalidateWorkflowCacheByWorkflowId(workflowId: string): Promise<void> {
  const projectIds = await getProjectIdsForWorkflow(workflowId);
  await Promise.all(projectIds.map((pid) => invalidateWorkflowCache(pid)));
}

// ─── Types ────────────────────────────────────────────────────────────────────

type WorkflowFull = Awaited<ReturnType<typeof loadWorkflowFull>>;

async function loadWorkflowFull(workflowId: string) {
  return prisma.workflow.findUniqueOrThrow({
    where: { id: workflowId },
    include: {
      steps: { include: { status: true }, orderBy: { orderIndex: 'asc' } },
      transitions: {
        include: {
          toStatus: true,
          fromStatus: true,
          screen: { include: { items: { include: { customField: true }, orderBy: { orderIndex: 'asc' } } } },
        },
        orderBy: { orderIndex: 'asc' },
      },
    },
  });
}

// ─── Resolve workflow for an issue ───────────────────────────────────────────

async function resolveWorkflowFromDB(issue: { projectId: string; issueTypeConfigId: string | null }): Promise<WorkflowFull> {
  const binding = await prisma.workflowSchemeProject.findUnique({
    where: { projectId: issue.projectId },
    include: {
      scheme: {
        include: {
          items: true,
        },
      },
    },
  });

  if (!binding) {
    const defaultWf = await prisma.workflow.findFirst({ where: { isDefault: true } });
    if (!defaultWf) throw new AppError(409, 'NO_WORKFLOW_CONFIGURED');
    return loadWorkflowFull(defaultWf.id);
  }

  const items = binding.scheme.items;

  let item = issue.issueTypeConfigId
    ? items.find((i) => i.issueTypeConfigId === issue.issueTypeConfigId)
    : undefined;

  if (!item) {
    item = items.find((i) => i.issueTypeConfigId === null);
  }

  if (!item) {
    const defaultWf = await prisma.workflow.findFirst({ where: { isDefault: true } });
    if (!defaultWf) throw new AppError(409, 'NO_WORKFLOW_CONFIGURED');
    return loadWorkflowFull(defaultWf.id);
  }

  return loadWorkflowFull(item.workflowId);
}

export async function resolveWorkflowForIssue(issue: { projectId: string; issueTypeConfigId: string | null }): Promise<WorkflowFull> {
  const key = wfCacheKey(issue.projectId, issue.issueTypeConfigId);
  const cached = await getCachedJson<WorkflowFull>(key);
  if (cached) return cached;

  const workflow = await resolveWorkflowFromDB(issue);
  await setCachedJson(key, workflow, WORKFLOW_CACHE_TTL);
  return workflow;
}

// ─── Map workflow status systemKey to legacy IssueStatus enum ────────────────

function mapToLegacyStatus(systemKey: string | null, category: string): IssueStatus {
  if (systemKey) {
    const map: Record<string, IssueStatus> = {
      OPEN: 'OPEN',
      IN_PROGRESS: 'IN_PROGRESS',
      REVIEW: 'REVIEW',
      DONE: 'DONE',
      CANCELLED: 'CANCELLED',
    };
    if (map[systemKey]) return map[systemKey];
  }
  // Fallback by category
  const categoryMap: Record<string, IssueStatus> = {
    DONE: 'DONE',
    IN_PROGRESS: 'IN_PROGRESS',
    TODO: 'OPEN',
  };
  return categoryMap[category] ?? 'OPEN';
}

// ─── Get available transitions ────────────────────────────────────────────────

export async function getAvailableTransitions(
  issueId: string,
  actorId: string,
  actorRole: UserRole,
): Promise<AvailableTransitionsResponse> {
  const issue = await prisma.issue.findUnique({
    where: { id: issueId },
    include: { workflowStatus: true },
  });
  if (!issue) throw new AppError(404, 'Issue not found');

  const workflow = await resolveWorkflowForIssue(issue);

  const candidates = workflow.transitions.filter(
    (t) => t.isGlobal || t.fromStatusId === issue.workflowStatusId,
  );

  const available: TransitionResponse[] = [];

  for (const t of candidates) {
    try {
      const conditionRules = t.conditions ? (t.conditions as unknown as ConditionRule[]) : [];
      if (conditionRules.length > 0) {
        const allowed = evaluateConditions(conditionRules, {
          actorId,
          actorRole,
          issue: { assigneeId: issue.assigneeId, creatorId: issue.creatorId },
        });
        if (!allowed) continue;
      }
    } catch {
      continue; // condition evaluation error → exclude transition silently
    }

    const response: TransitionResponse = {
      id: t.id,
      name: t.name,
      toStatus: {
        id: t.toStatus.id,
        name: t.toStatus.name,
        category: t.toStatus.category,
        color: t.toStatus.color,
      },
      requiresScreen: !!t.screen,
    };

    if (t.screen && t.screen.items.length > 0) {
      response.screenFields = t.screen.items.map((item) => ({
        customFieldId: item.customFieldId,
        name: item.customField.name,
        fieldType: item.customField.fieldType,
        isRequired: item.isRequired,
        orderIndex: item.orderIndex,
      }));
    }

    available.push(response);
  }

  return {
    currentStatus: issue.workflowStatus
      ? {
          id: issue.workflowStatus.id,
          name: issue.workflowStatus.name,
          category: issue.workflowStatus.category,
          color: issue.workflowStatus.color,
        }
      : null,
    transitions: available,
  };
}

// ─── Execute transition ───────────────────────────────────────────────────────

export async function executeTransition(
  issueId: string,
  transitionId: string,
  actorId: string,
  actorRole: UserRole,
  screenFieldValues?: Record<string, unknown>,
  bypassConditions = false,
) {
  const issue = await prisma.issue.findUnique({
    where: { id: issueId },
    include: { workflowStatus: true },
  });
  if (!issue) throw new AppError(404, 'Issue not found');

  const transition = await prisma.workflowTransition.findUnique({
    where: { id: transitionId },
    include: {
      toStatus: true,
      fromStatus: true,
      screen: { include: { items: { include: { customField: true }, orderBy: { orderIndex: 'asc' } } } },
    },
  });
  if (!transition) throw new AppError(400, 'Transition not found');

  // Validate transition belongs to the correct workflow
  const workflow = await resolveWorkflowForIssue(issue);
  if (transition.workflowId !== workflow.id) {
    throw new AppError(409, 'INVALID_TRANSITION');
  }

  // Validate from-status
  if (!transition.isGlobal && transition.fromStatusId !== issue.workflowStatusId) {
    throw new AppError(409, 'INVALID_TRANSITION');
  }

  // Conditions
  if (!bypassConditions) {
    const conditionRules = transition.conditions ? (transition.conditions as unknown as ConditionRule[]) : [];
    if (conditionRules.length > 0) {
      const allowed = evaluateConditions(conditionRules, {
        actorId,
        actorRole,
        issue: { assigneeId: issue.assigneeId, creatorId: issue.creatorId },
      });
      if (!allowed) {
        const firstRule = conditionRules[0];
        throw new AppError(403, 'CONDITION_NOT_MET', { details: { conditionType: firstRule?.type ?? 'UNKNOWN' } });
      }
    }
  }

  // Validators
  const validatorRules = transition.validators ? (transition.validators as unknown as ValidatorRule[]) : [];
  if (validatorRules.length > 0) {
    await runValidators(issueId, validatorRules);
  }

  // Screen field validation
  if (transition.screen && transition.screen.items.length > 0) {
    const requiredFields = transition.screen.items.filter((item) => item.isRequired);
    const missing = requiredFields.filter((item) => {
      const val = screenFieldValues?.[item.customFieldId];
      return val === undefined || val === null || val === '';
    });
    if (missing.length > 0) {
      throw new AppError(422, 'SCREEN_FIELD_REQUIRED', {
        fields: missing.map((f) => ({ customFieldId: f.customFieldId, name: f.customField.name })),
      });
    }
  }

  const newLegacyStatus = mapToLegacyStatus(transition.toStatus.systemKey, transition.toStatus.category);

  // DB transaction: upsert screen field values + update issue
  const updatedIssue = await prisma.$transaction(async (tx) => {
    if (screenFieldValues && Object.keys(screenFieldValues).length > 0) {
      for (const [customFieldId, value] of Object.entries(screenFieldValues)) {
        await tx.issueCustomFieldValue.upsert({
          where: { issueId_customFieldId: { issueId, customFieldId } },
          update: { value: value as Prisma.InputJsonValue, updatedById: actorId },
          create: { issueId, customFieldId, value: value as Prisma.InputJsonValue, updatedById: actorId },
        });
      }
    }

    return tx.issue.update({
      where: { id: issueId },
      data: {
        workflowStatusId: transition.toStatusId,
        status: newLegacyStatus,
      },
      include: {
        workflowStatus: true,
        assignee: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } },
      },
    });
  });

  // Post-functions (fire-and-forget, errors logged)
  const postFunctionRules = transition.postFunctions ? (transition.postFunctions as unknown as PostFunctionRule[]) : [];
  if (postFunctionRules.length > 0) {
    runPostFunctions(issueId, actorId, postFunctionRules, updatedIssue).catch(() => {});
  }

  // Audit log
  await prisma.auditLog.create({
    data: {
      action: 'issue.transitioned',
      entityType: 'issue',
      entityId: issueId,
      userId: actorId,
      details: {
        transitionId: transition.id,
        transitionName: transition.name,
        fromStatusId: issue.workflowStatusId,
        toStatusId: transition.toStatusId,
        toStatusName: transition.toStatus.name,
      } as Prisma.InputJsonValue,
    },
  });

  return updatedIssue;
}
