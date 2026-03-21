import { useEffect, useState, useCallback } from 'react';
import type { AxiosError } from 'axios';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Typography,
  Button,
  Space,
  Tag,
  Table,
  Modal,
  Form,
  Input,
  message,
  Popconfirm,
  Select,
  Tooltip,
  Progress,
} from 'antd';
import {
  PlusOutlined,
  ArrowLeftOutlined,
  CheckOutlined,
  RocketOutlined,
  UserOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import * as releasesApi from '../api/releases';
import * as issuesApi from '../api/issues';
import * as projectsApi from '../api/projects';
import * as sprintsApi from '../api/sprints';
import { useAuthStore } from '../store/auth.store';
import type { Release, Issue, ReleaseLevel, ReleaseState, SprintInRelease, ReleaseReadiness, Sprint } from '../types';

const LEVEL_LABEL: Record<ReleaseLevel, string> = {
  MINOR: 'Минорный (улучшения, баг-фиксы)',
  MAJOR: 'Мажорный (новые фичи)',
};

const STATE_LABEL: Record<ReleaseState, string> = {
  DRAFT: 'Черновик',
  READY: 'Готов к выпуску',
  RELEASED: 'Выпущен',
};

const STATE_TONE: Record<ReleaseState, string> = {
  DRAFT: 'default',
  READY: 'processing',
  RELEASED: 'success',
};

const SPRINT_STATE_LABEL: Record<string, string> = {
  PLANNED: 'Запланирован',
  ACTIVE: 'Активен',
  CLOSED: 'Закрыт',
};

const SPRINT_STATE_COLOR: Record<string, string> = {
  PLANNED: 'default',
  ACTIVE: 'processing',
  CLOSED: 'success',
};

export default function ReleasesPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [project, setProject] = useState<projectsApi.ProjectDashboard['project'] | null>(null);
  const [releases, setReleases] = useState<Release[]>([]);
  const [selectedRelease, setSelectedRelease] = useState<(Release & { issues?: Issue[]; sprints?: SprintInRelease[] }) | null>(null);
  const [readiness, setReadiness] = useState<ReleaseReadiness | null>(null);
  const [projectIssues, setProjectIssues] = useState<Issue[]>([]);
  const [projectSprints, setProjectSprints] = useState<Sprint[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addSprintsModalOpen, setAddSprintsModalOpen] = useState(false);
  const [selectedIssueIds, setSelectedIssueIds] = useState<string[]>([]);
  const [selectedSprintIds, setSelectedSprintIds] = useState<string[]>([]);
  const [form] = Form.useForm();
  const canManage = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const loadReleases = useCallback(async () => {
    if (!projectId) return;
    const list = await releasesApi.listReleases(projectId);
    setReleases(list);
  }, [projectId]);

  const loadProject = useCallback(async () => {
    if (!projectId) return;
    const dash = await projectsApi.getProjectDashboard(projectId);
    setProject(dash.project);
  }, [projectId]);

  const loadProjectIssues = useCallback(async () => {
    if (!projectId) return;
    const issues = await issuesApi.listIssues(projectId);
    setProjectIssues(issues);
  }, [projectId]);

  const loadProjectSprints = useCallback(async () => {
    if (!projectId) return;
    const sprints = await sprintsApi.listSprints(projectId);
    setProjectSprints(sprints);
  }, [projectId]);

  const loadSelectedRelease = useCallback(async (releaseId: string) => {
    const full = await releasesApi.getReleaseWithIssues(releaseId);
    setSelectedRelease(full);
    const r = await releasesApi.getReleaseReadiness(releaseId);
    setReadiness(r);
  }, []);

  useEffect(() => {
    loadProject();
    loadReleases();
  }, [loadProject, loadReleases]);

  useEffect(() => {
    if (selectedRelease?.id) {
      loadSelectedRelease(selectedRelease.id);
    } else {
      setSelectedRelease(null);
      setReadiness(null);
    }
  }, [selectedRelease?.id, loadSelectedRelease]);

  useEffect(() => {
    if (projectId && (addModalOpen || (selectedRelease && canManage))) {
      loadProjectIssues();
    }
  }, [projectId, addModalOpen, selectedRelease, canManage, loadProjectIssues]);

  useEffect(() => {
    if (projectId && addSprintsModalOpen) {
      loadProjectSprints();
    }
  }, [projectId, addSprintsModalOpen, loadProjectSprints]);

  const handleCreate = async (vals: { name: string; description?: string; level: ReleaseLevel }) => {
    if (!projectId) return;
    try {
      await releasesApi.createRelease(projectId, {
        name: vals.name,
        description: vals.description,
        level: vals.level,
      });
      message.success('Релиз создан');
      setModalOpen(false);
      form.resetFields();
      loadReleases();
    } catch (e) {
      const err = e as AxiosError<{ error?: string }>;
      message.error(err.response?.data?.error || 'Ошибка');
    }
  };

  const handleMarkReady = async (releaseId: string) => {
    try {
      await releasesApi.markReleaseReady(releaseId);
      message.success('Релиз помечен как готовый к выпуску');
      loadReleases();
      if (selectedRelease?.id === releaseId) loadSelectedRelease(releaseId);
    } catch (e) {
      const err = e as AxiosError<{ error?: string }>;
      message.error(err.response?.data?.error || 'Ошибка');
    }
  };

  const handleMarkReleased = async (releaseId: string) => {
    try {
      await releasesApi.markReleaseReleased(releaseId);
      message.success('Релиз выпущен');
      loadReleases();
      if (selectedRelease?.id === releaseId) loadSelectedRelease(releaseId);
    } catch (e) {
      const err = e as AxiosError<{ error?: string }>;
      message.error(err.response?.data?.error || 'Ошибка');
    }
  };

  const handleAddIssues = async () => {
    if (!selectedRelease || selectedIssueIds.length === 0) return;
    try {
      await releasesApi.addIssuesToRelease(selectedRelease.id, selectedIssueIds);
      message.success('Задачи добавлены в релиз');
      setAddModalOpen(false);
      setSelectedIssueIds([]);
      loadSelectedRelease(selectedRelease.id);
      loadReleases();
    } catch (e) {
      const err = e as AxiosError<{ error?: string }>;
      message.error(err.response?.data?.error || 'Ошибка');
    }
  };

  const handleAddSprints = async () => {
    if (!selectedRelease || selectedSprintIds.length === 0) return;
    try {
      await releasesApi.addSprintsToRelease(selectedRelease.id, selectedSprintIds);
      message.success('Спринты добавлены в релиз');
      setAddSprintsModalOpen(false);
      setSelectedSprintIds([]);
      loadSelectedRelease(selectedRelease.id);
      loadReleases();
    } catch (e) {
      const err = e as AxiosError<{ error?: string }>;
      message.error(err.response?.data?.error || 'Ошибка');
    }
  };

  const handleRemoveSprint = async (sprintId: string) => {
    if (!selectedRelease) return;
    try {
      await releasesApi.removeSprintsFromRelease(selectedRelease.id, [sprintId]);
      message.success('Спринт убран из релиза');
      loadSelectedRelease(selectedRelease.id);
      loadReleases();
    } catch (e) {
      const err = e as AxiosError<{ error?: string }>;
      message.error(err.response?.data?.error || 'Ошибка');
    }
  };

  const issuesInRelease = selectedRelease?.issues ?? [];
  const sprintsInRelease = selectedRelease?.sprints ?? [];
  const issueIdsInRelease = new Set(issuesInRelease.map((i) => i.id));
  const sprintIdsInRelease = new Set(sprintsInRelease.map((s) => s.id));
  const candidatesToAdd = projectIssues.filter((i) => !issueIdsInRelease.has(i.id));
  const sprintCandidates = projectSprints.filter((s) => !sprintIdsInRelease.has(s.id));

  const formatDate = (iso?: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
  };

  const getReadyTooltip = () => {
    if (!readiness) return '';
    if (readiness.totalSprints === 0) return 'Добавьте хотя бы один спринт с задачами';
    if (readiness.totalIssues === 0) return 'В спринтах нет задач';
    return '';
  };

  const getReleaseTooltip = () => {
    if (!readiness) return '';
    const parts: string[] = [];
    if (readiness.totalSprints > readiness.closedSprints) {
      parts.push(`${readiness.totalSprints - readiness.closedSprints} спринт(ов) не закрыто`);
    }
    if (readiness.totalIssues > readiness.doneIssues) {
      parts.push(`${readiness.totalIssues - readiness.doneIssues} задач(и) не выполнено`);
    }
    return parts.join(', ');
  };

  const issueColumns = [
    {
      title: 'Key',
      width: 100,
      render: (_: unknown, r: Issue) =>
        r.project ? (
          <Link to={`/issues/${r.id}`}>{`${r.project.key}-${r.number}`}</Link>
        ) : (
          r.number
        ),
    },
    { title: 'Название', dataIndex: 'title', ellipsis: true },
    {
      title: 'Тип',
      dataIndex: 'type',
      width: 80,
      render: (t: string) => <Tag>{t}</Tag>,
    },
    {
      title: 'Статус',
      dataIndex: 'status',
      width: 100,
    },
    {
      title: 'Исполнитель',
      dataIndex: ['assignee', 'name'],
      width: 120,
      render: (n: string) => n || '—',
    },
  ];

  const sprintColumns = [
    {
      title: 'Спринт',
      dataIndex: 'name',
      render: (name: string) => <span style={{ fontWeight: 500 }}>{name}</span>,
    },
    {
      title: 'Статус',
      dataIndex: 'state',
      width: 120,
      render: (state: string) => (
        <Tag color={SPRINT_STATE_COLOR[state]}>{SPRINT_STATE_LABEL[state] ?? state}</Tag>
      ),
    },
    {
      title: 'Задач',
      width: 70,
      render: (_: unknown, r: SprintInRelease) => r._count?.issues ?? 0,
    },
    {
      title: 'Период',
      width: 160,
      render: (_: unknown, r: SprintInRelease) =>
        r.startDate ? `${formatDate(r.startDate)} — ${formatDate(r.endDate)}` : '—',
    },
    ...(canManage && selectedRelease?.state !== 'RELEASED'
      ? [
          {
            title: '',
            width: 40,
            render: (_: unknown, r: SprintInRelease) => (
              <Popconfirm
                title="Убрать спринт из релиза?"
                onConfirm={() => handleRemoveSprint(r.id)}
              >
                <Button size="small" type="text" icon={<DeleteOutlined />} danger />
              </Popconfirm>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="tt-page">
      <div className="tt-page-breadcrumb">
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(`/projects/${projectId}`)}
          className="tt-page-breadcrumb-back"
        >
          {project?.name ?? 'Project'}
        </Button>
        <span className="tt-page-breadcrumb-separator">/</span>
        <span className="tt-page-breadcrumb-current">Релизы</span>
      </div>

      <div className="tt-page-header">
        <div>
          <h1 className="tt-page-title">Релизы</h1>
          <p className="tt-page-subtitle">
            Сбор задач для выпуска: минорные — улучшения и баг-фиксы, мажорные — новые фичи.
          </p>
        </div>
        {canManage && (
          <div className="tt-page-actions">
            <Button icon={<PlusOutlined />} type="primary" onClick={() => setModalOpen(true)}>
              Новый релиз
            </Button>
          </div>
        )}
      </div>

      <div className="tt-two-column">
        <div className="tt-two-column-main">
          <div className="tt-panel">
            <div className="tt-panel-header">
              <span>Релизы проекта</span>
              <span style={{ fontSize: 11, color: 'var(--t3)' }}>{releases.length}</span>
            </div>
            <div className="tt-panel-body">
              {releases.length === 0 ? (
                <div className="tt-panel-empty">
                  Нет релизов. Создайте релиз и добавляйте в него спринты для выпуска.
                </div>
              ) : (
                releases.map((r) => (
                  <div
                    key={r.id}
                    className="tt-panel-row"
                    onClick={() => setSelectedRelease(r)}
                    style={{
                      cursor: 'pointer',
                      backgroundColor: selectedRelease?.id === r.id ? 'var(--bg-sel)' : undefined,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 500, color: 'var(--t1)' }}>{r.name}</span>
                        <Tag color={r.level === 'MAJOR' ? 'blue' : 'default'}>
                          {r.level === 'MAJOR' ? 'Мажорный' : 'Минорный'}
                        </Tag>
                        <Tag color={STATE_TONE[r.state]}>{STATE_LABEL[r.state]}</Tag>
                        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                          {r._count?.sprints ?? 0} спринт(ов) · {r._count?.issues ?? 0} задач
                        </Typography.Text>
                      </div>
                      {r.releaseDate && (
                        <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
                          Выпущен: {formatDate(r.releaseDate)}
                        </div>
                      )}
                    </div>
                    {canManage && r.state !== 'RELEASED' && (
                      <Space size={4}>
                        {r.state === 'DRAFT' && (
                          <Button
                            size="small"
                            icon={<CheckOutlined />}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              handleMarkReady(r.id);
                            }}
                          >
                            Готов
                          </Button>
                        )}
                        {r.state === 'READY' && (
                          <Popconfirm
                            title="Отметить релиз как выпущенный?"
                            onConfirm={() => handleMarkReleased(r.id)}
                          >
                            <Button
                              size="small"
                              icon={<RocketOutlined />}
                              type="primary"
                              onClick={(ev) => ev.stopPropagation()}
                            >
                              Выпустить
                            </Button>
                          </Popconfirm>
                        )}
                      </Space>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {selectedRelease && (
            <>
              {/* Sprint panel */}
              <div style={{ marginTop: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Typography.Title level={5} style={{ margin: 0 }}>
                    Спринты в релизе «{selectedRelease.name}»
                  </Typography.Title>
                  {canManage && selectedRelease.state !== 'RELEASED' && (
                    <Button size="small" icon={<PlusOutlined />} onClick={() => setAddSprintsModalOpen(true)}>
                      Добавить спринт
                    </Button>
                  )}
                </div>
                <div className="tt-table">
                  <Table
                    dataSource={sprintsInRelease}
                    columns={sprintColumns}
                    rowKey="id"
                    size="small"
                    pagination={false}
                    locale={{ emptyText: 'Спринты не добавлены. Добавьте спринт для запуска релиза.' }}
                  />
                </div>
              </div>

              {/* Issues panel */}
              <div style={{ marginTop: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Typography.Title level={5} style={{ margin: 0 }}>
                    Задачи в релизе «{selectedRelease.name}»
                  </Typography.Title>
                  {canManage && selectedRelease.state !== 'RELEASED' && (
                    <Button size="small" icon={<UserOutlined />} onClick={() => setAddModalOpen(true)}>
                      Добавить задачи
                    </Button>
                  )}
                </div>
                <div className="tt-table">
                  <Table
                    dataSource={issuesInRelease}
                    columns={issueColumns}
                    rowKey="id"
                    size="small"
                    pagination={false}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        <aside className="tt-two-column-aside">
          <div className="tt-panel">
            <div className="tt-panel-header">Детали релиза</div>
            <div className="tt-panel-body">
              {!selectedRelease ? (
                <div className="tt-panel-empty">Выберите релиз слева.</div>
              ) : (
                <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ fontWeight: 600, color: 'var(--t1)' }}>{selectedRelease.name}</div>
                  <Space wrap>
                    <Tag color={selectedRelease.level === 'MAJOR' ? 'blue' : 'default'}>
                      {selectedRelease.level === 'MAJOR' ? 'Мажорный' : 'Минорный'}
                    </Tag>
                    <Tag color={STATE_TONE[selectedRelease.state]}>
                      {STATE_LABEL[selectedRelease.state]}
                    </Tag>
                  </Space>

                  {selectedRelease.description && (
                    <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 0 }}>
                      {selectedRelease.description}
                    </Typography.Paragraph>
                  )}

                  {/* Readiness block */}
                  {readiness && selectedRelease.state !== 'RELEASED' && (
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                      <div style={{ fontSize: 11, color: 'var(--t2)', marginBottom: 6, fontWeight: 500 }}>
                        Готовность к выпуску
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 4 }}>
                        Спринты: {readiness.closedSprints}/{readiness.totalSprints} закрыто
                      </div>
                      <Progress
                        percent={readiness.totalSprints > 0
                          ? Math.round((readiness.closedSprints / readiness.totalSprints) * 100)
                          : 0}
                        size="small"
                        status={readiness.closedSprints === readiness.totalSprints && readiness.totalSprints > 0 ? 'success' : 'active'}
                        style={{ marginBottom: 8 }}
                      />
                      <div style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 4 }}>
                        Задачи: {readiness.doneIssues}/{readiness.totalIssues} выполнено
                      </div>
                      <Progress
                        percent={readiness.totalIssues > 0
                          ? Math.round((readiness.doneIssues / readiness.totalIssues) * 100)
                          : 0}
                        size="small"
                        status={readiness.doneIssues === readiness.totalIssues && readiness.totalIssues > 0 ? 'success' : 'active'}
                        style={{ marginBottom: 10 }}
                      />

                      {canManage && selectedRelease.state === 'DRAFT' && (
                        <Tooltip title={getReadyTooltip()}>
                          <Button
                            icon={<CheckOutlined />}
                            size="small"
                            block
                            disabled={!readiness.canMarkReady}
                            onClick={() => handleMarkReady(selectedRelease.id)}
                          >
                            Отметить готовым
                          </Button>
                        </Tooltip>
                      )}

                      {canManage && selectedRelease.state === 'READY' && (
                        <Tooltip title={getReleaseTooltip()}>
                          <Popconfirm
                            title="Выпустить релиз?"
                            onConfirm={() => handleMarkReleased(selectedRelease.id)}
                            disabled={!readiness.canRelease}
                          >
                            <Button
                              icon={<RocketOutlined />}
                              size="small"
                              type="primary"
                              block
                              disabled={!readiness.canRelease}
                            >
                              Выпустить релиз
                            </Button>
                          </Popconfirm>
                        </Tooltip>
                      )}
                    </div>
                  )}

                  <div style={{ fontSize: 12, color: 'var(--t2)', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                    Спринтов: {sprintsInRelease.length} · Задач: {issuesInRelease.length}
                    {selectedRelease.releaseDate && (
                      <> · Выпущен: {formatDate(selectedRelease.releaseDate)}</>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Create release modal */}
      <Modal
        title="Новый релиз"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText="Создать"
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreate}
          initialValues={{ level: 'MINOR' }}
        >
          <Form.Item name="name" label="Версия (например 1.2.0)" rules={[{ required: true }]}>
            <Input placeholder="1.0.0" />
          </Form.Item>
          <Form.Item name="level" label="Уровень" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'MINOR', label: LEVEL_LABEL.MINOR },
                { value: 'MAJOR', label: LEVEL_LABEL.MAJOR },
              ]}
            />
          </Form.Item>
          <Form.Item name="description" label="Описание (релиз-ноты)">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Add sprints modal */}
      <Modal
        title="Добавить спринты в релиз"
        open={addSprintsModalOpen}
        onCancel={() => { setAddSprintsModalOpen(false); setSelectedSprintIds([]); }}
        onOk={handleAddSprints}
        okText="Добавить"
        okButtonProps={{ disabled: selectedSprintIds.length === 0 }}
        width={600}
      >
        <Table
          dataSource={sprintCandidates}
          columns={[
            { title: 'Спринт', dataIndex: 'name' },
            {
              title: 'Статус',
              dataIndex: 'state',
              width: 120,
              render: (state: string) => (
                <Tag color={SPRINT_STATE_COLOR[state]}>{SPRINT_STATE_LABEL[state] ?? state}</Tag>
              ),
            },
            {
              title: 'Задач',
              width: 70,
              render: (_: unknown, r: Sprint) => r._count?.issues ?? 0,
            },
          ]}
          rowKey="id"
          size="small"
          pagination={false}
          rowSelection={{
            selectedRowKeys: selectedSprintIds,
            onChange: (keys) => setSelectedSprintIds(keys as string[]),
          }}
        />
        {sprintCandidates.length === 0 && (
          <Typography.Text type="secondary">Нет спринтов для добавления или все уже в релизе.</Typography.Text>
        )}
      </Modal>

      {/* Add issues modal */}
      <Modal
        title="Добавить задачи в релиз"
        open={addModalOpen}
        onCancel={() => { setAddModalOpen(false); setSelectedIssueIds([]); }}
        onOk={handleAddIssues}
        okText="Добавить"
        okButtonProps={{ disabled: selectedIssueIds.length === 0 }}
        width={700}
      >
        <Table
          dataSource={candidatesToAdd}
          columns={issueColumns}
          rowKey="id"
          size="small"
          pagination={false}
          rowSelection={{
            selectedRowKeys: selectedIssueIds,
            onChange: (keys) => setSelectedIssueIds(keys as string[]),
          }}
        />
        {candidatesToAdd.length === 0 && (
          <Typography.Text type="secondary">Нет задач для добавления или все уже в релизе.</Typography.Text>
        )}
      </Modal>
    </div>
  );
}
