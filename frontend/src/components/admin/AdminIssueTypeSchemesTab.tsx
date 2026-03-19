import { useState, useEffect } from 'react';
import {
  Table, Button, Modal, Form, Input, message, Space, Tag, Select, Divider,
  Typography, List,
} from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import * as schemesApi from '../../api/issue-type-schemes';
import * as configsApi from '../../api/issue-type-configs';
import * as projectsApi from '../../api/projects';
import type { IssueTypeScheme, IssueTypeConfig, Project } from '../../types';

const { Text } = Typography;

export default function AdminIssueTypeSchemesTab() {
  const [schemes, setSchemes] = useState<IssueTypeScheme[]>([]);
  const [configs, setConfigs] = useState<IssueTypeConfig[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createForm] = Form.useForm();

  const [selectedScheme, setSelectedScheme] = useState<IssueTypeScheme | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailSaving, setDetailSaving] = useState(false);
  const [schemeTypeIds, setSchemeTypeIds] = useState<string[]>([]);
  const [projectToAdd, setProjectToAdd] = useState<string | undefined>(undefined);

  const load = async () => {
    setLoading(true);
    try {
      const [s, c, p] = await Promise.all([
        schemesApi.listIssueTypeSchemes(),
        configsApi.listIssueTypeConfigs(true),
        projectsApi.listProjects(),
      ]);
      setSchemes(s);
      setConfigs(c);
      setProjects(p);
    } catch {
      void message.error('Ошибка загрузки схем');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const openCreate = () => {
    createForm.resetFields();
    setCreateModalOpen(true);
  };

  const handleCreate = async (values: { name: string; description?: string }) => {
    setCreateLoading(true);
    try {
      const created = await schemesApi.createIssueTypeScheme(values);
      setSchemes((prev) => [...prev, created]);
      setCreateModalOpen(false);
      void message.success('Схема создана');
    } catch {
      void message.error('Ошибка создания');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDelete = (scheme: IssueTypeScheme) => {
    if (scheme.isDefault) {
      void message.warning('Схему по умолчанию нельзя удалить');
      return;
    }
    Modal.confirm({
      title: `Удалить схему "${scheme.name}"?`,
      content: 'Проекты, привязанные к этой схеме, будут отвязаны.',
      okText: 'Удалить',
      okType: 'danger',
      cancelText: 'Отмена',
      onOk: async () => {
        try {
          await schemesApi.deleteIssueTypeScheme(scheme.id);
          setSchemes((prev) => prev.filter((s) => s.id !== scheme.id));
          void message.success('Схема удалена');
        } catch {
          void message.error('Ошибка удаления');
        }
      },
    });
  };

  const openDetail = (scheme: IssueTypeScheme) => {
    setSelectedScheme(scheme);
    setSchemeTypeIds(scheme.items.map((i) => i.typeConfig.id));
    setProjectToAdd(undefined);
    setDetailOpen(true);
  };

  const refreshScheme = async (schemeId: string) => {
    const updated = await schemesApi.getIssueTypeScheme(schemeId);
    setSelectedScheme(updated);
    setSchemes((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    setSchemeTypeIds(updated.items.map((i) => i.typeConfig.id));
  };

  const handleSaveItems = async () => {
    if (!selectedScheme) return;
    setDetailSaving(true);
    try {
      const items = schemeTypeIds.map((id, idx) => ({ typeConfigId: id, orderIndex: idx }));
      await schemesApi.updateSchemeItems(selectedScheme.id, items);
      await refreshScheme(selectedScheme.id);
      void message.success('Типы задач в схеме обновлены');
    } catch {
      void message.error('Ошибка сохранения');
    } finally {
      setDetailSaving(false);
    }
  };

  const handleAddProject = async () => {
    if (!selectedScheme || !projectToAdd) return;
    try {
      await schemesApi.assignProjectToScheme(selectedScheme.id, projectToAdd);
      await refreshScheme(selectedScheme.id);
      setProjectToAdd(undefined);
      void message.success('Проект привязан к схеме');
    } catch {
      void message.error('Ошибка привязки проекта');
    }
  };

  const handleRemoveProject = async (projectId: string) => {
    if (!selectedScheme) return;
    try {
      await schemesApi.removeProjectFromScheme(selectedScheme.id, projectId);
      await refreshScheme(selectedScheme.id);
      void message.success('Проект отвязан от схемы');
    } catch {
      void message.error('Ошибка отвязки проекта');
    }
  };

  // Projects not yet assigned to this scheme
  const assignedProjectIds = new Set(selectedScheme?.projects.map((p) => p.projectId) ?? []);
  const availableProjects = projects.filter((p) => !assignedProjectIds.has(p.id));

  const columns: ColumnsType<IssueTypeScheme> = [
    {
      title: 'Название',
      dataIndex: 'name',
      render: (name: string, record: IssueTypeScheme) => (
        <Space>
          {name}
          {record.isDefault && <Tag color="blue">По умолчанию</Tag>}
        </Space>
      ),
    },
    {
      title: 'Типы задач',
      key: 'types',
      render: (_: unknown, record: IssueTypeScheme) => (
        <Space wrap>
          {record.items.map((item) => (
            <Tag key={item.id} style={{ color: item.typeConfig.iconColor, borderColor: item.typeConfig.iconColor }}>
              {item.typeConfig.name}
            </Tag>
          ))}
          {record.items.length === 0 && <Text type="secondary">—</Text>}
        </Space>
      ),
    },
    {
      title: 'Проекты',
      key: 'projects',
      render: (_: unknown, record: IssueTypeScheme) => (
        <Space wrap>
          {record.projects.map((p) => (
            <Tag key={p.id}>{p.project.key}</Tag>
          ))}
          {record.projects.length === 0 && <Text type="secondary">—</Text>}
        </Space>
      ),
    },
    {
      title: 'Действия',
      key: 'actions',
      width: 200,
      render: (_: unknown, record: IssueTypeScheme) => (
        <Space>
          <Button size="small" onClick={() => openDetail(record)}>Настроить</Button>
          <Button size="small" danger disabled={record.isDefault} onClick={() => handleDelete(record)}>
            Удалить
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          Создать схему
        </Button>
      </div>

      <Table
        className="tt-table"
        rowKey="id"
        columns={columns}
        dataSource={schemes}
        loading={loading}
        pagination={{ pageSize: 20 }}
        size="small"
      />

      {/* Create modal */}
      <Modal
        open={createModalOpen}
        title="Новая схема типов задач"
        onCancel={() => setCreateModalOpen(false)}
        onOk={() => createForm.submit()}
        okText="Создать"
        cancelText="Отмена"
        confirmLoading={createLoading}
      >
        <Form form={createForm} layout="vertical" onFinish={(v) => { void handleCreate(v); }}>
          <Form.Item name="name" label="Название" rules={[{ required: true, message: 'Введите название' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Описание">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Detail drawer / modal */}
      <Modal
        open={detailOpen}
        title={selectedScheme ? `Схема: ${selectedScheme.name}` : ''}
        onCancel={() => setDetailOpen(false)}
        footer={null}
        width={640}
      >
        {selectedScheme && (
          <>
            <Divider orientation="left">Типы задач в схеме</Divider>
            <Select
              mode="multiple"
              style={{ width: '100%', marginBottom: 8 }}
              placeholder="Выберите типы задач"
              value={schemeTypeIds}
              onChange={(ids: string[]) => setSchemeTypeIds(ids)}
              options={configs.map((c) => ({
                value: c.id,
                label: (
                  <Space>
                    <span style={{ color: c.iconColor }}>●</span>
                    {c.name}
                    {c.isSubtask && <Tag color="default">Подзадача</Tag>}
                    {!c.isEnabled && <Tag color="red">Отключён</Tag>}
                  </Space>
                ),
              }))}
            />
            <Button
              type="primary"
              size="small"
              loading={detailSaving}
              onClick={() => { void handleSaveItems(); }}
              style={{ marginBottom: 16 }}
            >
              Сохранить типы
            </Button>

            <Divider orientation="left">Привязанные проекты</Divider>
            <List
              size="small"
              dataSource={selectedScheme.projects}
              locale={{ emptyText: 'Нет привязанных проектов' }}
              renderItem={(item) => (
                <List.Item
                  actions={[
                    <Button
                      key="remove"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => { void handleRemoveProject(item.projectId); }}
                    >
                      Отвязать
                    </Button>,
                  ]}
                >
                  <Tag>{item.project.key}</Tag> {item.project.name}
                </List.Item>
              )}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <Select
                style={{ flex: 1 }}
                placeholder="Выберите проект для привязки"
                value={projectToAdd}
                onChange={(v: string) => setProjectToAdd(v)}
                options={availableProjects.map((p) => ({ value: p.id, label: `${p.key} — ${p.name}` }))}
                allowClear
              />
              <Button
                type="primary"
                icon={<PlusOutlined />}
                disabled={!projectToAdd}
                onClick={() => { void handleAddProject(); }}
              >
                Привязать
              </Button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
