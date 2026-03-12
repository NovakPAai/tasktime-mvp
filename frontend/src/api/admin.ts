import api from './client';

export interface AdminStats {
  counts: {
    users: number;
    projects: number;
    issues: number;
    timeLogs: number;
  };
  issuesByStatus: { status: string; _count: { _all: number } }[];
  issuesByAssignee: { assigneeId: string | null; assigneeName: string | null; _count: { _all: number } }[];
  recentActivity: {
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    details?: Record<string, unknown> | null;
    createdAt: string;
    user?: { id: string; name: string; email: string };
  }[];
}

export async function getStats(): Promise<AdminStats> {
  const { data } = await api.get<AdminStats>('/admin/stats');
  return data;
}

export async function listAdminUsers() {
  const { data } = await api.get<
    {
      id: string;
      email: string;
      name: string;
      role: string;
      isActive: boolean;
      createdAt: string;
      _count: { createdIssues: number; assignedIssues: number; timeLogs: number };
    }[]
  >('/admin/users');
  return data;
}

export async function getIssuesByStatusReport(params: {
  projectId: string;
  sprintId?: string;
  from?: string;
  to?: string;
}) {
  const { data } = await api.get<{ status: string; _count: { _all: number } }[]>('/admin/reports/issues-by-status', {
    params,
  });
  return data;
}

export async function getIssuesByAssigneeReport(params: {
  projectId: string;
  sprintId?: string;
  from?: string;
  to?: string;
}) {
  const { data } = await api.get<{ assigneeId: string | null; _count: { _all: number } }[]>(
    '/admin/reports/issues-by-assignee',
    { params }
  );
  return data;
}

