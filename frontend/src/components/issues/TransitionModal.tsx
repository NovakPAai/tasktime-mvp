import { useState, useEffect } from 'react';
import { Modal, Form, Input, InputNumber, DatePicker, Switch, Select, message } from 'antd';
import { workflowEngineApi, type ScreenField } from '../../api/workflow-engine';
import { adminApi, type AdminUser } from '../../api/admin';

interface Props {
  open: boolean;
  issueId: string;
  transitionId: string;
  transitionName: string;
  screenFields: ScreenField[];
  onSuccess: () => void;
  onCancel: () => void;
}

function useUsers(hasAssignee: boolean) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  useEffect(() => {
    if (!hasAssignee) return;
    adminApi.listUsers({ pageSize: 200 }).then(r => setUsers(r.users)).catch(() => {});
  }, [hasAssignee]);
  return users;
}

function FieldInput({ field, users }: { field: ScreenField; users: AdminUser[] }) {
  const opts = Array.isArray(field.options) ? field.options as { value: string; label: string }[] : [];
  if (field.fieldType === 'USER') {
    return (
      <Select
        style={{ width: '100%' }}
        placeholder="Выберите пользователя"
        allowClear
        showSearch
        optionFilterProp="label"
        options={users.map(u => ({ value: u.id, label: u.name }))}
      />
    );
  }
  switch (field.fieldType) {
    case 'TEXTAREA':
      return <Input.TextArea rows={3} />;
    case 'NUMBER':
    case 'DECIMAL':
      return <InputNumber style={{ width: '100%' }} />;
    case 'DATE':
      return <DatePicker style={{ width: '100%' }} />;
    case 'CHECKBOX':
      return <Switch />;
    case 'SELECT':
      return <Select options={opts} style={{ width: '100%' }} />;
    case 'MULTI_SELECT':
      return <Select mode="multiple" options={opts} style={{ width: '100%' }} />;
    default:
      return <Input />;
  }
}

export default function TransitionModal({ open, issueId, transitionId, transitionName, screenFields, onSuccess, onCancel }: Props) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const hasAssignee = screenFields.some(f => f.systemFieldKey === 'ASSIGNEE');
  const users = useUsers(hasAssignee);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      const screenFieldValues: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(values)) {
        screenFieldValues[key] = val ?? null;
      }
      await workflowEngineApi.executeTransition(issueId, { transitionId, screenFieldValues });
      message.success('Статус изменён');
      form.resetFields();
      onSuccess();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string; details?: { message?: string } } } };
      const code = e?.response?.data?.error;
      if (!code) return; // validation error from antd
      if (code === 'NO_VALID_TRANSITION') message.error('Переход недоступен из текущего статуса');
      else if (code === 'CONDITION_NOT_MET') message.error('У вас нет прав для этого перехода');
      else if (code === 'INVALID_TRANSITION') message.error('Переход недопустим');
      else if (code === 'VALIDATOR_FAILED') message.error(e.response?.data?.details?.message || 'Условия перехода не выполнены');
      else message.error('Не удалось выполнить переход');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={transitionName}
      open={open}
      onOk={handleOk}
      onCancel={() => { form.resetFields(); onCancel(); }}
      okText="Подтвердить"
      cancelText="Отмена"
      confirmLoading={loading}
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        {screenFields.map(field => {
          const formKey = field.isSystemField ? field.systemFieldKey! : field.customFieldId!;
          return (
            <Form.Item
              key={formKey}
              name={formKey}
              label={field.name}
              rules={field.isRequired ? [{ required: true, message: `${field.name} обязательно` }] : []}
              valuePropName={field.fieldType === 'CHECKBOX' ? 'checked' : 'value'}
            >
              <FieldInput field={field} users={users} />
            </Form.Item>
          );
        })}
      </Form>
    </Modal>
  );
}
