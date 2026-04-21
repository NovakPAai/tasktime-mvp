// TTMP-160 PR-1: CheckpointType CRUD service (FR-1).
// Deletion is blocked while the type has active release_checkpoints (§12.11: 409 CHECKPOINT_TYPE_IN_USE).

import type { Prisma } from '@prisma/client';
import { prisma } from '../../../prisma/client.js';
import { AppError } from '../../../shared/middleware/error-handler.js';
import { isForeignKeyViolation, isUniqueViolation } from '../../../shared/utils/prisma-errors.js';
import type { CreateCheckpointTypeDto, UpdateCheckpointTypeDto } from './checkpoint.dto.js';

const typeInclude = {
  _count: { select: { releaseCheckpoints: true, templateItems: true } },
} as const;

export async function listCheckpointTypes(filters: { isActive?: boolean } = {}) {
  const where: Prisma.CheckpointTypeWhereInput = {};
  if (filters.isActive !== undefined) where.isActive = filters.isActive;

  return prisma.checkpointType.findMany({
    where,
    orderBy: [{ name: 'asc' }],
    include: typeInclude,
  });
}

export async function getCheckpointType(id: string) {
  const type = await prisma.checkpointType.findUnique({ where: { id }, include: typeInclude });
  if (!type) throw new AppError(404, 'Checkpoint type not found');
  return type;
}

/**
 * TTMP-160 PR-5: list the release instances that use this type. Powers the FR-15
 * "apply changes to N active instances?" modal.
 *
 * We intentionally return ALL states (PENDING / OK / VIOLATED), not only non-OK ones:
 * the user edited the type's criteria and may want to propagate the change to OK
 * instances too, because the next evaluation may produce a different result under the
 * new criteria. The UI shows the current `state` per row so the RM can make an informed
 * choice. Capped at 200 — if a type ends up with more instances than that, pagination
 * should be added (TODO).
 */
export async function listActiveInstances(id: string) {
  const type = await prisma.checkpointType.findUnique({ where: { id }, select: { id: true } });
  if (!type) throw new AppError(404, 'Checkpoint type not found');

  const rows = await prisma.releaseCheckpoint.findMany({
    where: { checkpointTypeId: id },
    select: {
      id: true,
      releaseId: true,
      deadline: true,
      state: true,
      release: {
        select: {
          name: true,
          plannedDate: true,
          project: { select: { key: true, name: true } },
        },
      },
    },
    orderBy: { deadline: 'asc' },
    take: 200,
  });
  return rows.map((r) => ({
    id: r.id,
    releaseId: r.releaseId,
    releaseName: r.release.name,
    releasePlannedDate: r.release.plannedDate ? r.release.plannedDate.toISOString().slice(0, 10) : null,
    projectKey: r.release.project?.key ?? null,
    projectName: r.release.project?.name ?? null,
    deadline: r.deadline.toISOString().slice(0, 10),
    state: r.state,
  }));
}

export async function createCheckpointType(dto: CreateCheckpointTypeDto) {
  try {
    return await prisma.checkpointType.create({
      data: {
        name: dto.name,
        description: dto.description ?? null,
        color: dto.color,
        weight: dto.weight,
        offsetDays: dto.offsetDays,
        warningDays: dto.warningDays,
        criteria: dto.criteria as unknown as Prisma.InputJsonValue,
        // TTSRH-1 PR-15: conditionMode + ttqlCondition должны быть persist'нуты
        // из DTO, иначе row сохраняется с default'ом STRUCTURED независимо от
        // того, что клиент валидировал через superRefine — schema-change inert.
        conditionMode: dto.conditionMode,
        ttqlCondition: dto.ttqlCondition ?? null,
        webhookUrl: dto.webhookUrl ?? null,
        minStableSeconds: dto.minStableSeconds,
        isActive: dto.isActive,
      },
      include: typeInclude,
    });
  } catch (err) {
    if (isUniqueViolation(err, 'name')) {
      throw new AppError(409, 'CHECKPOINT_TYPE_NAME_TAKEN');
    }
    throw err;
  }
}

