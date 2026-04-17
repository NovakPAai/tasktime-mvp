import api from './client';

export interface UserGroupMember {
  groupId: string;
  userId: string;
  addedAt: string;
  addedById: string | null;
  user: { id: string; name: string; email: string; isActive: boolean };
  addedBy: { id: string; name: string } | null;
}

export interface UserGroupProjectRole {
  id: string;
  groupId: string;
  projectId: string;
  roleId: string;
  schemeId: string;
  createdAt: string;
  project: { id: string; key: string; name: string };
  roleDefinition: { id: string; name: string; key: string; color: string | null };
}

export interface UserGroupListItem {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { members: number; projectRoles: number };
}

export interface UserGroupDetail extends UserGroupListItem {
  members: UserGroupMember[];
  projectRoles: UserGroupProjectRole[];
}

export interface UserGroupImpact {
  memberCount: number;
  projectCount: number;
  members: { id: string; name: string; email: string }[];
  projects: {
    project: { id: string; key: string; name: string };
    roleDefinition: { id: string; name: string; key: string };
  }[];
}

export const userGroupsApi = {
  list: (search?: string) =>
    api.get<UserGroupListItem[]>('/admin/user-groups', { params: search ? { search } : undefined }).then(r => r.data),
  get: (id: string) =>
    api.get<UserGroupDetail>(`/admin/user-groups/${id}`).then(r => r.data),
  getImpact: (id: string) =>
    api.get<UserGroupImpact>(`/admin/user-groups/${id}/impact`).then(r => r.data),
  create: (data: { name: string; description?: string | null }) =>
    api.post<UserGroupListItem>('/admin/user-groups', data).then(r => r.data),
  update: (id: string, data: { name?: string; description?: string | null }) =>
    api.patch<UserGroupListItem>(`/admin/user-groups/${id}`, data).then(r => r.data),
  remove: (id: string) =>
    api.delete(`/admin/user-groups/${id}`, { params: { confirm: 'true' } }).then(r => r.data),
  addMembers: (id: string, userIds: string[]) =>
    api.post<{ added: number }>(`/admin/user-groups/${id}/members`, { userIds }).then(r => r.data),
  removeMember: (id: string, userId: string) =>
    api.delete(`/admin/user-groups/${id}/members/${userId}`).then(r => r.data),
  grantProjectRole: (id: string, data: { projectId: string; roleId: string }) =>
    api.post<UserGroupProjectRole>(`/admin/user-groups/${id}/project-roles`, data).then(r => r.data),
  revokeProjectRole: (id: string, projectId: string) =>
    api.delete(`/admin/user-groups/${id}/project-roles/${projectId}`).then(r => r.data),
};
