import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma/client.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import { invalidateWorkflowCacheByWorkflowId } from '../workflow-engine/workflow-engine.service.js';
import type {
  CreateWorkflowDto,
  UpdateWorkflowDto,
  CreateWorkflowStepDto,
  UpdateWorkflowStepDto,
  CreateWorkflowTransitionDto,
  UpdateWorkflowTransitionDto,
} from './workflows.dto.js';

const workflowInclude = {
  steps: { include: { status: true }, orderBy: { orderIndex: 'asc' as const } },
  transitions: {
    include: { fromStatus: true, toStatus: true, screen: true },
    orderBy: { orderIndex: 'asc' as const },
  },
  _count: { select: { schemeItems: true } },
};

// ─── Workflows CRUD ──────────────────────────────────────────────────────────

export async function listWorkflows() {
  return prisma.workflow.findMany({
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    include: workflowInclude,
  });
}

export async function getWorkflow(id: string) {
  const wf = await prisma.workflow.findUnique({ where: { id }, include: workflowInclude });
  if (!wf) throw new AppError(404, 'Workflow not found');
  return wf;
}

export async function createWorkflow(dto: CreateWorkflowDto) {
  return prisma.workflow.create({
    data: {
      name: dto.name,
      description: dto.description,
      isDefault: dto.isDefault ?? false,
    },
    include: workflowInclude,
  });
}

export async function updateWorkflow(id: string, dto: UpdateWorkflowDto) {
  const wf = await prisma.workflow.findUnique({ where: { id } });
  if (!wf) throw new AppError(404, 'Workflow not found');
  if (wf.isSystem) throw new AppError(400, 'SYSTEM_WORKFLOW_IMMUTABLE');

  return prisma.workflow.update({
    where: { id },
    data: {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
    },
    include: workflowInclude,
  });
}

export async function deleteWorkflow(id: string) {
  const wf = await prisma.workflow.findUnique({
    where: { id },
    include: { _count: { select: { schemeItems: true } } },
  });
  if (!wf) throw new AppError(404, 'Workflow not found');
  if (wf.isSystem) throw new AppError(400, 'SYSTEM_WORKFLOW_IMMUTABLE');
  if (wf._count.schemeItems > 0) throw new AppError(400, 'WORKFLOW_IN_USE');

  await prisma.workflow.delete({ where: { id } });
  return { ok: true };
}

export async function copyWorkflow(id: string) {
  const source = await prisma.workflow.findUnique({
    where: { id },
    include: {
      steps: true,
      transitions: true,
    },
  });
  if (!source) throw new AppError(404, 'Workflow not found');

  const copy = await prisma.$transaction(async (tx) => {
    const newWf = await tx.workflow.create({
      data: {
        name: `${source.name} (copy)`,
        description: source.description,
        isDefault: false,
        isSystem: false,
      },
    });

    // Copy steps
    const stepIdMap = new Map<string, string>();
    for (const step of source.steps) {
      const newStep = await tx.workflowStep.create({
        data: {
          workflowId: newWf.id,
          statusId: step.statusId,
          isInitial: step.isInitial,
          orderIndex: step.orderIndex,
        },
      });
      stepIdMap.set(step.id, newStep.id);
    }

    // Copy transitions
    for (const t of source.transitions) {
      await tx.workflowTransition.create({
        data: {
          workflowId: newWf.id,
          name: t.name,
          fromStatusId: t.fromStatusId,
          toStatusId: t.toStatusId,
          isGlobal: t.isGlobal,
          orderIndex: t.orderIndex,
          conditions: t.conditions as Prisma.InputJsonValue ?? Prisma.JsonNull,
          validators: t.validators as Prisma.InputJsonValue ?? Prisma.JsonNull,
          postFunctions: t.postFunctions as Prisma.InputJsonValue ?? Prisma.JsonNull,
          screenId: t.screenId,
        },
      });
    }

    return newWf;
  });

  return getWorkflow(copy.id);
}

// ─── Graph validation ─────────────────────────────────────────────────────────

