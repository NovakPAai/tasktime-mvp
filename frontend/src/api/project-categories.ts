import api from './client';
import type { ProjectCategory } from '../types';

export async function listCategories(): Promise<ProjectCategory[]> {
  const { data } = await api.get<ProjectCategory[]>('/project-categories');
  return data;
}

export async function createCategory(body: { name: string; description?: string | null }): Promise<ProjectCategory> {
  const { data } = await api.post<ProjectCategory>('/project-categories', body);
  return data;
}

export async function updateCategory(
  id: string,
  body: { name?: string; description?: string | null },
): Promise<ProjectCategory> {
  const { data } = await api.patch<ProjectCategory>(`/project-categories/${id}`, body);
  return data;
}

export async function deleteCategory(id: string): Promise<void> {
  await api.delete(`/project-categories/${id}`);
}
