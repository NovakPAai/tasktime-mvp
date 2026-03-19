import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Select, Space, Button, Modal, Form, Input, message } from 'antd';
import { AppstoreOutlined, ThunderboltOutlined, PlusOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import * as boardApi from '../api/board';
import * as sprintsApi from '../api/sprints';
import * as projectsApi from '../api/projects';
import * as issuesApi from '../api/issues';
import type { Issue, IssueStatus, Sprint, Project, IssueType, IssuePriority } from '../types';
import { useAuthStore } from '../store/auth.store';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { IssueTypeBadge } from '../lib/issue-kit';

const STATUS_ORDER: IssueStatus[] = ['OPEN', 'IN_PROGRESS', 'REVIEW', 'DONE', 'CANCELLED'];
const COLUMN_LABELS: Record<IssueStatus, string> = {
  OPEN: 'Open', IN_PROGRESS: 'In Progress', REVIEW: 'Review', DONE: 'Done', CANCELLED: 'Cancelled',
};
const COLUMN_COLORS: Record<IssueStatus, string> = {
  OPEN: '#e6f7ff', IN_PROGRESS: '#fff7e6', REVIEW: '#f6ffed', DONE: '#f9f0ff', CANCELLED: '#fff1f0',
};

export default function BoardPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [columns, setColumns] = useState<Record<IssueStatus, Issue[]>>({} as Record<IssueStatus, Issue[]>);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [selectedSprint, setSelectedSprint] = useState<string | undefined>();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [form] = Form.useForm<issuesApi.CreateIssueBody>();
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);

  const canCreate = user?.role !== 'VIEWER';

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [board, proj] = await Promise.all([
        boardApi.getBoard(projectId, selectedSprint),
        projectsApi.getProject(projectId),
      ]);
      setColumns(board.columns);
      setProject(proj);
    } finally {
      setLoading(false);
    }
  }, [projectId, selectedSprint]);

  useEffect(() => {
    if (projectId) sprintsApi.listSprints(projectId).then(setSprints);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const onDragEnd = async (result: DropResult) => {
    const { source, destination } = result;
    if (!destination || !projectId) return;

    const srcStatus = source.droppableId as IssueStatus;
    const dstStatus = destination.droppableId as IssueStatus;

    const newCols = { ...columns };
    const srcItems = [...(newCols[srcStatus] || [])];
    const [moved] = srcItems.splice(source.index, 1);
    if (!moved) return;

    if (srcStatus === dstStatus) {
      srcItems.splice(destination.index, 0, moved);
      newCols[srcStatus] = srcItems;
    } else {
      const dstItems = [...(newCols[dstStatus] || [])];
      moved.status = dstStatus;
      dstItems.splice(destination.index, 0, moved);
      newCols[srcStatus] = srcItems;
      newCols[dstStatus] = dstItems;
    }
    setColumns(newCols);

    const updates = (Object.entries(newCols) as [IssueStatus, Issue[]][]).flatMap(([status, items]) =>
      items.map((item, idx) => ({ id: item.id, status, orderIndex: idx }))
    );
    await boardApi.reorderBoard(projectId, updates);
  };

  const handleCreateIssue = async (values: issuesApi.CreateIssueBody) => {
    if (!projectId) return;
    try {
      setCreateLoading(true);
      await issuesApi.createIssue(projectId, values);
      message.success('Issue created');
      setCreateOpen(false);
      form.resetFields();
      load();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      message.error(error.response?.data?.error || 'Failed to create issue');
    } finally {
      setCreateLoading(false);
    }
  };

  if (loading || !project) {
    return <LoadingSpinner />;
  }

  const allBoardIssues = STATUS_ORDER.flatMap((status) => columns[status] || []);

  return (
    <div className="tt-page tt-board-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(`/projects/${projectId}`)}
          style={{ padding: '4px 8px', color: 'var(--t2)' }}
        >
          Back to project
        </Button>
      </div>

      <div className="tt-board-header">
        <div className="tt-board-header-main">
          <h1 className="tt-page-title tt-board-title">
            {project.name}
            <span className="tt-board-key">{project.key}</span>
          </h1>
          <p className="tt-page-subtitle tt-board-subtitle">Kanban board</p>
        </div>
        <div className="tt-board-header-actions">
          <Space.Compact>
            <Button
              icon={<AppstoreOutlined />}
              type="primary"
              size="small"
            >
              Board
            </Button>
            <Button
              icon={<ThunderboltOutlined />}
              size="small"
              onClick={() => navigate(`/projects/${projectId}/sprints`)}
            >
              Sprints
            </Button>
          </Space.Compact>
          {canCreate && (
            <Button
              type="primary"
              size="small"
              icon={<PlusOutlined />}
              className="tt-board-new-issue-btn"
              onClick={() => setCreateOpen(true)}
            >
              New Issue
            </Button>
          )}
        </div>
      </div>

      <div className="tt-board-toolbar">
        <Space size="middle" wrap>
          <Select
            allowClear
            placeholder="All sprints"
            value={selectedSprint}
            onChange={setSelectedSprint}
            style={{ minWidth: 220 }}
            options={sprints.map((s) => ({
              value: s.id,
              label: s.name,
            }))}
          />
        </Space>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="tt-board-columns">
          {STATUS_ORDER.map(status => (
            <Droppable droppableId={status} key={status}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`tt-board-column ${snapshot.isDraggingOver ? 'tt-board-column--active' : ''}`}
                  style={{ backgroundColor: COLUMN_COLORS[status] }}
                >
                  <div className="tt-board-column-header">
                    <span className={`tt-board-column-chip tt-board-column-chip--${status.toLowerCase()}`}>
                      {COLUMN_LABELS[status]}
                    </span>
                    <span className="tt-board-column-count">
                      {columns[status]?.length || 0}
                    </span>
                  </div>
                  {(columns[status] || []).map((issue, idx) => (
                    <Draggable key={issue.id} draggableId={issue.id} index={idx}>
                      {(prov) => (
                        <div
                          ref={prov.innerRef}
                          {...prov.draggableProps}
                          {...prov.dragHandleProps}
                          className={`tt-board-card ${selectedIssueId === issue.id ? 'tt-board-card--selected' : ''}`}
                          style={prov.draggableProps.style as React.CSSProperties}
                          onClick={() => setSelectedIssueId(issue.id)}
                        >
                          <div className="tt-board-card-top-row">
                            <span className="tt-board-card-id">
                              {project.key}-{issue.number}
                            </span>
                            <IssueTypeBadge type={issue.type} />
                          </div>
                          <Link to={`/issues/${issue.id}`} className="tt-board-card-title">
                            {issue.title}
                          </Link>
                          <div className="tt-board-card-meta">
                            <span className={`tt-board-status-pill tt-board-status-pill--${issue.status.toLowerCase()}`}>
                              {COLUMN_LABELS[issue.status]}
                            </span>
                            {issue.assignee && (
                              <span className="tt-board-card-assignee">
                                {issue.assignee.name}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          ))}
        </div>
      </DragDropContext>

      <Modal
        title="New Issue"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => form.submit()}
        okText="Create"
        confirmLoading={createLoading}
        width={520}
      >
        <Form<issuesApi.CreateIssueBody>
          form={form}
          layout="vertical"
          onFinish={handleCreateIssue}
          initialValues={{ type: 'TASK', priority: 'MEDIUM' }}
        >
          <Form.Item
            name="title"
            label="Title"
            rules={[{ required: true, message: 'Please enter a title' }]}
          >
            <Input />
          </Form.Item>
          <Space size="middle" style={{ width: '100%' }}>
            <Form.Item<IssueType>
              name="type"
              label="Type"
              style={{ flex: 1 }}
            >
              <Select<IssueType>
                options={(['EPIC', 'STORY', 'TASK', 'SUBTASK', 'BUG'] as IssueType[]).map((v) => ({
                  value: v,
                  label: v,
                }))}
              />
            </Form.Item>
            <Form.Item<IssuePriority>
              name="priority"
              label="Priority"
              style={{ flex: 1 }}
            >
              <Select<IssuePriority>
                options={(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as IssuePriority[]).map((v) => ({
                  value: v,
                  label: v,
                }))}
              />
            </Form.Item>
          </Space>
          <Form.Item name="parentId" label="Parent Issue">
            <Select
              allowClear
              placeholder="None (top level)"
              style={{ width: '100%' }}
              options={allBoardIssues
                .filter((i) => i.type != null && ['EPIC', 'STORY', 'TASK'].includes(i.type))
                .map((i) => ({
                  value: i.id,
                  label: `${project.key}-${i.number} ${i.title}`,
                }))}
            />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
