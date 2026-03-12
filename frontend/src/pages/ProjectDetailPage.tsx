import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Typography, Table, Button, Space, Modal, Form, Input, Select, message, Progress } from 'antd';
import { PlusOutlined, ArrowLeftOutlined, AppstoreOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useIssuesStore } from '../store/issues.store';
import { useAuthStore } from '../store/auth.store';
import * as projectsApi from '../api/projects';
import * as issuesApi from '../api/issues';
import * as authApi from '../api/auth';
import type { Project, Issue, IssueType, IssuePriority, IssueStatus, User } from '../types';
import LoadingSpinner from '../components/common/LoadingSpinner';

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { issues, loading: issuesLoading, fetchIssues, filters, setFilters, resetFilters } = useIssuesStore();
  const { user } = useAuthStore();
  const [project, setProject] = useState<Project | null>(null);
  const [dashboard, setDashboard] = useState<projectsApi.ProjectDashboard | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [selectedIssueIds, setSelectedIssueIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<IssueStatus | undefined>(undefined);
  const [bulkAssigneeId, setBulkAssigneeId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (id) {
      projectsApi.getProject(id).then(setProject);
      projectsApi.getProjectDashboard(id).then(setDashboard);
      fetchIssues(id);
      authApi
        .listUsers()
        .then(setAllUsers)
        .catch(() => {
          // ignore errors, assignee filters will just be empty
        });
    }
  }, [id, fetchIssues]);

  const canCreate = user?.role !== 'VIEWER';
  const canBulkEdit = user && (user.role === 'ADMIN' || user.role === 'MANAGER');

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

  const handleApplyFilters = () => {
    if (!id) return;
    fetchIssues(id);
  };

  const handleResetFilters = () => {
    if (!id) return;
    resetFilters();
    fetchIssues(id);
  };

  const handleBulkUpdate = async () => {
    if (!id || selectedIssueIds.length === 0) return;
    if (!bulkStatus && bulkAssigneeId === undefined) {
      message.warning('Select status and/or assignee to update');
      return;
    }

    try {
      await issuesApi.bulkUpdateIssues(id, {
        issueIds: selectedIssueIds,
        status: bulkStatus,
        assigneeId: bulkAssigneeId === 'UNASSIGNED' ? null : bulkAssigneeId,
      });
      message.success('Issues updated');
      setSelectedIssueIds([]);
      setBulkStatus(undefined);
      setBulkAssigneeId(undefined);
      fetchIssues(id);
    } catch {
      message.error('Failed to update issues');
    }
  };

  if (!project || !dashboard) return <LoadingSpinner />;

  const columns = [
    {
      title: 'Key',
      width: 110,
      render: (_: unknown, r: Issue) => (
        <span className="tt-issue-id">{`${project.key}-${r.number}`}</span>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'type',
      width: 100,
      render: (t: IssueType) => (
        <span className={`tt-issue-tag tt-issue-tag-${t.toLowerCase()}`}>{t}</span>
      ),
    },
    { title: 'Title', dataIndex: 'title' },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 150,
      render: (s: IssueStatus, r: Issue) => (
        <div className="tt-issue-status-cell">
          <span className={`tt-status-dot tt-status-dot-${s.toLowerCase()}`} />
          <Select
            value={s}
            size="small"
            className="tt-status-select"
            onChange={(v) => handleStatusChange(r.id, v)}
            options={(['OPEN', 'IN_PROGRESS', 'REVIEW', 'DONE', 'CANCELLED'] as IssueStatus[]).map((v) => ({
              value: v,
              label: v,
            }))}
          />
        </div>
      ),
    },
    {
      title: 'Priority',
      dataIndex: 'priority',
      width: 120,
      render: (p: IssuePriority) => (
        <span className={`tt-priority-pill tt-priority-${p.toLowerCase()}`}>
          <span className="tt-priority-dot" />
          {p}
        </span>
      ),
    },
    {
      title: 'Assignee',
      dataIndex: ['assignee', 'name'],
      width: 140,
      render: (n: string) => n || '-',
    },
  ];

  const rowSelection = canBulkEdit
    ? {
        selectedRowKeys: selectedIssueIds,
        onChange: (keys: React.Key[]) => setSelectedIssueIds(keys as string[]),
      }
    : undefined;

  return (
    <div className="tt-page">
      <div className="tt-page-breadcrumb">
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/projects')}
          className="tt-page-breadcrumb-back"
        >
          Projects
        </Button>
        <span className="tt-page-breadcrumb-separator">/</span>
        <span className="tt-page-breadcrumb-current">{project.key}</span>
      </div>

      <div className="tt-two-column">
        <div className="tt-two-column-main">
          <div className="tt-page-header">
            <h1 className="tt-page-title">
              {project.name}{' '}
              <span className="tt-page-key">{project.key}</span>
            </h1>
          </div>
          {project.description ? (
            <p className="tt-page-subtitle">{project.description}</p>
          ) : (
            <p className="tt-page-subtitle">No description yet.</p>
          )}

          <div
            className="tt-stats-grid"
          >
            <div className="tt-stats-card">
              <div className="tt-stats-label">Total Issues</div>
              <div className="tt-stats-value">{dashboard.totals.totalIssues}</div>
            </div>
            <div className="tt-stats-card">
              <div className="tt-stats-label">Done Issues</div>
              <div className="tt-stats-value">{dashboard.totals.doneIssues}</div>
            </div>
            <div className="tt-stats-card" style={{ gridColumn: 'span 2' }}>
              <div className="tt-stats-label">Active Sprint Progress</div>
              {dashboard.activeSprint ? (
                <div className="tt-stats-sprint">
                  <Typography.Text className="tt-stats-sprint-name">
                    {dashboard.activeSprint.name}
                  </Typography.Text>
                  <Progress
                    percent={
                      dashboard.activeSprint.totalIssues === 0
                        ? 0
                        : Math.round(
                            (dashboard.activeSprint.doneIssues / dashboard.activeSprint.totalIssues) * 100,
                          )
                    }
                    showInfo={false}
                  />
                </div>
              ) : (
                <Typography.Text
                  type="secondary"
                  style={{ fontSize: 12 }}
                >
                  No active sprint
                </Typography.Text>
              )}
            </div>
          </div>

          <div
            className="tt-panel"
          >
            <div className="tt-panel-header">Issues overview</div>
            <div className="tt-panel-body">
              <div className="tt-filter-block">
                <div className="tt-filter-row">
                  <Input.Search
                    allowClear
                    placeholder="Search in title or description"
                    className="tt-filter-search"
                    value={filters.search}
                    onChange={(e) => setFilters({ search: e.target.value })}
                    onSearch={handleApplyFilters}
                  />
                  <div className="tt-filter-actions">
                    <Button type="primary" size="small" onClick={handleApplyFilters}>
                      Apply
                    </Button>
                    <Button size="small" onClick={handleResetFilters}>
                      Reset
                    </Button>
                  </div>
                </div>
                <div className="tt-filter-row tt-filter-row-chips">
                  <Select<IssueStatus[]>
                    mode="multiple"
                    placeholder="Status"
                    className="tt-filter-field"
                    value={filters.status}
                    onChange={(value) => setFilters({ status: value })}
                    options={(['OPEN', 'IN_PROGRESS', 'REVIEW', 'DONE', 'CANCELLED'] as IssueStatus[]).map((v) => ({
                      value: v,
                      label: v,
                    }))}
                  />
                  <Select<IssueType[]>
                    mode="multiple"
                    placeholder="Type"
                    className="tt-filter-field"
                    value={filters.type}
                    onChange={(value) => setFilters({ type: value })}
                    options={(['EPIC', 'STORY', 'TASK', 'SUBTASK', 'BUG'] as IssueType[]).map((v) => ({
                      value: v,
                      label: v,
                    }))}
                  />
                  <Select<IssuePriority[]>
                    mode="multiple"
                    placeholder="Priority"
                    className="tt-filter-field"
                    value={filters.priority}
                    onChange={(value) => setFilters({ priority: value })}
                    options={(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as IssuePriority[]).map((v) => ({
                      value: v,
                      label: v,
                    }))}
                  />
                  <Select
                    allowClear
                    placeholder="Assignee"
                    className="tt-filter-field tt-filter-field-wide"
                    value={filters.assigneeId}
                    onChange={(value) => setFilters({ assigneeId: value })}
                    options={[
                      { value: 'UNASSIGNED', label: 'Unassigned' },
                      ...allUsers.map((u) => ({ value: u.id, label: `${u.name} (${u.email})` })),
                    ]}
                  />
                </div>

                {canBulkEdit && (
                  <div className="tt-filter-row tt-filter-row-bulk">
                    <Typography.Text strong className="tt-filter-bulk-label">
                      Bulk edit selected issues
                    </Typography.Text>
                    <Space size="small" wrap>
                      <Select<IssueStatus>
                        allowClear
                        placeholder="Status"
                        className="tt-filter-field"
                        value={bulkStatus}
                        onChange={(value) => setBulkStatus(value)}
                        options={(['OPEN', 'IN_PROGRESS', 'REVIEW', 'DONE', 'CANCELLED'] as IssueStatus[]).map((v) => ({
                          value: v,
                          label: v,
                        }))}
                      />
                      <Select
                        allowClear
                        placeholder="Assignee"
                        className="tt-filter-field tt-filter-field-wide"
                        value={bulkAssigneeId}
                        onChange={(value) => setBulkAssigneeId(value)}
                        options={[
                          { value: 'UNASSIGNED', label: 'Unassigned' },
                          ...allUsers.map((u) => ({ value: u.id, label: `${u.name} (${u.email})` })),
                        ]}
                      />
                      <Button
                        type="primary"
                        size="small"
                        disabled={selectedIssueIds.length === 0 || (!bulkStatus && bulkAssigneeId === undefined)}
                        onClick={handleBulkUpdate}
                      >
                        Apply to {selectedIssueIds.length || 0} issue(s)
                      </Button>
                    </Space>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="tt-issues-toolbar">
            <Button icon={<AppstoreOutlined />} onClick={() => navigate(`/projects/${id}/board`)}>
              Board
            </Button>
            <Button icon={<ThunderboltOutlined />} onClick={() => navigate(`/projects/${id}/sprints`)}>
              Sprints
            </Button>
            {canCreate && (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
                New Issue
              </Button>
            )}
          </div>

          <Table
            dataSource={issues}
            columns={columns}
            rowKey="id"
            loading={issuesLoading}
            pagination={false}
            size="middle"
            rowSelection={rowSelection}
            className="tt-issues-table"
            rowClassName={() => 'tt-issues-row'}
            onRow={(record) => ({
              onClick: () => navigate(`/issues/${record.id}`),
              style: { cursor: 'pointer' },
            })}
          />
        </div>

        <aside className="tt-two-column-aside">
          <div className="tt-panel tt-panel-aside">
            <div className="tt-panel-header">Properties</div>
            <div className="tt-panel-body">
              <div className="tt-panel-row">
                <span className="tt-aside-label">Key</span>
                <span className="tt-aside-value tt-aside-mono">{project.key}</span>
              </div>
              <div className="tt-panel-row">
                <span className="tt-aside-label">Total issues</span>
                <span className="tt-aside-value">{dashboard.totals.totalIssues}</span>
              </div>
              <div className="tt-panel-row">
                <span className="tt-aside-label">Done issues</span>
                <span className="tt-aside-value">{dashboard.totals.doneIssues}</span>
              </div>
              <div className="tt-panel-row">
                <span className="tt-aside-label">Active sprint</span>
                <span className="tt-aside-value tt-aside-muted">
                  {dashboard.activeSprint ? dashboard.activeSprint.name : 'None'}
                </span>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <Modal
        title="New Issue"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText="Create"
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreate}
          initialValues={{ type: 'TASK', priority: 'MEDIUM' }}
        >
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
    </div>
  );
}
