import type { SystemRoleType } from '@prisma/client';
import type { ConditionRule } from '../types.js';

interface ConditionContext {
  actorId: string;
  actorRoles: SystemRoleType[];
  issue: {
    assigneeId: string | null;
    creatorId: string;
  };
}

export function evaluateConditions(rules: ConditionRule[], ctx: ConditionContext): boolean {
  return rules.every((rule) => evaluateCondition(rule, ctx));
}

function evaluateCondition(rule: ConditionRule, ctx: ConditionContext): boolean {
  switch (rule.type) {
    case 'USER_HAS_GLOBAL_ROLE':
      return rule.roles.some((r) => ctx.actorRoles.includes(r));

    case 'USER_IS_ASSIGNEE':
      return ctx.actorId === ctx.issue.assigneeId;

    case 'USER_IS_REPORTER':
      return ctx.actorId === ctx.issue.creatorId;

    case 'ANY_OF':
      return rule.conditions.some((c) => evaluateCondition(c, ctx));

    case 'ALL_OF':
      return rule.conditions.every((c) => evaluateCondition(c, ctx));

    default:
      return true;
  }
}
