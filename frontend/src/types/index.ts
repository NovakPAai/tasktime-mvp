export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'USER' | 'VIEWER';
export type IssueType = 'EPIC' | 'STORY' | 'TASK' | 'SUBTASK' | 'BUG';
export type IssueStatus = 'OPEN' | 'IN_PROGRESS' | 'REVIEW' | 'DONE' | 'CANCELLED';
export type IssuePriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type AiExecutionStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE' | 'FAILED';
export type AiAssigneeType = 'HUMAN' | 'AGENT' | 'MIXED';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  key: string;
  description?: string;
  createdAt: string;
  _count?: { issues: number };
}

export interface Issue {
  id: string;
  projectId: string;
  number: number;
  title: string;
  description?: string;
  type: IssueType;
  status: IssueStatus;
  priority: IssuePriority;
  aiEligible?: boolean;
  aiExecutionStatus?: AiExecutionStatus;
  aiAssigneeType?: AiAssigneeType;
  parentId?: string;
  assigneeId?: string;
  creatorId: string;
  assignee?: { id: string; name: string; email?: string };
  creator?: { id: string; name: string };
  parent?: { id: string; title: string; type: IssueType; number: number };
  children?: Issue[];
  project?: { id: string; name: string; key: string };
  releaseId?: string | null;
  estimatedHours?: number | null;
  _count?: { children: number };
  createdAt: string;
  updatedAt: string;
}

export interface IssueLinkType {
  id: string;
  name: string;
  outboundName: string;
  inboundName: string;
  isActive: boolean;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IssueLink {
  id: string;
  createdAt: string;
  linkType: Pick<IssueLinkType, 'id' | 'name' | 'outboundName' | 'inboundName'>;
  sourceIssue: { id: string; number: number; title: string; type: IssueType; status: IssueStatus; project: { key: string } };
  targetIssue: { id: string; number: number; title: string; type: IssueType; status: IssueStatus; project: { key: string } };
  createdBy: { id: string; name: string };
}

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

export type ReleaseLevel = 'MINOR' | 'MAJOR';
export type ReleaseState = 'DRAFT' | 'READY' | 'RELEASED';

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
  _count?: { issues: number };
  project?: { id: string; name: string; key: string };
}

export interface Comment {
  id: string;
  issueId: string;
  authorId: string;
  body: string;
  author?: { id: string; name: string; email?: string };
  createdAt: string;
  updatedAt: string;
}

export interface TimeLog {
  id: string;
  issueId: string;
  userId?: string | null;
  hours: number;
  note?: string;
  startedAt?: string;
  stoppedAt?: string;
  logDate: string;
  createdAt: string;
  user?: { id: string; name: string };
  issue?: { id: string; title: string; number: number; project?: { key: string } };
  source?: 'HUMAN' | 'AGENT';
  agentSessionId?: string | null;
  costMoney?: number | null;
  agentSession?: { model: string; provider: string };
}

export interface UserTimeSummary {
  userId: string;
  humanHours: number;
  agentHours: number;
  totalHours: number;
  agentCost: number;
}

export interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: Record<string, unknown>;
  user?: { id: string; name: string };
  createdAt: string;
}

export interface BoardData {
  projectId: string;
  sprintId: string | null;
  columns: Record<IssueStatus, Issue[]>;
}

export interface TeamMember {
  id: string;
  userId: string;
  teamId: string;
  role?: string | null;
  createdAt: string;
  user: User;
}

export interface Team {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  members?: TeamMember[];
  _count?: { members: number };
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}
