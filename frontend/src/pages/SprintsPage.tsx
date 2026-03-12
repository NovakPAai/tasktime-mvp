import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Typography, Button, Space, Tag, Table, Modal, Form, Input, message, Popconfirm, Progress } from 'antd';
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
  const [selectedSprintId, setSelectedSprintId] = useState<string | null>(null);
  const [form] = Form.useForm();
  const canManage = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const load = useCallback(async () => {
    if (!projectId) return;
    const [sp, bl] = await Promise.all([
      sprintsApi.listSprints(projectId),
      sprintsApi.getBacklog(projectId),
    ]);
    setSprints(sp);

    setSelectedSprintId(prev => {
      if (!sp.length) return null;
      if (prev && sp.some(s => s.id === prev)) return prev;
      const active = sp.find(s => s.state === 'ACTIVE');
      return (active ?? sp[0]).id;
    });
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

  const backlogColumns: {
    title: string;
    dataIndex: string | string[];
    width?: number;
    render?: (value: string, record: Issue) => JSX.Element;
  }[] = [
    { title: 'Title', dataIndex: 'title', render: (t: string, r: Issue) => <Link to={`/issues/${r.id}`}>{t}</Link> },
    { title: 'Type', dataIndex: 'type', width: 80, render: (t: string) => <Tag>{t}</Tag> },
    { title: 'Priority', dataIndex: 'priority', width: 80 },
    { title: 'Assignee', dataIndex: ['assignee', 'name'], width: 100, render: (n: string) => n || '-' },
  ];

  const selectedSprint = sprints.find(s => s.id === selectedSprintId) ?? null;

  const formatDate = (iso?: string) => {
    if (!iso) return 'Not set';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'Not set';
    return d.toLocaleDateString();
  };

  const formatDateRange = (start?: string, end?: string) => {
    if (!start && !end) return 'Dates not set';
    if (start && end) return `${formatDate(start)} – ${formatDate(end)}`;
    if (start && !end) return `${formatDate(start)} → open`;
    return `until ${formatDate(end!)}`;
  };

  const getTimeProgress = (sprint: Sprint) => {
    if (!sprint.startDate || !sprint.endDate) return 0;
    const start = new Date(sprint.startDate).getTime();
    const end = new Date(sprint.endDate).getTime();
    const now = Date.now();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
    const ratio = (now - start) / (end - start);
    const clamped = Math.min(1, Math.max(0, ratio));
    return Math.round(clamped * 100);
  };

  return (
    <div className="tt-page">
      <div className="tt-page-header">
        <div>
          <h1 className="tt-page-title">Sprints</h1>
          <p className="tt-page-subtitle">Cycles for this project: plan, run, and close iterations.</p>
        </div>
        {canManage && (
          <div className="tt-page-actions">
            <Button icon={<PlusOutlined />} type="primary" onClick={() => setModalOpen(true)}>
              New Sprint
            </Button>
          </div>
        )}
      </div>

      <div className="tt-two-column">
        <div className="tt-two-column-main">
          <div className="tt-panel">
            <div className="tt-panel-header">
              <span>Cycles</span>
              <span style={{ fontSize: 11, color: 'var(--t3)' }}>{sprints.length} sprint(s)</span>
            </div>
            <div className="tt-panel-body">
              {sprints.length === 0 ? (
                <div className="tt-panel-empty">No sprints yet. Create the first sprint to start planning.</div>
              ) : (
                sprints.map(sprint => (
                  <div
                    key={sprint.id}
                    className="tt-panel-row"
                    onClick={() => setSelectedSprintId(sprint.id)}
                    style={{
                      cursor: 'pointer',
                      backgroundColor: sprint.id === selectedSprintId ? 'var(--bg-sel)' : undefined,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 500, color: 'var(--t1)' }}>{sprint.name}</span>
                        <Tag color={STATE_COLORS[sprint.state]}>{sprint.state}</Tag>
                        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                          {sprint._count?.issues ?? 0} issues
                        </Typography.Text>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
                        {formatDateRange(sprint.startDate, sprint.endDate)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      <div style={{ width: 120 }}>
                        <Progress percent={getTimeProgress(sprint)} size="small" showInfo={false} />
                      </div>
                      {canManage && (
                        <Space size={4}>
                          {sprint.state === 'PLANNED' && selectedBacklog.length > 0 && (
                            <Button size="small" onClick={() => handleMoveToSprint(sprint.id)}>
                              + Add selected
                            </Button>
                          )}
                          {sprint.state === 'PLANNED' && (
                            <Button
                              size="small"
                              icon={<PlayCircleOutlined />}
                              type="primary"
                              onClick={() => handleStart(sprint.id)}
                            >
                              Start
                            </Button>
                          )}
                          {sprint.state === 'ACTIVE' && (
                            <Popconfirm
                              title="Close sprint? Incomplete issues go to backlog."
                              onConfirm={() => handleClose(sprint.id)}
                            >
                              <Button size="small" icon={<StopOutlined />} danger>
                                Close
                              </Button>
                            </Popconfirm>
                          )}
                        </Space>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div style={{ marginTop: 24 }}>
            <Typography.Title level={5} style={{ margin: '0 0 8px' }}>
              Backlog ({backlog.length})
            </Typography.Title>
            <div className="tt-table">
              <Table
                dataSource={backlog}
                columns={backlogColumns}
                rowKey="id"
                size="small"
                pagination={false}
                rowSelection={
                  canManage
                    ? {
                        selectedRowKeys: selectedBacklog,
                        onChange: keys => setSelectedBacklog(keys as string[]),
                      }
                    : undefined
                }
              />
            </div>
          </div>
        </div>

        <div className="tt-two-column-aside">
          <div className="tt-panel">
            <div className="tt-panel-header">
              <span>Sprint details</span>
            </div>
            <div className="tt-panel-body">
              {!selectedSprint ? (
                <div className="tt-panel-empty">Select a sprint on the left to see its details.</div>
              ) : (
                <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: 'var(--t1)' }}>{selectedSprint.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
                        {formatDateRange(selectedSprint.startDate, selectedSprint.endDate)}
                      </div>
                    </div>
                    <Tag color={STATE_COLORS[selectedSprint.state]}>{selectedSprint.state}</Tag>
                  </div>

                  {selectedSprint.goal && (
                    <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 0 }}>
                      {selectedSprint.goal}
                    </Typography.Paragraph>
                  )}

                  <div>
                    <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 4 }}>Time progress</div>
                    <Progress percent={getTimeProgress(selectedSprint)} size="small" />
                  </div>

                  <div style={{ fontSize: 12, color: 'var(--t2)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span>Issues: {selectedSprint._count?.issues ?? 0}</span>
                    <span>Created at: {formatDate(selectedSprint.createdAt)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <Modal title="New Sprint" open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()}>
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="goal" label="Goal">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
