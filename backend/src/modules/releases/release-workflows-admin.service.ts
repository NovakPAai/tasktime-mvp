import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma/client.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import { invalidateReleaseWorkflowCache } from './release-workflow-engine.service.js';
import type {
  CreateReleaseWorkflowDto,
  UpdateReleaseWorkflowDto,
  CreateReleaseWorkflowStepDto,
  UpdateReleaseWorkflowStepDto,
  CreateReleaseWorkflowTransitionDto,
  UpdateReleaseWorkflowTransitionDto,
} from './release-workflows-admin.dto.js';

// ─── Include helper ───────────────────────────────────────────────────────────

const workflowInclude = {
  steps: { include: { status: true }, orderBy: { orderIndex: 'asc' as const } },
  transitions: {
    include: { fromStatus: true, toStatus: true },
    orderBy: { id: 'asc' as const },
  },
  _count: { select: { releases: true } },
} as const;

// ─── Workflows CRUD ───────────────────────────────────────────────────────────

export async function listReleaseWorkflows() {
  return prisma.releaseWorkflow.findMany({
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    include: workflowInclude,
  });
}

export async function getReleaseWorkflow(id: string) {
  const wf = await prisma.releaseWorkflow.findUnique({ where: { id }, include: workflowInclude });
  if (!wf) throw new AppError(404, 'Release workflow not found');
  return wf;
}

export async function createReleaseWorkflow(dto: CreateReleaseWorkflowDto) {
  return prisma.releaseWorkflow.create({
    data: {
      name: dto.name,
      description: dto.description,
      releaseType: dto.releaseType ?? null,
      isDefault: dto.isDefault ?? false,
      isActive: dto.isActive ?? true,
    },
    include: workflowInclude,
  });
}

export async function updateReleaseWorkflow(id: string, dto: UpdateReleaseWorkflowDto) {
  const wf = await prisma.releaseWorkflow.findUnique({ where: { id } });
  if (!wf) throw new AppError(404, 'Release workflow not found');

  const updated = await prisma.releaseWorkflow.update({
    where: { id },
    data: {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.releaseType !== undefined && { releaseType: dto.releaseType }),
      ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
    },
    include: workflowInclude,
  });
  await invalidateReleaseWorkflowCache(id);
  return updated;
}

export async function deleteReleaseWorkflow(id: string) {
  const wf = await prisma.releaseWorkflow.findUnique({
    where: { id },
    include: { _count: { select: { releases: true } } },
  });
  if (!wf) throw new AppError(404, 'Release workflow not found');
  if (wf._count.releases > 0) throw new AppError(400, 'RELEASE_WORKFLOW_IN_USE');

  await prisma.releaseWorkflow.delete({ where: { id } });
  await invalidateReleaseWorkflowCache(id);
  return { ok: true };
}

// ─── RM-04.3: Graph validation ────────────────────────────────────────────────

export interface ReleaseWorkflowValidationReport {
  isValid: boolean;
  errors: Array<{ type: string; message: string }>;
  warnings: Array<{ type: string; message: string; statusId?: string; statusName?: string }>;
}

