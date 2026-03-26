import type { UserRole, StatusCategory } from '@prisma/client';

// ─── Conditions ───────────────────────────────────────────────────────────────

export type ConditionRule =
  | { type: 'USER_HAS_GLOBAL_ROLE'; roles: UserRole[] }
  | { type: 'USER_IS_ASSIGNEE' }
  | { type: 'USER_IS_REPORTER' }
  | { type: 'ANY_OF'; conditions: ConditionRule[] }
  | { type: 'ALL_OF'; conditions: ConditionRule[] };

// ─── Validators ───────────────────────────────────────────────────────────────

export type ValidatorRule =
  | { type: 'REQUIRED_FIELDS'; fieldIds?: string[] }
  | { type: 'ALL_SUBTASKS_DONE' }
  | { type: 'COMMENT_REQUIRED' }
  | { type: 'TIME_LOGGED'; minHours?: number }
  | { type: 'FIELD_VALUE'; customFieldId: string; operator: 'NOT_EMPTY' | 'EQUALS'; value?: unknown };

// ─── Post-functions ───────────────────────────────────────────────────────────

export type PostFunctionRule =
  | { type: 'ASSIGN_TO_REPORTER' }
  | { type: 'ASSIGN_TO_CURRENT_USER' }
  | { type: 'CLEAR_ASSIGNEE' }
  | { type: 'SET_FIELD_VALUE'; customFieldId: string; value: unknown }
  | { type: 'TRIGGER_WEBHOOK'; url: string; method?: 'POST' | 'GET'; includeIssue?: boolean }
  | { type: 'LOG_AUDIT'; action: string };

// ─── Response types ───────────────────────────────────────────────────────────

export interface TransitionScreenFieldResponse {
  customFieldId: string;
  name: string;
  fieldType: string;
  isRequired: boolean;
  orderIndex: number;
}

export interface TransitionResponse {
  id: string;
  name: string;
  toStatus: {
    id: string;
    name: string;
    category: StatusCategory;
    color: string;
  };
  requiresScreen: boolean;
  screenFields?: TransitionScreenFieldResponse[];
}

export interface AvailableTransitionsResponse {
  currentStatus: {
    id: string;
    name: string;
    category: StatusCategory;
    color: string;
  } | null;
  transitions: TransitionResponse[];
}
