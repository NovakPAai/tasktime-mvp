/**
 * SprintsPage — Спринты проекта
 * Дизайн: Paper артборд "Sprints — Dark" (28O-0)
 */
import { useEffect, useState, useCallback, useMemo } from 'react';
import type { AxiosError } from 'axios';
import { useParams, Link } from 'react-router-dom';
import { Button, Modal, Form, Input, Progress, Popconfirm, Select, message } from 'antd';
import { PlusOutlined, PlayCircleOutlined, StopOutlined, FilterOutlined } from '@ant-design/icons';
import * as sprintsApi from '../api/sprints';
import * as projectsApi from '../api/projects';
import * as teamsApi from '../api/teams';
import { useAuthStore } from '../store/auth.store';
import type { Sprint, Issue, SprintState, Team, Project } from '../types';
import SprintIssuesDrawer from '../components/sprints/SprintIssuesDrawer';
import SprintPlanningDrawer from '../components/sprints/SprintPlanningDrawer';
import { hasAnyRequiredRole } from '../lib/roles';

// ── helpers ───────────────────────────────────────────────────────────────────

const STATE_TONE_CLASS: Record<SprintState, string> = {
  PLANNED: 'planned',
  ACTIVE: 'active',
  CLOSED: 'closed',
};

const STATUS_LABEL_RU: Record<string, string> = {
  OPEN: 'Открыта',
  IN_PROGRESS: 'В работе',
  REVIEW: 'Ревью',
  DONE: 'Готово',
  CANCELLED: 'Отменена',
};

const STATUS_CLASS: Record<string, string> = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  REVIEW: 'review',
  DONE: 'done',
  CANCELLED: 'cancelled',
};

const PRIORITY_COLOR: Record<string, string> = {
  CRITICAL: '#ef4444',
  HIGH: '#f59e0b',
  MEDIUM: '#4f6ef7',
  LOW: '#6b7280',
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

const AVATAR_COLORS = [
  '#4f6ef7', '#7c3aed', '#10b981', '#f59e0b',
  '#ef4444', '#06b6d4', '#8b5cf6', '#ec4899',
];

function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
}

function fmtDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  return `${d.getDate()} ${months[d.getMonth()] ?? ''} ${d.getFullYear()}`;
}

function getIssueProgress(issues: Issue[]): { done: number; inProgress: number; review: number; open: number; total: number } {
  const total = issues.length;
  const done = issues.filter((i) => i.status === 'DONE').length;
  const inProgress = issues.filter((i) => i.status === 'IN_PROGRESS').length;
  const review = issues.filter((i) => i.status === 'REVIEW').length;
  const open = issues.filter((i) => i.status === 'OPEN').length;
  return { done, inProgress, review, open, total };
}

// ── component ─────────────────────────────────────────────────────────────────

type StateFilter = 'ACTIVE' | 'PLANNED' | 'CLOSED';

