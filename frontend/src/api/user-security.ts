import api from './client';

export interface SecurityProjectRole {
  project: { id: string; key: string; name: string };
  role: { id: string; name: string; key: string; permissions: string[] };
  source: 'DIRECT' | 'GROUP';
  sourceGroups: { id: string; name: string }[];
}

export interface SecurityGroupMembership {
  id: string;
  name: string;
  addedAt: string;
  memberCount: number;
}

export interface UserSecurityPayload {
  user: { id: string; name: string; email: string };
  groups: SecurityGroupMembership[];
  projectRoles: SecurityProjectRole[];
  updatedAt: string;
}

export const userSecurityApi = {
  getMine: () => api.get<UserSecurityPayload>('/users/me/security').then(r => r.data),
  getByUser: (userId: string) =>
    api.get<UserSecurityPayload>(`/admin/users/${userId}/security`).then(r => r.data),
};
