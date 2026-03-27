import api from './client';
import type { CustomFieldType } from './custom-fields';

export interface TransitionScreenItem {
  id: string;
  screenId: string;
  customFieldId: string | null;
  systemFieldKey: string | null;
  customField: { id: string; name: string; fieldType: CustomFieldType } | null;
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

export type ReplaceItemPayload =
  | { customFieldId: string; systemFieldKey?: never; isRequired: boolean; orderIndex: number }
  | { systemFieldKey: string; customFieldId?: never; isRequired: boolean; orderIndex: number };

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

  replaceItems: (id: string, items: ReplaceItemPayload[]) =>
    api.put<TransitionScreen>(`/admin/transition-screens/${id}/items`, { items }).then(r => r.data),
};
