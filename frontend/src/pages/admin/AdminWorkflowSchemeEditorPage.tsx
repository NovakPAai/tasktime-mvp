import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Button, Table, Select, Tag, message, Popconfirm, Typography, Divider,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ArrowLeftOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { workflowSchemesApi, type WorkflowScheme, type WorkflowSchemeItem } from '../../api/workflow-schemes';
import { workflowsApi, type Workflow } from '../../api/workflows';
import { listProjects } from '../../api/projects';
import type { Project } from '../../types';

export default function AdminWorkflowSchemeEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [scheme, setScheme] = useState<WorkflowScheme | null>(null);
  const [allWorkflows, setAllWorkflows] = useState<Workflow[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [itemEdits, setItemEdits] = useState<Record<string, string>>({}); // itemId → workflowId
  const [addProjectId, setAddProjectId] = useState<string | undefined>();

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [s, wfs, projs] = await Promise.all([
        workflowSchemesApi.get(id),
        workflowsApi.list(),
        listProjects(),
      ]);
      setScheme(s);
      setAllWorkflows(wfs);
      setAllProjects(projs);
      // Init edit state
      const edits: Record<string, string> = {};
      (s.items ?? []).forEach(item => { edits[item.id] = item.workflowId; });
      setItemEdits(edits);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleSaveItems = async () => {
    if (!id || !scheme) return;
    setSaving(true);
    try {
      const items = (scheme.items ?? []).map(item => ({
        issueTypeConfigId: item.issueTypeConfigId,
        workflowId: itemEdits[item.id] ?? item.workflowId,
      }));
      await workflowSchemesApi.updateItems(id, items);
      message.success('Маппинг сохранён');
      load();
    } catch {
      message.error('Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

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

  const itemColumns: ColumnsType<WorkflowSchemeItem> = [
    {
      title: 'Тип задачи',
      render: (_, item) => item.issueTypeConfig?.name ?? <Tag color="blue">По умолчанию</Tag>,
    },
    {
      title: 'Workflow',
      render: (_, item) => (
        <Select
          value={itemEdits[item.id] ?? item.workflowId}
          onChange={(val) => setItemEdits(prev => ({ ...prev, [item.id]: val }))}
          options={allWorkflows.map(w => ({ value: w.id, label: w.name }))}
          style={{ width: 200 }}
        />
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
          <Button type="primary" size="small" onClick={handleSaveItems} loading={saving}>
            Сохранить маппинг
          </Button>
        </div>
        <Table
          rowKey="id"
          dataSource={scheme.items ?? []}
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
