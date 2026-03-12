import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../prisma/client.js';
import type { CreateAiSessionDto } from './ai-sessions.dto.js';

export async function createAiSession(dto: CreateAiSessionDto) {
  const startedAt = new Date(dto.startedAt);
  const finishedAt = new Date(dto.finishedAt);

  const totalMs = finishedAt.getTime() - startedAt.getTime();
  const totalHours = totalMs > 0 ? totalMs / 3_600_000 : 0;

  const session = await prisma.aiSession.create({
    data: {
      issueId: dto.issueId,
      userId: dto.userId,
      model: dto.model,
      provider: dto.provider,
      startedAt,
      finishedAt,
      tokensInput: dto.tokensInput,
      tokensOutput: dto.tokensOutput,
      costMoney: new Decimal(dto.costMoney),
      notes: dto.notes,
    },
  });

  // Нормализуем коэффициенты на случай неточной суммы
  const totalRatio = dto.issueSplits.reduce((acc, s) => acc + s.ratio, 0);
  const safeTotalRatio = totalRatio > 0 ? totalRatio : 1;

  const logsData = dto.issueSplits.map((split) => {
    const normalizedRatio = split.ratio / safeTotalRatio;
    const hours = totalHours * normalizedRatio;
    const cost = dto.costMoney * normalizedRatio;

    return {
      issueId: split.issueId,
      userId: dto.userId ?? null,
      hours: new Decimal(Math.round(hours * 100) / 100),
      note: dto.notes ?? null,
      logDate: finishedAt,
      source: 'AGENT' as const,
      agentSessionId: session.id,
      startedAt,
      stoppedAt: finishedAt,
      costMoney: new Decimal(Math.round(cost * 10_000) / 10_000),
    };
  });

  if (logsData.length > 0) {
    await prisma.timeLog.createMany({ data: logsData });
  }

  return session;
}

