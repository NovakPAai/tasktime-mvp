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
} from 'antd';
import { PlusOutlined, ArrowLeftOutlined, CheckOutlined, RocketOutlined, UserOutlined } from '@ant-design/icons';
import * as releasesApi from '../api/releases';
import * as issuesApi from '../api/issues';
import * as projectsApi from '../api/projects';
import { useAuthStore } from '../store/auth.store';
import type { Release, Issue, ReleaseLevel, ReleaseState } from '../types';

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

export default function ReleasesPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [project, setProject] = useState<projectsApi.ProjectDashboard['project'] | null>(null);
  const [releases, setReleases] = useState<Release[]>([]);
  const [selectedRelease, setSelectedRelease] = useState<(Release & { issues?: Issue[] }) | null>(null);
  const [projectIssues, setProjectIssues] = useState<Issue[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [selectedIssueIds, setSelectedIssueIds] = useState<string[]>([]);
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

  const loadSelectedRelease = useCallback(async (releaseId: string) => {
    const full = await releasesApi.getReleaseWithIssues(releaseId);
    setSelectedRelease(full);
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
    }
  }, [selectedRelease?.id, loadSelectedRelease]);

  useEffect(() => {
    if (projectId && (addModalOpen || (selectedRelease && canManage))) {
      loadProjectIssues();
    }
  }, [projectId, addModalOpen, selectedRelease, canManage, loadProjectIssues]);

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

  const issuesInRelease = selectedRelease?.issues ?? [];
  const issueIdsInRelease = new Set(issuesInRelease.map((i) => i.id));
  const candidatesToAdd = projectIssues.filter((i) => !issueIdsInRelease.has(i.id));

  const formatDate = (iso?: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
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
                  Нет релизов. Создайте релиз и добавляйте в него задачи для выпуска.
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
                          {r._count?.issues ?? 0} задач
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
          )}
        </div>

        <aside className="tt-two-column-aside">
          <div className="tt-panel">
            <div className="tt-panel-header">Детали релиза</div>
            <div className="tt-panel-body">
              {!selectedRelease ? (
                <div className="tt-panel-empty">Выберите релиз слева.</div>
              ) : (
                <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontWeight: 600, color: 'var(--t1)' }}>{selectedRelease.name}</div>
                  <Tag color={selectedRelease.level === 'MAJOR' ? 'blue' : 'default'}>
                    {selectedRelease.level === 'MAJOR' ? 'Мажорный' : 'Минорный'}
                  </Tag>
                  <Tag color={STATE_TONE[selectedRelease.state]}>
                    {STATE_LABEL[selectedRelease.state]}
                  </Tag>
                  {selectedRelease.description && (
                    <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 0 }}>
                      {selectedRelease.description}
                    </Typography.Paragraph>
                  )}
                  <div style={{ fontSize: 12, color: 'var(--t2)' }}>
                    Задач: {issuesInRelease.length}
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