export async function validateReleaseWorkflow(workflowId: string): Promise<ReleaseWorkflowValidationReport> {
  const wf = await prisma.releaseWorkflow.findUnique({
    where: { id: workflowId },
    include: {
      steps: { include: { status: true } },
      transitions: true,
    },
  });
  if (!wf) throw new AppError(404, 'Release workflow not found');

  const errors: ReleaseWorkflowValidationReport['errors'] = [];
  const warnings: ReleaseWorkflowValidationReport['warnings'] = [];

  // NO_INITIAL_STATUS
  const initialSteps = wf.steps.filter((s) => s.isInitial);
  if (initialSteps.length === 0) {
    errors.push({ type: 'NO_INITIAL_STATUS', message: 'Workflow has no initial status (isInitial = true)' });
  }

  // NO_DONE_STATUS
  const doneSteps = wf.steps.filter((s) => s.status.category === 'DONE');
  if (doneSteps.length === 0) {
    errors.push({ type: 'NO_DONE_STATUS', message: 'Workflow has no status with category DONE' });
  }

  // DEAD_END_STATUS
  // A global transition is available from *every* status, so any status that has
  // at least one outgoing global transition is not a dead-end regardless of its
  // direct outgoing edges.
  const hasGlobalOutgoing = wf.transitions.some((t) => t.isGlobal);

  for (const step of wf.steps) {
    const outgoing = wf.transitions.filter(
      (t) => t.fromStatusId === step.statusId || t.isGlobal,
    );
    if (
      outgoing.length === 0 &&
      !hasGlobalOutgoing &&
      step.status.category !== 'DONE'
    ) {
      warnings.push({
        type: 'DEAD_END_STATUS',
        message: `Status "${step.status.name}" has no outgoing transitions and is not DONE category`,
        statusId: step.statusId,
        statusName: step.status.name,
      });
    }
  }

  // UNREACHABLE_STATUS
  if (initialSteps.length > 0) {
    const reachable = new Set<string>();
    const queue = [initialSteps[0].statusId];
    reachable.add(initialSteps[0].statusId);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const nexts = wf.transitions
        .filter((t) => t.fromStatusId === current || t.isGlobal)
        .map((t) => t.toStatusId);
      for (const next of nexts) {
        if (!reachable.has(next)) {
          reachable.add(next);
          queue.push(next);
        }
      }
    }

    for (const step of wf.steps) {
      if (!reachable.has(step.statusId)) {
        warnings.push({
          type: 'UNREACHABLE_STATUS',
          message: `Status "${step.status.name}" is not reachable from the initial status`,
          statusId: step.statusId,
          statusName: step.status.name,
        });
      }
    }
  }

  // UNUSED_STATUS
  const usedStatusIds = new Set<string>();
  for (const t of wf.transitions) {
    usedStatusIds.add(t.fromStatusId);
    usedStatusIds.add(t.toStatusId);
  }
  for (const step of wf.steps) {
    if (!usedStatusIds.has(step.statusId)) {
      warnings.push({
        type: 'UNUSED_STATUS',
        message: `Status "${step.status.name}" is not referenced in any transition`,
        statusId: step.statusId,
        statusName: step.status.name,
      });
    }
  }

  return { isValid: errors.length === 0, errors, warnings };
}

// ─── Steps ────────────────────────────────────────────────────────────────────

export async function addReleaseWorkflowStep(workflowId: string, dto: CreateReleaseWorkflowStepDto) {
  const wf = await prisma.releaseWorkflow.findUnique({ where: { id: workflowId } });
  if (!wf) throw new AppError(404, 'Release workflow not found');

  const status = await prisma.releaseStatus.findUnique({ where: { id: dto.statusId } });
  if (!status) throw new AppError(404, 'Release status not found');

  const existing = await prisma.releaseWorkflowStep.findUnique({
    where: { workflowId_statusId: { workflowId, statusId: dto.statusId } },
  });
  if (existing) throw new AppError(409, 'Status already in workflow');

  const maxOrder = await prisma.releaseWorkflowStep.aggregate({
    where: { workflowId },
    _max: { orderIndex: true },
  });
  const orderIndex = dto.orderIndex ?? (maxOrder._max.orderIndex ?? -1) + 1;

  const step = await prisma.$transaction(async (tx) => {
    if (dto.isInitial) {
      await tx.releaseWorkflowStep.updateMany({
        where: { workflowId, isInitial: true },
        data: { isInitial: false },
      });
    }
    return tx.releaseWorkflowStep.create({
      data: { workflowId, statusId: dto.statusId, isInitial: dto.isInitial ?? false, orderIndex },
      include: { status: true },
    });
  });

  await invalidateReleaseWorkflowCache(workflowId);
  return step;
}

export async function updateReleaseWorkflowStep(
  workflowId: string,
  stepId: string,
  dto: UpdateReleaseWorkflowStepDto,
) {
  const wf = await prisma.releaseWorkflow.findUnique({ where: { id: workflowId } });
  if (!wf) throw new AppError(404, 'Release workflow not found');

  const step = await prisma.releaseWorkflowStep.findFirst({ where: { id: stepId, workflowId } });
  if (!step) throw new AppError(404, 'Release workflow step not found');

  const updated = await prisma.$transaction(async (tx) => {
    if (dto.isInitial) {
      await tx.releaseWorkflowStep.updateMany({
        where: { workflowId, isInitial: true },
        data: { isInitial: false },
      });
    }
    return tx.releaseWorkflowStep.update({
      where: { id: stepId },
      data: {
        ...(dto.isInitial !== undefined && { isInitial: dto.isInitial }),
        ...(dto.orderIndex !== undefined && { orderIndex: dto.orderIndex }),
      },
      include: { status: true },
    });
  });

  await invalidateReleaseWorkflowCache(workflowId);
  return updated;
}

