import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Table, Button, Space, Modal, Form, Input, Select, message, Progress, Popconfirm } from 'antd';
import {
  PlusOutlined,
  AppstoreOutlined,
  ThunderboltOutlined,
  TagOutlined,
  ApartmentOutlined,
  SearchOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import type { Issue } from '../types';
import { useIssuesStore } from '../store/issues.store';
import { useAuthStore } from '../store/auth.store';
import * as projectsApi from '../api/projects';
import * as issuesApi from '../api/issues';
import * as authApi from '../api/auth';
import type { Project, IssuePriority, IssueStatus, User, IssueTypeConfig } from '../types';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { hasAnyRequiredRole, hasRequiredRole } from '../lib/roles';
import { getProjectIssueTypes } from '../api/issue-type-configs';
import { IssueTypeBadge } from '../lib/issue-kit';

function buildTree(issues: Issue[]): Issue[] {
  const map = new Map(issues.map((i) => [i.id, { ...i, children: [] as Issue[] }]));
  const roots: Issue[] = [];
  for (const issue of map.values()) {
    if (issue.parentId && map.has(issue.parentId)) {
      map.get(issue.parentId)!.children!.push(issue);
    } else {
      roots.push(issue);
    }
  }
  // Remove empty children arrays so Ant Design doesn't show expand icon for leaf nodes
  for (const node of map.values()) {
    if (node.children && node.children.length === 0) {
      delete (node as Issue & { children?: Issue[] }).children;
    }
  }
  return roots;
}

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
  const [treeMode, setTreeMode] = useState(true);
  const [issueTypeConfigs, setIssueTypeConfigs] = useState<IssueTypeConfig[]>([]);

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
      getProjectIssueTypes(id).then(setIssueTypeConfigs).catch(() => {});
    }
  }, [id, fetchIssues]);

  const canCreate = user?.role !== 'VIEWER';
  const canBulkEdit = hasAnyRequiredRole(user?.role, ['ADMIN', 'MANAGER']);

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

  const handleBulkDelete = async () => {
    if (!id || selectedIssueIds.length === 0) return;
    try {
      const result = await issuesApi.bulkDeleteIssues(id, selectedIssueIds);
      message.success(`Удалено задач: ${result.deletedCount}`);
      setSelectedIssueIds([]);
      fetchIssues(id);
      projectsApi.getProjectDashboard(id).then(setDashboard);
    } catch {
      message.error('Failed to delete issues');
    }
  };

  if (!project || !dashboard) return <LoadingSpinner />;

  const sprintPercent =
    dashboard.activeSprint && dashboard.activeSprint.totalIssues > 0
      ? Math.round((dashboard.activeSprint.doneIssues / dashboard.activeSprint.totalIssues) * 100)
      : 0;

  const statusCounts = {
    open: issues.filter((i) => i.status === 'OPEN').length,
    inProgress: issues.filter((i) => i.status === 'IN_PROGRESS').length,
    review: issues.filter((i) => i.status === 'REVIEW').length,
    done: issues.filter((i) => i.status === 'DONE').length,
    cancelled: issues.filter((i) => i.status === 'CANCELLED').length,
  };

  const columns = [
    {
      title: 'KEY',
      width: 96,
      render: (_: unknown, r: Issue) => (
        <span className="tt-issue-key">{`${project.key}-${r.number}`}</span>
      ),
    },
    {
      title: 'TYPE',
      width: 160,
      render: (_: unknown, r: Issue) => (
        <IssueTypeBadge type={r.type} typeConfig={r.issueTypeConfig} showLabel />
      ),
    },
    {
      title: 'TITLE',
      dataIndex: 'title',
      render: (title: string) => <span className="tt-issue-title">{title}</span>,
    },
    {
      title: 'STATUS',
      dataIndex: 'status',
      width: 138,
      render: (s: IssueStatus, r: Issue) => (
        <div className="tt-issue-status-cell">
          <span className={`tt-status-dot tt-status-dot-${s.toLowerCase()}`} />
          <Select
            value={s}
            size="small"
            variant="borderless"
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
      title: 'PRIORITY',
      dataIndex: 'priority',
      width: 100,
      render: (p: IssuePriority) => (
        <span className={`tt-priority-pill tt-priority-${p.toLowerCase()}`}>
          <span className="tt-priority-dot" />
          {p}
        </span>
      ),
    },
    {
      title: 'ASSIGNEE',
      dataIndex: ['assignee', 'name'],
      width: 120,
      render: (n: string) =>
        n ? <span className="tt-assignee-name">{n}</span> : <span className="tt-assignee-empty">—</span>,
    },
    {
      title: 'AUTHOR',
      dataIndex: ['creator', 'name'],
      width: 120,
      render: (n: string) =>
        n ? <span className="tt-assignee-name">{n}</span> : <span className="tt-assignee-empty">—</span>,
    },
  ];

  const rowSelection = canBulkEdit
    ? {
        selectedRowKeys: selectedIssueIds,
        onChange: (keys: React.Key[]) => setSelectedIssueIds(keys as string[]),
      }
    : undefined;

  return (
    <div className="tt-page tt-issues-page">
      {/* ── Header ── */}
      <div className="tt-issues-header">
        <div className="tt-issues-breadcrumb">
          <span className="tt-issues-breadcrumb-link" onClick={() => navigate('/projects')}>
            Projects
          </span>
          <span className="tt-issues-breadcrumb-sep">/</span>
          <span className="tt-issues-breadcrumb-current">{project.name}</span>
          <span className="tt-issues-breadcrumb-sep">/</span>
          <span className="tt-issues-breadcrumb-active">Issues</span>
        </div>

        <div className="tt-issues-title-row">
          <div className="tt-issues-title-left">
            <div className="tt-project-avatar">{project.key.slice(0, 2)}</div>
            <div className="tt-issues-title-group">
              <h1 className="tt-issues-title">{project.name}</h1>
              <span className="tt-issues-key-badge">{project.key}</span>
              <span className="tt-issues-status-badge tt-issues-status-active">
                <span className="tt-issues-status-dot" />
                Active
              </span>
            </div>
          </div>
          <div className="tt-issues-actions">
            <Button
              icon={<AppstoreOutlined />}
              className="tt-issues-action-btn"
              onClick={() => navigate(`/projects/${id}/board`)}
            >
              Board
            </Button>
            <Button
              icon={<ThunderboltOutlined />}
              className="tt-issues-action-btn"
              onClick={() => navigate(`/projects/${id}/sprints`)}
            >
              Sprints
            </Button>
            <Button
              icon={<TagOutlined />}
              className="tt-issues-action-btn"
              onClick={() => navigate(`/projects/${id}/releases`)}
            >
              Релизы
            </Button>
            <Button
              icon={<ApartmentOutlined />}
              className="tt-issues-action-btn"
              type={treeMode ? 'primary' : 'default'}
              onClick={() => setTreeMode((v) => !v)}
            >
              {treeMode ? 'Tree' : 'Flat'}
            </Button>
            {canCreate && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                className="tt-issues-new-btn"
                onClick={() => setModalOpen(true)}
              >
                New Issue
              </Button>
            )}
          </div>
        </div>

        {/* Stats strip */}
        <div className="tt-issues-stats-strip">
          <div className="tt-issues-stat">
            <span className="tt-issues-stat-label">Total</span>
            <span className="tt-issues-stat-value">{dashboard.totals.totalIssues}</span>
          </div>
          <div className="tt-issues-stat-divider" />
          <div className="tt-issues-stat">
            <span className="tt-issues-stat-dot tt-issues-stat-dot-open" />
            <span className="tt-issues-stat-label">Open</span>
            <span className="tt-issues-stat-value">{statusCounts.open}</span>
          </div>
          <div className="tt-issues-stat">
            <span className="tt-issues-stat-dot tt-issues-stat-dot-inprog" />
            <span className="tt-issues-stat-label">In Progress</span>
            <span className="tt-issues-stat-value tt-issues-stat-inprog">{statusCounts.inProgress}</span>
          </div>
          <div className="tt-issues-stat">
            <span className="tt-issues-stat-dot tt-issues-stat-dot-review" />
            <span className="tt-issues-stat-label">Review</span>
            <span className="tt-issues-stat-value tt-issues-stat-review">{statusCounts.review}</span>
          </div>
          <div className="tt-issues-stat">
            <span className="tt-issues-stat-dot tt-issues-stat-dot-done" />
            <span className="tt-issues-stat-label">Done</span>
            <span className="tt-issues-stat-value tt-issues-stat-done">{statusCounts.done}</span>
          </div>
          <div className="tt-issues-stat">
            <span className="tt-issues-stat-dot tt-issues-stat-dot-cancelled" />
            <span className="tt-issues-stat-label">Cancelled</span>
            <span className="tt-issues-stat-value">{statusCounts.cancelled}</span>
          </div>
          {dashboard.activeSprint && (
            <>
              <div className="tt-issues-stat-divider" />
              <div className="tt-issues-stat tt-issues-stat-sprint">
                <span className="tt-issues-stat-label">{dashboard.activeSprint.name}</span>
                <div className="tt-issues-sprint-bar">
                  <Progress
                    percent={sprintPercent}
                    showInfo={false}
                    strokeWidth={4}
                    className="tt-issues-sprint-progress"
                  />
                </div>
                <span className="tt-issues-stat-value tt-issues-stat-sprint-pct">{sprintPercent}%</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="tt-issues-toolbar">
        <div className="tt-issues-search">
          <SearchOutlined className="tt-issues-search-icon" />
          <Input
            variant="borderless"
            placeholder="Search issues..."
            className="tt-issues-search-input"
            value={filters.search}
            onChange={(e) => setFilters({ search: e.target.value })}
            onPressEnter={handleApplyFilters}
          />
        </div>
        <Select<string[]>
          mode="multiple"
          placeholder="Type"
          className="tt-toolbar-select"
          value={filters.issueTypeConfigId}
          maxTagCount={1}
          onChange={(value) => { setFilters({ issueTypeConfigId: value }); if (id) fetchIssues(id); }}
          options={issueTypeConfigs.map((c) => ({ value: c.id, label: c.name.replace(/^->\s*/, '') }))}
        />
        <Select<IssueStatus[]>
          mode="multiple"
          placeholder="Status"
          className="tt-toolbar-select"
          value={filters.status}
          maxTagCount={1}
          onChange={(value) => { setFilters({ status: value }); if (id) fetchIssues(id); }}
          options={(['OPEN', 'IN_PROGRESS', 'REVIEW', 'DONE', 'CANCELLED'] as IssueStatus[]).map((v) => ({ value: v, label: v }))}
        />
        <Select<IssuePriority[]>
          mode="multiple"
          placeholder="Priority"
          className="tt-toolbar-select"
          value={filters.priority}
          maxTagCount={1}
          onChange={(value) => { setFilters({ priority: value }); if (id) fetchIssues(id); }}
          options={(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as IssuePriority[]).map((v) => ({ value: v, label: v }))}
        />
        <Select
          allowClear
          placeholder="Assignee"
          className="tt-toolbar-select tt-toolbar-select-wide"
          value={filters.assigneeId}
          onChange={(value) => { setFilters({ assigneeId: value }); if (id) fetchIssues(id); }}
          options={[
            { value: 'UNASSIGNED', label: 'Unassigned' },
            ...allUsers.map((u) => ({ value: u.id, label: u.name })),
          ]}
        />
        <Button size="small" className="tt-toolbar-apply-btn" onClick={handleApplyFilters}>
          Apply
        </Button>
        <Button size="small" className="tt-toolbar-reset-btn" onClick={handleResetFilters}>
          Reset
        </Button>
        <div className="tt-toolbar-spacer" />
        <span className="tt-toolbar-count">{issues.length} issues</span>

        {canBulkEdit && selectedIssueIds.length > 0 && (
          <>
            <div className="tt-issues-stat-divider" />
            <Space size={6}>
              <Select<IssueStatus>
                allowClear
                placeholder="Set status"
                className="tt-toolbar-select"
                value={bulkStatus}
                onChange={(value) => setBulkStatus(value)}
                options={(['OPEN', 'IN_PROGRESS', 'REVIEW', 'DONE', 'CANCELLED'] as IssueStatus[]).map((v) => ({
                  value: v,
                  label: v,
                }))}
              />
              <Select
                allowClear
                placeholder="Set assignee"
                className="tt-toolbar-select tt-toolbar-select-wide"
                value={bulkAssigneeId}
                onChange={(value) => setBulkAssigneeId(value)}
                options={[
                  { value: 'UNASSIGNED', label: 'Unassigned' },
                  ...allUsers.map((u) => ({ value: u.id, label: u.name })),
                ]}
              />
              <Button
                type="primary"
                size="small"
                disabled={!bulkStatus && bulkAssigneeId === undefined}
                onClick={handleBulkUpdate}
              >
                Apply to {selectedIssueIds.length}
              </Button>
              {hasRequiredRole(user?.role, 'ADMIN') && (
                <Popconfirm
                  title={`Удалить ${selectedIssueIds.length} задач?`}
                  description="Это действие нельзя отменить."
                  okText="Удалить"
                  okButtonProps={{ danger: true }}
                  cancelText="Отмена"
                  onConfirm={handleBulkDelete}
                >
                  <Button danger size="small" icon={<DeleteOutlined />}>
                    Delete {selectedIssueIds.length}
                  </Button>
                </Popconfirm>
              )}
            </Space>
          </>
        )}
      </div>

      {/* ── Table ── */}
      <Table
        dataSource={treeMode ? buildTree(issues) : issues}
        columns={columns}
        rowKey="id"
        loading={issuesLoading}
        pagination={{ pageSize: 25, size: 'small', showTotal: (t) => `${t} issues` }}
        size="small"
        rowSelection={rowSelection}
        className="tt-issues-table tt-issues-table-v2"
        onRow={(record) => ({
          onClick: (e) => {
            const target = e.target as HTMLElement;
            if (target.closest('.ant-table-row-expand-icon') || target.closest('.ant-table-row-indent')) return;
            navigate(`/issues/${record.id}`);
          },
          style: { cursor: 'pointer' },
        })}
        indentSize={24}
        expandable={treeMode ? { defaultExpandAllRows: false } : undefined}
      />

      {/* ── New Issue Modal ── */}
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
          initialValues={{
            issueTypeConfigId: issueTypeConfigs.find((c) => c.systemKey === 'TASK')?.id ?? issueTypeConfigs[0]?.id,
            priority: 'MEDIUM',
          }}
        >
          <Form.Item name="title" label="Title" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Space style={{ width: '100%' }} size="middle">
            <Form.Item name="issueTypeConfigId" label="Type">
              <Select
                style={{ width: 180 }}
                options={issueTypeConfigs.map((c) => ({
                  value: c.id,
                  label: c.name,
                }))}
              />
            </Form.Item>
            <Form.Item name="priority" label="Priority">
              <Select
                style={{ width: 140 }}
                options={(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as IssuePriority[]).map((v) => ({ value: v, label: v }))}
              />
            </Form.Item>
          </Space>
          <Form.Item name="parentId" label="Parent Issue">
            <Select
              allowClear
              placeholder="None (top level)"
              style={{ width: '100%' }}
              options={issues
                .filter((i) => !i.issueTypeConfig?.isSubtask)
                .map((i) => ({ value: i.id, label: `${project.key}-${i.number} ${i.title}` }))}
            />
          </Form.Item>
          <Form.Item name="assigneeId" label="Assignee">
            <Select
              allowClear
              placeholder="Unassigned"
              style={{ width: '100%' }}
              options={allUsers.map((u) => ({ value: u.id, label: `${u.name} (${u.email})` }))}
            />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={4} />
          </Form.Item>
          <Form.Item name="acceptanceCriteria" label="Acceptance Criteria">
            <Input.TextArea
              rows={3}
              placeholder="What conditions must be met for this issue to be considered done?"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
