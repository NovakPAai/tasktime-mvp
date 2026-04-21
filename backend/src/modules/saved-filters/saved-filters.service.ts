/**
 * TTSRH-1 PR-7 — SavedFilter CRUD + sharing + favorite + useCount tracking.
 *
 * Публичный API:
 *   • listFilters(userId, scope?) — возвращает фильтры по scope'у.
 *   • getFilter(userId, filterId) — с RBAC-проверкой (R-SF-1).
 *   • createFilter(userId, dto) — + audit.
 *   • updateFilter(userId, filterId, dto) — owner OR SHARED-WRITE (R-SF-2).
 *   • deleteFilter(userId, filterId) — только owner.
 *   • setFavorite(userId, filterId, value) — доступ по R-SF-1 (read-доступ).
 *   • shareFilter(userId, filterId, dto) — только owner. Replace-семантика на shares.
 *   • incrementUseStats(userId, filterId) — вызывает фронт при execute.
 *   • getUserFavorites(userId, limit) — top-N по useCount/lastUsedAt (для сайдбара).
 *
 * Инварианты:
 *   • R-SF-1 (read): owner всегда; PRIVATE — только owner; SHARED — owner ∪ shares (user
 *     direct или через UserGroupMember); PUBLIC — любой аутентифицированный.
 *   • R-SF-2 (write): owner всегда; SHARED с permission=WRITE — user из shares; PUBLIC
 *     даже write-запрещён другим.
 *   • Share создаёт строки SavedFilterShare с XOR (userId ⊕ groupId) — DB-level CHECK
 *     constraint не даёт нарушить это. Replace-семантика: старые shares удаляются,
 *     новые создаются в одной транзакции.
 *   • `useCount` инкрементируется атомарно через `{ increment: 1 }` (race-safe).
 *   • AuditLog пишется после успешной мутации (не перед — чтобы не логировать
 *     неуспешные попытки).
 *
 * Не бросает на DB-ошибках — пробрасывает AppError с http-status.
 */

import type { FilterPermission, FilterVisibility, Prisma, SavedFilter } from '@prisma/client';
import { prisma } from '../../prisma/client.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import type { CreateDto, UpdateDto, ShareDto } from './saved-filters.dto.js';

export type SavedFilterScope = 'mine' | 'shared' | 'public' | 'favorite';

export interface FilterShareView {
  id: string;
  userId: string | null;
  groupId: string | null;
  permission: FilterPermission;
}

export interface SavedFilterView {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  jql: string;
  visibility: FilterVisibility;
  columns: string[] | null;
  isFavorite: boolean;
  lastUsedAt: Date | null;
  useCount: number;
  createdAt: Date;
  updatedAt: Date;
  shares: FilterShareView[];
  permission: 'READ' | 'WRITE';
}

type SavedFilterWithShares = SavedFilter & {
  shares: { id: string; userId: string | null; groupId: string | null; permission: FilterPermission }[];
};

function toView(filter: SavedFilterWithShares, viewerUserId: string, canWrite: boolean): SavedFilterView {
  return {
    id: filter.id,
    ownerId: filter.ownerId,
    name: filter.name,
    description: filter.description,
    jql: filter.jql,
    visibility: filter.visibility,
    columns: Array.isArray(filter.columns) ? (filter.columns as string[]) : null,
    isFavorite: filter.ownerId === viewerUserId ? filter.isFavorite : false,
    lastUsedAt: filter.lastUsedAt,
    useCount: filter.useCount,
    createdAt: filter.createdAt,
    updatedAt: filter.updatedAt,
    shares: filter.shares.map((s) => ({
      id: s.id,
      userId: s.userId,
      groupId: s.groupId,
      permission: s.permission,
    })),
    permission: canWrite ? 'WRITE' : 'READ',
  };
}

async function getUserGroupIds(userId: string): Promise<string[]> {
  const rows = await prisma.userGroupMember.findMany({
    where: { userId },
    select: { groupId: true },
  });
  return rows.map((r) => r.groupId);
}

interface AccessDecision {
  filter: SavedFilterWithShares;
  canRead: boolean;
  canWrite: boolean;
}

async function resolveAccess(userId: string, filterId: string): Promise<AccessDecision> {
  const filter = await prisma.savedFilter.findUnique({
    where: { id: filterId },
    include: { shares: true },
  });
  if (!filter) throw new AppError(404, 'SavedFilter not found');

  if (filter.ownerId === userId) return { filter, canRead: true, canWrite: true };

  if (filter.visibility === 'PRIVATE') return { filter, canRead: false, canWrite: false };

  if (filter.visibility === 'PUBLIC') return { filter, canRead: true, canWrite: false };

  // SHARED: check direct user-share OR group-membership.
  const directShare = filter.shares.find((s) => s.userId === userId);
  if (directShare) {
    return { filter, canRead: true, canWrite: directShare.permission === 'WRITE' };
  }

  const userGroupIds = await getUserGroupIds(userId);
  if (userGroupIds.length > 0) {
    const groupShare = filter.shares.find((s) => s.groupId !== null && userGroupIds.includes(s.groupId));
    if (groupShare) {
      return { filter, canRead: true, canWrite: groupShare.permission === 'WRITE' };
    }
  }

  return { filter, canRead: false, canWrite: false };
}

