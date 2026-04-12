/** Release domain types — TTMP-178 */
import type { SprintState } from './sprint.types';

export type ReleaseType = 'ATOMIC' | 'INTEGRATION';
export type ReleaseLevel = 'MINOR' | 'MAJOR';
export type ReleaseState = 'DRAFT' | 'READY' | 'RELEASED'; // legacy field

export interface ReleaseStatus {
  id: string;
  name: string;
  category: string;
  color: string;
}

export interface SprintInRelease {
  id: string;
  name: string;
  state: SprintState;
  startDate?: string | null;
  endDate?: string | null;
  _count?: { issues: number };
  issues?: { id: string; status: string }[];
}

export interface ReleaseReadiness {
  totalSprints: number;
  closedSprints: number;
  totalItems: number;
  doneItems: number;
  cancelledItems: number;
  inProgressItems: number;
  completionPercent: number;
  byProject: Array<{ projectId: string; key: string; name: string; total: number; done: number }>;
  // legacy fields
  totalIssues?: number;
  doneIssues?: number;
  canMarkReady?: boolean;
  canRelease?: boolean;
}

export interface ReleaseTransition {
  id: string;
  name: string;
  toStatus: ReleaseStatus;
}

export interface ReleaseTransitionsResponse {
  currentStatus: ReleaseStatus | null;
  transitions: ReleaseTransition[];
}

export interface ReleaseAuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown> | null;
  createdAt: string;
  user: { id: string; name: string } | null;
}

export interface ReleaseItem {
  id: string;
  releaseId: string;
  issueId: string;
  issue: {
    id: string;
    number: number;
    title: string;
    status: string;
    priority: string;
    projectId: string;
    project: { id: string; name: string; key: string };
    assignee: { id: string; name: string } | null;
    issueTypeConfig: { id: string; name: string; systemKey: string; iconColor: string };
    workflowStatus: { id: string; name: string; category: string; color: string } | null;
  };
}

export interface Release {
  id: string;
  projectId?: string | null;
  type: ReleaseType;
  name: string;
  description?: string | null;
  level: ReleaseLevel;
  state: ReleaseState;
  statusId?: string | null;
  status?: ReleaseStatus | null;
  workflowId?: string | null;
  releaseDate?: string | null;
  plannedDate?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: { id: string; name: string } | null;
  project?: { id: string; name: string; key: string } | null;
  _count?: { issues?: number; sprints?: number; items?: number };
  _projects?: string[];
  sprints?: SprintInRelease[];
}
