import api from './client';

export interface ProjectRole {
  id: string;
  role: 'ADMIN' | 'MANAGER' | 'USER' | 'VIEWER';
  projectId: string;
  project: { id: string; name: string; key: string };
  createdAt: string;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'USER' | 'VIEWER';
  isActive: boolean;
  isSystem: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  projectRoles: ProjectRole[];
  _count: { createdIssues: number; assignedIssues: number; timeLogs: number };
}

export interface AdminUsersResponse {
  users: AdminUser[];
  total: number;
  page: number;
  pageSize: number;
}

export const adminApi = {
  // Users
  listUsers: (params?: { search?: string; isActive?: boolean; page?: number; pageSize?: number }) =>
    api.get<AdminUsersResponse>('/admin/users', { params }).then(r => r.data),

  createUser: (data: { email: string; name: string; isSuperAdmin?: boolean }) =>
    api.post<{ user: AdminUser; tempPassword: string }>('/admin/users', data).then(r => r.data),

  updateUser: (id: string, data: { name?: string; email?: string; isActive?: boolean }) =>
    api.patch<AdminUser>(`/admin/users/${id}`, data).then(r => r.data),

  deleteUser: (id: string) =>
    api.delete(`/admin/users/${id}`).then(r => r.data),

  deactivateUser: (id: string) =>
    api.patch<AdminUser>(`/admin/users/${id}/deactivate`).then(r => r.data),

  resetPassword: (id: string) =>
    api.post<{ tempPassword: string }>(`/admin/users/${id}/reset-password`).then(r => r.data),

  // Project roles
  getUserRoles: (userId: string) =>
    api.get<ProjectRole[]>(`/admin/users/${userId}/roles`).then(r => r.data),

  assignRole: (userId: string, data: { projectId: string; role: string }) =>
    api.post<ProjectRole>(`/admin/users/${userId}/roles`, data).then(r => r.data),

  removeRole: (userId: string, roleId: string) =>
    api.delete(`/admin/users/${userId}/roles/${roleId}`).then(r => r.data),

  // Registration setting
  getRegistrationSetting: () =>
    api.get<{ registrationEnabled: boolean }>('/admin/settings/registration').then(r => r.data),

  setRegistrationSetting: (enabled: boolean) =>
    api.patch<{ registrationEnabled: boolean }>('/admin/settings/registration', { enabled }).then(r => r.data),
};

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
    AdminUsersResponse
  >('/admin/users');
  return data.users;
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

