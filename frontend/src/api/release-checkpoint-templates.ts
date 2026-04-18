// TTMP-160 PR-5: CheckpointTemplate admin API client.

import api from './client';
import type { CheckpointWeight } from './release-checkpoint-types';

export interface CheckpointTemplateItem {
  id: string;
  templateId: string;
  checkpointTypeId: string;
  orderIndex: number;
  checkpointType: {
    id: string;
    name: string;
    color: string;
    weight: CheckpointWeight;
    offsetDays: number;
    isActive: boolean;
  };
}

export interface CheckpointTemplate {
  id: string;
  name: string;
  description?: string | null;
  createdById?: string | null;
  createdAt: string;
  updatedAt: string;
  items: CheckpointTemplateItem[];
  createdBy?: { id: string; name: string; email: string } | null;
}

export interface CreateCheckpointTemplateBody {
  name: string;
  description?: string | null;
  items: Array<{ checkpointTypeId: string; orderIndex: number }>;
}

export type UpdateCheckpointTemplateBody = Partial<CreateCheckpointTemplateBody>;

export async function listCheckpointTemplates(): Promise<CheckpointTemplate[]> {
  const { data } = await api.get<CheckpointTemplate[]>('/admin/checkpoint-templates');
  return data;
}

export async function getCheckpointTemplate(id: string): Promise<CheckpointTemplate> {
  const { data } = await api.get<CheckpointTemplate>(`/admin/checkpoint-templates/${id}`);
  return data;
}

export async function createCheckpointTemplate(
  body: CreateCheckpointTemplateBody,
): Promise<CheckpointTemplate> {
  const { data } = await api.post<CheckpointTemplate>('/admin/checkpoint-templates', body);
  return data;
}

export async function updateCheckpointTemplate(
  id: string,
  body: UpdateCheckpointTemplateBody,
): Promise<CheckpointTemplate> {
  const { data } = await api.patch<CheckpointTemplate>(`/admin/checkpoint-templates/${id}`, body);
  return data;
}

export async function deleteCheckpointTemplate(id: string): Promise<void> {
  await api.delete(`/admin/checkpoint-templates/${id}`);
}

export async function cloneCheckpointTemplate(
  id: string,
  body?: { name?: string },
): Promise<CheckpointTemplate> {
  const { data } = await api.post<CheckpointTemplate>(
    `/admin/checkpoint-templates/${id}/clone`,
    body ?? {},
  );
  return data;
}
