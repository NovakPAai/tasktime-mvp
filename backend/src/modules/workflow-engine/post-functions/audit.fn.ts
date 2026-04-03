import { Prisma } from '@prisma/client';
import { prisma } from '../../../prisma/client.js';
import type { PostFunctionRule } from '../types.js';

export async function runAuditPostFunction(
  issueId: string,
  actorId: string,
  rule: Extract<PostFunctionRule, { type: 'LOG_AUDIT' }>,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      action: rule.action,
      entityType: 'issue',
      entityId: issueId,
      userId: actorId,
      details: { source: 'post_function' } as Prisma.InputJsonValue,
    },
  });
}
