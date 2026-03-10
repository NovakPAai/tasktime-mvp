import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Typography, Card, Button, Space, Tag, Table, Modal, Form, Input, message, Popconfirm } from 'antd';
import { PlusOutlined, PlayCircleOutlined, StopOutlined } from '@ant-design/icons';
import * as sprintsApi from '../api/sprints';
import { useAuthStore } from '../store/auth.store';
import type { Sprint, Issue, SprintState } from '../types';

const STATE_COLORS: Record<SprintState, string> = { PLANNED: 'default', ACTIVE: 'processing', CLOSED: 'green' };

export default function SprintsPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [backlog, setBacklog] = useState<Issue[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedBacklog, setSelectedBacklog] = useState<string[]>([]);
  const [form] = Form.useForm();
  const canManage = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const load = useCallback(async () => {
    if (!projectId) return;
    const [sp, bl] = await Promise.all([
      sprintsApi.listSprints(projectId),
      sprintsApi.getBacklog(projectId),
    ]);
    setSprints(sp);
    setBacklog(bl);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (vals: { name: string; goal?: string }) => {
    if (!projectId) return;
    await sprintsApi.createSprint(projectId, { name: vals.name, goal: vals.goal });
    setModalOpen(false);
    form.resetFields();
    load();
  };

  const handleStart = async (id: string) => {
    try { await sprintsApi.startSprint(id); load(); message.success('Sprint started'); }
    catch (e: any) { message.error(e.response?.data?.error || 'Error'); }
  };

  const handleClose = async (id: string) => {
    try { await sprintsApi.closeSprint(id); load(); message.success('Sprint closed. Incomplete issues moved to backlog.'); }
    catch (e: any) { message.error(e.response?.data?.error || 'Error'); }
  };

  const handleMoveToSprint = async (sprintId: string) => {
    if (!selectedBacklog.length) return;
    await sprintsApi.moveIssuesToSprint(sprintId, selectedBacklog);
    setSelectedBacklog([]);
    load();
  };

  const backlogColumns = [
    { title: 'Title', dataIndex: 'title', render: (t: string, r: Issue) => <Link to={`/issues/${r.id}`}>{t}</Link> },
    { title: 'Type', dataIndex: 'type', width: 80, render: (t: string) => <Tag>{t}</Tag> },
    { title: 'Priority', dataIndex: 'priority', width: 80 },
    { title: 'Assignee', dataIndex: ['assignee', 'name'], width: 100, render: (n: string) => n || '-' },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Sprints</Typography.Title>
        {canManage && <Button icon={<PlusOutlined />} type="primary" onClick={() => setModalOpen(true)}>New Sprint</Button>}
      </Space>

      {sprints.map(sprint => (
        <Card key={sprint.id} size="small" title={
          <Space><Tag color={STATE_COLORS[sprint.state]}>{sprint.state}</Tag>{sprint.name}
            <Typography.Text type="secondary">({sprint._count?.issues ?? 0} issues)</Typography.Text></Space>
        } extra={canManage && (
          <Space>
            {sprint.state === 'PLANNED' && selectedBacklog.length > 0 && (
              <Button size="small" onClick={() => handleMoveToSprint(sprint.id)}>+ Add selected</Button>
            )}
            {sprint.state === 'PLANNED' && <Button size="small" icon={<PlayCircleOutlined />} type="primary" onClick={() => handleStart(sprint.id)}>Start</Button>}
            {sprint.state === 'ACTIVE' && (
              <Popconfirm title="Close sprint? Incomplete issues go to backlog." onConfirm={() => handleClose(sprint.id)}>
                <Button size="small" icon={<StopOutlined />} danger>Close</Button>
              </Popconfirm>
            )}
          </Space>
        )} style={{ marginBottom: 12 }}>
          {sprint.goal && <Typography.Paragraph type="secondary">{sprint.goal}</Typography.Paragraph>}
        </Card>
      ))}

      <Typography.Title level={5} style={{ marginTop: 24 }}>Backlog ({backlog.length})</Typography.Title>
      <Table dataSource={backlog} columns={backlogColumns} rowKey="id" size="small" pagination={false}
        rowSelection={canManage ? { selectedRowKeys: selectedBacklog, onChange: keys => setSelectedBacklog(keys as string[]) } : undefined} />

      <Modal title="New Sprint" open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()}>
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="goal" label="Goal"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
