import { useState, useEffect } from 'react';
import { Spin, Typography, message } from 'antd';
import { issueCustomFieldsApi, type IssueCustomFieldValue } from '../../api/issue-custom-fields';
import CustomFieldInput from './CustomFieldInput';
import api from '../../api/client';

interface User { id: string; name: string }

interface Props {
  issueId: string;
  refreshKey?: number;
}

export default function IssueCustomFieldsSection({ issueId, refreshKey }: Props) {
  const [fields, setFields] = useState<IssueCustomFieldValue[]>([]);
  const [loading, setLoading] = useState(true);
  const [allUsers, setAllUsers] = useState<User[]>([]);

  useEffect(() => {
    setLoading(true);
    issueCustomFieldsApi.getFields(issueId)
      .then(res => setFields(res.fields))
      .catch(() => {})
      .finally(() => setLoading(false));
    api.get<User[]>('/users').then(r => setAllUsers(r.data)).catch(() => {});
  }, [issueId, refreshKey]);

  if (loading) return (
    <div className="tt-panel" style={{ padding: '12px 16px' }}>
      <Spin size="small" />
    </div>
  );

  if (fields.length === 0) return null;

  const handleSave = async (fieldId: string, value: unknown) => {
    try {
      const res = await issueCustomFieldsApi.updateFields(issueId, [{ customFieldId: fieldId, value }]);
      setFields(res.fields);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      const msg = err?.response?.data?.error ?? 'Ошибка сохранения';
      message.error(msg);
      throw e;
    }
  };

  return (
    <div className="tt-panel">
      <div className="tt-panel-header">Дополнительные поля</div>
      <div className="tt-panel-body">
        {fields.map(field => (
          <div key={field.customFieldId} className="tt-panel-row" style={{ alignItems: 'flex-start', gap: 8 }}>
            <span style={{ minWidth: 80, flexShrink: 0 }}>
              {field.isRequired && <Typography.Text type="danger">* </Typography.Text>}
              {field.name}
            </span>
            <div style={{ flex: 1 }}>
              <CustomFieldInput
                field={field}
                allUsers={allUsers}
                onSave={v => handleSave(field.customFieldId, v)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