export async function deleteReleaseWorkflowStep(workflowId: string, stepId: string) {
  const wf = await prisma.releaseWorkflow.findUnique({ where: { id: workflowId } });
  if (!wf) throw new AppError(404, 'Release workflow not found');

  const step = await prisma.releaseWorkflowStep.findFirst({ where: { id: stepId, workflowId } });
  if (!step) throw new AppError(404, 'Release workflow step not found');

  // Delete step and any transitions that reference this status (from or to)
  await prisma.$transaction([
    prisma.releaseWorkflowTransition.deleteMany({
      where: {
        workflowId,
        OR: [{ fromStatusId: step.statusId }, { toStatusId: step.statusId }],
      },
    }),
    prisma.releaseWorkflowStep.delete({ where: { id: stepId } }),
  ]);
  await invalidateReleaseWorkflowCache(workflowId);
  return { ok: true };
}

// ─── Transitions ──────────────────────────────────────────────────────────────

async function assertStatusInReleaseWorkflow(workflowId: string, statusId: string, label: string) {
  const step = await prisma.releaseWorkflowStep.findUnique({
    where: { workflowId_statusId: { workflowId, statusId } },
  });
  if (!step) throw new AppError(400, `${label} must be a step in the workflow`);
}

export async function createReleaseWorkflowTransition(
  workflowId: string,
  dto: CreateReleaseWorkflowTransitionDto,
) {
  const wf = await prisma.releaseWorkflow.findUnique({ where: { id: workflowId } });
  if (!wf) throw new AppError(404, 'Release workflow not found');

  await assertStatusInReleaseWorkflow(workflowId, dto.fromStatusId, 'fromStatus');
  await assertStatusInReleaseWorkflow(workflowId, dto.toStatusId, 'toStatus');

  const dup = await prisma.releaseWorkflowTransition.findFirst({
    where: { workflowId, fromStatusId: dto.fromStatusId, toStatusId: dto.toStatusId },
  });
  if (dup) throw new AppError(409, 'TRANSITION_ALREADY_EXISTS');

  const transition = await prisma.releaseWorkflowTransition.create({
    data: {
      workflowId,
      name: dto.name,
      fromStatusId: dto.fromStatusId,
      toStatusId: dto.toStatusId,
      isGlobal: dto.isGlobal ?? false,
      conditions: dto.conditions ? (dto.conditions as Prisma.InputJsonValue) : Prisma.JsonNull,
    },
    include: { fromStatus: true, toStatus: true },
  });
  await invalidateReleaseWorkflowCache(workflowId);
  return transition;
}

export async function updateReleaseWorkflowTransition(
  workflowId: string,
  transitionId: string,
  dto: UpdateReleaseWorkflowTransitionDto,
) {
  const wf = await prisma.releaseWorkflow.findUnique({ where: { id: workflowId } });
  if (!wf) throw new AppError(404, 'Release workflow not found');

  const transition = await prisma.releaseWorkflowTransition.findFirst({
    where: { id: transitionId, workflowId },
  });
  if (!transition) throw new AppError(404, 'Release workflow transition not found');

  if (dto.fromStatusId !== undefined) await assertStatusInReleaseWorkflow(workflowId, dto.fromStatusId, 'fromStatus');
  if (dto.toStatusId !== undefined) await assertStatusInReleaseWorkflow(workflowId, dto.toStatusId, 'toStatus');

  const updated = await prisma.releaseWorkflowTransition.update({
    where: { id: transitionId },
    data: {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.fromStatusId !== undefined && { fromStatusId: dto.fromStatusId }),
      ...(dto.toStatusId !== undefined && { toStatusId: dto.toStatusId }),
      ...(dto.isGlobal !== undefined && { isGlobal: dto.isGlobal }),
      ...(dto.conditions !== undefined && {
        conditions: dto.conditions ? (dto.conditions as Prisma.InputJsonValue) : Prisma.JsonNull,
      }),
    },
    include: { fromStatus: true, toStatus: true },
  });
  await invalidateReleaseWorkflowCache(workflowId);
  return updated;
}

export async function deleteReleaseWorkflowTransition(workflowId: string, transitionId: string) {
  const wf = await prisma.releaseWorkflow.findUnique({ where: { id: workflowId } });
  if (!wf) throw new AppError(404, 'Release workflow not found');

  const transition = await prisma.releaseWorkflowTransition.findFirst({
    where: { id: transitionId, workflowId },
  });
  if (!transition) throw new AppError(404, 'Release workflow transition not found');

  await prisma.releaseWorkflowTransition.delete({ where: { id: transitionId } });
  await invalidateReleaseWorkflowCache(workflowId);
  return { ok: true };
}
