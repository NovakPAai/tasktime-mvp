import { prisma } from '../../../prisma/client.js';
import { AppError } from '../../../shared/middleware/error-handler.js';

export async function validateAllSubtasksDone(issueId: string): Promise<void> {
  const children = await prisma.issue.findMany({
    where: { parentId: issueId },
    include: { workflowStatus: { select: { category: true } } },
  });

  if (children.length === 0) return;

  const undone = children.filter((c) => {
    if (c.workflowStatus) {
      return c.workflowStatus.category !== 'DONE';
    }
    return c.status !== 'DONE' && c.status !== 'CANCELLED';
  });

  if (undone.length > 0) {
    throw new AppError(422, 'VALIDATOR_FAILED', {
      validatorType: 'ALL_SUBTASKS_DONE',
      message: `${undone.length} subtask(s) are not done`,
      details: { undoneCount: undone.length },
    });
  }
}