export async function listFilters(userId: string, scope: SavedFilterScope = 'mine'): Promise<SavedFilterView[]> {
  if (scope === 'mine') {
    const rows = await prisma.savedFilter.findMany({
      where: { ownerId: userId },
      include: { shares: true },
      orderBy: [{ updatedAt: 'desc' }],
    });
    return rows.map((r) => toView(r, userId, true));
  }

  if (scope === 'favorite') {
    const rows = await prisma.savedFilter.findMany({
      where: { ownerId: userId, isFavorite: true },
      include: { shares: true },
      orderBy: [{ useCount: 'desc' }, { lastUsedAt: 'desc' }],
    });
    return rows.map((r) => toView(r, userId, true));
  }

  if (scope === 'public') {
    const rows = await prisma.savedFilter.findMany({
      where: { visibility: 'PUBLIC' },
      include: { shares: true },
      orderBy: [{ updatedAt: 'desc' }],
      take: 200,
    });
    return rows.map((r) => toView(r, userId, r.ownerId === userId));
  }

  // scope === 'shared': filters shared with me directly OR via my groups, excluding ones I own.
  const userGroupIds = await getUserGroupIds(userId);
  const rows = await prisma.savedFilter.findMany({
    where: {
      visibility: 'SHARED',
      ownerId: { not: userId },
      shares: {
        some: {
          OR: [
            { userId },
            ...(userGroupIds.length > 0 ? [{ groupId: { in: userGroupIds } }] : []),
          ],
        },
      },
    },
    include: { shares: true },
    orderBy: [{ updatedAt: 'desc' }],
    take: 200,
  });
  return rows.map((r) => {
    const directShare = r.shares.find((s) => s.userId === userId);
    const groupShare = r.shares.find((s) => s.groupId !== null && userGroupIds.includes(s.groupId));
    const canWrite = directShare?.permission === 'WRITE' || groupShare?.permission === 'WRITE';
    return toView(r, userId, Boolean(canWrite));
  });
}

export async function getFilter(userId: string, filterId: string): Promise<SavedFilterView> {
  const { filter, canRead, canWrite } = await resolveAccess(userId, filterId);
  if (!canRead) throw new AppError(403, 'Forbidden');
  return toView(filter, userId, canWrite);
}

async function resolveShareTargets(
  input: { users?: string[]; groups?: string[] } | undefined,
): Promise<{ userIds: string[]; groupIds: string[] }> {
  const userIds = Array.from(new Set(input?.users ?? []));
  const groupIds = Array.from(new Set(input?.groups ?? []));

  if (userIds.length > 0) {
    const existing = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true },
    });
    if (existing.length !== userIds.length) {
      throw new AppError(400, 'One or more users do not exist');
    }
  }
  if (groupIds.length > 0) {
    const existing = await prisma.userGroup.findMany({
      where: { id: { in: groupIds } },
      select: { id: true },
    });
    if (existing.length !== groupIds.length) {
      throw new AppError(400, 'One or more groups do not exist');
    }
  }
  return { userIds, groupIds };
}

export async function createFilter(userId: string, dto: CreateDto): Promise<SavedFilterView> {
  const visibility = dto.visibility ?? 'PRIVATE';

  // sharedWith only meaningful for SHARED; on PRIVATE/PUBLIC we silently drop to avoid surprises.
  const shouldWriteShares = visibility === 'SHARED';
  const { userIds, groupIds } = shouldWriteShares
    ? await resolveShareTargets(dto.sharedWith)
    : { userIds: [], groupIds: [] };
  const permission: FilterPermission = dto.sharedWith?.permission ?? 'READ';

  const created = await prisma.$transaction(async (tx) => {
    const filter = await tx.savedFilter.create({
      data: {
        ownerId: userId,
        name: dto.name,
        description: dto.description ?? null,
        jql: dto.jql,
        visibility,
        columns: dto.columns ? (dto.columns as Prisma.InputJsonValue) : undefined,
      },
    });
    if (shouldWriteShares && (userIds.length > 0 || groupIds.length > 0)) {
      await tx.savedFilterShare.createMany({
        data: [
          ...userIds.map((id) => ({ filterId: filter.id, userId: id, permission })),
          ...groupIds.map((id) => ({ filterId: filter.id, groupId: id, permission })),
        ],
      });
    }
    return tx.savedFilter.findUniqueOrThrow({
      where: { id: filter.id },
      include: { shares: true },
    });
  });

  await prisma.auditLog.create({
    data: {
      action: 'savedFilter.created',
      entityType: 'savedFilter',
      entityId: created.id,
      userId,
      details: {
        name: created.name,
        visibility: created.visibility,
        shareCount: created.shares.length,
      },
    },
  });

  return toView(created, userId, true);
}