export interface WorkflowValidationReport {
  isValid: boolean;
  errors: Array<{ type: string; message: string; details?: object }>;
  warnings: Array<{ type: string; message: string; statusId?: string; statusName?: string }>;
}

export async function validateWorkflow(workflowId: string): Promise<WorkflowValidationReport> {
  const wf = await prisma.workflow.findUnique({
    where: { id: workflowId },
    include: {
      steps: { include: { status: true } },
      transitions: true,
    },
  });
  if (!wf) throw new AppError(404, 'Workflow not found');

  const errors: WorkflowValidationReport['errors'] = [];
  const warnings: WorkflowValidationReport['warnings'] = [];

  const initialSteps = wf.steps.filter((s) => s.isInitial);
  if (initialSteps.length === 0) {
    errors.push({ type: 'NO_INITIAL_STATUS', message: 'Workflow has no initial status (isInitial = true)' });
  }

  const doneSteps = wf.steps.filter((s) => s.status.category === 'DONE');
  if (doneSteps.length === 0) {
    errors.push({ type: 'NO_DONE_STATUS', message: 'Workflow has no status with category DONE' });
  }

  const globalTransitionToStatusIds = new Set(
    wf.transitions.filter((t) => t.isGlobal).map((t) => t.toStatusId),
  );

  for (const step of wf.steps) {
    const outgoing = wf.transitions.filter((t) => t.fromStatusId === step.statusId);
    if (outgoing.length === 0 && !globalTransitionToStatusIds.has(step.statusId) && step.status.category !== 'DONE') {
      warnings.push({
        type: 'DEAD_END_STATUS',
        message: `Status "${step.status.name}" has no outgoing transitions and is not DONE category`,
        statusId: step.statusId,
        statusName: step.status.name,
      });
    }
  }

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

  const usedStatusIds = new Set<string>();
  for (const t of wf.transitions) {
    if (t.fromStatusId) usedStatusIds.add(t.fromStatusId);
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

// ─── Copy-on-Write ────────────────────────────────────────────────────────────

export async function ensureWorkflowEditable(workflowId: string): Promise<{ id: string; isDraft: boolean }> {
  const usageCount = await prisma.workflowSchemeItem.count({ where: { workflowId } });
  if (usageCount === 0) return { id: workflowId, isDraft: false };

  const source = await prisma.workflow.findUniqueOrThrow({
    where: { id: workflowId },
    include: { steps: true, transitions: true },
  });

  const dateStr = new Date().toISOString().slice(0, 10);
  const draft = await prisma.$transaction(async (tx) => {
    const newWf = await tx.workflow.create({
      data: {
        name: `${source.name} (draft ${dateStr})`,
        description: source.description,
        isDefault: false,
        isSystem: false,
      },
    });

    for (const step of source.steps) {
      await tx.workflowStep.create({
        data: {
          workflowId: newWf.id,
          statusId: step.statusId,
          isInitial: step.isInitial,
          orderIndex: step.orderIndex,
        },
      });
    }

    for (const t of source.transitions) {
      await tx.workflowTransition.create({
        data: {
          workflowId: newWf.id,
          name: t.name,
          fromStatusId: t.fromStatusId,
          toStatusId: t.toStatusId,
          isGlobal: t.isGlobal,
          orderIndex: t.orderIndex,
          conditions: (t.conditions as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          validators: (t.validators as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          postFunctions: (t.postFunctions as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          screenId: t.screenId,
        },
      });
    }

    return newWf;
  });

  return { id: draft.id, isDraft: true };
}

// ─── Steps ───────────────────────────────────────────────────────────────────

export async function addStep(workflowId: string, dto: CreateWorkflowStepDto) {
  const wf = await prisma.workflow.findUnique({ where: { id: workflowId } });
  if (!wf) throw new AppError(404, 'Workflow not found');
  if (wf.isSystem) throw new AppError(400, 'SYSTEM_WORKFLOW_IMMUTABLE');

  const status = await prisma.workflowStatus.findUnique({ where: { id: dto.statusId } });
  if (!status) throw new AppError(404, 'Workflow status not found');

  const existing = await prisma.workflowStep.findUnique({
    where: { workflowId_statusId: { workflowId, statusId: dto.statusId } },
  });
  if (existing) throw new AppError(409, 'Status already in workflow');

  if (dto.isInitial) {
    await prisma.workflowStep.updateMany({
      where: { workflowId, isInitial: true },
      data: { isInitial: false },
    });
  }

  const maxOrder = await prisma.workflowStep.aggregate({
    where: { workflowId },
    _max: { orderIndex: true },
  });
  const orderIndex = dto.orderIndex ?? (maxOrder._max.orderIndex ?? -1) + 1;

  const step = await prisma.workflowStep.create({
    data: { workflowId, statusId: dto.statusId, isInitial: dto.isInitial ?? false, orderIndex },
    include: { status: true },
  });
  await invalidateWorkflowCacheByWorkflowId(workflowId);
  return step;
}

export async function updateStep(workflowId: string, stepId: string, dto: UpdateWorkflowStepDto) {
  const wf = await prisma.workflow.findUnique({ where: { id: workflowId } });
  if (!wf) throw new AppError(404, 'Workflow not found');
  if (wf.isSystem) throw new AppError(400, 'SYSTEM_WORKFLOW_IMMUTABLE');

  const step = await prisma.workflowStep.findFirst({ where: { id: stepId, workflowId } });
  if (!step) throw new AppError(404, 'Workflow step not found');

  if (dto.isInitial) {
    await prisma.workflowStep.updateMany({
      where: { workflowId, isInitial: true },
      data: { isInitial: false },
    });
  }

  const updated = await prisma.workflowStep.update({
    where: { id: stepId },
    data: {
      ...(dto.isInitial !== undefined && { isInitial: dto.isInitial }),
      ...(dto.orderIndex !== undefined && { orderIndex: dto.orderIndex }),
    },
    include: { status: true },
  });
  await invalidateWorkflowCacheByWorkflowId(workflowId);
  return updated;
}

export async function deleteStep(workflowId: string, stepId: string) {
  const wf = await prisma.workflow.findUnique({ where: { id: workflowId } });
  if (!wf) throw new AppError(404, 'Workflow not found');
  if (wf.isSystem) throw new AppError(400, 'SYSTEM_WORKFLOW_IMMUTABLE');

  const step = await prisma.workflowStep.findFirst({ where: { id: stepId, workflowId } });
  if (!step) throw new AppError(404, 'Workflow step not found');

  await prisma.workflowStep.delete({ where: { id: stepId } });
  await invalidateWorkflowCacheByWorkflowId(workflowId);
  return { ok: true };
}

// ─── Transitions ─────────────────────────────────────────────────────────────

export async function listTransitions(workflowId: string) {
  const wf = await prisma.workflow.findUnique({ where: { id: workflowId } });
  if (!wf) throw new AppError(404, 'Workflow not found');

  return prisma.workflowTransition.findMany({
    where: { workflowId },
    orderBy: { orderIndex: 'asc' },
  });
}

async function assertStatusInWorkflow(workflowId: string, statusId: string | null | undefined, label: string) {
  if (!statusId) return;
  const step = await prisma.workflowStep.findUnique({
    where: { workflowId_statusId: { workflowId, statusId } },
  });
  if (!step) throw new AppError(400, `${label} must be a step in the workflow`);
}

export async function createTransition(workflowId: string, dto: CreateWorkflowTransitionDto) {
  const wf = await prisma.workflow.findUnique({ where: { id: workflowId } });
  if (!wf) throw new AppError(404, 'Workflow not found');
  if (wf.isSystem) throw new AppError(400, 'SYSTEM_WORKFLOW_IMMUTABLE');

  await assertStatusInWorkflow(workflowId, dto.fromStatusId, 'fromStatus');
  await assertStatusInWorkflow(workflowId, dto.toStatusId, 'toStatus');

  // Check duplicate
  const dup = await prisma.workflowTransition.findFirst({
    where: {
      workflowId,
      fromStatusId: dto.fromStatusId ?? null,
      toStatusId: dto.toStatusId,
    },
  });
  if (dup) throw new AppError(409, 'TRANSITION_ALREADY_EXISTS');

  const maxOrder = await prisma.workflowTransition.aggregate({
    where: { workflowId },
    _max: { orderIndex: true },
  });
  const orderIndex = dto.orderIndex ?? (maxOrder._max.orderIndex ?? -1) + 1;

  const transition = await prisma.workflowTransition.create({
    data: {
      workflowId,
      name: dto.name,
      fromStatusId: dto.fromStatusId ?? null,
      toStatusId: dto.toStatusId,
      isGlobal: dto.isGlobal ?? false,
      orderIndex,
      conditions: dto.conditions ? (dto.conditions as Prisma.InputJsonValue) : Prisma.JsonNull,
      validators: dto.validators ? (dto.validators as Prisma.InputJsonValue) : Prisma.JsonNull,
      postFunctions: dto.postFunctions ? (dto.postFunctions as Prisma.InputJsonValue) : Prisma.JsonNull,
      screenId: dto.screenId ?? null,
    },
  });
  await invalidateWorkflowCacheByWorkflowId(workflowId);
  return transition;
}

export async function updateTransition(
  workflowId: string,
  transitionId: string,
  dto: UpdateWorkflowTransitionDto,
) {
  const wf = await prisma.workflow.findUnique({ where: { id: workflowId } });
  if (!wf) throw new AppError(404, 'Workflow not found');
  if (wf.isSystem) throw new AppError(400, 'SYSTEM_WORKFLOW_IMMUTABLE');

  const transition = await prisma.workflowTransition.findFirst({
    where: { id: transitionId, workflowId },
  });
  if (!transition) throw new AppError(404, 'Workflow transition not found');

  if (dto.fromStatusId !== undefined) await assertStatusInWorkflow(workflowId, dto.fromStatusId, 'fromStatus');
  if (dto.toStatusId !== undefined) await assertStatusInWorkflow(workflowId, dto.toStatusId, 'toStatus');

  const updated = await prisma.workflowTransition.update({
    where: { id: transitionId },
    data: {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.fromStatusId !== undefined && { fromStatusId: dto.fromStatusId }),
      ...(dto.toStatusId !== undefined && { toStatusId: dto.toStatusId }),
      ...(dto.isGlobal !== undefined && { isGlobal: dto.isGlobal }),
      ...(dto.orderIndex !== undefined && { orderIndex: dto.orderIndex }),
      ...(dto.conditions !== undefined && { conditions: (dto.conditions as Prisma.InputJsonValue) ?? Prisma.JsonNull }),
      ...(dto.validators !== undefined && { validators: (dto.validators as Prisma.InputJsonValue) ?? Prisma.JsonNull }),
      ...(dto.postFunctions !== undefined && { postFunctions: (dto.postFunctions as Prisma.InputJsonValue) ?? Prisma.JsonNull }),
      ...(dto.screenId !== undefined && { screenId: dto.screenId }),
    },
  });
  await invalidateWorkflowCacheByWorkflowId(workflowId);
  return updated;
}

export async function deleteTransition(workflowId: string, transitionId: string) {
  const wf = await prisma.workflow.findUnique({ where: { id: workflowId } });
  if (!wf) throw new AppError(404, 'Workflow not found');
  if (wf.isSystem) throw new AppError(400, 'SYSTEM_WORKFLOW_IMMUTABLE');

  const transition = await prisma.workflowTransition.findFirst({
    where: { id: transitionId, workflowId },
  });
  if (!transition) throw new AppError(404, 'Workflow transition not found');

  await prisma.workflowTransition.delete({ where: { id: transitionId } });
  await invalidateWorkflowCacheByWorkflowId(workflowId);
  return { ok: true };
}
