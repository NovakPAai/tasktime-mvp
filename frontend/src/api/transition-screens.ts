import api from './client';
import type { CustomFieldType } from './custom-fields';

export interface TransitionScreenItem {
  id: string;
  screenId: string;
  customFieldId: string;
  customField: { id: string; name: string; fieldType: CustomFieldType };
  isRequired: boolean;
  orderIndex: number;
}

export interface TransitionScreen {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  items?: TransitionScreenItem[];
  _count?: { transitions: number; items: number };
}

export const transitionScreensApi = {
  list: () =>
    api.get<TransitionScreen[]>('/admin/transition-screens').then(r => r.data),

  get: (id: string) =>
    api.get<TransitionScreen>(`/admin/transition-screens/${id}`).then(r => r.data),

  create: (data: { name: string; description?: string }) =>
    api.post<TransitionScreen>('/admin/transition-screens', data).then(r => r.data),

  update: (id: string, data: { name?: string; description?: string }) =>
    api.patch<TransitionScreen>(`/admin/transition-screens/${id}`, data).then(r => r.data),

  delete: (id: string) =>
    api.delete(`/admin/transition-screens/${id}`).then(r => r.data),

  replaceItems: (id: string, items: { customFieldId: string; isRequired: boolean; orderIndex: number }[]) =>
    api.put<TransitionScreen>(`/admin/transition-screens/${id}/items`, { items }).then(r => r.data),
};
