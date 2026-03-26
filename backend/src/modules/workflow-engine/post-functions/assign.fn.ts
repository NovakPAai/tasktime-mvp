import { prisma } from '../../../prisma/client.js';
import type { PostFunctionRule } from '../types.js';

export async function runAssignPostFunction(
  issueId: string,
  actorId: string,
  rule: Extract<PostFunctionRule, { type: 'ASSIGN_TO_REPORTER' | 'ASSIGN_TO_CURRENT_USER' | 'CLEAR_ASSIGNEE' }>,
): Promise<void> {
  if (rule.type === 'ASSIGN_TO_CURRENT_USER') {
    await prisma.issue.update({ where: { id: issueId }, data: { assigneeId: actorId } });
  } else if (rule.type === 'ASSIGN_TO_REPORTER') {
    const issue = await prisma.issue.findUnique({ where: { id: issueId }, select: { creatorId: true } });
    if (issue) {
      await prisma.issue.update({ where: { id: issueId }, data: { assigneeId: issue.creatorId } });
    }
  } else {
    await prisma.issue.update({ where: { id: issueId }, data: { assigneeId: null } });
  }
}
