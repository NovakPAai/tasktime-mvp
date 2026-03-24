import { useState, useEffect, useCallback } from 'react';
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Badge,
  Tooltip,
  Typography,
  Tag,
  message,
  Popconfirm,
  Switch,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  MinusCircleOutlined,
  FontSizeOutlined,
  AlignLeftOutlined,
  NumberOutlined,
  PercentageOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  LinkOutlined,
  CheckSquareOutlined,
  UnorderedListOutlined,
  BarsOutlined,
  UserOutlined,
  TagOutlined,
  PoweroffOutlined,
  BookOutlined,
} from '@ant-design/icons';
import { customFieldsApi, type CustomField, type CustomFieldType, type CustomFieldOption, type ReferenceItem, type ReferenceOptions } from '../../api/custom-fields';

const SELECT_TYPES: CustomFieldType[] = ['SELECT', 'MULTI_SELECT'];

const FIELD_TYPE_META: Record<CustomFieldType, { label: string; icon: React.ReactNode }> = {
  TEXT: { label: 'Текст', icon: <FontSizeOutlined /> },
  TEXTAREA: { label: 'Многострочный текст', icon: <AlignLeftOutlined /> },
  NUMBER: { label: 'Число (целое)', icon: <NumberOutlined /> },
  DECIMAL: { label: 'Число (дробное)', icon: <PercentageOutlined /> },
  DATE: { label: 'Дата', icon: <CalendarOutlined /> },
  DATETIME: { label: 'Дата и время', icon: <ClockCircleOutlined /> },
  URL: { label: 'Ссылка', icon: <LinkOutlined /> },
  CHECKBOX: { label: 'Флажок', icon: <CheckSquareOutlined /> },
  SELECT: { label: 'Выпадающий список', icon: <UnorderedListOutlined /> },
  MULTI_SELECT: { label: 'Мультивыбор', icon: <BarsOutlined /> },
  USER: { label: 'Пользователь', icon: <UserOutlined /> },
  LABEL: { label: 'Метка', icon: <TagOutlined /> },
  REFERENCE: { label: 'Справочник', icon: <BookOutlined /> },
};

const OPTION_COLORS = [
  { value: 'default', label: 'Серый' },
  { value: 'red', label: 'Красный' },
  { value: 'orange', label: 'Оранжевый' },
  { value: 'gold', label: 'Золотой' },
  { value: 'green', label: 'Зелёный' },
  { value: 'cyan', label: 'Циан' },
  { value: 'blue', label: 'Синий' },
  { value: 'purple', label: 'Фиолетовый' },
  { value: 'magenta', label: 'Малиновый' },
];

interface OptionRow {
  key: string;
  value: string;
  label: string;
  color?: string;
}

interface RefItemRow extends ReferenceItem {
  key: string;
}

