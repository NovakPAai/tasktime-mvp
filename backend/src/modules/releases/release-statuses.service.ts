import { prisma } from '../../prisma/client.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import { getCachedJson, setCachedJson, delCachedJson } from '../../shared/redis.js';
import type { CreateReleaseStatusDto, UpdateReleaseStatusDto } from './release-statuses.dto.js';

const STATUS_CACHE_KEY = 'release-statuses:all';
const STATUS_CACHE_TTL = 600; // 10 minutes

async function invalidateStatusCache() {
  await delCachedJson(STATUS_CACHE_KEY);
}

const statusInclude = {
  _count: { select: { releases: true, workflowSteps: true } },
} as const;

export async function listReleaseStatuses() {
  const cached = await getCachedJson<unknown[]>(STATUS_CACHE_KEY);
  if (cached) return cached;

  const statuses = await prisma.releaseStatus.findMany({
    orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
    include: statusInclude,
  });

  await setCachedJson(STATUS_CACHE_KEY, statuses, STATUS_CACHE_TTL);
  return statuses;
}

export async function getReleaseStatus(id: string) {
  const status = await prisma.releaseStatus.findUnique({ where: { id }, include: statusInclude });
  if (!status) throw new AppError(404, 'Release status not found');
  return status;
}

export async function createReleaseStatus(dto: CreateReleaseStatusDto) {
  const status = await prisma.releaseStatus.create({
    data: {
      name: dto.name,
      category: dto.category,
      color: dto.color ?? '#888888',
      description: dto.description,
      orderIndex: dto.orderIndex ?? 0,
    },
    include: statusInclude,
  });
  await invalidateStatusCache();
  return status;
}

export async function updateReleaseStatus(id: string, dto: UpdateReleaseStatusDto) {
  const status = await prisma.releaseStatus.findUnique({ where: { id } });
  if (!status) throw new AppError(404, 'Release status not found');

  const updated = await prisma.releaseStatus.update({
    where: { id },
    data: {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.category !== undefined && { category: dto.category }),
      ...(dto.color !== undefined && { color: dto.color }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.orderIndex !== undefined && { orderIndex: dto.orderIndex }),
    },
    include: statusInclude,
  });
  await invalidateStatusCache();
  return updated;
}

export async function deleteReleaseStatus(id: string) {
  const status = await prisma.releaseStatus.findUnique({
    where: { id },
    include: { _count: { select: { releases: true, workflowSteps: true } } },
  });
  if (!status) throw new AppError(404, 'Release status not found');
  if (status._count.releases > 0) throw new AppError(400, 'RELEASE_STATUS_IN_USE');
  if (status._count.workflowSteps > 0) throw new AppError(400, 'RELEASE_STATUS_IN_USE');

  await prisma.releaseStatus.delete({ where: { id } });
  await invalidateStatusCache();
  return { ok: true };
}
