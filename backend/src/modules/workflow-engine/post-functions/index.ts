import { Prisma } from '@prisma/client';
import { prisma } from '../../../prisma/client.js';
import type { PostFunctionRule } from '../types.js';
import { runAssignPostFunction } from './assign.fn.js';
import { runSetFieldPostFunction } from './set-field.fn.js';
import { runWebhookPostFunction } from './webhook.fn.js';
import { runAuditPostFunction } from './audit.fn.js';

export async function runPostFunctions(
  issueId: string,
  actorId: string,
  rules: PostFunctionRule[],
  issueData?: unknown,
): Promise<void> {
  for (const rule of rules) {
    try {
      switch (rule.type) {
        case 'ASSIGN_TO_REPORTER':
        case 'ASSIGN_TO_CURRENT_USER':
        case 'CLEAR_ASSIGNEE':
          await runAssignPostFunction(issueId, actorId, rule);
          break;
        case 'SET_FIELD_VALUE':
          await runSetFieldPostFunction(issueId, actorId, rule);
          break;
        case 'TRIGGER_WEBHOOK':
          await runWebhookPostFunction(issueId, rule, issueData);
          break;
        case 'LOG_AUDIT':
          await runAuditPostFunction(issueId, actorId, rule);
          break;
      }
    } catch (err) {
      // Post-function errors do NOT rollback the transition — log and continue
      await prisma.auditLog.create({
        data: {
          action: 'post_function.failed',
          entityType: 'issue',
          entityId: issueId,
          userId: actorId,
          details: {
            ruleType: rule.type,
            error: err instanceof Error ? err.message : String(err),
          } as Prisma.InputJsonValue,
        },
      }).catch(() => {});
    }
  }
}
