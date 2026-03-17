import { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, message, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useProjectsStore } from '../store/projects.store';
import { useAuthStore } from '../store/auth.store';
import * as projectsApi from '../api/projects';
import type { Project } from '../types';
import { hasAnyRequiredRole } from '../lib/roles';

export default function ProjectsPage() {
  const { projects, loading, fetchProjects } = useProjectsStore();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // TTMP-137: project creation moved to Admin → Projects section (ADMIN only)
  const canCreate = hasAnyRequiredRole(user?.role, ['ADMIN']);

  const handleCreate = async (values: { name: string; key: string; description?: string }) => {
    try {
      await projectsApi.createProject(values);
      message.success('Project created');
      setModalOpen(false);
      form.resetFields();
      fetchProjects();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      message.error(error.response?.data?.error || 'Failed to create project');
    }
  };

  const columns = [
    {
      title: 'Key',
      dataIndex: 'key',
      width: 90,
      render: (key: string) => (
        <Tag className="tt-mono">
          {key}
        </Tag>
      ),
    },
    { title: 'Name', dataIndex: 'name', render: (name: string, record: Project) => (
      <a onClick={() => navigate(`/projects/${record.id}`)}>{name}</a>
    )},
    { title: 'Issues', dataIndex: ['_count', 'issues'], width: 80 },
    { title: 'Created', dataIndex: 'createdAt', width: 120, render: (v: string) => new Date(v).toLocaleDateString() },
  ];

  return (
    <div className="tt-page">
      <div className="tt-page-header">
        <div>
          <h1 className="tt-page-title">Projects</h1>
          <p className="tt-page-subtitle">
            Overview of all projects in this workspace
          </p>
        </div>
        <div className="tt-page-actions">
          {canCreate && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setModalOpen(true)}
            >
              New Project
            </Button>
          )}
        </div>
      </div>

      <Table
        className="tt-table tt-projects-table"
        dataSource={projects}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={false}
      />

      <Modal
        title="New Project"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText="Create"
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="key" label="Key" rules={[{ required: true, pattern: /^[A-Z][A-Z0-9]*$/, message: 'Uppercase letters/digits, starting with letter' }]} extra="e.g. PROJ, BACK, FRONT">
            <Input style={{ textTransform: 'uppercase' }} />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
