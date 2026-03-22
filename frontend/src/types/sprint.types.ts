/** Sprint domain types — TTUI-125 */
import type { Issue } from './issue.types';
import type { Team } from './team.types';

export type SprintState = 'PLANNED' | 'ACTIVE' | 'CLOSED';

export interface Sprint {
  id: string;
  projectId: string;
  name: string;
  goal?: string;
  startDate?: string;
  endDate?: string;
  state: SprintState;
  createdAt: string;
  _count?: { issues: number };
  project?: { id: string; name: string; key: string };
  projectTeam?: Team;
  businessTeam?: Team;
  flowTeam?: Team;
  stats?: { totalIssues: number; estimatedIssues: number; planningReadiness: number };
}

export interface SprintDetailsResponse {
  sprint: Sprint;
  issues: Issue[];
}