export default function AdminCustomFieldsPage() {
  const [fields, setFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editField, setEditField] = useState<CustomField | null>(null);
  const [form] = Form.useForm();
  const [watchType, setWatchType] = useState<CustomFieldType | null>(null);
  const [options, setOptions] = useState<OptionRow[]>([]);
  const [refItems, setRefItems] = useState<RefItemRow[]>([]);
  const [refMaxValues, setRefMaxValues] = useState<number>(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setFields(await customFieldsApi.list());
    } catch {
      message.error('Не удалось загрузить поля');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditField(null);
    setWatchType(null);
    setOptions([]);
    setRefItems([]);
    setRefMaxValues(0);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (field: CustomField) => {
    setEditField(field);
    setWatchType(field.fieldType);

    if (field.fieldType === 'REFERENCE') {
      const refOpts = field.options as ReferenceOptions | null;
      setRefMaxValues(refOpts?.maxValues ?? 0);
      setRefItems((refOpts?.items ?? []).map((item, i) => ({ ...item, key: String(i) })));
      setOptions([]);
    } else {
      const opts: OptionRow[] = ((field.options as CustomFieldOption[] | null) ?? []).map((o, i) => ({
        key: String(i),
        value: o.value,
        label: o.label,
        color: o.color,
      }));
      setOptions(opts);
      setRefItems([]);
      setRefMaxValues(0);
    }

    form.setFieldsValue({ name: field.name, description: field.description, fieldType: field.fieldType });
    setModalOpen(true);
  };

  const handleModalOk = async () => {
    let values: { name: string; description?: string; fieldType: CustomFieldType };
    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    const isSelectType = SELECT_TYPES.includes(values.fieldType);
    const isRefType = values.fieldType === 'REFERENCE';

    if (isSelectType && options.length === 0) {
      message.error('Добавьте хотя бы один вариант ответа');
      return;
    }
    for (const opt of options) {
      if (!opt.value.trim() || !opt.label.trim()) {
        message.error('Заполните все поля вариантов ответа');
        return;
      }
    }
    for (const item of refItems) {
      if (!item.label.trim()) {
        message.error('Заполните названия всех значений справочника');
        return;
      }
    }

    const cleanOptions: CustomFieldOption[] = options.map(o => ({
      value: o.value.trim(),
      label: o.label.trim(),
      ...(o.color && o.color !== 'default' ? { color: o.color } : {}),
    }));

    const cleanRefOptions: ReferenceOptions = {
      maxValues: refMaxValues,
      items: refItems.map((item, idx) => ({
        value: item.value || `item_${idx}_${Date.now()}`,
        label: item.label.trim(),
        isEnabled: item.isEnabled,
      })),
    };

    setSaving(true);
    try {
      if (editField) {
        await customFieldsApi.update(editField.id, {
          name: values.name,
          description: values.description ?? undefined,
          ...(isSelectType ? { options: cleanOptions } : {}),
          ...(isRefType ? { options: cleanRefOptions } : {}),
        });
        message.success('Поле обновлено');
      } else {
        await customFieldsApi.create({
          name: values.name,
          description: values.description,
          fieldType: values.fieldType,
          ...(isSelectType ? { options: cleanOptions } : {}),
          ...(isRefType ? { options: cleanRefOptions } : {}),
        });
        message.success('Поле создано');
      }
      setModalOpen(false);
      load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      message.error(err?.response?.data?.error ?? 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (field: CustomField) => {
    try {
      await customFieldsApi.toggle(field.id);
      message.success(field.isEnabled ? 'Поле деактивировано' : 'Поле активировано');
      load();
    } catch {
      message.error('Не удалось изменить статус');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await customFieldsApi.delete(id);
      message.success('Поле удалено');
      load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      message.error(err?.response?.data?.error ?? 'Не удалось удалить поле');
    }
  };

  const addOption = () => {
    setOptions(prev => [...prev, { key: Date.now().toString(), value: '', label: '', color: 'default' }]);
  };

  const removeOption = (key: string) => {
    setOptions(prev => prev.filter(o => o.key !== key));
  };

  const updateOption = (key: string, field: keyof Omit<OptionRow, 'key'>, val: string) => {
    setOptions(prev => prev.map(o => o.key === key ? { ...o, [field]: val } : o));
  };

  const addRefItem = () => {
    setRefItems(prev => [...prev, { key: Date.now().toString(), value: '', label: '', isEnabled: true }]);
  };

  const removeRefItem = (key: string) => {
    setRefItems(prev => prev.filter(i => i.key !== key));
  };

  const updateRefItemLabel = (key: string, label: string) => {
    setRefItems(prev => prev.map(i => i.key === key ? { ...i, label } : i));
  };

  const toggleRefItem = (key: string) => {
    setRefItems(prev => prev.map(i => i.key === key ? { ...i, isEnabled: !i.isEnabled } : i));
  };

  const isSelectType = watchType && SELECT_TYPES.includes(watchType);
  const isRefType = watchType === 'REFERENCE';

  const columns: ColumnsType<CustomField> = [
    {
      title: 'Название',
      dataIndex: 'name',
      render: (name: string, record) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{name}</Typography.Text>
          {record.description && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {record.description}
            </Typography.Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Тип',
      dataIndex: 'fieldType',
      width: 200,
      render: (type: CustomFieldType) => {
        const meta = FIELD_TYPE_META[type];
        return (
          <Space size={6}>
            <Typography.Text type="secondary">{meta?.icon}</Typography.Text>
            <Typography.Text>{meta?.label ?? type}</Typography.Text>
          </Space>
        );
      },
    },
    {
      title: 'Статус',
      dataIndex: 'isEnabled',
      width: 120,
      render: (enabled: boolean) => (
        <Badge
          status={enabled ? 'success' : 'default'}
          text={enabled ? 'Активно' : 'Неактивно'}
        />
      ),
    },
    {
      title: 'Схем',
      width: 80,
      align: 'center',
      render: (_: unknown, record) => (
        <Typography.Text type="secondary">
          {record._count?.schemaItems ?? '—'}
        </Typography.Text>
      ),
    },
    {
      title: '',
      width: 140,
      align: 'right',
      render: (_: unknown, record) => (
        <Space size={4}>
          <Tooltip title="Редактировать">
            <Button
              size="small"
              type="text"
              icon={<EditOutlined />}
              onClick={() => openEdit(record)}
            />
          </Tooltip>
          <Tooltip title={record.isEnabled ? 'Деактивировать' : 'Активировать'}>
            <Button
              size="small"
              type="text"
              icon={<PoweroffOutlined />}
              onClick={() => handleToggle(record)}
            />
          </Tooltip>
          {!record.isSystem && (
            <Popconfirm
              title="Удалить поле?"
              description="Все значения этого поля в задачах будут удалены."
              okText="Удалить"
              okButtonProps={{ danger: true }}
              cancelText="Отмена"
              onConfirm={() => handleDelete(record.id)}
            >
              <Tooltip title="Удалить">
                <Button size="small" type="text" danger icon={<DeleteOutlined />} />
              </Tooltip>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Кастомные поля
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          Добавить поле
        </Button>
      </div>

      <Table
        dataSource={fields}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={false}
        size="small"
      />

      <Modal
        title={editField ? 'Редактировать поле' : 'Добавить поле'}
        open={modalOpen}
        onOk={handleModalOk}
        onCancel={() => setModalOpen(false)}
        confirmLoading={saving}
        okText={editField ? 'Сохранить' : 'Создать'}
        cancelText="Отмена"
        width={560}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="Название"
            rules={[{ required: true, message: 'Введите название' }]}
          >
            <Input placeholder="Например: Приоритет бизнеса" maxLength={100} />
          </Form.Item>

          <Form.Item name="description" label="Описание">
            <Input.TextArea placeholder="Краткое описание назначения поля" rows={2} />
          </Form.Item>

          <Form.Item
            name="fieldType"
            label="Тип данных"
            rules={[{ required: true, message: 'Выберите тип' }]}
          >
            <Select
              placeholder="Выберите тип поля"
              disabled={!!editField}
              onChange={(v) => setWatchType(v as CustomFieldType)}
              options={Object.entries(FIELD_TYPE_META).map(([value, meta]) => ({
                value,
                label: (
                  <Space size={8}>
                    <Typography.Text type="secondary">{meta.icon}</Typography.Text>
                    {meta.label}
                  </Space>
                ),
              }))}
            />
          </Form.Item>

          {isSelectType && (
            <Form.Item label="Варианты ответа" required>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {options.map(opt => (
                  <div key={opt.key} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Input
                      placeholder="Значение (value)"
                      value={opt.value}
                      onChange={e => updateOption(opt.key, 'value', e.target.value)}
                      style={{ flex: 1 }}
                    />
                    <Input
                      placeholder="Отображаемое имя"
                      value={opt.label}
                      onChange={e => updateOption(opt.key, 'label', e.target.value)}
                      style={{ flex: 1 }}
                    />
                    <Select
                      value={opt.color ?? 'default'}
                      onChange={v => updateOption(opt.key, 'color', v)}
                      style={{ width: 110 }}
                      options={OPTION_COLORS.map(c => ({
                        value: c.value,
                        label: <Tag color={c.value === 'default' ? undefined : c.value}>{c.label}</Tag>,
                      }))}
                    />
                    <Button
                      type="text"
                      icon={<MinusCircleOutlined />}
                      danger
                      onClick={() => removeOption(opt.key)}
                    />
                  </div>
                ))}
                <Button type="dashed" onClick={addOption} icon={<PlusOutlined />}>
                  Добавить вариант
                </Button>
              </div>
            </Form.Item>
          )}

          {isRefType && (
            <>
              <Form.Item
                label="Макс. кол-во значений"
                extra={
                  refMaxValues === 0
                    ? 'Значение 0 означает, что количество выбранных значений не ограничено'
                    : refMaxValues === 1
                    ? 'Пользователь сможет выбрать только одно значение'
                    : `Пользователь сможет выбрать не более ${refMaxValues} значений`
                }
              >
                <InputNumber
                  min={0}
                  value={refMaxValues}
                  onChange={v => setRefMaxValues(v ?? 0)}
                  style={{ width: 120 }}
                />
              </Form.Item>

              <Form.Item label="Значения справочника">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {refItems.map(item => (
                    <div key={item.key} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <Tooltip title={item.isEnabled ? 'Включено' : 'Отключено'}>
                        <Switch
                          size="small"
                          checked={item.isEnabled}
                          onChange={() => toggleRefItem(item.key)}
                        />
                      </Tooltip>
                      <Input
                        placeholder="Название значения"
                        value={item.label}
                        onChange={e => updateRefItemLabel(item.key, e.target.value)}
                        style={{ flex: 1, opacity: item.isEnabled ? 1 : 0.45 }}
                      />
                      <Button
                        type="text"
                        icon={<MinusCircleOutlined />}
                        danger
                        onClick={() => removeRefItem(item.key)}
                      />
                    </div>
                  ))}
                  <Button type="dashed" onClick={addRefItem} icon={<PlusOutlined />}>
                    Добавить значение
                  </Button>
                </div>
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>
    </div>
  );
}
