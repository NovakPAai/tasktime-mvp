import { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, message, Tag, Popconfirm } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import api from '../../api/client';
import type { ReleaseStatus } from '../../api/release-workflows-admin';

type Category = ReleaseStatus['category'];

const CATEGORY_LABEL: Record<Category, string> = {
  PLANNING: 'Планирование',
  IN_PROGRESS: 'В работе',
  DONE: 'Выпущен',
  CANCELLED: 'Отменён',
};

const CATEGORY_COLOR: Record<Category, string> = {
  PLANNING: 'default',
  IN_PROGRESS: 'blue',
  DONE: 'green',
  CANCELLED: 'red',
};

async function listReleaseStatuses(): Promise<ReleaseStatus[]> {
  const { data } = await api.get<ReleaseStatus[]>('/admin/release-statuses');
  return data;
}

async function createReleaseStatus(body: { name: string; category: Category; color: string; description?: string }): Promise<ReleaseStatus> {
  const { data } = await api.post<ReleaseStatus>('/admin/release-statuses', body);
  return data;
}

async function updateReleaseStatus(id: string, body: { name?: string; category?: Category; color?: string; description?: string }): Promise<ReleaseStatus> {
  const { data } = await api.patch<ReleaseStatus>(`/admin/release-statuses/${id}`, body);
  return data;
}

async function deleteReleaseStatus(id: string): Promise<void> {
  await api.delete(`/admin/release-statuses/${id}`);
}

export default function AdminReleaseStatusesPage() {
  const [statuses, setStatuses] = useState<ReleaseStatus[]>([]);
  const [loading, setLoading] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [creating, setCreating] = useState(false);

  const [editTarget, setEditTarget] = useState<ReleaseStatus | null>(null);
  const [editForm] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setStatuses(await listReleaseStatuses());
    } catch {
      void message.error('Не удалось загрузить статусы');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const handleCreate = async () => {
    const values = await createForm.validateFields() as { name: string; category: Category; color: string; description?: string };
    setCreating(true);
    try {
      await createReleaseStatus({ ...values, color: values.color || '#888888' });
      void message.success('Статус создан');
      setCreateOpen(false);
      createForm.resetFields();
      void load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      void message.error(err?.response?.data?.error || 'Ошибка создания');
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (s: ReleaseStatus) => {
    setEditTarget(s);
    editForm.setFieldsValue({ name: s.name, category: s.category, color: s.color, description: s.description ?? '' });
  };

  const handleSave = async () => {
    if (!editTarget) return;
    const values = await editForm.validateFields() as { name: string; category: Category; color: string; description?: string };
    setSaving(true);
    try {
      await updateReleaseStatus(editTarget.id, values);
      void message.success('Статус обновлён');
      setEditTarget(null);
      void load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      void message.error(err?.response?.data?.error || 'Ошибка обновления');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteReleaseStatus(id);
      void message.success('Статус удалён');
      void load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      const errorCode = err?.response?.data?.error;
      void message.error(
        errorCode === 'RELEASE_STATUS_IN_USE'
          ? 'Нельзя удалить статус, который используется в релизах или workflow'
          : (errorCode || 'Ошибка удаления'),
      );
    }
  };

  const columns: ColumnsType<ReleaseStatus> = [
    {
      title: 'Цвет',
      dataIndex: 'color',
      width: 60,
      render: (color: string) => (
        <span style={{
          display: 'inline-block', width: 20, height: 20, borderRadius: 4,
          background: color, border: '1px solid rgba(0,0,0,0.1)',
          verticalAlign: 'middle',
        }} />
      ),
    },
    {
      title: 'Название',
      dataIndex: 'name',
      render: (name: string, s: ReleaseStatus) => (
        <span style={{ fontWeight: 500 }}>{name}
          {' '}<span style={{ color: s.color, fontSize: 11 }}>●</span>
        </span>
      ),
    },
    {
      title: 'Категория',
      dataIndex: 'category',
      render: (cat: Category) => <Tag color={CATEGORY_COLOR[cat]}>{CATEGORY_LABEL[cat]}</Tag>,
    },
    {
      title: 'Описание',
      dataIndex: 'description',
      render: (d: string | null) => d || <span style={{ color: '#8c959f' }}>—</span>,
    },
    {
      title: 'Действия',
      key: 'actions',
      width: 100,
      render: (_: unknown, s: ReleaseStatus) => (
        <span style={{ display: 'flex', gap: 8 }}>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(s)} />
          <Popconfirm
            title="Удалить статус?"
            description="Статус можно удалить только если он не используется ни в одном релизе или workflow."
            onConfirm={() => void handleDelete(s.id)}
            okText="Удалить"
            cancelText="Отмена"
            okButtonProps={{ danger: true }}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </span>
      ),
    },
  ];

  const categoryOptions = (Object.keys(CATEGORY_LABEL) as Category[]).map(k => ({
    value: k,
    label: CATEGORY_LABEL[k],
  }));

  const StatusForm = ({ form }: { form: ReturnType<typeof Form.useForm>[0] }) => (
    <Form form={form} layout="vertical">
      <Form.Item name="name" label="Название" rules={[{ required: true, message: 'Укажите название' }]}>
        <Input placeholder="Напр. «На стабилизации»" />
      </Form.Item>
      <Form.Item name="category" label="Категория" rules={[{ required: true, message: 'Выберите категорию' }]}>
        <Select options={categoryOptions} placeholder="Выберите категорию" />
      </Form.Item>
      <Form.Item
        name="color"
        label="Цвет (HEX)"
        initialValue="#888888"
        rules={[{ pattern: /^#[0-9A-Fa-f]{6}$/, message: 'Используйте формат #RRGGBB, например #FF5500' }]}
      >
        <Input placeholder="#888888" maxLength={7} />
      </Form.Item>
      <Form.Item name="description" label="Описание">
        <Input.TextArea rows={2} placeholder="Описание статуса (необязательно)" />
      </Form.Item>
    </Form>
  );

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Статусы релизов</h2>
          <p style={{ margin: '4px 0 0', color: '#656d76', fontSize: 13 }}>
            Управление статусами, используемыми в workflow релизов
          </p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          Создать статус
        </Button>
      </div>

      <Table
        rowKey="id"
        loading={loading}
        dataSource={statuses}
        columns={columns}
        pagination={false}
        size="small"
      />

      {/* Create modal */}
      <Modal
        title="Создать статус релиза"
        open={createOpen}
        onOk={() => void handleCreate()}
        onCancel={() => { setCreateOpen(false); createForm.resetFields(); void load(); }}
        confirmLoading={creating}
        okText="Создать"
        cancelText="Отмена"
      >
        <StatusForm form={createForm} />
      </Modal>

      {/* Edit modal */}
      <Modal
        title={`Редактировать: ${editTarget?.name}`}
        open={!!editTarget}
        onOk={() => void handleSave()}
        onCancel={() => { setEditTarget(null); void load(); }}
        confirmLoading={saving}
        okText="Сохранить"
        cancelText="Отмена"
      >
        <StatusForm form={editForm} />
      </Modal>
    </div>
  );
}
