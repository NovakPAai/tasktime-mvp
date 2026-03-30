import { prisma } from '../../../prisma/client.js';
import { AppError } from '../../../shared/middleware/error-handler.js';
import type { ValidatorRule } from '../types.js';

export async function validateTimeLogged(issueId: string, rule: Extract<ValidatorRule, { type: 'TIME_LOGGED' }>): Promise<void> {
  const result = await prisma.timeLog.aggregate({
    where: { issueId },
    _sum: { hours: true },
  });

  const totalHours = Number(result._sum.hours ?? 0);

  if (totalHours === 0) {
    throw new AppError(422, 'VALIDATOR_FAILED', {
      validatorType: 'TIME_LOGGED',
      message: 'No time has been logged for this issue',
    });
  }

  if (rule.minHours !== undefined && totalHours < rule.minHours) {
    throw new AppError(422, 'VALIDATOR_FAILED', {
      validatorType: 'TIME_LOGGED',
      message: `At least ${rule.minHours} hours must be logged (current: ${totalHours})`,
      details: { required: rule.minHours, actual: totalHours },
    });
  }
}
