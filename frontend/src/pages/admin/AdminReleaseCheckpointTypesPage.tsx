// TTMP-160 PR-5: CRUD for CheckpointType (FR-1) + FR-15 sync-instances modal.
//
// The criteria builder is a Form.List of discriminated-union entries. For each entry we
// show a type picker; the fields below change based on the picked type. This stays close
// to the backend DTO shape without needing a Zod runtime on the frontend.

import { DeleteOutlined, EditOutlined, PlusOutlined, SyncOutlined } from '@ant-design/icons';
import {
  Button,
  ColorPicker,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  message,
} from 'antd';
import type { Color } from 'antd/es/color-picker';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useState } from 'react';
import {
  type CheckpointConditionMode,
  type CheckpointCriterion,
  type CheckpointCriterionType,
  type CheckpointType,
  type CheckpointWeight,
  type CreateCheckpointTypeBody,
  type StatusCategory,
  createCheckpointType,
  deleteCheckpointType,
  listCheckpointTypes,
  updateCheckpointType,
} from '../../api/release-checkpoint-types';
import { listReleasesGlobal } from '../../api/releases';
import CheckpointConditionModeControl, { CheckpointConditionModeIcon } from '../../components/releases/CheckpointConditionModeControl';
import CheckpointPreviewPanel from '../../components/releases/CheckpointPreviewPanel';
import { convertCriteriaToTtql } from '../../components/releases/convertCriteriaToTtql';
import SyncInstancesModal from './SyncInstancesModal';

const COLOR_PALETTE = [
  '#F44336', '#E91E63', '#FF5722', '#FF9800',
  '#FFC107', '#FFEB3B', '#8BC34A', '#4CAF50',
  '#00BCD4', '#2196F3', '#3F51B5', '#9C27B0',
  '#607D8B', '#9E9E9E', '#795548', '#000000',
];

const WEIGHT_OPTIONS: Array<{ value: CheckpointWeight; label: string; color: string }> = [
  { value: 'CRITICAL', label: 'CRITICAL', color: 'red' },
  { value: 'HIGH', label: 'HIGH', color: 'orange' },
  { value: 'MEDIUM', label: 'MEDIUM', color: 'gold' },
  { value: 'LOW', label: 'LOW', color: 'default' },
];

const STATUS_CATEGORY_OPTIONS: Array<{ value: StatusCategory; label: string }> = [
  { value: 'TODO', label: 'To Do' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'DONE', label: 'Done' },
];

const CRITERION_TYPE_OPTIONS: Array<{ value: CheckpointCriterionType; label: string }> = [
  { value: 'STATUS_IN', label: 'Статус задачи' },
  { value: 'DUE_BEFORE', label: 'Срок задачи ≤ plannedDate + N дней' },
  { value: 'ASSIGNEE_SET', label: 'Исполнитель назначен' },
  { value: 'CUSTOM_FIELD_VALUE', label: 'Значение кастом-поля' },
  { value: 'ALL_SUBTASKS_DONE', label: 'Все подзадачи завершены' },
  { value: 'NO_BLOCKING_LINKS', label: 'Нет блокирующих связей' },
];

function ColorField({ value, onChange }: { value?: string; onChange?: (v: string) => void }) {
  return (
    <ColorPicker
      format="hex"
      value={value}
      presets={[{ label: 'Палитра', colors: COLOR_PALETTE }]}
      onChange={(color: Color) => onChange?.(color.toHexString())}
      showText
    />
  );
}

// Untyped form values — Ant Form's RecursivePartial narrows `criterion.value: unknown` to
// `{} | undefined` and then rejects assignment of the strict CheckpointCriterion union.
// Using a permissive shape here and validating at the boundary when we build the request.
type TypeFormValues = {
  name: string;
  description?: string;
  color: string;
  weight: CheckpointWeight;
  offsetDays: number;
  warningDays: number;
  webhookUrl?: string;
  minStableSeconds: number;
  isActive: boolean;
  criteria: CheckpointCriterion[];
  conditionMode?: CheckpointConditionMode;
  ttqlCondition?: string | null;
};

