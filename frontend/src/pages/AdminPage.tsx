import { useEffect, useState } from 'react';
import { Table, Tag, Typography, Select, DatePicker, Space, List, Tabs, Button, Input, Form, Modal, Switch, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { UserOutlined, ProjectOutlined, BugOutlined, ClockCircleOutlined, PlusOutlined } from '@ant-design/icons';
import * as adminApi from '../api/admin';
import * as authApi from '../api/auth';
import * as linksApi from '../api/links';
import type { User, Project, Sprint, IssueLinkType } from '../types';
import * as projectsApi from '../api/projects';
import * as sprintsApi from '../api/sprints';
import LoadingSpinner from '../components/common/LoadingSpinner';
import AdminProjectsTab from '../components/admin/AdminProjectsTab';
import AdminCategoriesTab from '../components/admin/AdminCategoriesTab';
import AdminMonitoringTab from '../components/admin/AdminMonitoringTab';

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
  const [error, setError] = useState<string | null>(null);

  // Link types state
  const [linkTypes, setLinkTypes] = useState<IssueLinkType[]>([]);
  const [linkTypesLoading, setLinkTypesLoading] = useState(false);
  const [linkTypeSearch, setLinkTypeSearch] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [creating, setCreating] = useState(false);
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
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load admin data');
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

  const loadLinkTypes = async () => {
    setLinkTypesLoading(true);
    try {
      const types = await linksApi.listLinkTypes(true);
      setLinkTypes(types);
    } finally {
      setLinkTypesLoading(false);
    }
  };

  const handleCreateLinkType = async (values: { name: string; outboundName: string; inboundName: string }) => {
    setCreating(true);
    try {
      const newType = await linksApi.createLinkType(values);
      setLinkTypes((prev) => [...prev, newType]);
      setCreateModalOpen(false);
      createForm.resetFields();
      void message.success('Тип связи создан');
    } catch (err) {
      void message.error(err instanceof Error ? err.message : 'Ошибка создания');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleLinkType = async (id: string, isActive: boolean) => {
    try {
      const updated = await linksApi.updateLinkType(id, { isActive });
      setLinkTypes((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } catch (err) {
      void message.error(err instanceof Error ? err.message : 'Ошибка обновления');
    }
  };

  if (loading) return <LoadingSpinner />;
  if (error || !stats) return (
    <div className="tt-page">
      <div className="tt-page-header">
        <h1 className="tt-page-title">Admin</h1>
      </div>
      <Typography.Text type="danger">{error ?? 'Failed to load admin data'}</Typography.Text>
    </div>
  );

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

  const linkTypeColumns: ColumnsType<IssueLinkType> = [
    { title: 'Наименование', dataIndex: 'name', key: 'name', filteredValue: [linkTypeSearch], onFilter: (value, record) => record.name.toLowerCase().includes(String(value).toLowerCase()) || record.outboundName.toLowerCase().includes(String(value).toLowerCase()) || record.inboundName.toLowerCase().includes(String(value).toLowerCase()) },
    { title: 'Исходящая связь', dataIndex: 'outboundName', key: 'outboundName' },
    { title: 'Входящая связь', dataIndex: 'inboundName', key: 'inboundName' },
    { title: 'Статус', dataIndex: 'isActive', key: 'isActive', render: (active: boolean) => <Tag color={active ? 'green' : 'default'}>{active ? 'Активна' : 'Неактивна'}</Tag> },
    {
      title: 'Действия',
      key: 'actions',
      render: (_, record) => (
        <Switch
          size="small"
          checked={record.isActive}
          onChange={(checked) => void handleToggleLinkType(record.id, checked)}
          checkedChildren="Вкл"
          unCheckedChildren="Выкл"
        />
      ),
    },
  ];

  const dashboardTab = (
    <>
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
    </>
  );

  const linkTypesTab = (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Input.Search
          placeholder="Поиск по названию или связи..."
          style={{ maxWidth: 320 }}
          value={linkTypeSearch}
          onChange={(e) => setLinkTypeSearch(e.target.value)}
          allowClear
        />
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => { setCreateModalOpen(true); void loadLinkTypes(); }}
        >
          Создать вид связи
        </Button>
      </div>
      <Table<IssueLinkType>
        className="tt-table"
        rowKey="id"
        dataSource={linkTypes}
        columns={linkTypeColumns}
        loading={linkTypesLoading}
        pagination={{ pageSize: 20 }}
      />
      <Modal
        title="Создать вид связи"
        open={createModalOpen}
        onCancel={() => { setCreateModalOpen(false); createForm.resetFields(); }}
        onOk={() => createForm.submit()}
        confirmLoading={creating}
        okText="Создать"
        cancelText="Отмена"
      >
        <Form form={createForm} layout="vertical" onFinish={(values: { name: string; outboundName: string; inboundName: string }) => void handleCreateLinkType(values)}>
          <Form.Item name="name" label="Наименование вида связи" rules={[{ required: true, message: 'Обязательное поле' }]}>
            <Input placeholder="Блокирует" />
          </Form.Item>
          <Form.Item name="outboundName" label="Исходящая связь" rules={[{ required: true, message: 'Обязательное поле' }]}>
            <Input placeholder="блокирует" />
          </Form.Item>
          <Form.Item name="inboundName" label="Входящая связь" rules={[{ required: true, message: 'Обязательное поле' }]}>
            <Input placeholder="заблокировано" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );

  return (
    <div className="tt-page">
      <div className="tt-page-header">
        <div>
          <h1 className="tt-page-title">Admin</h1>
          <p className="tt-page-subtitle">Workspace-wide metrics, reports and activity</p>
        </div>
      </div>
      <Tabs
        defaultActiveKey="dashboard"
        onChange={(key) => { if (key === 'link-types' && linkTypes.length === 0) void loadLinkTypes(); }}
        items={[
          { key: 'dashboard', label: 'Дашборд', children: dashboardTab },
          { key: 'monitoring', label: 'Мониторинг', children: <AdminMonitoringTab /> },
          { key: 'projects', label: 'Проекты', children: <AdminProjectsTab /> },
          { key: 'categories', label: 'Категории проектов', children: <AdminCategoriesTab /> },
          { key: 'link-types', label: 'Виды связей', children: linkTypesTab },
        ]}
      />
    </div>
  );
}

