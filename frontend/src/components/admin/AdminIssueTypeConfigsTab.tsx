import { useState, useEffect } from 'react';
import {
  Table, Button, Modal, Form, Input, message, Space, Tag, Switch, Tooltip, Radio,
} from 'antd';
import {
  PlusOutlined, ThunderboltOutlined, BookOutlined, CheckSquareOutlined,
  BugOutlined, MinusSquareOutlined, FlagOutlined, RocketOutlined, StarOutlined,
  FireOutlined, HeartOutlined, ToolOutlined, AlertOutlined, CrownOutlined,
  DatabaseOutlined, CloudOutlined, CodeOutlined, SafetyOutlined, ExperimentOutlined,
  CompassOutlined, AimOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import * as api from '../../api/issue-type-configs';
import type { IssueTypeConfig } from '../../types';

const ICON_OPTIONS: { name: string; icon: React.ReactNode }[] = [
  { name: 'ThunderboltOutlined', icon: <ThunderboltOutlined /> },
  { name: 'BookOutlined', icon: <BookOutlined /> },
  { name: 'CheckSquareOutlined', icon: <CheckSquareOutlined /> },
  { name: 'BugOutlined', icon: <BugOutlined /> },
  { name: 'MinusSquareOutlined', icon: <MinusSquareOutlined /> },
  { name: 'FlagOutlined', icon: <FlagOutlined /> },
  { name: 'RocketOutlined', icon: <RocketOutlined /> },
  { name: 'StarOutlined', icon: <StarOutlined /> },
  { name: 'FireOutlined', icon: <FireOutlined /> },
  { name: 'HeartOutlined', icon: <HeartOutlined /> },
  { name: 'ToolOutlined', icon: <ToolOutlined /> },
  { name: 'AlertOutlined', icon: <AlertOutlined /> },
  { name: 'CrownOutlined', icon: <CrownOutlined /> },
  { name: 'DatabaseOutlined', icon: <DatabaseOutlined /> },
  { name: 'CloudOutlined', icon: <CloudOutlined /> },
  { name: 'CodeOutlined', icon: <CodeOutlined /> },
  { name: 'SafetyOutlined', icon: <SafetyOutlined /> },
  { name: 'ExperimentOutlined', icon: <ExperimentOutlined /> },
  { name: 'CompassOutlined', icon: <CompassOutlined /> },
  { name: 'AimOutlined', icon: <AimOutlined /> },
];

const COLOR_PALETTE = [
  '#722ED1', '#1677FF', '#52C41A', '#F5222D', '#8C8C8C',
  '#FA8C16', '#13C2C2', '#EB2F96', '#FAAD14', '#389E0D',
  '#096DD9', '#C41D7F', '#D4380D', '#7CB305', '#0958D9',
  '#531DAB',
];

function getIconComponent(name: string): React.ReactNode {
  const opt = ICON_OPTIONS.find((o) => o.name === name);
  return opt?.icon ?? <CheckSquareOutlined />;
}

export default function AdminIssueTypeConfigsTab() {
  const [configs, setConfigs] = useState<IssueTypeConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [editConfig, setEditConfig] = useState<IssueTypeConfig | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [form] = Form.useForm();
  const [selectedColor, setSelectedColor] = useState<string>(COLOR_PALETTE[0]);
  const [selectedIcon, setSelectedIcon] = useState<string>('CheckSquareOutlined');

  const load = async () => {
    setLoading(true);
    try {
      setConfigs(await api.listIssueTypeConfigs(true));
    } catch {
      void message.error('Ошибка загрузки типов задач');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const openCreate = () => {
    setEditConfig(null);
    setSelectedColor(COLOR_PALETTE[0]);
    setSelectedIcon('CheckSquareOutlined');
    form.resetFields();
    form.setFieldsValue({ isSubtask: false, orderIndex: configs.length });
    setModalOpen(true);
  };

  const openEdit = (cfg: IssueTypeConfig) => {
    setEditConfig(cfg);
    setSelectedColor(cfg.iconColor);
    setSelectedIcon(cfg.iconName);
    form.setFieldsValue({
      name: cfg.name,
      description: cfg.description ?? '',
      isSubtask: cfg.isSubtask,
      orderIndex: cfg.orderIndex,
    });
    setModalOpen(true);
  };

  const handleSave = async (values: { name: string; description?: string; isSubtask: boolean; orderIndex: number }) => {
    setSaveLoading(true);
    try {
      const payload = { ...values, iconName: selectedIcon, iconColor: selectedColor };
      if (editConfig) {
        const updated = await api.updateIssueTypeConfig(editConfig.id, payload);
        setConfigs((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        void message.success('Тип задачи обновлён');
      } else {
        const created = await api.createIssueTypeConfig(payload);
        setConfigs((prev) => [...prev, created]);
        void message.success('Тип задачи создан');
      }
      setModalOpen(false);
    } catch {
      void message.error('Ошибка сохранения');
    } finally {
      setSaveLoading(false);
    }
  };

  const handleToggle = async (cfg: IssueTypeConfig) => {
    try {
      const updated = await api.toggleIssueTypeConfig(cfg.id);
      setConfigs((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    } catch {
      void message.error('Ошибка изменения статуса');
    }
  };

  const handleDelete = (cfg: IssueTypeConfig) => {
    if (cfg.isSystem) {
      void message.warning('Системный тип нельзя удалить');
      return;
    }
    Modal.confirm({
      title: `Удалить тип "${cfg.name}"?`,
      okText: 'Удалить',
      okType: 'danger',
      cancelText: 'Отмена',
      onOk: async () => {
        try {
          await api.deleteIssueTypeConfig(cfg.id);
          setConfigs((prev) => prev.filter((c) => c.id !== cfg.id));
          void message.success('Тип удалён');
        } catch {
          void message.error('Ошибка удаления');
        }
      },
    });
  };

  const columns: ColumnsType<IssueTypeConfig> = [
    {
      title: 'Иконка',
      key: 'icon',
      width: 64,
      render: (_: unknown, record: IssueTypeConfig) => (
        <span style={{ fontSize: 20, color: record.iconColor }}>
          {getIconComponent(record.iconName)}
        </span>
      ),
    },
    { title: 'Название', dataIndex: 'name' },
    {
      title: 'Категория',
      key: 'category',
      render: (_: unknown, record: IssueTypeConfig) => (
        <Tag color={record.isSubtask ? 'default' : 'blue'}>
          {record.isSubtask ? 'Подзадача' : 'Задача'}
        </Tag>
      ),
    },
    {
      title: 'Тип',
      key: 'system',
      render: (_: unknown, record: IssueTypeConfig) =>
        record.isSystem ? <Tag color="purple">Системный</Tag> : <Tag>Пользовательский</Tag>,
    },
    {
      title: 'Статус',
      key: 'enabled',
      render: (_: unknown, record: IssueTypeConfig) => (
        <Switch
          size="small"
          checked={record.isEnabled}
          onChange={() => handleToggle(record)}
          checkedChildren="Вкл"
          unCheckedChildren="Выкл"
        />
      ),
    },
    {
      title: 'Действия',
      key: 'actions',
      width: 200,
      render: (_: unknown, record: IssueTypeConfig) => (
        <Space>
          <Button size="small" onClick={() => openEdit(record)}>
            {record.isSystem ? 'Иконка/Цвет' : 'Редактировать'}
          </Button>
          <Tooltip title={record.isSystem ? 'Системный тип нельзя удалить' : ''}>
            <Button size="small" danger disabled={record.isSystem} onClick={() => handleDelete(record)}>
              Удалить
            </Button>
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          Создать тип задачи
        </Button>
      </div>

      <Table
        className="tt-table"
        rowKey="id"
        columns={columns}
        dataSource={configs}
        loading={loading}
        pagination={{ pageSize: 20 }}
        size="small"
      />

      <Modal
        open={modalOpen}
        title={editConfig ? `Редактировать: ${editConfig.name}` : 'Новый тип задачи'}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={saveLoading}
        width={520}
      >
        <Form form={form} layout="vertical" onFinish={(v) => { void handleSave(v); }}>
          <Form.Item name="name" label="Название" rules={[{ required: true, message: 'Введите название' }]}>
            <Input disabled={editConfig?.isSystem} />
          </Form.Item>
          <Form.Item name="description" label="Описание">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="isSubtask" label="Тип">
            <Radio.Group disabled={editConfig?.isSystem}>
              <Radio value={false}>Задача (основной уровень)</Radio>
              <Radio value={true}>Подзадача</Radio>
            </Radio.Group>
          </Form.Item>

          <Form.Item label="Иконка" required>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {ICON_OPTIONS.map((opt) => (
                <Tooltip key={opt.name} title={opt.name}>
                  <Button
                    type={selectedIcon === opt.name ? 'primary' : 'default'}
                    size="small"
                    style={{ fontSize: 18, width: 36, height: 36, color: selectedIcon === opt.name ? undefined : selectedColor }}
                    onClick={() => setSelectedIcon(opt.name)}
                    icon={opt.icon}
                  />
                </Tooltip>
              ))}
            </div>
          </Form.Item>

          <Form.Item label="Цвет иконки" required>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              {COLOR_PALETTE.map((color) => (
                <div
                  key={color}
                  onClick={() => setSelectedColor(color)}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 4,
                    backgroundColor: color,
                    cursor: 'pointer',
                    border: selectedColor === color ? '3px solid #000' : '2px solid transparent',
                  }}
                />
              ))}
              <span style={{ fontSize: 20, color: selectedColor, marginLeft: 8 }}>
                {getIconComponent(selectedIcon)}
              </span>
            </div>
          </Form.Item>

          <Form.Item name="orderIndex" label="Порядок отображения">
            <Input type="number" min={0} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
