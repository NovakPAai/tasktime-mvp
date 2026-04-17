import api from './client';

export interface ProjectRolePermission {
  id: string;
  roleId: string;
  permission: string;
  granted: boolean;
}

export interface ProjectRoleDefinition {
  id: string;
  schemeId: string;
  name: string;
  key: string;
  description: string | null;
  color: string | null;
  isSystem: boolean;
  permissions: ProjectRolePermission[];
  _count?: { userProjectRoles: number };
}

export interface ProjectRoleSchemeProject {
  projectId: string;
  project: { id: string; name: string; key: string };
}

export interface ProjectRoleScheme {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  roles: ProjectRoleDefinition[];
  projects: ProjectRoleSchemeProject[];
  _count?: { roles: number; projects: number };
}

export const roleSchemesApi = {
  list: () =>
    api.get<ProjectRoleScheme[]>('/admin/role-schemes').then(r => r.data),
  get: (id: string) =>
    api.get<ProjectRoleScheme>(`/admin/role-schemes/${id}`).then(r => r.data),
  create: (data: { name: string; description?: string; isDefault?: boolean }) =>
    api.post<ProjectRoleScheme>('/admin/role-schemes', data).then(r => r.data),
  update: (id: string, data: { name?: string; description?: string | null; isDefault?: boolean }) =>
    api.patch<ProjectRoleScheme>(`/admin/role-schemes/${id}`, data).then(r => r.data),
  delete: (id: string) =>
    api.delete(`/admin/role-schemes/${id}`).then(r => r.data),
  attachProject: (id: string, projectId: string) =>
    api.post(`/admin/role-schemes/${id}/projects`, { projectId }).then(r => r.data),
  detachProject: (id: string, projectId: string) =>
    api.delete(`/admin/role-schemes/${id}/projects/${projectId}`).then(r => r.data),
  listRoles: (id: string) =>
    api.get<ProjectRoleDefinition[]>(`/admin/role-schemes/${id}/roles`).then(r => r.data),
  createRole: (id: string, data: { name: string; key: string; description?: string; color?: string }) =>
    api.post<ProjectRoleDefinition>(`/admin/role-schemes/${id}/roles`, data).then(r => r.data),
  updateRole: (id: string, roleId: string, data: { name?: string; description?: string | null; color?: string | null }) =>
    api.patch<ProjectRoleDefinition>(`/admin/role-schemes/${id}/roles/${roleId}`, data).then(r => r.data),
  deleteRole: (id: string, roleId: string) =>
    api.delete(`/admin/role-schemes/${id}/roles/${roleId}`).then(r => r.data),
  getPermissions: (id: string, roleId: string) =>
    api.get<ProjectRolePermission[]>(`/admin/role-schemes/${id}/roles/${roleId}/permissions`).then(r => r.data),
  updatePermissions: (id: string, roleId: string, permissions: Record<string, boolean>) =>
    api.patch<ProjectRoleDefinition>(`/admin/role-schemes/${id}/roles/${roleId}/permissions`, { permissions }).then(r => r.data),
  getForProject: (projectId: string) =>
    api.get<ProjectRoleScheme>(`/projects/${projectId}/role-scheme`).then(r => r.data),
};
