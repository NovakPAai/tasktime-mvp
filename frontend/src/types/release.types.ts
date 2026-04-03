/** Release domain types — TTUI-125 */
import type { SprintState } from './sprint.types';

export type ReleaseLevel = 'MINOR' | 'MAJOR';
export type ReleaseState = 'DRAFT' | 'READY' | 'RELEASED';

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
  totalIssues: number;
  doneIssues: number;
  canMarkReady: boolean;
  canRelease: boolean;
}

export interface Release {
  id: string;
  projectId: string;
  name: string;
  description?: string | null;
  level: ReleaseLevel;
  state: ReleaseState;
  releaseDate?: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { issues: number; sprints?: number };
  project?: { id: string; name: string; key: string };
  sprints?: SprintInRelease[];
}
