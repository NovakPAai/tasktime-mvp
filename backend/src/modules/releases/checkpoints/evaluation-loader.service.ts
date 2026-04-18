// TTMP-160 PR-3: loader that turns a release ID into the pure-engine input
// (EvaluationIssue[] + EvaluationContext). One DB round-trip per entity class
// (release-items, custom fields, subtasks, inbound links) — no N+1.
//
// Isolated from both the engine (PR-2) and the router (below) so the scheduler
// in PR-4 can reuse it without going through HTTP.

import type { Prisma } from '@prisma/client';
import { prisma } from '../../../prisma/client.js';
import { AppError } from '../../../shared/middleware/error-handler.js';
import type {
  EvaluationBlocker,
  EvaluationContext,
  EvaluationIssue,
  EvaluationSubtask,
} from './evaluate-criterion.js';

export interface LoadedRelease {
  releaseId: string;
  plannedDate: Date | null;
  issues: EvaluationIssue[];
  context: EvaluationContext;
}

export async function loadEvaluationIssuesForRelease(
  releaseId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<LoadedRelease> {
  const release = await tx.release.findUnique({
    where: { id: releaseId },
    select: {
      id: true,
      plannedDate: true,
      items: {
        select: {
          issue: {
            select: {
              id: true,
              number: true,
              title: true,
              dueDate: true,
              assigneeId: true,
              project: { select: { key: true } },
              issueTypeConfig: { select: { systemKey: true } },
              workflowStatus: { select: { name: true, category: true } },
            },
          },
        },
      },
    },
  });

  if (!release) throw new AppError(404, 'Релиз не найден');

  const releaseItems = release.items
    .map((item) => item.issue)
    .filter((issue): issue is NonNullable<typeof issue> => issue !== null);

  if (releaseItems.length === 0) {
    return {
      releaseId,
      plannedDate: release.plannedDate,
      issues: [],
      context: { releasePlannedDate: release.plannedDate ?? new Date(0) },
    };
  }

  const issueIds = releaseItems.map((i) => i.id);

  // ─── Batch: custom field values + field names ─────────────────────────────
  const customFieldValues = await tx.issueCustomFieldValue.findMany({
    where: { issueId: { in: issueIds } },
    select: {
      issueId: true,
      customFieldId: true,
      value: true,
      customField: { select: { name: true } },
    },
  });

  const cfvByIssue = new Map<string, Map<string, unknown>>();
  const cfNamesByIssue = new Map<string, Map<string, string>>();
  for (const row of customFieldValues) {
    const extracted = extractCustomFieldValue(row.value);
    let valueMap = cfvByIssue.get(row.issueId);
    if (!valueMap) {
      valueMap = new Map();
      cfvByIssue.set(row.issueId, valueMap);
    }
    valueMap.set(row.customFieldId, extracted);

    let nameMap = cfNamesByIssue.get(row.issueId);
    if (!nameMap) {
      nameMap = new Map();
      cfNamesByIssue.set(row.issueId, nameMap);
    }
    nameMap.set(row.customFieldId, row.customField.name);
  }

  // ─── Batch: subtasks (self-relation via parentId) ─────────────────────────
  const subtasks = await tx.issue.findMany({
    where: { parentId: { in: issueIds } },
    select: {
      id: true,
      number: true,
      parentId: true,
      project: { select: { key: true } },
      workflowStatus: { select: { category: true } },
    },
  });

  const subtasksByParent = new Map<string, EvaluationSubtask[]>();
  for (const st of subtasks) {
    if (!st.parentId) continue;
    if (!st.workflowStatus) continue;
    const list = subtasksByParent.get(st.parentId) ?? [];
    list.push({
      id: st.id,
      key: `${st.project.key}-${st.number}`,
      statusCategory: st.workflowStatus.category,
    });
    subtasksByParent.set(st.parentId, list);
  }

  // ─── Batch: inbound links where target is one of the release issues ──────
  // MVP: only inbound links count as "blockers" on the target. The link type key
  // we hand to the engine is the raw IssueLinkType.name — system link types have
  // no stable systemKey today, and the criterion `linkTypeKeys` is a user-controlled
  // allowlist that the criterion editor (PR-5) populates from IssueLinkType.name.
  const inboundLinks = await tx.issueLink.findMany({
    where: { targetIssueId: { in: issueIds } },
    select: {
      targetIssueId: true,
      sourceIssue: {
        select: {
          number: true,
          project: { select: { key: true } },
          workflowStatus: { select: { category: true } },
        },
      },
      linkType: { select: { name: true } },
    },
  });

  const blockersByTarget = new Map<string, EvaluationBlocker[]>();
  for (const link of inboundLinks) {
    if (!link.sourceIssue?.workflowStatus) continue;
    const list = blockersByTarget.get(link.targetIssueId) ?? [];
    list.push({
      issueKey: `${link.sourceIssue.project.key}-${link.sourceIssue.number}`,
      statusCategory: link.sourceIssue.workflowStatus.category,
      linkTypeKey: link.linkType.name,
    });
    blockersByTarget.set(link.targetIssueId, list);
  }

  // ─── Assemble EvaluationIssue[] ──────────────────────────────────────────
  const issues: EvaluationIssue[] = releaseItems
    .filter((i) => i.workflowStatus !== null)
    .map((i) => ({
      id: i.id,
      key: `${i.project.key}-${i.number}`,
      title: i.title,
      issueTypeSystemKey: i.issueTypeConfig?.systemKey ?? null,
      statusCategory: i.workflowStatus!.category,
      statusName: i.workflowStatus!.name,
      assigneeId: i.assigneeId,
      dueDate: i.dueDate,
      customFieldValues: cfvByIssue.get(i.id) ?? new Map(),
      customFieldNames: cfNamesByIssue.get(i.id),
      subtasks: subtasksByParent.get(i.id) ?? [],
      blockers: blockersByTarget.get(i.id) ?? [],
    }));

  return {
    releaseId,
    plannedDate: release.plannedDate,
    issues,
    context: { releasePlannedDate: release.plannedDate ?? new Date(0) },
  };
}

// IssueCustomFieldValue.value is stored wrapped as `{ v: <actual> }` (see
// issue-custom-fields.service.ts). For MULTI_SELECT we canonically sort arrays so
// the engine's order-sensitive deep-equal for EQUALS doesn't produce phantom
// violations — see comment in evaluate-criterion.ts:EQUALS branch.
function extractCustomFieldValue(value: Prisma.JsonValue): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || Array.isArray(value)) return value;
  const v = (value as { v?: unknown }).v ?? null;
  if (Array.isArray(v)) {
    // Sort primitives deterministically; objects are compared by JSON representation.
    return [...v].sort((a, b) => {
      const sa = typeof a === 'string' ? a : JSON.stringify(a);
      const sb = typeof b === 'string' ? b : JSON.stringify(b);
      return sa < sb ? -1 : sa > sb ? 1 : 0;
    });
  }
  return v;
}
