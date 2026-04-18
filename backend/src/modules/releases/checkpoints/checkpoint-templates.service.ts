// TTMP-160 PR-1: CheckpointTemplate CRUD + clone service (FR-2).
// Templates are ordered bundles of CheckpointTypes applied to a release in one action (PR-3).

import type { Prisma } from '@prisma/client';
import { prisma } from '../../../prisma/client.js';
import { AppError } from '../../../shared/middleware/error-handler.js';
import { isUniqueViolation } from '../../../shared/utils/prisma-errors.js';
import type {
  CreateCheckpointTemplateDto,
  UpdateCheckpointTemplateDto,
  CloneCheckpointTemplateDto,
} from './checkpoint.dto.js';

const templateInclude = {
  items: {
    orderBy: { orderIndex: 'asc' as const },
    include: {
      checkpointType: {
        select: { id: true, name: true, color: true, weight: true, offsetDays: true, isActive: true },
      },
    },
  },
  createdBy: { select: { id: true, name: true, email: true } },
} as const;

export async function listCheckpointTemplates() {
  return prisma.checkpointTemplate.findMany({
    orderBy: [{ name: 'asc' }],
    include: templateInclude,
  });
}

export async function getCheckpointTemplate(id: string) {
  const template = await prisma.checkpointTemplate.findUnique({
    where: { id },
    include: templateInclude,
  });
  if (!template) throw new AppError(404, 'Checkpoint template not found');
  return template;
}

export async function createCheckpointTemplate(
  dto: CreateCheckpointTemplateDto,
  createdById: string,
) {
  await assertCheckpointTypesExist(dto.items.map((i) => i.checkpointTypeId));

  try {
    return await prisma.checkpointTemplate.create({
      data: {
        name: dto.name,
        description: dto.description ?? null,
        createdById,
        items: {
          create: dto.items.map((i) => ({
            checkpointTypeId: i.checkpointTypeId,
            orderIndex: i.orderIndex,
          })),
        },
      },
      include: templateInclude,
    });
  } catch (err) {
    if (isUniqueViolation(err, 'name')) {
      throw new AppError(409, 'CHECKPOINT_TEMPLATE_NAME_TAKEN');
    }
    throw err;
  }
}

export async function updateCheckpointTemplate(id: string, dto: UpdateCheckpointTemplateDto) {
  const existing = await prisma.checkpointTemplate.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, 'Checkpoint template not found');

  if (dto.items) {
    await assertCheckpointTypesExist(dto.items.map((i) => i.checkpointTypeId));
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const data: Prisma.CheckpointTemplateUpdateInput = {};
      if (dto.name !== undefined) data.name = dto.name;
      if (dto.description !== undefined) data.description = dto.description ?? null;
      await tx.checkpointTemplate.update({ where: { id }, data });

      if (dto.items) {
        // Replace items wholesale — simpler than diff-merge for v1; template-size capped at 20.
        await tx.checkpointTemplateItem.deleteMany({ where: { templateId: id } });
        await tx.checkpointTemplateItem.createMany({
          data: dto.items.map((i) => ({
            templateId: id,
            checkpointTypeId: i.checkpointTypeId,
            orderIndex: i.orderIndex,
          })),
        });
      }

      return tx.checkpointTemplate.findUniqueOrThrow({ where: { id }, include: templateInclude });
    });
  } catch (err) {
    if (isUniqueViolation(err, 'name')) {
      throw new AppError(409, 'CHECKPOINT_TEMPLATE_NAME_TAKEN');
    }
    // Composite unique on (template_id, checkpoint_type_id): duplicate type slipped past Zod
    // refine (service is callable from future internal callers that might bypass the DTO).
    if (isUniqueViolation(err, 'template_id') || isUniqueViolation(err, 'checkpoint_type_id')) {
      throw new AppError(400, 'CHECKPOINT_TEMPLATE_DUPLICATE_TYPE');
    }
    throw err;
  }
}

// Safe to delete unconditionally: criteria and offsetDays are snapshot-copied into
// ReleaseCheckpoint at apply-time (FR-15), so deleting a template does not affect any
// release-checkpoint instance that was created from it. Template items cascade.
export async function deleteCheckpointTemplate(id: string) {
  const existing = await prisma.checkpointTemplate.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, 'Checkpoint template not found');

  await prisma.checkpointTemplate.delete({ where: { id } });
  return { ok: true };
}

export async function cloneCheckpointTemplate(
  id: string,
  dto: CloneCheckpointTemplateDto,
  createdById: string,
) {
  const source = await prisma.checkpointTemplate.findUnique({
    where: { id },
    include: { items: true },
  });
  if (!source) throw new AppError(404, 'Checkpoint template not found');

  const clonedName = dto.name ?? buildClonedName(source.name);

  try {
    return await prisma.checkpointTemplate.create({
      data: {
        name: clonedName,
        description: source.description,
        createdById,
        items: {
          create: source.items.map((i) => ({
            checkpointTypeId: i.checkpointTypeId,
            orderIndex: i.orderIndex,
          })),
        },
      },
      include: templateInclude,
    });
  } catch (err) {
    if (isUniqueViolation(err, 'name')) {
      throw new AppError(409, 'CHECKPOINT_TEMPLATE_NAME_TAKEN');
    }
    throw err;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Existence only — inactive types are intentionally allowed inside a template so that
// templates remain stable artifacts when a type is temporarily archived. The apply-template
// flow (PR-3) copies criteriaSnapshot at that point and may decide what to do with inactive
// types there.
async function assertCheckpointTypesExist(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const found = await prisma.checkpointType.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  const foundIds = new Set(found.map((t) => t.id));
  const missing = ids.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    throw new AppError(400, 'CHECKPOINT_TYPES_NOT_FOUND', { missingIds: missing });
  }
}

function buildClonedName(originalName: string): string {
  // Ant Design-style "Copy" suffix — short enough to fit within the 100-char cap.
  const suffix = ' (копия)';
  const maxLen = 100;
  if (originalName.length + suffix.length <= maxLen) return `${originalName}${suffix}`;
  return originalName.slice(0, maxLen - suffix.length) + suffix;
}
