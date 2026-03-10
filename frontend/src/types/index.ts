export type UserRole = 'ADMIN' | 'MANAGER' | 'USER' | 'VIEWER';
export type IssueType = 'EPIC' | 'STORY' | 'TASK' | 'SUBTASK' | 'BUG';
export type IssueStatus = 'OPEN' | 'IN_PROGRESS' | 'REVIEW' | 'DONE' | 'CANCELLED';
export type IssuePriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

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
  parentId?: string;
  assigneeId?: string;
  creatorId: string;
  assignee?: { id: string; name: string; email?: string };
  creator?: { id: string; name: string };
  parent?: { id: string; title: string; type: IssueType; number: number };
  children?: Issue[];
  project?: { id: string; name: string; key: string };
  _count?: { children: number };
  createdAt: string;
  updatedAt: string;
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
  userId: string;
  hours: number;
  note?: string;
  startedAt?: string;
  stoppedAt?: string;
  logDate: string;
  createdAt: string;
  user?: { id: string; name: string };
  issue?: { id: string; title: string; number: number; project?: { key: string } };
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

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}
