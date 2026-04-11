import type { UserRole, ReleaseStatusCategory, Prisma } from '@prisma/client';
import { prisma } from '../../prisma/client.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import { getCachedJson, setCachedJson, delCachedJson } from '../../shared/redis.js';

// ─── Cache ────────────────────────────────────────────────────────────────────

const WORKFLOW_CACHE_TTL = 300; // 5 minutes
const rwCacheKey = (workflowId: string): string => `rw:${workflowId}`;

export async function invalidateReleaseWorkflowCache(workflowId: string): Promise<void> {
  await delCachedJson(rwCacheKey(workflowId));
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ReleaseWorkflowFull = Awaited<ReturnType<typeof loadReleaseWorkflowFull>>;

async function loadReleaseWorkflowFull(workflowId: string) {
  return prisma.releaseWorkflow.findUniqueOrThrow({
    where: { id: workflowId },
    include: {
      steps: { include: { status: true }, orderBy: { orderIndex: 'asc' } },
      transitions: {
        include: { fromStatus: true, toStatus: true },
        orderBy: { id: 'asc' },
      },
    },
  });
}

// ─── Release-specific condition types ────────────────────────────────────────

type ReleaseConditionRule =
  | { type: 'USER_HAS_GLOBAL_ROLE'; roles: UserRole[] }
  | { type: 'ALL_ITEMS_IN_STATUS_CATEGORY'; category: ReleaseStatusCategory }
  | { type: 'ALL_SPRINTS_CLOSED' }
  | { type: 'MIN_ITEMS_COUNT'; minCount: number };

// ─── Condition evaluator (async, release-specific) ────────────────────────────

async function evaluateReleaseCondition(
  rule: ReleaseConditionRule,
  ctx: { actorRole: UserRole; releaseId: string },
): Promise<boolean> {
  switch (rule.type) {
    case 'USER_HAS_GLOBAL_ROLE':
      return rule.roles.includes(ctx.actorRole);

    case 'ALL_ITEMS_IN_STATUS_CATEGORY': {
      // All issues linked via ReleaseItem must be in the given status category
      const nonMatching = await prisma.releaseItem.count({
        where: {
          releaseId: ctx.releaseId,
          issue: {
            workflowStatus: {
              category: { not: rule.category as never },
            },
          },
        },
      });
      return nonMatching === 0;
    }

    case 'ALL_SPRINTS_CLOSED': {
      const openSprints = await prisma.sprint.count({
        where: { releaseId: ctx.releaseId, state: { not: 'CLOSED' } },
      });
      return openSprints === 0;
    }

    case 'MIN_ITEMS_COUNT': {
      const total = await prisma.releaseItem.count({
        where: { releaseId: ctx.releaseId },
      });
      return total >= rule.minCount;
    }

    default:
      return true;
  }
}

async function evaluateReleaseConditions(
  rules: ReleaseConditionRule[],
  ctx: { actorRole: UserRole; releaseId: string },
): Promise<{ allowed: boolean; failedCondition?: string }> {
  for (const rule of rules) {
    const passed = await evaluateReleaseCondition(rule, ctx);
    if (!passed) {
      return { allowed: false, failedCondition: rule.type };
    }
  }
  return { allowed: true };
}

// ─── TTMP-187: resolveWorkflowForRelease ──────────────────────────────────────

export async function resolveWorkflowForRelease(release: {
  id: string;
  workflowId: string | null;
  type: 'ATOMIC' | 'INTEGRATION';
}): Promise<ReleaseWorkflowFull> {
  // If release has an explicit workflowId — use it with cache
  if (release.workflowId) {
    const cacheKey = rwCacheKey(release.workflowId);
    const cached = await getCachedJson<ReleaseWorkflowFull>(cacheKey);
    if (cached) return cached;

    const workflow = await loadReleaseWorkflowFull(release.workflowId);
    await setCachedJson(cacheKey, workflow, WORKFLOW_CACHE_TTL);
    return workflow;
  }

  // No workflowId — find default workflow compatible with this release type
  // Priority: type-specific default > universal default
  let workflow = await prisma.releaseWorkflow.findFirst({
    where: { releaseType: release.type, isDefault: true, isActive: true },
  });

  if (!workflow) {
    workflow = await prisma.releaseWorkflow.findFirst({
      where: { releaseType: null, isDefault: true, isActive: true },
    });
  }

  if (!workflow) {
    throw new AppError(409, 'NO_RELEASE_WORKFLOW_CONFIGURED');
  }

  const cacheKey = rwCacheKey(workflow.id);
  const cached = await getCachedJson<ReleaseWorkflowFull>(cacheKey);
  if (cached) return cached;

  const full = await loadReleaseWorkflowFull(workflow.id);
  await setCachedJson(cacheKey, full, WORKFLOW_CACHE_TTL);
  return full;
}

// ─── TTMP-188: getAvailableTransitions ───────────────────────────────────────

export interface ReleaseTransitionResponse {
  id: string;
  name: string;
  toStatus: {
    id: string;
    name: string;
    category: ReleaseStatusCategory;
    color: string;
  };
}

export interface ReleaseAvailableTransitionsResponse {
  currentStatus: {
    id: string;
    name: string;
    category: ReleaseStatusCategory;
    color: string;
  } | null;
  transitions: ReleaseTransitionResponse[];
}

export async function getAvailableTransitions(
  releaseId: string,
  actorId: string,
  actorRole: UserRole,
): Promise<ReleaseAvailableTransitionsResponse> {
  const release = await prisma.release.findUnique({
    where: { id: releaseId },
    include: { status: true },
  });
  if (!release) throw new AppError(404, 'Release not found');

  const workflow = await resolveWorkflowForRelease(release);

  const candidates = workflow.transitions.filter(
    (t) => t.isGlobal || t.fromStatusId === release.statusId,
  );

  const available: ReleaseTransitionResponse[] = [];

  for (const t of candidates) {
    const conditionRules = t.conditions ? (t.conditions as unknown as ReleaseConditionRule[]) : [];
    if (conditionRules.length > 0) {
      try {
        const { allowed } = await evaluateReleaseConditions(conditionRules, {
          actorRole,
          releaseId,
        });
        if (!allowed) continue;
      } catch {
        continue;
      }
    }

    available.push({
      id: t.id,
      name: t.name,
      toStatus: {
        id: t.toStatus.id,
        name: t.toStatus.name,
        category: t.toStatus.category,
        color: t.toStatus.color,
      },
    });
  }

  return {
    currentStatus: release.status
      ? {
          id: release.status.id,
          name: release.status.name,
          category: release.status.category,
          color: release.status.color,
        }
      : null,
    transitions: available,
  };
}

// ─── TTMP-189: executeTransition ─────────────────────────────────────────────

export async function executeTransition(
  releaseId: string,
  transitionId: string,
  actorId: string,
  actorRole: UserRole,
  comment?: string,
): Promise<void> {
  const release = await prisma.release.findUnique({
    where: { id: releaseId },
    include: { status: true },
  });
  if (!release) throw new AppError(404, 'Release not found');

  const transition = await prisma.releaseWorkflowTransition.findUnique({
    where: { id: transitionId },
    include: { toStatus: true, fromStatus: true },
  });
  if (!transition) throw new AppError(400, 'Transition not found');

  // Validate transition belongs to the workflow resolved for this release
  const workflow = await resolveWorkflowForRelease(release);
  if (transition.workflowId !== workflow.id) {
    throw new AppError(409, 'INVALID_TRANSITION');
  }

  // Validate from-status
  if (!transition.isGlobal && transition.fromStatusId !== release.statusId) {
    throw new AppError(409, 'INVALID_TRANSITION');
  }

  // Evaluate conditions
  const conditionRules = transition.conditions ? (transition.conditions as unknown as ReleaseConditionRule[]) : [];
  if (conditionRules.length > 0) {
    const { allowed, failedCondition } = await evaluateReleaseConditions(conditionRules, {
      actorRole,
      releaseId,
    });
    if (!allowed) {
      throw new AppError(403, 'CONDITION_NOT_MET', {
        details: { conditionType: failedCondition ?? 'UNKNOWN' },
      });
    }
  }

  // Build update data
  const updateData: Prisma.ReleaseUpdateInput = {
    status: { connect: { id: transition.toStatusId } },
  };

  // Set releaseDate when transitioning to DONE category
  if (transition.toStatus.category === 'DONE' && !release.releaseDate) {
    updateData.releaseDate = new Date();
  }

  await prisma.release.update({
    where: { id: releaseId },
    data: updateData,
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      action: 'release.transitioned',
      entityType: 'release',
      entityId: releaseId,
      userId: actorId,
      details: {
        transitionId: transition.id,
        transitionName: transition.name,
        fromStatusId: release.statusId,
        fromStatusName: release.status?.name ?? null,
        toStatusId: transition.toStatusId,
        toStatusName: transition.toStatus.name,
        ...(comment ? { comment } : {}),
      } as Prisma.InputJsonValue,
    },
  });
}
