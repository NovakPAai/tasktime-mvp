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

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}
