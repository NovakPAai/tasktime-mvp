// TTMP-160 PR-5: CRUD + clone for CheckpointTemplate (FR-2). Item ordering is drag-drop
// via @hello-pangea/dnd — reorder updates `orderIndex` locally and the save call sends
// the new items array to the backend (replace-all semantics per PR-1 service).

import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  HolderOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import {
  Button,
  Divider,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useState } from 'react';
import {
  type CheckpointType,
  type CheckpointWeight,
  listCheckpointTypes,
} from '../../api/release-checkpoint-types';
import {
  type CheckpointTemplate,
  cloneCheckpointTemplate,
  createCheckpointTemplate,
  deleteCheckpointTemplate,
  listCheckpointTemplates,
  updateCheckpointTemplate,
} from '../../api/release-checkpoint-templates';

const WEIGHT_COLOR: Record<CheckpointWeight, string> = {
  CRITICAL: 'red',
  HIGH: 'orange',
  MEDIUM: 'gold',
  LOW: 'default',
};

interface TemplateFormState {
  name: string;
  description?: string;
  items: Array<{ checkpointTypeId: string; orderIndex: number }>;
}

export default function AdminReleaseCheckpointTemplatesPage() {
  const [templates, setTemplates] = useState<CheckpointTemplate[]>([]);
  const [types, setTypes] = useState<CheckpointType[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CheckpointTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [formState, setFormState] = useState<TemplateFormState>({ name: '', items: [] });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Degrade gracefully: if `types` fails, the templates table still renders — only the
      // "Add item" Select inside the edit modal becomes a no-op (with a warning toast).
      const [tmplResult, typsResult] = await Promise.allSettled([
        listCheckpointTemplates(),
        listCheckpointTypes(),
      ]);
      if (tmplResult.status === 'fulfilled') setTemplates(tmplResult.value);
      else message.error('Не удалось загрузить шаблоны');
      if (typsResult.status === 'fulfilled') setTypes(typsResult.value);
      else message.warning('Не удалось загрузить список типов — выбор в шаблоне недоступен');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const typeById = new Map(types.map((t) => [t.id, t] as const));

  const openCreate = () => {
    setEditing(null);
    setFormState({ name: '', description: '', items: [] });
    setModalOpen(true);
  };

  const openEdit = (t: CheckpointTemplate) => {
    setEditing(t);
    setFormState({
      name: t.name,
      description: t.description ?? '',
      items: t.items
        .slice()
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((i) => ({ checkpointTypeId: i.checkpointTypeId, orderIndex: i.orderIndex })),
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!formState.name.trim()) {
      message.error('Введите название шаблона');
      return;
    }
    if (formState.items.length === 0) {
      message.error('Добавьте хотя бы один тип в шаблон');
      return;
    }
    setSaving(true);
    try {
      // Normalise orderIndex based on current position.
      const items = formState.items.map((i, idx) => ({
        checkpointTypeId: i.checkpointTypeId,
        orderIndex: idx,
      }));
      if (editing) {
        await updateCheckpointTemplate(editing.id, {
          name: formState.name,
          description: formState.description || null,
          items,
        });
        message.success('Шаблон обновлён');
      } else {
        await createCheckpointTemplate({
          name: formState.name,
          description: formState.description || null,
          items,
        });
        message.success('Шаблон создан');
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      const anyErr = err as { response?: { data?: { error?: string } } };
      if (anyErr.response?.data?.error === 'CHECKPOINT_TEMPLATE_NAME_TAKEN') {
        message.error('Шаблон с таким названием уже существует');
      } else if (anyErr.response?.data?.error === 'CHECKPOINT_TYPES_NOT_FOUND') {
        message.error('Один или несколько типов не найдены');
      } else {
        message.error('Не удалось сохранить');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (t: CheckpointTemplate) => {
    try {
      await deleteCheckpointTemplate(t.id);
      message.success('Шаблон удалён');
      await load();
    } catch {
      message.error('Не удалось удалить');
    }
  };

  const handleClone = async (t: CheckpointTemplate) => {
    try {
      await cloneCheckpointTemplate(t.id);
      message.success('Шаблон клонирован');
      await load();
    } catch {
      message.error('Не удалось клонировать');
    }
  };

  const onDragEnd = (res: DropResult) => {
    if (!res.destination) return;
    if (res.destination.index === res.source.index) return;
    const next = [...formState.items];
    const [moved] = next.splice(res.source.index, 1);
    next.splice(res.destination.index, 0, moved);
    setFormState({ ...formState, items: next });
  };

  const addItem = (checkpointTypeId: string) => {
    if (formState.items.some((i) => i.checkpointTypeId === checkpointTypeId)) {
      message.info('Этот тип уже добавлен в шаблон');
      return;
    }
    setFormState({
      ...formState,
      items: [...formState.items, { checkpointTypeId, orderIndex: formState.items.length }],
    });
  };

  const removeItem = (idx: number) => {
    const next = formState.items.slice();
    next.splice(idx, 1);
    setFormState({ ...formState, items: next });
  };

  const availableTypesForAdd = types.filter(
    (t) => !formState.items.some((i) => i.checkpointTypeId === t.id),
  );

  const columns: ColumnsType<CheckpointTemplate> = [
    { title: 'Название', dataIndex: 'name' },
    {
      title: 'Описание',
      dataIndex: 'description',
      render: (v: string | null) => v ?? '—',
    },
    {
      title: 'Элементов',
      width: 100,
      render: (_, t) => t.items.length,
    },
    {
      title: 'Автор',
      width: 200,
      render: (_, t) => t.createdBy?.name ?? '—',
    },
    {
      title: '',
      width: 150,
      render: (_, t) => (
        <Space>
          <Tooltip title="Редактировать">
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(t)} />
          </Tooltip>
          <Tooltip title="Клонировать">
            <Button size="small" icon={<CopyOutlined />} onClick={() => handleClone(t)} />
          </Tooltip>
          <Popconfirm
            title="Удалить шаблон?"
            description="Связанные контрольные точки релизов не затрагиваются (FR-15)."
            onConfirm={() => handleDelete(t)}
            okText="Удалить"
            okButtonProps={{ danger: true }}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="tt-page">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <h2 className="tt-page-title">Шаблоны контрольных точек</h2>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={openCreate}
          disabled={types.length === 0}
        >
          Создать шаблон
        </Button>
      </div>

      <Table rowKey="id" dataSource={templates} columns={columns} loading={loading} pagination={false} />

      <Modal
        title={editing ? 'Редактировать шаблон' : 'Новый шаблон'}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          void load();
        }}
        onOk={handleSave}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={saving}
        destroyOnClose
        width={680}
      >
        <Form layout="vertical">
          <Form.Item label="Название" required>
            <Input
              value={formState.name}
              onChange={(e) => setFormState({ ...formState, name: e.target.value })}
              maxLength={100}
            />
          </Form.Item>
          <Form.Item label="Описание">
            <Input.TextArea
              value={formState.description ?? ''}
              onChange={(e) => setFormState({ ...formState, description: e.target.value })}
              rows={2}
              maxLength={500}
            />
          </Form.Item>

          <Divider orientation="left">Состав (drag-and-drop для порядка)</Divider>

          {formState.items.length === 0 ? (
            <Empty description="В шаблоне пока нет типов" />
          ) : (
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="template-items">
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps}>
                    {formState.items.map((it, idx) => {
                      const type = typeById.get(it.checkpointTypeId);
                      return (
                        <Draggable key={it.checkpointTypeId} draggableId={it.checkpointTypeId} index={idx}>
                          {(dragProvided, snapshot) => (
                            <div
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              style={{
                                border: '1px solid #f0f0f0',
                                borderRadius: 6,
                                padding: '8px 12px',
                                marginBottom: 6,
                                background: snapshot.isDragging ? '#e6f4ff' : '#ffffff',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                ...dragProvided.draggableProps.style,
                              }}
                            >
                              <span
                                {...dragProvided.dragHandleProps}
                                style={{ cursor: 'grab', color: '#999' }}
                              >
                                <HolderOutlined />
                              </span>
                              <span style={{ flex: 1 }}>
                                {type ? (
                                  <Space>
                                    <span
                                      style={{
                                        width: 10,
                                        height: 10,
                                        borderRadius: '50%',
                                        background: type.color,
                                        display: 'inline-block',
                                      }}
                                    />
                                    <strong>{type.name}</strong>
                                    <Tag color={WEIGHT_COLOR[type.weight]}>{type.weight}</Tag>
                                    <span style={{ color: '#666' }}>
                                      offset {type.offsetDays >= 0 ? '+' : ''}
                                      {type.offsetDays}
                                    </span>
                                    {!type.isActive && <Tag color="default">Неактивен</Tag>}
                                  </Space>
                                ) : (
                                  <span style={{ color: '#ff4d4f' }}>
                                    Тип {it.checkpointTypeId} не найден
                                  </span>
                                )}
                              </span>
                              <Button
                                size="small"
                                danger
                                icon={<DeleteOutlined />}
                                onClick={() => removeItem(idx)}
                              />
                            </div>
                          )}
                        </Draggable>
                      );
                    })}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          )}

          <div style={{ marginTop: 12 }}>
            <Select
              placeholder={loading ? 'Загрузка типов…' : 'Добавить тип контрольной точки'}
              style={{ width: '100%' }}
              value={undefined}
              disabled={availableTypesForAdd.length === 0 || loading}
              loading={loading}
              onChange={(id: string) => addItem(id)}
              options={availableTypesForAdd.map((t) => ({
                value: t.id,
                label: `${t.name} — ${t.weight}, offset ${t.offsetDays >= 0 ? '+' : ''}${t.offsetDays}`,
              }))}
            />
          </div>
        </Form>
      </Modal>
    </div>
  );
}
