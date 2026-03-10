import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../prisma/client.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import type { ManualTimeDto } from './time.dto.js';

export async function startTimer(issueId: string, userId: string) {
  const issue = await prisma.issue.findUnique({ where: { id: issueId } });
  if (!issue) throw new AppError(404, 'Issue not found');

  // Check for already running timer for this user
  const running = await prisma.timeLog.findFirst({
    where: { userId, stoppedAt: null, startedAt: { not: null } },
  });
  if (running) throw new AppError(400, 'Timer already running. Stop it first.');

  return prisma.timeLog.create({
    data: {
      issueId,
      userId,
      hours: new Decimal(0),
      startedAt: new Date(),
    },
  });
}

export async function stopTimer(issueId: string, userId: string) {
  const running = await prisma.timeLog.findFirst({
    where: { issueId, userId, stoppedAt: null, startedAt: { not: null } },
  });
  if (!running) throw new AppError(404, 'No running timer found');

  const now = new Date();
  const hours = (now.getTime() - running.startedAt!.getTime()) / 3600000;

  return prisma.timeLog.update({
    where: { id: running.id },
    data: { stoppedAt: now, hours: new Decimal(Math.round(hours * 100) / 100) },
  });
}

export async function logManual(issueId: string, userId: string, dto: ManualTimeDto) {
  const issue = await prisma.issue.findUnique({ where: { id: issueId } });
  if (!issue) throw new AppError(404, 'Issue not found');

  return prisma.timeLog.create({
    data: {
      issueId,
      userId,
      hours: new Decimal(dto.hours),
      note: dto.note,
      logDate: dto.logDate ? new Date(dto.logDate) : new Date(),
    },
  });
}

export async function getIssueLogs(issueId: string) {
  return prisma.timeLog.findMany({
    where: { issueId },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getUserLogs(userId: string) {
  return prisma.timeLog.findMany({
    where: { userId },
    include: { issue: { select: { id: true, title: true, number: true, project: { select: { key: true } } } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

export async function getActiveTimer(userId: string) {
  return prisma.timeLog.findFirst({
    where: { userId, stoppedAt: null, startedAt: { not: null } },
    include: { issue: { select: { id: true, title: true, number: true, project: { select: { key: true } } } } },
  });
}
