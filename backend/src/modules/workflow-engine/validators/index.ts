import type { ValidatorRule } from '../types.js';
import { validateRequiredFields } from './required-fields.validator.js';
import { validateAllSubtasksDone } from './subtasks-done.validator.js';
import { validateCommentRequired } from './comment-required.validator.js';
import { validateTimeLogged } from './time-logged.validator.js';
import { validateFieldValue } from './field-value.validator.js';

export async function runValidators(issueId: string, rules: ValidatorRule[]): Promise<void> {
  for (const rule of rules) {
    switch (rule.type) {
      case 'REQUIRED_FIELDS':
        await validateRequiredFields(issueId, rule);
        break;
      case 'ALL_SUBTASKS_DONE':
        await validateAllSubtasksDone(issueId);
        break;
      case 'COMMENT_REQUIRED':
        await validateCommentRequired(issueId);
        break;
      case 'TIME_LOGGED':
        await validateTimeLogged(issueId, rule);
        break;
      case 'FIELD_VALUE':
        await validateFieldValue(issueId, rule);
        break;
    }
  }
}