export default function AdminReleaseCheckpointTypesPage() {
  const [types, setTypes] = useState<CheckpointType[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CheckpointType | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncTarget, setSyncTarget] = useState<CheckpointType | null>(null);
  const [form] = Form.useForm();
  // TTSRH-1 PR-18: mode state mirrors form.conditionMode but lives outside
  // so mode-toggle + preview panel re-render instantly without waiting for
  // Form.useWatch propagation.
  const [conditionMode, setConditionMode] = useState<CheckpointConditionMode>('STRUCTURED');
  const [ttqlValue, setTtqlValue] = useState<string>('');
  const [releaseOptions, setReleaseOptions] = useState<Array<{ id: string; name: string; projectKey?: string }>>([]);

  useEffect(() => {
    // Preload releases for the preview panel. Silent-fail: panel is optional UX.
    listReleasesGlobal({ limit: 100 })
      .then((res) => {
        setReleaseOptions(
          res.data.map((r) => ({
            id: r.id,
            name: r.name,
            projectKey: (r as unknown as { project?: { key?: string } }).project?.key,
          })),
        );
      })
      .catch(() => setReleaseOptions([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTypes(await listCheckpointTypes());
    } catch {
      message.error('Не удалось загрузить типы');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      color: '#52C41A',
      weight: 'MEDIUM',
      offsetDays: 0,
      warningDays: 3,
      minStableSeconds: 300,
      isActive: true,
      criteria: [{ type: 'STATUS_IN', categories: ['DONE'] }],
      conditionMode: 'STRUCTURED',
      ttqlCondition: '',
    });
    setConditionMode('STRUCTURED');
    setTtqlValue('');
    setModalOpen(true);
  };

  const openEdit = (t: CheckpointType) => {
    setEditing(t);
    const mode = t.conditionMode ?? 'STRUCTURED';
    const ttql = t.ttqlCondition ?? '';
    form.setFieldsValue({
      name: t.name,
      description: t.description ?? '',
      color: t.color,
      weight: t.weight,
      offsetDays: t.offsetDays,
      warningDays: t.warningDays,
      webhookUrl: t.webhookUrl ?? '',
      minStableSeconds: t.minStableSeconds,
      isActive: t.isActive,
      criteria: t.criteria,
      conditionMode: mode,
      ttqlCondition: ttql,
    });
    setConditionMode(mode);
    setTtqlValue(ttql);
    setModalOpen(true);
  };

  const handleSave = async (values: TypeFormValues) => {
    setSaving(true);
    try {
      const body: CreateCheckpointTypeBody = {
        name: values.name,
        description: values.description || null,
        color: values.color,
        weight: values.weight,
        offsetDays: values.offsetDays,
        warningDays: values.warningDays,
        criteria: values.criteria,
        // TTSRH-1 PR-18: propagate new fields. Backend superRefine validates
        // mode ↔ payload consistency (см. checkpoint.dto.ts).
        conditionMode: conditionMode,
        ttqlCondition:
          conditionMode === 'TTQL' || conditionMode === 'COMBINED'
            ? ttqlValue.trim() || null
            : null,
        webhookUrl: values.webhookUrl ? values.webhookUrl : null,
        minStableSeconds: values.minStableSeconds,
        isActive: values.isActive,
      };
      if (editing) {
        // Compare pre-submit values (same JS serialisation path) so a Postgres jsonb key
        // reorder on the server round-trip doesn't falsely trigger the sync modal.
        const criteriaChanged = JSON.stringify(editing.criteria) !== JSON.stringify(body.criteria);
        const offsetChanged = editing.offsetDays !== body.offsetDays;

        const updated = await updateCheckpointType(editing.id, body);
        message.success('Тип обновлён');
        setModalOpen(false);
        await load();

        // FR-15: offer to propagate changes to running instances.
        const activeCount = updated._count?.releaseCheckpoints ?? 0;
        if ((criteriaChanged || offsetChanged) && activeCount > 0) {
          setSyncTarget(updated);
        }
      } else {
        await createCheckpointType(body);
        message.success('Тип создан');
        setModalOpen(false);
        await load();
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Не удалось сохранить';
      message.error(reason);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (t: CheckpointType) => {
    try {
      await deleteCheckpointType(t.id);
      message.success('Тип удалён');
      await load();
    } catch (err) {
      const anyErr = err as { response?: { data?: { error?: string } } };
      if (anyErr.response?.data?.error === 'CHECKPOINT_TYPE_IN_USE') {
        message.error('Тип используется в активных контрольных точках');
      } else {
        message.error('Не удалось удалить');
      }
    }
  };

  const columns: ColumnsType<CheckpointType> = [
    {
      title: 'Название',
      dataIndex: 'name',
      render: (name: string, t) => (
        <Space>
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: t.color,
              display: 'inline-block',
            }}
          />
          {name}
          <CheckpointConditionModeIcon mode={t.conditionMode ?? 'STRUCTURED'} />
        </Space>
      ),
    },
    {
      title: 'Вес',
      dataIndex: 'weight',
      width: 110,
      render: (w: CheckpointWeight) => {
        const o = WEIGHT_OPTIONS.find((x) => x.value === w);
        return <Tag color={o?.color}>{o?.label ?? w}</Tag>;
      },
    },
    {
      title: 'Offset / Warning',
      width: 150,
      render: (_, t) => `${t.offsetDays >= 0 ? '+' : ''}${t.offsetDays} / ${t.warningDays}`,
    },
    {
      title: 'Критериев',
      width: 110,
      render: (_, t) => t.criteria.length,
    },
    {
      title: 'Активных экз.',
      width: 130,
      render: (_, t) => t._count?.releaseCheckpoints ?? 0,
    },
    {
      title: 'Активен',
      dataIndex: 'isActive',
      width: 100,
      render: (v: boolean) => (v ? <Tag color="green">Да</Tag> : <Tag>Нет</Tag>),
    },
    {
      title: '',
      width: 140,
      render: (_, t) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(t)} />
          {(t._count?.releaseCheckpoints ?? 0) > 0 && (
            <Button
              size="small"
              icon={<SyncOutlined />}
              onClick={() => setSyncTarget(t)}
              title="Применить изменения к активным экземплярам"
            />
          )}
          <Popconfirm
            title="Удалить тип контрольной точки?"
            onConfirm={() => handleDelete(t)}
            okText="Удалить"
            okButtonProps={{ danger: true }}
            disabled={(t._count?.releaseCheckpoints ?? 0) > 0}
          >
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              disabled={(t._count?.releaseCheckpoints ?? 0) > 0}
            />
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
        <h2 className="tt-page-title">Типы контрольных точек</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          Создать тип
        </Button>
      </div>

      <Table rowKey="id" dataSource={types} columns={columns} loading={loading} pagination={false} />

      <Modal
        title={editing ? 'Редактировать тип' : 'Новый тип'}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          void load();
        }}
        onOk={() => form.submit()}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={saving}
        destroyOnClose
        width={720}
      >
        <Form form={form} layout="vertical" onFinish={handleSave as (values: unknown) => void}>
          <Form.Item
            name="name"
            label="Название"
            rules={[{ required: true, max: 100 }]}
          >
            <Input placeholder="Код заморожен" />
          </Form.Item>
          <Form.Item name="description" label="Описание">
            <Input.TextArea rows={2} maxLength={500} />
          </Form.Item>
          <Space size={16} style={{ display: 'flex' }}>
            <Form.Item
              name="color"
              label="Цвет"
              rules={[{ required: true, pattern: /^#[0-9A-Fa-f]{6}$/, message: 'Hex #RRGGBB' }]}
              style={{ flex: '0 0 140px' }}
            >
              <ColorField />
            </Form.Item>
            <Form.Item
              name="weight"
              label="Вес"
              rules={[{ required: true }]}
              style={{ flex: '0 0 160px' }}
            >
              <Select options={WEIGHT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} />
            </Form.Item>
            <Form.Item
              name="offsetDays"
              label="Смещение (дни)"
              tooltip="От plannedDate релиза. <0 — до, >0 — после."
              rules={[{ required: true }]}
              style={{ flex: '0 0 150px' }}
            >
              <InputNumber min={-365} max={365} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="warningDays"
              label="Предупреждение (дни)"
              rules={[{ required: true }]}
              style={{ flex: '0 0 170px' }}
            >
              <InputNumber min={0} max={30} style={{ width: '100%' }} />
            </Form.Item>
          </Space>
          <Space size={16} style={{ display: 'flex' }}>
            <Form.Item name="webhookUrl" label="Webhook URL" style={{ flex: 1 }}>
              <Input placeholder="https://hooks.slack.com/..." />
            </Form.Item>
            <Form.Item
              name="minStableSeconds"
              label="Debounce (сек)"
              tooltip="Минимальное время стабильности VIOLATED перед webhook"
              rules={[{ required: true }]}
              style={{ flex: '0 0 170px' }}
            >
              <InputNumber min={0} max={3600} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="isActive" label="Активен" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>

          <Divider orientation="left">Режим оценки</Divider>
          <CheckpointConditionModeControl
            value={conditionMode}
            onChange={setConditionMode}
            ttqlValue={ttqlValue}
            onTtqlChange={setTtqlValue}
            disabled={saving}
          />

          {/* TTSRH-1 PR-19: one-way structured → TTQL converter. Не автосохраняет
              режим (R21) — только генерирует draft в TTQL-редактор. Кнопка показывается
              когда есть хотя бы 1 structured criterion. */}
          {(conditionMode === 'STRUCTURED' || conditionMode === 'COMBINED') && (
            <div style={{ marginTop: 6, fontSize: 12, color: '#6B7280' }}>
              <Button
                type="link"
                size="small"
                style={{ padding: 0 }}
                onClick={() => {
                  const values = form.getFieldsValue() as Partial<TypeFormValues>;
                  const criteria = values.criteria ?? [];
                  if (criteria.length === 0) {
                    message.info('Нет критериев для конвертации');
                    return;
                  }
                  const generated = convertCriteriaToTtql(criteria);
                  setTtqlValue(generated);
                  setConditionMode('COMBINED');
                  message.success('TTS-QL сгенерирован. Проверьте и отредактируйте перед сохранением.');
                }}
              >
                Сконвертировать structured-критерии в TTS-QL (draft)
              </Button>
            </div>
          )}

          {(conditionMode === 'STRUCTURED' || conditionMode === 'COMBINED') && (
            <>
              <Divider orientation="left">Критерии (AND)</Divider>
              <CriteriaListField />
            </>
          )}

          <CheckpointPreviewPanel
            releaseOptions={releaseOptions}
            disabled={saving}
            body={() => {
              const values = form.getFieldsValue() as Partial<TypeFormValues>;
              return {
                releaseId: '', // filled inside the panel from its own select
                conditionMode,
                criteria: conditionMode === 'TTQL' ? [] : (values.criteria ?? []),
                ttqlCondition:
                  conditionMode === 'TTQL' || conditionMode === 'COMBINED'
                    ? ttqlValue.trim() || null
                    : null,
                offsetDays: values.offsetDays,
                warningDays: values.warningDays,
              };
            }}
          />
        </Form>
      </Modal>

      {syncTarget && (
        <SyncInstancesModal
          open
          checkpointType={syncTarget}
          onClose={(applied) => {
            setSyncTarget(null);
            if (applied) void load();
          }}
        />
      )}
    </div>
  );
}

// ─── Criteria list editor ────────────────────────────────────────────────────
function CriteriaListField() {
  return (
    <Form.List name="criteria">
      {(fields, { add, remove }) => (
        <>
          {fields.map((field) => (
            <CriterionRow
              key={field.key}
              name={field.name}
              onRemove={() => remove(field.name)}
              canRemove={fields.length > 1}
            />
          ))}
          <Button
            type="dashed"
            block
            icon={<PlusOutlined />}
            onClick={() => add({ type: 'STATUS_IN', categories: ['DONE'] })}
            style={{ marginTop: 8 }}
            disabled={fields.length >= 10}
          >
            Добавить критерий {fields.length >= 10 ? '(лимит 10)' : ''}
          </Button>
        </>
      )}
    </Form.List>
  );
}

function CriterionRow({
  name,
  onRemove,
  canRemove,
}: {
  name: number;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const form = Form.useFormInstance();
  const typeValue = Form.useWatch(['criteria', name, 'type'], form) as CheckpointCriterionType | undefined;
  const operatorValue = Form.useWatch(
    ['criteria', name, 'operator'],
    form,
  ) as 'EQUALS' | 'NOT_EMPTY' | 'IN' | undefined;

  return (
    <div
      style={{
        border: '1px solid #f0f0f0',
        borderRadius: 6,
        padding: 12,
        marginBottom: 8,
        background: '#fafafa',
      }}
    >
      <Space style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <Form.Item
          name={[name, 'type']}
          label="Тип"
          rules={[{ required: true }]}
          style={{ marginBottom: 0, flex: 1 }}
        >
          <Select
            options={CRITERION_TYPE_OPTIONS}
            onChange={(nextType: CheckpointCriterionType) => {
              // Reset per-type fields when type changes so stale state doesn't leak.
              const base: CheckpointCriterion =
                nextType === 'STATUS_IN'
                  ? { type: 'STATUS_IN', categories: ['DONE'] }
                  : nextType === 'DUE_BEFORE'
                    ? { type: 'DUE_BEFORE', days: 0 }
                    : nextType === 'ASSIGNEE_SET'
                      ? { type: 'ASSIGNEE_SET' }
                      : nextType === 'CUSTOM_FIELD_VALUE'
                        ? {
                            type: 'CUSTOM_FIELD_VALUE',
                            customFieldId: '',
                            operator: 'NOT_EMPTY',
                          }
                        : nextType === 'ALL_SUBTASKS_DONE'
                          ? { type: 'ALL_SUBTASKS_DONE' }
                          : { type: 'NO_BLOCKING_LINKS' };
              const current = (form.getFieldValue('criteria') ?? []) as CheckpointCriterion[];
              const nextCriteria = current.slice();
              nextCriteria[name] = base;
              form.setFieldsValue({ criteria: nextCriteria });
            }}
          />
        </Form.Item>
        {canRemove && (
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={onRemove}
            style={{ marginTop: 28 }}
          />
        )}
      </Space>

      {typeValue === 'STATUS_IN' && (
        <Form.Item
          name={[name, 'categories']}
          label="Категории"
          rules={[{ required: true, type: 'array', min: 1 }]}
        >
          <Select mode="multiple" options={STATUS_CATEGORY_OPTIONS} />
        </Form.Item>
      )}
      {typeValue === 'DUE_BEFORE' && (
        <Form.Item
          name={[name, 'days']}
          label="Days от plannedDate"
          tooltip="dueDate ≤ plannedDate + days"
          rules={[{ required: true }]}
        >
          <InputNumber min={-365} max={365} style={{ width: '100%' }} />
        </Form.Item>
      )}
      {typeValue === 'CUSTOM_FIELD_VALUE' && (
        <>
          <Form.Item
            name={[name, 'customFieldId']}
            label="Custom field ID (UUID)"
            rules={[
              { required: true },
              {
                pattern: /^[0-9a-fA-F-]{36}$/,
                message: 'UUID',
              },
            ]}
          >
            <Input placeholder="00000000-0000-0000-0000-000000000000" />
          </Form.Item>
          <Form.Item name={[name, 'operator']} label="Оператор" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'NOT_EMPTY', label: 'Заполнено' },
                { value: 'EQUALS', label: 'Равно' },
                { value: 'IN', label: 'В списке' },
              ]}
            />
          </Form.Item>
          {operatorValue === 'EQUALS' && (
            <Form.Item
              name={[name, 'value']}
              label="Значение"
              tooltip="Строка / число / boolean"
              rules={[{ required: true }]}
            >
              <Input />
            </Form.Item>
          )}
          {operatorValue === 'IN' && (
            <Form.Item
              name={[name, 'value']}
              label="Значения"
              tooltip="Нажмите Enter после каждого"
              rules={[{ required: true, type: 'array', min: 1 }]}
            >
              <Select mode="tags" tokenSeparators={[',']} placeholder="PASSED, SKIPPED" />
            </Form.Item>
          )}
        </>
      )}
      {typeValue === 'NO_BLOCKING_LINKS' && (
        <Form.Item
          name={[name, 'linkTypeKeys']}
          label="Типы связей"
          tooltip="Оставьте пустым, чтобы учитывать все входящие связи"
        >
          <Select mode="tags" tokenSeparators={[',']} placeholder="Блокирует" />
        </Form.Item>
      )}

      <Form.Item
        name={[name, 'issueTypes']}
        label="Типы задач (systemKey)"
        tooltip="Критерий применим только к задачам из списка. Пусто — ко всем."
      >
        <Select mode="tags" tokenSeparators={[',']} placeholder="TASK, BUG" />
      </Form.Item>
    </div>
  );
}