export async function updateCheckpointType(id: string, dto: UpdateCheckpointTypeDto) {
  const existing = await prisma.checkpointType.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, 'Checkpoint type not found');

  const data: Prisma.CheckpointTypeUpdateInput = {};
  if (dto.name !== undefined) data.name = dto.name;
  if (dto.description !== undefined) data.description = dto.description ?? null;
  if (dto.color !== undefined) data.color = dto.color;
  if (dto.weight !== undefined) data.weight = dto.weight;
  if (dto.offsetDays !== undefined) data.offsetDays = dto.offsetDays;
  if (dto.warningDays !== undefined) data.warningDays = dto.warningDays;
  if (dto.criteria !== undefined) data.criteria = dto.criteria as unknown as Prisma.InputJsonValue;
  if (dto.conditionMode !== undefined) data.conditionMode = dto.conditionMode;
  if (dto.ttqlCondition !== undefined) data.ttqlCondition = dto.ttqlCondition ?? null;
  if (dto.webhookUrl !== undefined) data.webhookUrl = dto.webhookUrl ?? null;
  if (dto.minStableSeconds !== undefined) data.minStableSeconds = dto.minStableSeconds;
  if (dto.isActive !== undefined) data.isActive = dto.isActive;

  // TTSRH-1 PR-15: cross-field guard против PATCH-bypass. DTO superRefine
  // skip'ается если conditionMode absent в payload — но effective mode может
  // быть STRUCTURED из существующей row, а caller прислал только ttqlCondition.
  // Проверяем на effective-mode чтобы не оставлять contradictory row.
  const effectiveMode = dto.conditionMode ?? existing.conditionMode;
  const effectiveTtql =
    dto.ttqlCondition !== undefined ? dto.ttqlCondition : existing.ttqlCondition;
  if (effectiveMode === 'STRUCTURED' && effectiveTtql != null && effectiveTtql.length > 0) {
    throw new AppError(400, 'ttqlCondition must be empty in STRUCTURED mode');
  }
  if ((effectiveMode === 'TTQL' || effectiveMode === 'COMBINED') &&
      (effectiveTtql == null || effectiveTtql.trim().length === 0)) {
    throw new AppError(400, `${effectiveMode} mode requires a non-empty ttqlCondition`);
  }

  try {
    return await prisma.checkpointType.update({
      where: { id },
      data,
      include: typeInclude,
    });
  } catch (err) {
    if (isUniqueViolation(err, 'name')) {
      throw new AppError(409, 'CHECKPOINT_TYPE_NAME_TAKEN');
    }
    throw err;
  }
}

export async function deleteCheckpointType(id: string) {
  const type = await prisma.checkpointType.findUnique({
    where: { id },
    include: {
      releaseCheckpoints: {
        select: { releaseId: true, release: { select: { name: true } } },
        take: 20,
      },
      _count: { select: { releaseCheckpoints: true } },
    },
  });
  if (!type) throw new AppError(404, 'Checkpoint type not found');

  if (type._count.releaseCheckpoints > 0) {
    throw new AppError(409, 'CHECKPOINT_TYPE_IN_USE', {
      activeInstances: type.releaseCheckpoints.map((rc) => ({
        releaseId: rc.releaseId,
        releaseName: rc.release.name,
      })),
    });
  }

  try {
    await prisma.checkpointType.delete({ where: { id } });
  } catch (err) {
    // TOCTOU: a concurrent apply-template could have linked this type between the read above
    // and this delete. FK is ON DELETE RESTRICT, so Postgres surfaces P2003 — map to 409.
    if (isForeignKeyViolation(err)) {
      throw new AppError(409, 'CHECKPOINT_TYPE_IN_USE');
    }
    throw err;
  }
  return { ok: true };
}
