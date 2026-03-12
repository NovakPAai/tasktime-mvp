import { useEffect, useState } from 'react';
import { Table, Tag, Typography, Select, DatePicker, Space, List } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { UserOutlined, ProjectOutlined, BugOutlined, ClockCircleOutlined } from '@ant-design/icons';
import * as adminApi from '../api/admin';
import * as authApi from '../api/auth';
import type { User, Project, Sprint } from '../types';
import * as projectsApi from '../api/projects';
import * as sprintsApi from '../api/sprints';
import LoadingSpinner from '../components/common/LoadingSpinner';

interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  createdIssues: number;
  assignedIssues: number;
  timeLogs: number;
}

export default function AdminPage() {
  const [stats, setStats] = useState<adminApi.AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [usersMap, setUsersMap] = useState<Record<string, User>>({});
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(undefined);
  const [selectedSprintId, setSelectedSprintId] = useState<string | undefined>(undefined);
  const [dateRange, setDateRange] = useState<[string | undefined, string | undefined]>([undefined, undefined]);
  const [reportByStatus, setReportByStatus] = useState<{ status: string; _count: { _all: number } }[]>([]);
  const [reportByAssignee, setReportByAssignee] = useState<{ assignee: string; count: number }[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const [statsData, adminUsers, allUsers, allProjects] = await Promise.all([
          adminApi.getStats(),
          adminApi.listAdminUsers(),
          authApi.listUsers(),
          projectsApi.listProjects(),
        ]);
        setStats(statsData);
        const userMap: Record<string, User> = {};
        allUsers.forEach((u) => {
          userMap[u.id] = u;
        });
        setUsersMap(userMap);
        setUsers(
          adminUsers.map((u) => ({
            id: u.id,
            email: u.email,
            name: u.name,
            role: u.role,
            isActive: u.isActive,
            createdAt: u.createdAt,
            createdIssues: u._count.createdIssues,
            assignedIssues: u._count.assignedIssues,
            timeLogs: u._count.timeLogs,
          }))
        );
        setProjects(allProjects);
        if (allProjects.length > 0) {
          setSelectedProjectId(allProjects[0].id);
        }
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  useEffect(() => {
    const loadReports = async () => {
      if (!selectedProjectId) return;
      const [from, to] = dateRange;
      const [statusData, assigneeData, projectUsers] = await Promise.all([
        adminApi.getIssuesByStatusReport({
          projectId: selectedProjectId,
          sprintId: selectedSprintId,
          from,
          to,
        }),
        adminApi.getIssuesByAssigneeReport({
          projectId: selectedProjectId,
          sprintId: selectedSprintId,
          from,
          to,
        }),
        authApi.listUsers(),
      ]);
      const userMap: Record<string, User> = {};
      projectUsers.forEach((u) => {
        userMap[u.id] = u;
      });
      setUsersMap((prev) => ({ ...prev, ...userMap }));
      setReportByStatus(statusData);
      setReportByAssignee(
        assigneeData.map((row) => ({
          assignee: row.assigneeId ? userMap[row.assigneeId]?.name ?? 'Unknown' : 'Unassigned',
          count: row._count._all,
        }))
      );
    };
    void loadReports();
  }, [selectedProjectId, selectedSprintId, dateRange]);

  useEffect(() => {
    const loadSprints = async () => {
      if (!selectedProjectId) {
        setSprints([]);
        setSelectedSprintId(undefined);
        return;
      }
      const data = await sprintsApi.listSprints(selectedProjectId);
      setSprints(data);
      if (!selectedSprintId && data.length > 0) {
        setSelectedSprintId(data[0].id);
      }
    };
    void loadSprints();
  }, [selectedProjectId]);

  if (loading || !stats) return <LoadingSpinner />;

  const issuesByStatus = stats.issuesByStatus.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = item._count._all;
    return acc;
  }, {});

  const issuesByAssignee = stats.issuesByAssignee.map((row) => ({
    assignee: row.assigneeId ? usersMap[row.assigneeId]?.name ?? 'Unknown' : 'Unassigned',
    count: row._count._all,
  }));

  const userColumns: ColumnsType<AdminUserRow> = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      render: (role: string) => <Tag className="tt-admin-role-tag">{role}</Tag>,
    },
    {
      title: 'Status',
      dataIndex: 'isActive',
      key: 'isActive',
      render: (active: boolean) => <Tag color={active ? 'green' : 'red'}>{active ? 'Active' : 'Inactive'}</Tag>,
    },
    {
      title: 'Created Issues',
      dataIndex: 'createdIssues',
      key: 'createdIssues',
    },
    {
      title: 'Assigned Issues',
      dataIndex: 'assignedIssues',
      key: 'assignedIssues',
    },
    {
      title: 'Time Logs',
      dataIndex: 'timeLogs',
      key: 'timeLogs',
    },
  ];

  return (
    <div className="tt-page">
      <div className="tt-page-header">
        <div>
          <h1 className="tt-page-title">Admin</h1>
          <p className="tt-page-subtitle">Workspace-wide metrics, reports and activity</p>
        </div>
      </div>

      <div className="tt-stats-grid">
        <div className="tt-stats-card">
          <div className="tt-stats-label">Users</div>
          <div className="tt-stats-value">
            <UserOutlined className="tt-stats-icon" />
            {stats.counts.users}
          </div>
        </div>
        <div className="tt-stats-card">
          <div className="tt-stats-label">Projects</div>
          <div className="tt-stats-value">
            <ProjectOutlined className="tt-stats-icon" />
            {stats.counts.projects}
          </div>
        </div>
        <div className="tt-stats-card">
          <div className="tt-stats-label">Issues</div>
          <div className="tt-stats-value">
            <BugOutlined className="tt-stats-icon" />
            {stats.counts.issues}
          </div>
        </div>
        <div className="tt-stats-card">
          <div className="tt-stats-label">Time Logs</div>
          <div className="tt-stats-value">
            <ClockCircleOutlined className="tt-stats-icon" />
            {stats.counts.timeLogs}
          </div>
        </div>
      </div>

      <div
        className="tt-panel-grid"
        style={{ marginTop: 16 }}
      >
        <div className="tt-panel">
          <div className="tt-panel-header">Overall Issues by Status</div>
          <div className="tt-panel-body">
            {Object.entries(issuesByStatus).length === 0 ? (
              <div className="tt-panel-empty">
                <Typography.Text type="secondary">No data yet</Typography.Text>
              </div>
            ) : (
              Object.entries(issuesByStatus).map(([status, count]) => (
                <div
                  key={status}
                  className="tt-panel-row"
                >
                  <span>{status}</span>
                  <span>{count}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="tt-panel">
          <div className="tt-panel-header">Overall Issues by Assignee</div>
          <div className="tt-panel-body">
            {issuesByAssignee.length === 0 ? (
              <div className="tt-panel-empty">
                <Typography.Text type="secondary">No data yet</Typography.Text>
              </div>
            ) : (
              issuesByAssignee.map((row) => (
                <div
                  key={row.assignee}
                  className="tt-panel-row"
                >
                  <span>{row.assignee}</span>
                  <span>{row.count}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div
        className="tt-panel"
        style={{ marginTop: 16 }}
      >
        <div className="tt-panel-header">Reports</div>
        <div className="tt-panel-body">
          <div style={{ padding: 12 }}>
            <Space
              style={{ marginBottom: 16 }}
              wrap
            >
              <Select
                placeholder="Project"
                style={{ minWidth: 200 }}
                value={selectedProjectId}
                onChange={(value) => setSelectedProjectId(value)}
                options={projects.map((p) => ({ value: p.id, label: `${p.key} - ${p.name}` }))}
              />
              <Select
                allowClear
                placeholder="Sprint"
                style={{ minWidth: 200 }}
                value={selectedSprintId}
                onChange={(value) => setSelectedSprintId(value)}
                options={sprints.map((s) => ({ value: s.id, label: s.name }))}
              />
              <DatePicker.RangePicker
                onChange={(values) =>
                  setDateRange([
                    values?.[0]?.startOf('day').toISOString(),
                    values?.[1]?.endOf('day').toISOString(),
                  ])
                }
              />
            </Space>

            <div className="tt-panel-grid">
              <div className="tt-panel">
                <div className="tt-panel-header">Issues by Status</div>
                <div className="tt-panel-body">
                  {reportByStatus.length === 0 ? (
                    <div className="tt-panel-empty">
                      <Typography.Text type="secondary">No data yet</Typography.Text>
                    </div>
                  ) : (
                    reportByStatus.map((row) => (
                      <div
                        key={row.status}
                        className="tt-panel-row"
                      >
                        <span>{row.status}</span>
                        <span>{row._count._all}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="tt-panel">
                <div className="tt-panel-header">Issues by Assignee</div>
                <div className="tt-panel-body">
                  {reportByAssignee.length === 0 ? (
                    <div className="tt-panel-empty">
                      <Typography.Text type="secondary">No data yet</Typography.Text>
                    </div>
                  ) : (
                    reportByAssignee.map((row) => (
                      <div
                        key={row.assignee}
                        className="tt-panel-row"
                      >
                        <span>{row.assignee}</span>
                        <span>{row.count}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        className="tt-two-column"
        style={{ marginTop: 16 }}
      >
        <div className="tt-two-column-main">
          <div className="tt-panel">
            <div className="tt-panel-header">Users</div>
            <div className="tt-panel-body">
              <Table<AdminUserRow>
                className="tt-table"
                rowKey="id"
                dataSource={users}
                columns={userColumns}
                pagination={{ pageSize: 10 }}
              />
            </div>
          </div>
        </div>

        <aside className="tt-two-column-aside">
          <div className="tt-panel">
            <div className="tt-panel-header">Recent Activity</div>
            <div className="tt-panel-body">
              <List
                dataSource={stats.recentActivity}
                renderItem={(item) => (
                  <List.Item>
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <div className="tt-admin-activity-main">
                        <span className="tt-admin-activity-action">
                          {item.action} {item.entityType} {item.entityId}
                        </span>
                        <span className="tt-admin-activity-date">
                          {new Date(item.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <Typography.Text className="tt-admin-activity-user">
                        {item.user ? `${item.user.name} (${item.user.email})` : 'System'}
                      </Typography.Text>
                    </Space>
                  </List.Item>
                )}
              />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

