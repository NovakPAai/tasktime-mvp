import api from './client';
import type { CustomFieldType, CustomFieldOption } from './custom-fields';

export interface IssueCustomFieldValue {
  customFieldId: string;
  name: string;
  description: string | null;
  fieldType: CustomFieldType;
  options: CustomFieldOption[] | null;
  isRequired: boolean;
  showOnKanban: boolean;
  orderIndex: number;
  currentValue: unknown;
  updatedAt: string | null;
}

export interface IssueCustomFieldsResponse {
  fields: IssueCustomFieldValue[];
}

export const issueCustomFieldsApi = {
  getFields: (issueId: string, params?: { issueTypeConfigId?: string }) => {
    const q = params?.issueTypeConfigId ? `?issueTypeConfigId=${encodeURIComponent(params.issueTypeConfigId)}` : '';
    return api.get<IssueCustomFieldsResponse>(`/issues/${issueId}/custom-fields${q}`).then(r => r.data);
  },

  updateFields: (issueId: string, values: { customFieldId: string; value: unknown }[]) =>
    api.put<IssueCustomFieldsResponse>(`/issues/${issueId}/custom-fields`, { values }).then(r => r.data),
};
