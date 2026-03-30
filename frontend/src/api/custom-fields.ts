import api from './client';

export type CustomFieldType =
  | 'TEXT'
  | 'TEXTAREA'
  | 'NUMBER'
  | 'DECIMAL'
  | 'DATE'
  | 'DATETIME'
  | 'URL'
  | 'CHECKBOX'
  | 'SELECT'
  | 'MULTI_SELECT'
  | 'USER'
  | 'LABEL'
  | 'REFERENCE';

export interface CustomFieldOption {
  value: string;
  label: string;
  color?: string;
}

export interface ReferenceItem {
  value: string;
  label: string;
  isEnabled: boolean;
}

export interface ReferenceOptions {
  maxValues: number;
  items: ReferenceItem[];
}

export interface CustomField {
  id: string;
  name: string;
  description: string | null;
  fieldType: CustomFieldType;
  options: CustomFieldOption[] | ReferenceOptions | null;
  isSystem: boolean;
  isEnabled: boolean;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
  _count?: { schemaItems: number; values: number };
}

export const customFieldsApi = {
  list: () =>
    api.get<CustomField[]>('/admin/custom-fields').then(r => r.data),

  create: (data: {
    name: string;
    description?: string;
    fieldType: CustomFieldType;
    options?: CustomFieldOption[] | ReferenceOptions;
  }) => api.post<CustomField>('/admin/custom-fields', data).then(r => r.data),

  get: (id: string) =>
    api.get<CustomField>(`/admin/custom-fields/${id}`).then(r => r.data),

  update: (id: string, data: { name?: string; description?: string; options?: CustomFieldOption[] | ReferenceOptions }) =>
    api.patch<CustomField>(`/admin/custom-fields/${id}`, data).then(r => r.data),

  delete: (id: string) =>
    api.delete(`/admin/custom-fields/${id}`).then(r => r.data),

  toggle: (id: string) =>
    api.patch<CustomField>(`/admin/custom-fields/${id}/toggle`).then(r => r.data),

  reorder: (updates: { id: string; orderIndex: number }[]) =>
    api.patch('/admin/custom-fields/reorder', { updates }).then(r => r.data),
};
