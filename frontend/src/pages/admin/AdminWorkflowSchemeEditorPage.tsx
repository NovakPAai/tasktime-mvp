import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Button, Table, Select, Tag, message, Popconfirm, Typography, Divider, Space,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ArrowLeftOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { workflowSchemesApi, type WorkflowScheme } from '../../api/workflow-schemes';
import { workflowsApi, type Workflow } from '../../api/workflows';
import { listProjects } from '../../api/projects';
import { listIssueTypeConfigs } from '../../api/issue-type-configs';
import type { Project, IssueTypeConfig } from '../../types';

type LocalItem = { key: string; issueTypeConfigId: string | null; workflowId: string };

let _keyId = 0;
const nextKey = () => `item-${++_keyId}`;

export default function AdminWorkflowSchemeEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [scheme, setScheme] = useState<WorkflowScheme | null>(null);
  const [allWorkflows, setAllWorkflows] = useState<Workflow[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [allIssueTypes, setAllIssueTypes] = useState<IssueTypeConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [localItems, setLocalItems] = useState<LocalItem[]>([]);
  const [addProjectId, setAddProjectId] = useState<string | undefined>();

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [s, wfs, projs, issueTypes] = await Promise.all([
        workflowSchemesApi.get(id),
        workflowsApi.list(),
        listProjects(),
        listIssueTypeConfigs(),
      ]);
      setScheme(s);
      setAllWorkflows(wfs);
      setAllProjects(projs);
      setAllIssueTypes(issueTypes);
      setLocalItems((s.items ?? []).map(i => ({
        key: i.id,
        issueTypeConfigId: i.issueTypeConfigId,
        workflowId: i.workflowId,
      })));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleSaveItems = async () => {
    if (!id) return;
    const hasDefault = localItems.some(i => i.issueTypeConfigId === null);
    if (!hasDefault) { message.error('Необходим хотя бы один маппинг "По умолчанию"'); return; }
    if (localItems.some(i => !i.workflowId)) { message.error('Выберите workflow для всех строк'); return; }
    setSaving(true);
    try {
      await workflowSchemesApi.updateItems(id, localItems.map(i => ({
        issueTypeConfigId: i.issueTypeConfigId ?? null,
        workflowId: i.workflowId,
      })));
      message.success('Маппинг сохранён');
      load();
    } catch {
      message.error('Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  const addRow = () => {
    setLocalItems(prev => [
      ...prev,
      { key: nextKey(), issueTypeConfigId: null, workflowId: allWorkflows[0]?.id ?? '' },
    ]);
  };

  const itemColumns: ColumnsType<LocalItem> = [
    {
      title: 'Тип задачи',
      render: (_, item) => {
        const val = item.issueTypeConfigId ?? '__default__';
        const usedByOthers = new Set(
          localItems.filter(i => i.key !== item.key).map(i => i.issueTypeConfigId ?? '__default__')
        );
        const options = [
          { value: '__default__', label: 'По умолчанию', disabled: usedByOthers.has('__default__') },
          ...allIssueTypes.map(t => ({
            value: t.id,
            label: t.name,
            disabled: usedByOthers.has(t.id),
          })),
        ];
        return (
          <Select
            value={val}
            onChange={(v) => setLocalItems(prev => prev.map(i =>
              i.key === item.key ? { ...i, issueTypeConfigId: v === '__default__' ? null : v } : i
            ))}
            options={options}
            style={{ width: 200 }}
          />
        );
      },
    },
    {
      title: 'Workflow',
      render: (_, item) => (
        <Select
          value={item.workflowId || undefined}
          onChange={(val) => setLocalItems(prev => prev.map(i =>
            i.key === item.key ? { ...i, workflowId: val } : i
          ))}
          options={allWorkflows.map(w => ({ value: w.id, label: w.name }))}
          style={{ width: 200 }}
          placeholder="Выберите workflow"
        />
      ),
    },
    {
      title: '',
      width: 50,
      render: (_, item) => (
        <Popconfirm
          title="Удалить строку?"
          onConfirm={() => setLocalItems(prev => prev.filter(i => i.key !== item.key))}
          okText="Удалить"
          okButtonProps={{ danger: true }}
        >
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  const projectColumns: ColumnsType<{ projectId: string; project: { id: string; name: string; key: string } }> = [
    { title: 'Проект', render: (_, r) => `${r.project.key} — ${r.project.name}` },
    {
      title: '',
      width: 80,
      render: (_, r) => (
        <Popconfirm title="Отвязать проект?" onConfirm={() => handleRemoveProject(r.projectId)} okText="Отвязать" okButtonProps={{ danger: true }}>
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  const handleAddProject = async () => {
    if (!id || !addProjectId) return;
    try {
      await workflowSchemesApi.addProject(id, addProjectId);
      message.success('Проект привязан');
      setAddProjectId(undefined);
      load();
    } catch {
      message.error('Не удалось привязать проект');
    }
  };

  const handleRemoveProject = async (projectId: string) => {
    if (!id) return;
    try {
      await workflowSchemesApi.removeProject(id, projectId);
      message.success('Проект отвязан');
      load();
    } catch {
      message.error('Не удалось отвязать');
    }
  };

  if (loading || !scheme) return <div style={{ padding: 24 }}>Загрузка...</div>;

  const attachedProjectIds = new Set((scheme.projects ?? []).map(p => p.projectId));
  const availableProjects = allProjects.filter(p => !attachedProjectIds.has(p.id));

  return (
    <div className="tt-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/admin/workflow-schemes')}>
          Назад
        </Button>
        <Typography.Title level={4} style={{ margin: 0 }}>{scheme.name}</Typography.Title>
        {scheme.isDefault && <Tag color="blue">По умолчанию</Tag>}
      </div>

      {/* Mapping */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Typography.Text strong>Маппинг типов задач → Workflow</Typography.Text>
          <Space>
            <Button size="small" icon={<PlusOutlined />} onClick={addRow}>Добавить строку</Button>
            <Button type="primary" size="small" onClick={handleSaveItems} loading={saving}>
              Сохранить маппинг
            </Button>
          </Space>
        </div>
        <Table
          rowKey="key"
          dataSource={localItems}
          columns={itemColumns}
          pagination={false}
          size="small"
        />
      </div>

      <Divider />

      {/* Projects */}
      <div>
        <Typography.Text strong>Привязанные проекты</Typography.Text>
        <div style={{ display: 'flex', gap: 8, margin: '8px 0' }}>
          <Select
            placeholder="Добавить проект"
            value={addProjectId}
            onChange={setAddProjectId}
            options={availableProjects.map(p => ({ value: p.id, label: `${p.key} — ${p.name}` }))}
            style={{ width: 280 }}
            allowClear
          />
          <Button icon={<PlusOutlined />} onClick={handleAddProject} disabled={!addProjectId}>
            Добавить
          </Button>
        </div>
        <Table
          rowKey="projectId"
          dataSource={scheme.projects ?? []}
          columns={projectColumns}
          pagination={false}
          size="small"
        />
      </div>
    </div>
  );
}
