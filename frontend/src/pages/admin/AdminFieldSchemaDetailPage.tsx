import { useState, useEffect, useCallback } from 'react';
import {
  Button,
  Modal,
  Form,
  Input,
  Select,
  Space,
  Badge,
  Tooltip,
  Typography,
  Tag,
  message,
  Checkbox,
  Spin,
  Divider,
  Radio,
  Table,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ArrowLeftOutlined,
  StarFilled,
  PlusOutlined,
  DeleteOutlined,
  HolderOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import type { DropResult } from '@hello-pangea/dnd';
import { useNavigate, useParams } from 'react-router-dom';
import { fieldSchemasApi, type FieldSchema, type SchemaItem, type SchemaBinding, type ConflictCheckResult } from '../../api/field-schemas';
import { customFieldsApi, type CustomField } from '../../api/custom-fields';
import api from '../../api/client';
import SchemaConflictsModal from '../../components/admin/SchemaConflictsModal';

interface Project { id: string; name: string; key: string }
interface IssueTypeConfig { id: string; name: string }

type BindingMode = 'all' | 'selected';

export default function AdminFieldSchemaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [schema, setSchema] = useState<FieldSchema | null>(null);
  const [items, setItems] = useState<SchemaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Edit schema name/description
  const [editMetaOpen, setEditMetaOpen] = useState(false);
  const [metaForm] = Form.useForm();

  // Add item
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [allFields, setAllFields] = useState<CustomField[]>([]);
  const [addItemForm] = Form.useForm();
  const [addItemSaving, setAddItemSaving] = useState(false);

  // Bindings
  const [addBindingOpen, setAddBindingOpen] = useState(false);
  const [bindingForm] = Form.useForm();
  const [bindingSaving, setBindingSaving] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [issueTypeConfigs, setIssueTypeConfigs] = useState<IssueTypeConfig[]>([]);
  const [projectMode, setProjectMode] = useState<BindingMode>('all');
  const [typeMode, setTypeMode] = useState<BindingMode>('all');

  // Conflicts modal
  const [conflictsOpen, setConflictsOpen] = useState(false);
  const [conflictsResult, setConflictsResult] = useState<ConflictCheckResult | null>(null);
  const [publishing, setPublishing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const s = await fieldSchemasApi.get(id);
      setSchema(s);
      setItems(s.items);
    } catch {
      message.error('Схема не найдена');
      navigate('/admin/field-schemas');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.get<Project[]>('/projects').then(r => setProjects(r.data)).catch(() => {});
    api.get<IssueTypeConfig[]>('/admin/issue-type-configs').then(r => setIssueTypeConfigs(r.data)).catch(() => {});
  }, []);

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Spin /></div>;
  if (!schema) return null;

  const isDraft = schema.status === 'DRAFT';

  const handleEditMeta = () => {
    metaForm.setFieldsValue({ name: schema.name, description: schema.description });
    setEditMetaOpen(true);
  };

  const handleSaveMeta = async () => {
    let values: { name: string; description?: string };
    try { values = await metaForm.validateFields(); } catch { return; }
    setSaving(true);
    try {
      const updated = await fieldSchemasApi.update(schema.id, values);
      setSchema(updated);
      setItems(updated.items);
      message.success('Метаданные обновлены');
      setEditMetaOpen(false);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      message.error(err?.response?.data?.error ?? 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    setSaving(true);
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
        setConflictsOpen(true);
      } else {
        message.error(err?.response?.data?.error ?? 'Ошибка публикации');
      }
    } finally {
      setSaving(false);
    }
  };

  const handlePublishWithWarnings = async () => {
    setPublishing(true);
    try {
      await fieldSchemasApi.publish(schema.id);
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

  const handleUnpublish = async () => {
    try {
      const updated = await fieldSchemasApi.unpublish(schema.id);
      setSchema(updated);
      setItems(updated.items);
      message.success('Схема деактивирована');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      message.error(err?.response?.data?.error ?? 'Ошибка');
    }
  };

  const handleSetDefault = async () => {
    try {
      const updated = await fieldSchemasApi.setDefault(schema.id);
      setSchema(updated);
      message.success('Схема по умолчанию обновлена');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      message.error(err?.response?.data?.error ?? 'Ошибка');
    }
  };

  // ===== Items =====

  const openAddItem = async () => {
    const all = await customFieldsApi.list();
    const existingIds = new Set(items.map(i => i.customFieldId));
    setAllFields(all.filter(f => f.isEnabled && !existingIds.has(f.id)));
    addItemForm.resetFields();
    setAddItemOpen(true);
  };

  const handleAddItem = async () => {
    let values: { customFieldId: string; isRequired: boolean; showOnKanban: boolean };
    try { values = await addItemForm.validateFields(); } catch { return; }
    setAddItemSaving(true);
    try {
      const item = await fieldSchemasApi.addItem(schema.id, {
        ...values,
        orderIndex: items.length,
      });
      setItems(prev => [...prev, item]);
      message.success('Поле добавлено');
      setAddItemOpen(false);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      message.error(err?.response?.data?.error ?? 'Ошибка добавления');
    } finally {
      setAddItemSaving(false);
    }
  };

  const handleRemoveItem = async (item: SchemaItem) => {
    try {
      await fieldSchemasApi.deleteItem(schema.id, item.id);
      setItems(prev => prev.filter(i => i.id !== item.id));
      message.success('Поле удалено из схемы');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      message.error(err?.response?.data?.error ?? 'Ошибка');
    }
  };

  const handleItemCheckbox = async (item: SchemaItem, field: 'isRequired' | 'showOnKanban', val: boolean) => {
    const updated = items.map(i => i.id === item.id ? { ...i, [field]: val } : i);
    setItems(updated);
    try {
      await fieldSchemasApi.replaceItems(schema.id, updated.map((i, idx) => ({
        customFieldId: i.customFieldId,
        orderIndex: idx,
        isRequired: i.isRequired,
        showOnKanban: i.showOnKanban,
      })));
    } catch {
      message.error('Ошибка сохранения');
      load();
    }
  };

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const from = result.source.index;
    const to = result.destination.index;
    if (from === to) return;

    const reordered = [...items];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    setItems(reordered);

    try {
      await fieldSchemasApi.reorderItems(schema.id, reordered.map((item, idx) => ({
        id: item.id,
        orderIndex: idx,
      })));
    } catch {
      message.error('Ошибка сохранения порядка');
      load();
    }
  };

  // ===== Bindings =====

  const handleAddBindings = async () => {
    let values: { selectedProjects?: string[]; selectedTypes?: string[] };
    try { values = await bindingForm.validateFields(); } catch { return; }

    const allProjects = projectMode === 'all';
    const allTypes = typeMode === 'all';
    const projectIds = allProjects ? [] : (values.selectedProjects ?? []);
    const typeIds = allTypes ? [] : (values.selectedTypes ?? []);

    // Build list of bindings to create
    const toCreate: { scopeType: 'GLOBAL' | 'PROJECT' | 'ISSUE_TYPE' | 'PROJECT_ISSUE_TYPE'; projectId?: string; issueTypeConfigId?: string }[] = [];

    if (allProjects && allTypes) {
      toCreate.push({ scopeType: 'GLOBAL' });
    } else if (!allProjects && allTypes) {
      projectIds.forEach(pid => toCreate.push({ scopeType: 'PROJECT', projectId: pid }));
    } else if (allProjects && !allTypes) {
      typeIds.forEach(tid => toCreate.push({ scopeType: 'ISSUE_TYPE', issueTypeConfigId: tid }));
    } else {
      projectIds.forEach(pid =>
        typeIds.forEach(tid =>
          toCreate.push({ scopeType: 'PROJECT_ISSUE_TYPE', projectId: pid, issueTypeConfigId: tid })
        )
      );
    }

    if (toCreate.length === 0) {
      message.warning('Выберите хотя бы один проект или тип задачи');
      return;
    }

    setBindingSaving(true);
    try {
      for (const binding of toCreate) {
        await fieldSchemasApi.addBinding(schema.id, binding);
      }
      message.success(`Добавлено привязок: ${toCreate.length}`);
      setAddBindingOpen(false);
      load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      message.error(err?.response?.data?.error ?? 'Ошибка добавления привязки');
    } finally {
      setBindingSaving(false);
    }
  };

  const handleRemoveBinding = async (binding: SchemaBinding) => {
    try {
      await fieldSchemasApi.deleteBinding(schema.id, binding.id);
      setSchema(prev => prev ? { ...prev, bindings: prev.bindings.filter(b => b.id !== binding.id) } : prev);
      message.success('Привязка удалена');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      message.error(err?.response?.data?.error ?? 'Ошибка');
    }
  };

  const scopeLabel = (b: SchemaBinding) => {
    if (b.scopeType === 'GLOBAL') return <Tag>Все проекты / Все типы</Tag>;
    if (b.scopeType === 'PROJECT') return <Tag color="blue">{b.project?.name ?? b.projectId}</Tag>;
    if (b.scopeType === 'ISSUE_TYPE') return <Tag color="purple">{b.issueTypeConfig?.name ?? b.issueTypeConfigId}</Tag>;
    return (
      <Space size={4}>
        <Tag color="blue">{b.project?.name ?? b.projectId}</Tag>
        <Tag color="purple">{b.issueTypeConfig?.name ?? b.issueTypeConfigId}</Tag>
      </Space>
    );
  };

  const bindingColumns: ColumnsType<SchemaBinding> = [
    {
      title: 'Тип охвата',
      dataIndex: 'scopeType',
      width: 180,
      render: (t: string) => {
        const map: Record<string, string> = {
          GLOBAL: 'Глобальная',
          PROJECT: 'Проект',
          ISSUE_TYPE: 'Тип задачи',
          PROJECT_ISSUE_TYPE: 'Проект + тип',
        };
        return <Tag>{map[t] ?? t}</Tag>;
      },
    },
    {
      title: 'Область',
      render: (_: unknown, record) => scopeLabel(record),
    },
    {
      title: '',
      width: 50,
      render: (_: unknown, record) => (
        <Tooltip title="Удалить привязку">
          <Button
            size="small"
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleRemoveBinding(record)}
          />
        </Tooltip>
      ),
    },
  ];

  // Live preview text for binding form
  const previewText = () => {
    const ap = projectMode === 'all';
    const at = typeMode === 'all';
    if (ap && at) return 'Глобальная привязка — ко всем проектам и типам задач';
    if (!ap && at) return 'Привязка по проектам';
    if (ap && !at) return 'Привязка по типам задач';
    return 'Привязка по проекту + типу задачи';
  };

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <Space style={{ marginBottom: 16 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/admin/field-schemas')}>
          Схемы полей
        </Button>
      </Space>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <Space direction="vertical" size={4}>
          <Space align="center">
            <Typography.Title level={3} style={{ margin: 0 }}>{schema.name}</Typography.Title>
            {schema.status === 'ACTIVE' && schema.isDefault && <Tag color="green" icon={<StarFilled />}>По умолчанию</Tag>}
            <Badge
              status={schema.status === 'ACTIVE' ? 'success' : 'default'}
              text={schema.status === 'ACTIVE' ? 'Активна' : 'Черновик'}
            />
            <Button size="small" type="text" icon={<EditOutlined />} onClick={handleEditMeta} />
          </Space>
          {schema.description && (
            <Typography.Text type="secondary">{schema.description}</Typography.Text>
          )}
        </Space>
        <Space>
          {isDraft && (
            <Button type="primary" loading={saving} onClick={handlePublish}>
              Опубликовать
            </Button>
          )}
          {!isDraft && (
            <Button onClick={handleUnpublish}>Деактивировать</Button>
          )}
          {schema.status === 'ACTIVE' && !schema.isDefault && (
            <Button icon={<StarFilled />} onClick={handleSetDefault}>
              По умолчанию
            </Button>
          )}
        </Space>
      </div>

      {/* Fields section */}
      <Divider orientation="left">Поля схемы</Divider>

      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="schema-items">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps}>
              {items.length === 0 && (
                <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                  Нет полей. Добавьте поля из библиотеки кастомных полей.
                </Typography.Text>
              )}
              {items.map((item, index) => (
                <Draggable key={item.id} draggableId={item.id} index={index}>
                  {(drag) => (
                    <div
                      ref={drag.innerRef}
                      {...drag.draggableProps}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '8px 12px',
                        marginBottom: 4,
                        background: 'var(--ant-color-bg-container)',
                        border: '1px solid var(--ant-color-border)',
                        borderRadius: 6,
                        ...drag.draggableProps.style,
                      }}
                    >
                      <span {...drag.dragHandleProps} style={{ cursor: 'grab', color: '#888', flexShrink: 0 }}>
                        <HolderOutlined />
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Typography.Text strong>{item.customField.name}</Typography.Text>
                        <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                          {item.customField.fieldType}
                        </Typography.Text>
                      </div>
                      <Tooltip title="Обязательное поле">
                        <Space size={4}>
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>Обязательное</Typography.Text>
                          <Checkbox
                            checked={item.isRequired}
                            onChange={e => handleItemCheckbox(item, 'isRequired', e.target.checked)}
                          />
                        </Space>
                      </Tooltip>
                      <Tooltip title="Показывать на Kanban">
                        <Space size={4}>
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>Kanban</Typography.Text>
                          <Checkbox
                            checked={item.showOnKanban}
                            onChange={e => handleItemCheckbox(item, 'showOnKanban', e.target.checked)}
                          />
                        </Space>
                      </Tooltip>
                      <Tooltip title="Удалить из схемы">
                        <Button
                          size="small"
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => handleRemoveItem(item)}
                        />
                      </Tooltip>
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      <Button
        type="dashed"
        icon={<PlusOutlined />}
        onClick={openAddItem}
        style={{ marginTop: 8 }}
      >
        Добавить поле
      </Button>

      {/* Bindings section */}
      <Divider orientation="left" style={{ marginTop: 32 }}>Привязки</Divider>

      {schema.bindings.length > 0 ? (
        <Table
          dataSource={schema.bindings}
          columns={bindingColumns}
          rowKey="id"
          pagination={false}
          size="small"
          style={{ marginBottom: 12 }}
        />
      ) : (
        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          Нет привязок. Добавьте привязки, чтобы схема применялась к задачам.
        </Typography.Text>
      )}
      <Button
        type="dashed"
        icon={<PlusOutlined />}
        onClick={() => {
          bindingForm.resetFields();
          setProjectMode('all');
          setTypeMode('all');
          setAddBindingOpen(true);
        }}
      >
        Добавить привязку
      </Button>

      {/* Edit meta modal */}
      <Modal
        title="Редактировать схему"
        open={editMetaOpen}
        onOk={handleSaveMeta}
        onCancel={() => setEditMetaOpen(false)}
        confirmLoading={saving}
        okText="Сохранить"
        cancelText="Отмена"
        destroyOnClose
      >
        <Form form={metaForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="Название" rules={[{ required: true }]}>
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item name="description" label="Описание">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Add item modal */}
      <Modal
        title="Добавить поле в схему"
        open={addItemOpen}
        onOk={handleAddItem}
        onCancel={() => setAddItemOpen(false)}
        confirmLoading={addItemSaving}
        okText="Добавить"
        cancelText="Отмена"
        destroyOnClose
      >
        <Form form={addItemForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="customFieldId" label="Поле" rules={[{ required: true, message: 'Выберите поле' }]}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Выберите поле"
              options={allFields.map(f => ({ value: f.id, label: `${f.name} (${f.fieldType})` }))}
            />
          </Form.Item>
          <Form.Item name="isRequired" valuePropName="checked" initialValue={false}>
            <Checkbox>Обязательное поле</Checkbox>
          </Form.Item>
          <Form.Item name="showOnKanban" valuePropName="checked" initialValue={false}>
            <Checkbox>Показывать на Kanban</Checkbox>
          </Form.Item>
        </Form>
      </Modal>

      {/* Add binding modal */}
      <Modal
        title="Добавить привязку"
        open={addBindingOpen}
        onOk={handleAddBindings}
        onCancel={() => setAddBindingOpen(false)}
        confirmLoading={bindingSaving}
        okText="Добавить"
        cancelText="Отмена"
        width={540}
        destroyOnClose
      >
        <Form form={bindingForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="Проекты">
            <Radio.Group value={projectMode} onChange={e => setProjectMode(e.target.value)}>
              <Radio value="all">Все проекты</Radio>
              <Radio value="selected">Выбрать проекты</Radio>
            </Radio.Group>
            {projectMode === 'selected' && (
              <Form.Item name="selectedProjects" style={{ marginTop: 8, marginBottom: 0 }}>
                <Select
                  mode="multiple"
                  placeholder="Выберите проекты"
                  options={projects.map(p => ({ value: p.id, label: `${p.key} — ${p.name}` }))}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            )}
          </Form.Item>

          <Form.Item label="Типы задач">
            <Radio.Group value={typeMode} onChange={e => setTypeMode(e.target.value)}>
              <Radio value="all">Все типы задач</Radio>
              <Radio value="selected">Выбрать типы</Radio>
            </Radio.Group>
            {typeMode === 'selected' && (
              <Form.Item name="selectedTypes" style={{ marginTop: 8, marginBottom: 0 }}>
                <Select
                  mode="multiple"
                  placeholder="Выберите типы задач"
                  options={issueTypeConfigs.map(t => ({ value: t.id, label: t.name }))}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            )}
          </Form.Item>

          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            <strong>Предпросмотр:</strong> {previewText()}
          </Typography.Text>
        </Form>
      </Modal>

      {/* Conflicts modal */}
      {conflictsResult && (
        <SchemaConflictsModal
          open={conflictsOpen}
          schemaId={schema.id}
          schemaName={schema.name}
          result={conflictsResult}
          onCancel={() => setConflictsOpen(false)}
          onPublishWithWarnings={handlePublishWithWarnings}
          publishing={publishing}
        />
      )}
    </div>
  );
}
