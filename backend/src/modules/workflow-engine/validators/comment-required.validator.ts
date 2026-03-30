import { prisma } from '../../../prisma/client.js';
import { AppError } from '../../../shared/middleware/error-handler.js';

export async function validateCommentRequired(issueId: string): Promise<void> {
  const count = await prisma.comment.count({ where: { issueId } });
  if (count === 0) {
    throw new AppError(422, 'VALIDATOR_FAILED', {
      validatorType: 'COMMENT_REQUIRED',
      message: 'At least one comment is required',
    });
  }
}