export default function SprintsPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const [project, setProject] = useState<Project | null>(null);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [sprintIssues, setSprintIssues] = useState<Issue[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedSprintId, setSelectedSprintId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [planningOpen, setPlanningOpen] = useState(false);
  const [stateFilter, setStateFilter] = useState<StateFilter>('ACTIVE');
  const [teams, setTeams] = useState<Team[]>([]);
  const [form] = Form.useForm();
  const canManage = hasAnyRequiredRole(user?.role, ['ADMIN', 'MANAGER']);

  const load = useCallback(async () => {
    if (!projectId) return;
    const [sp, ts, proj] = await Promise.all([
      sprintsApi.listSprints(projectId),
      teamsApi.listTeams(),
      projectsApi.getProject(projectId),
    ]);
    setSprints(sp);
    setTeams(ts);
    setProject(proj);

    setSelectedSprintId((prev) => {
      if (!sp.length) return null;
      if (prev && sp.some((s) => s.id === prev)) return prev;
      const active = sp.find((s) => s.state === 'ACTIVE');
      return (active ?? sp[0]).id;
    });
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  // Load sprint issues when selectedSprintId changes
  useEffect(() => {
    if (!selectedSprintId) { setSprintIssues([]); return; }
    void sprintsApi.getSprintIssues(selectedSprintId).then((res) => setSprintIssues(res.issues));
  }, [selectedSprintId]);

  const handleCreate = async (vals: {
    name: string;
    goal?: string;
    projectTeamId?: string;
    businessTeamId?: string;
    flowTeamId?: string;
  }) => {
    if (!projectId) return;
    await sprintsApi.createSprint(projectId, {
      name: vals.name,
      goal: vals.goal,
      projectTeamId: vals.projectTeamId,
      businessTeamId: vals.businessTeamId,
      flowTeamId: vals.flowTeamId,
    });
    setModalOpen(false);
    form.resetFields();
    void load();
  };

  const handleStart = async (id: string) => {
    try {
      await sprintsApi.startSprint(id);
      void load();
      void message.success('Спринт запущен');
    } catch (e) {
      const error = e as AxiosError<{ error?: string }>;
      void message.error(error.response?.data?.error ?? 'Ошибка');
    }
  };

  const handleClose = async (id: string) => {
    try {
      await sprintsApi.closeSprint(id);
      void load();
      void message.success('Спринт закрыт. Незавершённые задачи перенесены в бэклог.');
    } catch (e) {
      const error = e as AxiosError<{ error?: string }>;
      void message.error(error.response?.data?.error ?? 'Ошибка');
    }
  };

  const selectedSprint = sprints.find((s) => s.id === selectedSprintId) ?? null;

  const filteredSprints = useMemo(
    () => sprints.filter((s) => s.state === stateFilter),
    [sprints, stateFilter],
  );

  const progress = getIssueProgress(sprintIssues);
  const progressPercent = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  const STATE_TABS: { label: string; value: StateFilter }[] = [
    { label: 'Active', value: 'ACTIVE' },
    { label: 'Planned', value: 'PLANNED' },
    { label: 'Closed', value: 'CLOSED' },
  ];

  return (
    <div className="tt-page">
      {/* Header */}
      <div className="tt-page-header">
        <div>
          <div className="tt-page-breadcrumb">
            {project && (
              <>
                <Link to={`/projects/${projectId}`} className="tt-page-breadcrumb-back">
                  {project.name}
                </Link>
                <span className="tt-page-breadcrumb-separator">/</span>
              </>
            )}
            <span className="tt-page-breadcrumb-current">Sprints</span>
          </div>
          <h1 className="tt-page-title">Sprints</h1>
        </div>
        {canManage && (
          <div className="tt-page-actions">
            <Button
              className="tt-dashboard-new-btn"
              icon={<PlusOutlined />}
              onClick={() => setModalOpen(true)}
            >
              Новый спринт
            </Button>
          </div>
        )}
      </div>

      {/* State tabs */}
      <div className="tt-sprint-state-tabs">
        {STATE_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            className={`tt-sprint-state-tab${stateFilter === tab.value ? ' tt-sprint-state-tab-active' : ''}`}
            onClick={() => {
              setStateFilter(tab.value);
              // Auto-select first sprint of this state
              const first = sprints.find((s) => s.state === tab.value);
              if (first) setSelectedSprintId(first.id);
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Sprint selector list */}
      {filteredSprints.length > 1 && (
        <div className="tt-sprint-selector">
          {filteredSprints.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`tt-sprint-selector-item${s.id === selectedSprintId ? ' tt-sprint-selector-item-active' : ''}`}
              onClick={() => setSelectedSprintId(s.id)}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {filteredSprints.length === 0 && (
        <div className="tt-panel-empty" style={{ marginTop: 24 }}>
          Нет спринтов в статусе «{STATE_TABS.find((t) => t.value === stateFilter)?.label}».
        </div>
      )}

      {/* Sprint info card */}
      {selectedSprint && selectedSprint.state === stateFilter && (
        <div className="tt-sprint-info-card">
          <div className="tt-sprint-info-header">
            <div className="tt-sprint-info-title-wrap">
              <span className="tt-sprint-info-name">{selectedSprint.name}</span>
              <span className={`tt-sprint-state-pill tt-sprint-state-pill-${STATE_TONE_CLASS[selectedSprint.state]}`}>
                {selectedSprint.state === 'ACTIVE' ? 'ACTIVE'
                  : selectedSprint.state === 'PLANNED' ? 'PLANNED'
                  : 'CLOSED'}
              </span>
            </div>
            <div className="tt-sprint-info-dates-wrap">
              {selectedSprint.startDate || selectedSprint.endDate ? (
                <span className="tt-sprint-info-dates">
                  {selectedSprint.startDate ? `Дата начала ${fmtDate(selectedSprint.startDate)}` : ''}
                  {selectedSprint.startDate && selectedSprint.endDate ? ' → ' : ''}
                  {selectedSprint.endDate ? `Дата окончания ${fmtDate(selectedSprint.endDate)}` : ''}
                </span>
              ) : null}
              {canManage && selectedSprint.state === 'PLANNED' && (
                <Button
                  size="small"
                  icon={<PlayCircleOutlined />}
                  type="primary"
                  style={{ marginLeft: 8 }}
                  onClick={() => void handleStart(selectedSprint.id)}
                >
                  Запустить спринт
                </Button>
              )}
              {canManage && selectedSprint.state === 'ACTIVE' && (
                <Popconfirm
                  title="Закрыть спринт? Незавершённые задачи перейдут в бэклог."
                  onConfirm={() => void handleClose(selectedSprint.id)}
                >
                  <Button
                    size="small"
                    icon={<StopOutlined />}
                    className="tt-btn-ghost"
                    style={{ marginLeft: 8 }}
                  >
                    Закрыть спринт
                  </Button>
                </Popconfirm>
              )}
            </div>
          </div>

          {selectedSprint.goal && (
            <div className="tt-sprint-info-goal">
              Цель: {selectedSprint.goal}
            </div>
          )}

          {/* Progress bar */}
          <div className="tt-sprint-info-progress">
            <div className="tt-sprint-info-progress-label">Прогресс выполнения</div>
            <div className="tt-sprint-info-progress-bar-wrap">
              <Progress
                percent={progressPercent}
                showInfo={false}
                strokeColor="linear-gradient(90deg, #4f6ef7 0%, #7c3aed 100%)"
                trailColor="rgba(255,255,255,0.08)"
                size="small"
              />
              <span className="tt-sprint-info-progress-count">
                {progress.done} / {progress.total} задач
              </span>
            </div>
          </div>

          {/* Status dots */}
          <div className="tt-sprint-info-status-dots">
            <span className="tt-sprint-info-dot tt-sprint-info-dot-done">●</span>
            <span>Done: {progress.done}</span>
            <span className="tt-sprint-info-dot tt-sprint-info-dot-inprogress">●</span>
            <span>In Progress: {progress.inProgress}</span>
            <span className="tt-sprint-info-dot tt-sprint-info-dot-review">●</span>
            <span>Review: {progress.review}</span>
            <span className="tt-sprint-info-dot tt-sprint-info-dot-open">●</span>
            <span>Open: {progress.open}</span>
          </div>
        </div>
      )}

      {/* Issues table */}
      {selectedSprint && selectedSprint.state === stateFilter && (
        <div className="tt-sprint-issues-section">
          <div className="tt-sprint-issues-header">
            <span className="tt-sprint-issues-title">Задачи спринта</span>
            <div className="tt-sprint-issues-actions">
              <Button size="small" icon={<FilterOutlined />} className="tt-btn-ghost">
                Фильтр
              </Button>
              {canManage && (
                <Button
                  size="small"
                  icon={<PlusOutlined />}
                  type="primary"
                  onClick={() => setPlanningOpen(true)}
                >
                  Добавить из бэклога
                </Button>
              )}
            </div>
          </div>

          <table className="tt-sprint-issues-table">
            <thead>
              <tr>
                <th className="tt-sprint-th">КЛЮЧ</th>
                <th className="tt-sprint-th">ЗАДАЧА</th>
                <th className="tt-sprint-th">СТАТУС</th>
                <th className="tt-sprint-th">ПРИОРИТЕТ</th>
                <th className="tt-sprint-th">ВРЕМЯ</th>
                <th className="tt-sprint-th">КОМУ</th>
              </tr>
            </thead>
            <tbody>
              {sprintIssues.length === 0 ? (
                <tr>
                  <td colSpan={6} className="tt-sprint-issues-empty">
                    В спринте нет задач
                  </td>
                </tr>
              ) : (
                sprintIssues.map((issue) => {
                  const assigneeName = issue.assignee?.name;
                  return (
                    <tr key={issue.id} className="tt-sprint-issue-row">
                      <td className="tt-sprint-td">
                        <Link
                          to={`/issues/${issue.id}`}
                          className="tt-sprint-issue-key"
                        >
                          {issue.project?.key ?? ''}-{issue.number}
                        </Link>
                      </td>
                      <td className="tt-sprint-td tt-sprint-td-title">
                        <Link to={`/issues/${issue.id}`} className="tt-sprint-issue-title">
                          {issue.title}
                        </Link>
                      </td>
                      <td className="tt-sprint-td">
                        <span className={`tt-sprint-status-pill tt-sprint-status-pill-${STATUS_CLASS[issue.status] ?? 'open'}`}>
                          {STATUS_LABEL_RU[issue.status] ?? issue.status}
                        </span>
                      </td>
                      <td className="tt-sprint-td">
                        <span
                          className="tt-sprint-priority"
                          style={{ color: PRIORITY_COLOR[issue.priority] ?? 'var(--t2)' }}
                        >
                          {issue.priority}
                        </span>
                      </td>
                      <td className="tt-sprint-td tt-sprint-td-mono">
                        {issue.estimatedHours != null ? (
                          <span>— / {issue.estimatedHours}ч</span>
                        ) : (
                          <span className="tt-sprint-td-muted">—</span>
                        )}
                      </td>
                      <td className="tt-sprint-td">
                        {assigneeName ? (
                          <div className="tt-sprint-assignee">
                            <span
                              className="tt-sprint-avatar"
                              style={{ background: avatarColor(assigneeName) }}
                            >
                              {getInitials(assigneeName)}
                            </span>
                          </div>
                        ) : (
                          <span className="tt-sprint-td-muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Sprint Modal */}
      <Modal
        title="Новый спринт"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText="Создать"
        cancelText="Отмена"
      >
        <Form form={form} layout="vertical" onFinish={(v) => void handleCreate(v)}>
          <Form.Item name="name" label="Название" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="goal" label="Цель">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="projectTeamId" label="Проектная команда">
            <Select allowClear options={teams.map((t) => ({ value: t.id, label: t.name }))} />
          </Form.Item>
          <Form.Item name="businessTeamId" label="Бизнес-функциональная команда">
            <Select allowClear options={teams.map((t) => ({ value: t.id, label: t.name }))} />
          </Form.Item>
          <Form.Item name="flowTeamId" label="Flow-команда">
            <Select allowClear options={teams.map((t) => ({ value: t.id, label: t.name }))} />
          </Form.Item>
        </Form>
      </Modal>

      <SprintIssuesDrawer
        open={detailsOpen}
        sprintId={selectedSprintId}
        onClose={() => setDetailsOpen(false)}
      />

      <SprintPlanningDrawer
        open={planningOpen}
        sprintId={selectedSprintId}
        projectId={projectId ?? null}
        onClose={() => setPlanningOpen(false)}
        onAdded={() => {
          void load();
          if (selectedSprintId) {
            void sprintsApi.getSprintIssues(selectedSprintId).then((res) => setSprintIssues(res.issues));
          }
        }}
      />
    </div>
  );
}
