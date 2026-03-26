import { prisma } from '../../../prisma/client.js';
import { AppError } from '../../../shared/middleware/error-handler.js';
import { getApplicableFields } from '../../issue-custom-fields/issue-custom-fields.service.js';
import type { ValidatorRule } from '../types.js';

export async function validateRequiredFields(issueId: string, rule: Extract<ValidatorRule, { type: 'REQUIRED_FIELDS' }>): Promise<void> {
  const fields = await getApplicableFields(issueId);
  const required = rule.fieldIds && rule.fieldIds.length > 0
    ? fields.filter((f) => rule.fieldIds!.includes(f.customFieldId) && f.isRequired)
    : fields.filter((f) => f.isRequired);

  if (required.length === 0) return;

  const values = await prisma.issueCustomFieldValue.findMany({
    where: { issueId, customFieldId: { in: required.map((f) => f.customFieldId) } },
    select: { customFieldId: true, value: true },
  });

  const valueMap = new Map(values.map((v) => [v.customFieldId, v.value]));

  const missing = required.filter((f) => {
    const val = valueMap.get(f.customFieldId);
    if (val === undefined || val === null) return true;
    if (typeof val === 'string' && val.trim() === '') return true;
    if (Array.isArray(val) && val.length === 0) return true;
    if (typeof val === 'object' && !Array.isArray(val) && 'v' in (val as object)) {
      const inner = (val as { v: unknown }).v;
      if (inner === null || inner === undefined) return true;
      if (typeof inner === 'string' && inner.trim() === '') return true;
      if (Array.isArray(inner) && inner.length === 0) return true;
    }
    return false;
  });

  if (missing.length > 0) {
    throw new AppError(422, 'VALIDATOR_FAILED', {
      validatorType: 'REQUIRED_FIELDS',
      message: 'Required fields are missing',
      details: missing.map((f) => ({ customFieldId: f.customFieldId, name: f.name, fieldType: f.fieldType })),
    });
  }
}
