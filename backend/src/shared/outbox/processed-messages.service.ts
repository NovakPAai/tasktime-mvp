import type { Prisma } from '@prisma/client';

import { prisma } from '../../prisma/client.js';

type PrismaLike = Pick<typeof prisma, 'processedMessage'> | Prisma.TransactionClient;

export async function markProcessedOnce(
  consumerGroup: string,
  messageId: string,
  client: PrismaLike = prisma,
): Promise<boolean> {
  try {
    await client.processedMessage.create({
      data: { consumerGroup, messageId },
    });
    return true;
  } catch (err) {
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code?: string }).code === 'P2002'
    ) {
      return false;
    }
    throw err;
  }
}

export async function hasProcessedMessage(
  consumerGroup: string,
  messageId: string,
  client: PrismaLike = prisma,
): Promise<boolean> {
  const count = await client.processedMessage.count({
    where: { consumerGroup, messageId },
  });
  return count > 0;
}
