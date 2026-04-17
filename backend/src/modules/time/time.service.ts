import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../prisma/client.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import type { AuthUser } from '../../shared/types/index.js';
import { assertProjectPermission } from '../../shared/middleware/rbac.js';
import type { ManualTimeDto } from './time.dto.js';
import { buildUserTimeSummary } from './time.domain.js';
import { getCachedJson, setCachedJson, delCachedJson } from '../../shared/redis.js';

export async function startTimer(issueId: string, userId: string) {
  const issue = await prisma.issue.findUnique({ where: { id: issueId } });
  if (!issue) throw new AppError(404, 'Issue not found');

  // Check for already running timer for this user
  const running = await prisma.timeLog.findFirst({
    where: { userId, stoppedAt: null, startedAt: { not: null } },
  });
  if (running) throw new AppError(400, 'Timer already running. Stop it first.');

  const log = await prisma.timeLog.create({
    data: {
      issueId,
      userId,
      hours: new Decimal(0),
      startedAt: new Date(),
      source: 'HUMAN',
    },
  });

  await delCachedJson(`time:summary:${userId}`);
  return log;
}

export async function stopTimer(issueId: string, userId: string) {
  const running = await prisma.timeLog.findFirst({
    where: { issueId, userId, stoppedAt: null, startedAt: { not: null } },
  });
  if (!running) throw new AppError(404, 'No running timer found');

  const now = new Date();
  const hours = (now.getTime() - running.startedAt!.getTime()) / 3600000;

  const log = await prisma.timeLog.update({
    where: { id: running.id },
    data: {
      stoppedAt: now,
      hours: new Decimal(Math.round(hours * 100) / 100),
      source: 'HUMAN',
    },
  });

  await delCachedJson(`time:summary:${userId}`);
  return log;
}

export async function logManual(issueId: string, userId: string, dto: ManualTimeDto) {
  const issue = await prisma.issue.findUnique({ where: { id: issueId } });
  if (!issue) throw new AppError(404, 'Issue not found');

  const log = await prisma.timeLog.create({
    data: {
      issueId,
      userId,
      hours: new Decimal(dto.hours),
      note: dto.note,
      logDate: dto.logDate ? new Date(dto.logDate) : new Date(),
      source: 'HUMAN',
    },
  });

  await delCachedJson(`time:summary:${userId}`);
  return log;
}

export async function getIssueLogs(issueId: string) {
  return prisma.timeLog.findMany({
    where: { issueId },
    include: {
      user: { select: { id: true, name: true } },
      agentSession: { select: { model: true, provider: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getUserLogs(userId: string) {
  return prisma.timeLog.findMany({
    where: { userId },
    include: {
      issue: {
        select: { id: true, title: true, number: true, project: { select: { key: true } } },
      },
      agentSession: { select: { model: true, provider: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

/**
 * TTSEC-2 Phase 2: delete a time log. Owner always may delete their own. Otherwise require
 * `TIME_LOGS_DELETE_OTHERS` OR `TIME_LOGS_MANAGE` in the log's project.
 */
export async function deleteTimeLog(id: string, user: AuthUser) {
  const log = await prisma.timeLog.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      issue: { select: { projectId: true } },
    },
  });
  if (!log) throw new AppError(404, 'Time log not found');

  if (log.userId !== user.userId) {
    await assertProjectPermission(user, log.issue.projectId, [
      'TIME_LOGS_DELETE_OTHERS',
      'TIME_LOGS_MANAGE',
    ]);
  }

  await prisma.timeLog.delete({ where: { id } });
  await delCachedJson(`time:summary:${log.userId}`);
}

export async function getUserTimeSummary(userId: string) {
  const cacheKey = `time:summary:${userId}`;
  type TimeSummary = ReturnType<typeof buildUserTimeSummary>;
  const cached = await getCachedJson<TimeSummary>(cacheKey);
  if (cached) return cached;

  const [groupedHours, agentTotals] = await Promise.all([
    prisma.timeLog.groupBy({
      by: ['source'],
      where: { userId },
      _sum: { hours: true },
    }),
    prisma.timeLog.aggregate({
      where: { userId, source: 'AGENT' },
      _sum: { costMoney: true },
    }),
  ]);

  const humanHours = groupedHours.find((group) => group.source === 'HUMAN')?._sum.hours;
  const agentHours = groupedHours.find((group) => group.source === 'AGENT')?._sum.hours;

  const summary = buildUserTimeSummary(userId, {
    humanHours,
    agentHours,
    agentCost: agentTotals._sum.costMoney,
  });

  await setCachedJson(cacheKey, summary);
  return summary;
}

export async function getActiveTimer(userId: string) {
  return prisma.timeLog.findFirst({
    where: { userId, stoppedAt: null, startedAt: { not: null } },
    include: { issue: { select: { id: true, title: true, number: true, project: { select: { key: true } } } } },
  });
}
