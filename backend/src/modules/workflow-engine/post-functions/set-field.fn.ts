import { Prisma } from '@prisma/client';
import { prisma } from '../../../prisma/client.js';
import type { PostFunctionRule } from '../types.js';

export async function runSetFieldPostFunction(
  issueId: string,
  actorId: string,
  rule: Extract<PostFunctionRule, { type: 'SET_FIELD_VALUE' }>,
): Promise<void> {
  await prisma.issueCustomFieldValue.upsert({
    where: { issueId_customFieldId: { issueId, customFieldId: rule.customFieldId } },
    update: { value: rule.value as Prisma.InputJsonValue, updatedById: actorId },
    create: { issueId, customFieldId: rule.customFieldId, value: rule.value as Prisma.InputJsonValue, updatedById: actorId },
  });
}
