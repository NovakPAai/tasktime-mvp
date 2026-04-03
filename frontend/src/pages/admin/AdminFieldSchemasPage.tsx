import { useState, useEffect, useCallback } from 'react';
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Space,
  Badge,
  Typography,
  Tag,
  message,
  Checkbox,
  Dropdown,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CopyOutlined,
  StarFilled,
  MoreOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { fieldSchemasApi, type FieldSchema, type ConflictCheckResult } from '../../api/field-schemas';
import SchemaConflictsModal from '../../components/admin/SchemaConflictsModal';

function StatusBadge({ schema }: { schema: FieldSchema }) {
  if (schema.status === 'ACTIVE' && schema.isDefault) {
    return <Tag color="green" icon={<StarFilled />}>По умолчанию</Tag>;
  }
  if (schema.status === 'ACTIVE') {
    return <Badge status="success" text="Активна" />;
  }
  return <Badge status="default" text="Черновик" />;
}

export default function AdminFieldSchemasPage() {
  const navigate = useNavigate();
  const [schemas, setSchemas] = useState<FieldSchema[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copySource, setCopySource] = useState<FieldSchema | null>(null);
  const [saving, setSaving] = useState(false);
  const [createForm] = Form.useForm();
  const [copyForm] = Form.useForm();

  // Conflicts modal state
  const [conflictsOpen, setConflictsOpen] = useState(false);
  const [conflictsResult, setConflictsResult] = useState<ConflictCheckResult | null>(null);
  const [conflictsSchemaId, setConflictsSchemaId] = useState('');
  const [conflictsSchemaName, setConflictsSchemaName] = useState('');
  const [publishing, setPublishing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSchemas(await fieldSchemasApi.list());
    } catch {
      message.error('Не удалось загрузить схемы');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    let values: { name: string; description?: string };
    try { values = await createForm.validateFields(); } catch { return; }
    setSaving(true);
    try {
      const schema = await fieldSchemasApi.create(values);
      message.success('Схема создана');
      setCreateOpen(false);
      navigate(`/admin/field-schemas/${schema.id}`);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      message.error(err?.response?.data?.error ?? 'Ошибка создания');
    } finally {
      setSaving(false);
    }
  };

  const openCopy = (schema: FieldSchema) => {
    setCopySource(schema);
    copyForm.setFieldsValue({ name: `Копия — ${schema.name}`, copyBindings: false });
    setCopyOpen(true);
  };

  const handleCopy = async () => {
    let values: { name: string; description?: string; copyBindings?: boolean };
    try { values = await copyForm.validateFields(); } catch { return; }
    if (!copySource) return;
    setSaving(true);
    try {
      const copy = await fieldSchemasApi.copy(copySource.id, values);
      message.success('Схема скопирована');
      setCopyOpen(false);
      navigate(`/admin/field-schemas/${copy.id}`);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      message.error(err?.response?.data?.error ?? 'Ошибка копирования');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async (schema: FieldSchema) => {
    try {
      await fieldSchemasApi.publish(schema.id);
      message.success('Схема опубликована');
      load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string; conflicts?: ConflictCheckResult['conflicts'] } } };
      if (err?.response?.data?.conflicts) {
        const conflicts = err.response.data.conflicts;
        const hasErrors = conflicts.some((c) => c.severity === 'ERROR');
        const hasWarnings = conflicts.some((c) => c.severity === 'WARNING');
        setConflictsResult({ hasErrors, hasWarnings, conflicts });
        setConflictsSchemaId(schema.id);
        setConflictsSchemaName(schema.name);
        setConflictsOpen(true);
      } else {
        message.error(err?.response?.data?.error ?? 'Ошибка публикации');
      }
    }
  };

  const handlePublishWithWarnings = async () => {
    setPublishing(true);
    try {
      // Ignore warnings — call publish again (the backend republishes if only warnings)
      await fieldSchemasApi.publish(conflictsSchemaId);
      message.success('Схема опубликована');
      setConflictsOpen(false);
      load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      message.error(err?.response?.data?.error ?? 'Ошибка публикации');
    } finally {
      setPublishing(false);
    }
  };

  const handleUnpublish = async (schema: FieldSchema) => {
    try {
      await fieldSchemasApi.unpublish(schema.id);
      message.success('Схема деактивирована');
      load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      message.error(err?.response?.data?.error ?? 'Ошибка');
    }
  };

  const handleSetDefault = async (schema: FieldSchema) => {
    try {
      await fieldSchemasApi.setDefault(schema.id);
      message.success('Схема установлена по умолчанию');
      load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      message.error(err?.response?.data?.error ?? 'Ошибка');
    }
  };

  const handleDelete = async (schema: FieldSchema) => {
    try {
      await fieldSchemasApi.delete(schema.id);
      message.success('Схема удалена');
      load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      message.error(err?.response?.data?.error ?? 'Ошибка удаления');
    }
  };

  const columns: ColumnsType<FieldSchema> = [
    {
      title: 'Название',
      render: (_: unknown, record) => (
        <Space direction="vertical" size={0}>
          <Button
            type="link"
            style={{ padding: 0, height: 'auto', fontWeight: 600 }}
            onClick={() => navigate(`/admin/field-schemas/${record.id}`)}
          >
            {record.name}
          </Button>
          {record.description && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {record.description}
            </Typography.Text>
          )}
          {record.copiedFromId && (
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              Скопирована из: {schemas.find(s => s.id === record.copiedFromId)?.name ?? '…'}
            </Typography.Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Статус',
      width: 160,
      render: (_: unknown, record) => <StatusBadge schema={record} />,
    },
    {
      title: 'Поля',
      width: 80,
      align: 'center',
      render: (_: unknown, record) => (
        <Typography.Text type="secondary">{record.items.length}</Typography.Text>
      ),
    },
    {
      title: 'Привязок',
      width: 90,
      align: 'center',
      render: (_: unknown, record) => (
        <Typography.Text type="secondary">{record.bindings.length}</Typography.Text>
      ),
    },
    {
      title: '',
      width: 120,
      align: 'right',
      render: (_: unknown, record) => {
        const isDraft = record.status === 'DRAFT';
        const isActive = record.status === 'ACTIVE';

        const menuItems = [
          {
            key: 'edit',
            label: 'Редактировать',
            icon: <EditOutlined />,
            onClick: () => navigate(`/admin/field-schemas/${record.id}`),
          },
          {
            key: 'copy',
            label: 'Копировать',
            icon: <CopyOutlined />,
            onClick: () => openCopy(record),
          },
          ...(isDraft ? [{
            key: 'publish',
            label: 'Опубликовать',
            onClick: () => handlePublish(record),
          }] : []),
          ...(isActive ? [{
            key: 'unpublish',
            label: 'Деактивировать',
            onClick: () => handleUnpublish(record),
          }] : []),
          ...(isActive && !record.isDefault ? [{
            key: 'default',
            label: 'По умолчанию',
            icon: <StarFilled />,
            onClick: () => handleSetDefault(record),
          }] : []),
          ...(isDraft ? [{
            key: 'delete',
            label: 'Удалить',
            icon: <DeleteOutlined />,
            danger: true,
            onClick: () => {
              Modal.confirm({
                title: 'Удалить схему?',
                content: 'Схема в статусе DRAFT будет удалена без возможности восстановления.',
                okText: 'Удалить',
                okButtonProps: { danger: true },
                cancelText: 'Отмена',
                onOk: () => handleDelete(record),
              });
            },
          }] : []),
        ];

        return (
          <Dropdown menu={{ items: menuItems }} trigger={['click']}>
            <Button size="small" type="text" icon={<MoreOutlined />} />
          </Dropdown>
        );
      },
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Схемы полей
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { createForm.resetFields(); setCreateOpen(true); }}>
          Создать схему
        </Button>
      </div>

      <Table
        dataSource={schemas}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={false}
        size="small"
      />

      {/* Create modal */}
      <Modal
        title="Новая схема полей"
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => setCreateOpen(false)}
        confirmLoading={saving}
        okText="Создать"
        cancelText="Отмена"
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="Название" rules={[{ required: true, message: 'Введите название' }]}>
            <Input placeholder="Например: Финансовые поля" maxLength={100} />
          </Form.Item>
          <Form.Item name="description" label="Описание">
            <Input.TextArea placeholder="Краткое описание назначения схемы" rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Copy modal */}
      <Modal
        title={`Копировать схему «${copySource?.name}»`}
        open={copyOpen}
        onOk={handleCopy}
        onCancel={() => setCopyOpen(false)}
        confirmLoading={saving}
        okText="Скопировать"
        cancelText="Отмена"
        destroyOnClose
      >
        <Form form={copyForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="Название копии" rules={[{ required: true, message: 'Введите название' }]}>
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item name="description" label="Описание">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="copyBindings" valuePropName="checked">
            <Checkbox>Копировать привязки</Checkbox>
          </Form.Item>
        </Form>
      </Modal>

      {/* Conflicts modal */}
      {conflictsResult && (
        <SchemaConflictsModal
          open={conflictsOpen}
          schemaId={conflictsSchemaId}
          schemaName={conflictsSchemaName}
          result={conflictsResult}
          onCancel={() => setConflictsOpen(false)}
          onPublishWithWarnings={handlePublishWithWarnings}
          publishing={publishing}
        />
      )}
    </div>
  );
}