export async function updateFilter(userId: string, filterId: string, dto: UpdateDto): Promise<SavedFilterView> {
  const { filter, canRead, canWrite } = await resolveAccess(userId, filterId);
  if (!canRead) throw new AppError(403, 'Forbidden');
  if (!canWrite) throw new AppError(403, 'Forbidden');

  const data: Prisma.SavedFilterUpdateInput = {};
  if (dto.name !== undefined) data.name = dto.name;
  if (dto.description !== undefined) data.description = dto.description;
  if (dto.jql !== undefined) data.jql = dto.jql;
  if (dto.visibility !== undefined && filter.ownerId === userId) data.visibility = dto.visibility;
  if (dto.columns !== undefined) {
    data.columns = dto.columns as Prisma.InputJsonValue;
  }

  const updated = await prisma.savedFilter.update({
    where: { id: filterId },
    data,
    include: { shares: true },
  });

  await prisma.auditLog.create({
    data: {
      action: 'savedFilter.updated',
      entityType: 'savedFilter',
      entityId: filterId,
      userId,
      details: {
        changedKeys: Object.keys(data),
      },
    },
  });

  return toView(updated, userId, true);
}

export async function deleteFilter(userId: string, filterId: string): Promise<void> {
  const filter = await prisma.savedFilter.findUnique({ where: { id: filterId }, select: { ownerId: true } });
  if (!filter) throw new AppError(404, 'SavedFilter not found');
  if (filter.ownerId !== userId) throw new AppError(403, 'Only the owner may delete this filter');

  await prisma.savedFilter.delete({ where: { id: filterId } });

  await prisma.auditLog.create({
    data: {
      action: 'savedFilter.deleted',
      entityType: 'savedFilter',
      entityId: filterId,
      userId,
    },
  });
}

export async function setFavorite(userId: string, filterId: string, value: boolean): Promise<SavedFilterView> {
  const { filter, canRead } = await resolveAccess(userId, filterId);
  if (!canRead) throw new AppError(403, 'Forbidden');

  // We only toggle isFavorite on filters owned by the user — favorites are a per-user flag, but
  // the current schema stores it as a single field on SavedFilter so only the owner may use it.
  // Non-owners who want to bookmark shared filters need a future "per-user favorite" table.
  if (filter.ownerId !== userId) {
    throw new AppError(400, 'Favoriting shared/public filters is not supported yet');
  }

  const updated = await prisma.savedFilter.update({
    where: { id: filterId },
    data: { isFavorite: value },
    include: { shares: true },
  });
  return toView(updated, userId, true);
}

export async function shareFilter(userId: string, filterId: string, dto: ShareDto): Promise<SavedFilterView> {
  const existing = await prisma.savedFilter.findUnique({ where: { id: filterId }, select: { ownerId: true, visibility: true } });
  if (!existing) throw new AppError(404, 'SavedFilter not found');
  if (existing.ownerId !== userId) throw new AppError(403, 'Only the owner may share this filter');

  const { userIds, groupIds } = await resolveShareTargets(dto);
  const permission: FilterPermission = dto.permission ?? 'READ';

  const updated = await prisma.$transaction(async (tx) => {
    await tx.savedFilterShare.deleteMany({ where: { filterId } });
    if (userIds.length > 0 || groupIds.length > 0) {
      await tx.savedFilterShare.createMany({
        data: [
          ...userIds.map((id) => ({ filterId, userId: id, permission })),
          ...groupIds.map((id) => ({ filterId, groupId: id, permission })),
        ],
      });
      // If someone shared to a list while visibility is still PRIVATE, promote to SHARED.
      if (existing.visibility === 'PRIVATE') {
        await tx.savedFilter.update({ where: { id: filterId }, data: { visibility: 'SHARED' } });
      }
    }
    return tx.savedFilter.findUniqueOrThrow({
      where: { id: filterId },
      include: { shares: true },
    });
  });

  await prisma.auditLog.create({
    data: {
      action: 'savedFilter.shared',
      entityType: 'savedFilter',
      entityId: filterId,
      userId,
      details: {
        userCount: userIds.length,
        groupCount: groupIds.length,
        permission,
      },
    },
  });

  return toView(updated, userId, true);
}

export async function incrementUseStats(userId: string, filterId: string): Promise<void> {
  const { canRead } = await resolveAccess(userId, filterId);
  if (!canRead) throw new AppError(403, 'Forbidden');
  await prisma.savedFilter.update({
    where: { id: filterId },
    data: { useCount: { increment: 1 }, lastUsedAt: new Date() },
  });
}

export async function getUserFavorites(userId: string, limit = 5): Promise<SavedFilterView[]> {
  const rows = await prisma.savedFilter.findMany({
    where: { ownerId: userId, isFavorite: true },
    include: { shares: true },
    orderBy: [{ useCount: 'desc' }, { lastUsedAt: 'desc' }],
    take: limit,
  });
  return rows.map((r) => toView(r, userId, true));
}
