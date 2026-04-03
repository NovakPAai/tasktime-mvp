import api from './client';
import type { CustomField } from './custom-fields';

export type FieldSchemaStatus = 'DRAFT' | 'ACTIVE';
export type FieldScopeType = 'GLOBAL' | 'PROJECT' | 'ISSUE_TYPE' | 'PROJECT_ISSUE_TYPE';
export type ConflictSeverity = 'ERROR' | 'WARNING';
export type ConflictType = 'FIELD_DUPLICATE_SAME_SCOPE' | 'REQUIRED_MISMATCH' | 'KANBAN_OVERFLOW';

export interface SchemaItem {
  id: string;
  schemaId: string;
  customFieldId: string;
  orderIndex: number;
  isRequired: boolean;
  showOnKanban: boolean;
  customField: CustomField;
}

export interface SchemaBinding {
  id: string;
  schemaId: string;
  scopeType: FieldScopeType;
  projectId: string | null;
  issueTypeConfigId: string | null;
  project: { id: string; name: string; key: string } | null;
  issueTypeConfig: { id: string; name: string } | null;
}

export interface FieldSchema {
  id: string;
  name: string;
  description: string | null;
  status: FieldSchemaStatus;
  isDefault: boolean;
  copiedFromId: string | null;
  createdAt: string;
  updatedAt: string;
  items: SchemaItem[];
  bindings: SchemaBinding[];
}

export interface ConflictItem {
  conflictType: ConflictType;
  severity: ConflictSeverity;
  description: string;
  customFieldId?: string;
  customFieldName?: string;
  conflictingSchemaId?: string;
  conflictingSchemaName?: string;
  scopeType?: string;
}

export interface ConflictCheckResult {
  hasErrors: boolean;
  hasWarnings: boolean;
  conflicts: ConflictItem[];
}

export const fieldSchemasApi = {
  list: () =>
    api.get<FieldSchema[]>('/admin/field-schemas').then(r => r.data),

  get: (id: string) =>
    api.get<FieldSchema>(`/admin/field-schemas/${id}`).then(r => r.data),

  create: (data: { name: string; description?: string }) =>
    api.post<FieldSchema>('/admin/field-schemas', data).then(r => r.data),

  update: (id: string, data: { name?: string; description?: string }) =>
    api.patch<FieldSchema>(`/admin/field-schemas/${id}`, data).then(r => r.data),

  delete: (id: string) =>
    api.delete(`/admin/field-schemas/${id}`).then(r => r.data),

  copy: (id: string, data: { name: string; description?: string; copyBindings?: boolean }) =>
    api.post<FieldSchema>(`/admin/field-schemas/${id}/copy`, data).then(r => r.data),

  publish: (id: string) =>
    api.post<{ schema: FieldSchema; warnings: ConflictItem[] }>(`/admin/field-schemas/${id}/publish`).then(r => r.data),

  unpublish: (id: string) =>
    api.post<FieldSchema>(`/admin/field-schemas/${id}/unpublish`).then(r => r.data),

  setDefault: (id: string) =>
    api.patch<FieldSchema>(`/admin/field-schemas/${id}/set-default`).then(r => r.data),

  getConflicts: (id: string) =>
    api.get<ConflictCheckResult>(`/admin/field-schemas/${id}/conflicts`).then(r => r.data),

  // Items
  addItem: (id: string, data: { customFieldId: string; isRequired: boolean; showOnKanban: boolean; orderIndex?: number }) =>
    api.post<SchemaItem>(`/admin/field-schemas/${id}/items`, data).then(r => r.data),

  replaceItems: (id: string, items: { customFieldId: string; orderIndex: number; isRequired: boolean; showOnKanban: boolean }[]) =>
    api.put<FieldSchema>(`/admin/field-schemas/${id}/items`, { items }).then(r => r.data),

  deleteItem: (id: string, itemId: string) =>
    api.delete(`/admin/field-schemas/${id}/items/${itemId}`).then(r => r.data),

  reorderItems: (id: string, updates: { id: string; orderIndex: number }[]) =>
    api.patch(`/admin/field-schemas/${id}/items/reorder`, { updates }).then(r => r.data),

  // Public project schemas (for create form)
  listProjectSchemas: (projectId: string, issueTypeConfigId?: string) =>
    api.get<FieldSchema[]>(`/projects/${projectId}/field-schemas`, {
      params: issueTypeConfigId ? { issueTypeConfigId } : {},
    }).then(r => r.data),

  // Bindings
  listBindings: (id: string) =>
    api.get<SchemaBinding[]>(`/admin/field-schemas/${id}/bindings`).then(r => r.data),

  addBinding: (id: string, data: { scopeType: FieldScopeType; projectId?: string; issueTypeConfigId?: string }) =>
    api.post<SchemaBinding>(`/admin/field-schemas/${id}/bindings`, data).then(r => r.data),

  deleteBinding: (id: string, bindingId: string) =>
    api.delete(`/admin/field-schemas/${id}/bindings/${bindingId}`).then(r => r.data),
};
