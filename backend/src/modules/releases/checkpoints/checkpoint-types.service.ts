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
  if (dto.webhookUrl !== undefined) data.webhookUrl = dto.webhookUrl ?? null;
  if (dto.minStableSeconds !== undefined) data.minStableSeconds = dto.minStableSeconds;
  if (dto.isActive !== undefined) data.isActive = dto.isActive;

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
