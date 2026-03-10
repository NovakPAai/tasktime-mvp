import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Typography, Table, Button, Tag, Space, Modal, Form, Input, Select, message } from 'antd';
import { PlusOutlined, ArrowLeftOutlined, AppstoreOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useIssuesStore } from '../store/issues.store';
import { useAuthStore } from '../store/auth.store';
import * as projectsApi from '../api/projects';
import * as issuesApi from '../api/issues';
import type { Project, Issue, IssueType, IssuePriority, IssueStatus } from '../types';
import LoadingSpinner from '../components/common/LoadingSpinner';

const PRIORITY_COLORS: Record<IssuePriority, string> = {
  CRITICAL: 'red', HIGH: 'orange', MEDIUM: 'blue', LOW: 'default',
};
const TYPE_COLORS: Record<IssueType, string> = {
  EPIC: 'purple', STORY: 'green', TASK: 'blue', SUBTASK: 'cyan', BUG: 'red',
};

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { issues, loading: issuesLoading, fetchIssues } = useIssuesStore();
  const { user } = useAuthStore();
  const [project, setProject] = useState<Project | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    if (id) {
      projectsApi.getProject(id).then(setProject);
      fetchIssues(id);
    }
  }, [id, fetchIssues]);

  const canCreate = user?.role !== 'VIEWER';

  const handleCreate = async (values: issuesApi.CreateIssueBody) => {
    if (!id) return;
    try {
      await issuesApi.createIssue(id, values);
      message.success('Issue created');
      setModalOpen(false);
      form.resetFields();
      fetchIssues(id);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      message.error(error.response?.data?.error || 'Failed to create issue');
    }
  };

  const handleStatusChange = async (issueId: string, status: IssueStatus) => {
    try {
      await issuesApi.updateStatus(issueId, status);
      if (id) fetchIssues(id);
    } catch {
      message.error('Failed to update status');
    }
  };

  if (!project) return <LoadingSpinner />;

  const columns = [
    { title: 'Key', width: 100, render: (_: unknown, r: Issue) => `${project.key}-${r.number}` },
    { title: 'Type', dataIndex: 'type', width: 90, render: (t: IssueType) => <Tag color={TYPE_COLORS[t]}>{t}</Tag> },
    { title: 'Title', dataIndex: 'title' },
    { title: 'Status', dataIndex: 'status', width: 120, render: (s: IssueStatus, r: Issue) => (
      <Select value={s} size="small" style={{ width: 120 }} onChange={(v) => handleStatusChange(r.id, v)}
        options={(['OPEN', 'IN_PROGRESS', 'REVIEW', 'DONE', 'CANCELLED'] as IssueStatus[]).map(v => ({ value: v, label: v }))}
      />
    )},
    { title: 'Priority', dataIndex: 'priority', width: 90, render: (p: IssuePriority) => <Tag color={PRIORITY_COLORS[p]}>{p}</Tag> },
    { title: 'Assignee', dataIndex: ['assignee', 'name'], width: 120, render: (n: string) => n || '-' },
  ];

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/projects')}>Back</Button>
        <Typography.Title level={3} style={{ margin: 0 }}>{project.key} - {project.name}</Typography.Title>
      </Space>
      {project.description && <Typography.Paragraph type="secondary">{project.description}</Typography.Paragraph>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 16 }}>
        <Button icon={<AppstoreOutlined />} onClick={() => navigate(`/projects/${id}/board`)}>Board</Button>
        <Button icon={<ThunderboltOutlined />} onClick={() => navigate(`/projects/${id}/sprints`)}>Sprints</Button>
        {canCreate && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            New Issue
          </Button>
        )}
      </div>

      <Table dataSource={issues} columns={columns} rowKey="id" loading={issuesLoading} pagination={false} size="middle"
        onRow={(record) => ({ onClick: () => navigate(`/issues/${record.id}`), style: { cursor: 'pointer' } })} />

      <Modal title="New Issue" open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()} okText="Create" width={600}>
        <Form form={form} layout="vertical" onFinish={handleCreate} initialValues={{ type: 'TASK', priority: 'MEDIUM' }}>
          <Form.Item name="title" label="Title" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Space style={{ width: '100%' }} size="middle">
            <Form.Item name="type" label="Type">
              <Select style={{ width: 140 }}
                options={(['EPIC', 'STORY', 'TASK', 'SUBTASK', 'BUG'] as IssueType[]).map(v => ({ value: v, label: v }))}
              />
            </Form.Item>
            <Form.Item name="priority" label="Priority">
              <Select style={{ width: 140 }}
                options={(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as IssuePriority[]).map(v => ({ value: v, label: v }))}
              />
            </Form.Item>
          </Space>
          <Form.Item name="parentId" label="Parent Issue">
            <Select allowClear placeholder="None (top level)" style={{ width: '100%' }}
              options={issues.filter(i => ['EPIC', 'STORY', 'TASK'].includes(i.type)).map(i => ({
                value: i.id, label: `${project.key}-${i.number} ${i.title}`,
              }))}
            />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={4} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
