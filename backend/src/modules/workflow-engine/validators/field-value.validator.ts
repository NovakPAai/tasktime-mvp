import { prisma } from '../../../prisma/client.js';
import { AppError } from '../../../shared/middleware/error-handler.js';
import type { ValidatorRule } from '../types.js';

export async function validateFieldValue(issueId: string, rule: Extract<ValidatorRule, { type: 'FIELD_VALUE' }>): Promise<void> {
  const cfv = await prisma.issueCustomFieldValue.findUnique({
    where: { issueId_customFieldId: { issueId, customFieldId: rule.customFieldId } },
    select: { value: true },
  });

  const rawValue = cfv?.value;
  const value = rawValue !== null && rawValue !== undefined && typeof rawValue === 'object' && 'v' in (rawValue as object)
    ? (rawValue as { v: unknown }).v
    : rawValue;

  if (rule.operator === 'NOT_EMPTY') {
    const isEmpty =
      value === null || value === undefined ||
      (typeof value === 'string' && value.trim() === '') ||
      (Array.isArray(value) && value.length === 0);

    if (isEmpty) {
      throw new AppError(422, 'VALIDATOR_FAILED', {
        validatorType: 'FIELD_VALUE',
        message: `Field ${rule.customFieldId} must not be empty`,
        details: { customFieldId: rule.customFieldId, operator: rule.operator },
      });
    }
  } else if (rule.operator === 'EQUALS') {
    if (JSON.stringify(value) !== JSON.stringify(rule.value)) {
      throw new AppError(422, 'VALIDATOR_FAILED', {
        validatorType: 'FIELD_VALUE',
        message: `Field ${rule.customFieldId} must equal expected value`,
        details: { customFieldId: rule.customFieldId, operator: rule.operator, expected: rule.value, actual: value },
      });
    }
  }
}
