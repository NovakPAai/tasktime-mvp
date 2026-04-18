// TTMP-160: Release Checkpoints — domain types.
// CheckpointCriterion is the AND-combined rule format evaluated per issue in a release.
// See docs/tz/TTMP-160.md §12.2–12.4 for algorithm.

import type { StatusCategory } from '@prisma/client';

export type CheckpointCriterion =
  | { type: 'STATUS_IN'; categories: StatusCategory[]; issueTypes?: string[] }
  | { type: 'DUE_BEFORE'; days: number; issueTypes?: string[] }
  | { type: 'ASSIGNEE_SET'; issueTypes?: string[] }
  | {
      type: 'CUSTOM_FIELD_VALUE';
      customFieldId: string;
      operator: 'EQUALS' | 'NOT_EMPTY' | 'IN';
      value?: unknown;
      issueTypes?: string[];
    }
  | { type: 'ALL_SUBTASKS_DONE'; issueTypes?: string[] }
  | { type: 'NO_BLOCKING_LINKS'; linkTypeKeys?: string[]; issueTypes?: string[] };

export type CheckpointCriterionType = CheckpointCriterion['type'];

export interface CheckpointViolation {
  issueId: string;
  issueKey: string;
  issueTitle: string;
  reason: string;
  criterionType: CheckpointCriterionType;
}

export interface CheckpointBreakdown {
  applicable: number;
  passed: number;
  violated: number;
}

export interface ReleaseRisk {
  score: number; // 0..1
  level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}
