/**
 * SprintsPage — rebuilt from Paper artboards 28O-0 (dark) + 2D3-0 (light).
 * All values taken directly from Paper JSX export.
 * Zero CSS class dependencies, zero Ant Design layout.
 */

import { useEffect, useState, useCallback } from 'react';
import type { AxiosError } from 'axios';
import { useParams, Link } from 'react-router-dom';
import { Modal, Form, Input, Popconfirm, Select, Checkbox, message } from 'antd';
import * as sprintsApi from '../api/sprints';
import * as projectsApi from '../api/projects';
import * as teamsApi from '../api/teams';
import { useAuthStore } from '../store/auth.store';
import { useThemeStore } from '../store/theme.store';
import type { Sprint, Issue, SprintState, IssueStatus, IssuePriority, Team, Project } from '../types';
import SprintIssuesDrawer from '../components/sprints/SprintIssuesDrawer';
import { hasAnyRequiredRole } from '../lib/roles';

// ─── Design tokens (Paper artboard 28O-0 dark / 2D3-0 light) ────────────────
const C = {
  bg:       '#080B14',
  bgCard:   '#0F1320',
  border:   '#21262D',
  borderHd: '#161B22',
  t1:       '#E2E8F8',
  t2:       '#C9D1D9',
  t3:       '#8B949E',
  t4:       '#484F58',
  acc:      '#4F6EF7',
  issueKey: '#6366F1',
  green:    '#4ADE80',
  amber:    '#F59E0B',
  violet:   '#A78BFA',
  red:      '#EF4444',
};

const CL = {
  bg:       '#F6F8FA',
  bgCard:   '#FFFFFF',
  border:   '#D0D7DE',
  borderHd: '#EEF0F2',
  t1:       '#1F2328',
  t2:       '#1F2328',
  t3:       '#656D76',
  t4:       '#8C959F',
  acc:      '#4F6EF7',
  issueKey: '#6366F1',
  green:    '#1A7F37',
  amber:    '#D97706',
  violet:   '#7C3AED',
  red:      '#DC2626',
};
const F = {
  display: '"Space Grotesk", system-ui, sans-serif',
  sans:    '"Inter", system-ui, sans-serif',
};
const LOGO_GRAD = 'linear-gradient(in oklab 135deg, oklab(59.3% -0.002 -0.207) 0%, oklab(54.1% 0.096 -0.227) 100%)';
const GRADIENTS = [
  'linear-gradient(in oklab 135deg, oklab(80% -0.160 0.086) 0%, oklab(59.6% -0.122 0.037) 100%)',
  'linear-gradient(in oklab 135deg, oklab(59.3% -0.002 -0.207) 0%, oklab(54.1% 0.096 -0.227) 100%)',
  'linear-gradient(in oklab 135deg, oklab(76.9% 0.056 0.155) 0%, oklab(66.6% 0.083 0.134) 100%)',
  'linear-gradient(in oklab 135deg, oklab(62.7% 0.130 -0.193) 0%, oklab(54.1% 0.096 -0.227) 100%)',
  'linear-gradient(in oklab 135deg, oklab(70% 0.18 0.10) 0%, oklab(55% 0.15 0.08) 100%)',
];

function avatarGradient(name: string) {
  const h = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
  return GRADIENTS[h % GRADIENTS.length];
}

function initials(name: string) {
  return name.split(' ').map(n => n[0] ?? '').join('').slice(0, 2).toUpperCase();
}

const STATUS_DARK: Record<IssueStatus, { bg: string; color: string; label: string }> = {
  OPEN:        { bg: '#8B949E1F', color: '#8B949E', label: 'OPEN' },
  IN_PROGRESS: { bg: '#F59E0B1F', color: '#F59E0B', label: 'IN PROGRESS' },
  REVIEW:      { bg: '#A78BFA1F', color: '#A78BFA', label: 'REVIEW' },
  DONE:        { bg: '#4ADE801F', color: '#4ADE80', label: 'DONE' },
  CANCELLED:   { bg: '#EF44441F', color: '#EF4444', label: 'CANCELLED' },
};
const STATUS_LIGHT: Record<IssueStatus, { bg: string; color: string; label: string }> = {
  OPEN:        { bg: '#8C959F1A', color: '#8C959F', label: 'OPEN' },
  IN_PROGRESS: { bg: '#D977061A', color: '#D97706', label: 'IN PROGRESS' },
  REVIEW:      { bg: '#7C3AED1A', color: '#7C3AED', label: 'REVIEW' },
  DONE:        { bg: '#1A7F371A', color: '#1A7F37', label: 'DONE' },
  CANCELLED:   { bg: '#DC26261A', color: '#DC2626', label: 'CANCELLED' },
};

const PRIORITY_DARK: Record<IssuePriority, string> = {
  CRITICAL: '#EF4444',
  HIGH:     '#F59E0B',
  MEDIUM:   '#8B949E',
  LOW:      '#8B949E',
};
const PRIORITY_LIGHT: Record<IssuePriority, string> = {
  CRITICAL: '#DC2626',
  HIGH:     '#D97706',
  MEDIUM:   '#656D76',
  LOW:      '#656D76',
};

const ISSUE_TYPE_CFG: Record<string, { bg: string; color: string; label: string }> = {
  TASK:    { bg: '#10B98126', color: '#10B981', label: 'TASK' },
  BUG:     { bg: '#EF444426', color: '#EF4444', label: 'BUG' },
  STORY:   { bg: '#3B82F626', color: '#3B82F6', label: 'STORY' },
  EPIC:    { bg: '#A855F726', color: '#A855F7', label: 'EPIC' },
  SUBTASK: { bg: '#8B949E26', color: '#8B949E', label: 'SUB' },
};

const STATE_BADGE_DARK: Record<SprintState, { bg: string; color: string }> = {
  ACTIVE:  { bg: '#4ADE801F', color: '#4ADE80' },
  PLANNED: { bg: '#4F6EF71F', color: '#4F6EF7' },
  CLOSED:  { bg: '#8B949E1F', color: '#8B949E' },
};
const STATE_BADGE_LIGHT: Record<SprintState, { bg: string; color: string }> = {
  ACTIVE:  { bg: '#1A7F371A', color: '#1A7F37' },
  PLANNED: { bg: '#4F6EF71A', color: '#4F6EF7' },
  CLOSED:  { bg: '#8C959F1A', color: '#8C959F' },
};

const TABS: { key: SprintState; label: string }[] = [
  { key: 'ACTIVE',  label: 'Active'  },
  { key: 'PLANNED', label: 'Planned' },
  { key: 'CLOSED',  label: 'Closed'  },
];

function formatIssueKey(issue: Issue) {
  return issue.project?.key ? `${issue.project.key}-${issue.number}` : `#${issue.number}`;
}

function formatDate(iso?: string | null): string {
  if (!iso) return 'Не задана';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Не задана';
  const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  return `${d.getDate()} ${months[d.getMonth()] ?? ''} ${d.getFullYear()}`;
}

function getTimeProgress(sprint: Sprint): number {
  if (!sprint.startDate || !sprint.endDate) return 0;
  const start = new Date(sprint.startDate).getTime();
  const end = new Date(sprint.endDate).getTime();
  const now = Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)));
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function SprintsPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const { mode } = useThemeStore();
  const isLight = mode === 'light';
  const T = isLight ? CL : C;
  const STATUS_STYLE  = isLight ? STATUS_LIGHT  : STATUS_DARK;
  const PRIORITY_COLOR = isLight ? PRIORITY_LIGHT : PRIORITY_DARK;
  const STATE_BADGE   = isLight ? STATE_BADGE_LIGHT : STATE_BADGE_DARK;
  const progressTrack = isLight ? '#EEF0F2' : '#21262D';
  const rowSep        = isLight ? '#EEF0F2'  : '#0D1017';
  const closeBtnBg    = isLight ? '#F6F8FA'  : '#161B22';
  const [project, setProject] = useState<Project | null>(null);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [backlog, setBacklog] = useState<Issue[]>([]);
  const [sprintIssues, setSprintIssues] = useState<Issue[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [activeTab, setActiveTab] = useState<SprintState>('ACTIVE');
  const [selectedSprintId, setSelectedSprintId] = useState<string | null>(null);
  const [selectedBacklog, setSelectedBacklog] = useState<string[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [backlogOpen, setBacklogOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [form] = Form.useForm();
  const canManage = hasAnyRequiredRole(user?.role, ['ADMIN', 'MANAGER']);

  const load = useCallback(async () => {
    if (!projectId) return;
    const [spPage, blPage, ts, proj] = await Promise.all([
      sprintsApi.listSprints(projectId),
      sprintsApi.getBacklog(projectId),
      teamsApi.listTeams(),
      projectsApi.getProject(projectId),
    ]);
    const sp = spPage.data;
    const bl = blPage.data;
    setSprints(sp);
    setTeams(ts);
    setProject(proj);
    setSelectedSprintId(prev => {
      if (!sp.length) return null;
      if (prev && sp.some(s => s.id === prev)) return prev;
      const active = sp.find(s => s.state === 'ACTIVE');
      return (active ?? sp[0]).id;
    });
    setBacklog(bl);
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  // Auto-select first sprint when tab changes
  useEffect(() => {
    const filtered = sprints.filter(s => s.state === activeTab);
    setSelectedSprintId(prev => {
      if (!filtered.length) return null;
      if (prev && filtered.some(s => s.id === prev)) return prev;
      return filtered[0].id;
    });
  }, [activeTab, sprints]);

  // Load sprint issues when selected sprint changes
  useEffect(() => {
    if (!selectedSprintId) { setSprintIssues([]); return; }
    let alive = true;
    void sprintsApi.getSprintIssues(selectedSprintId)
      .then(data => { if (alive) setSprintIssues(data.issues); })
      .catch(() => { if (alive) setSprintIssues([]); });
    return () => { alive = false; };
  }, [selectedSprintId]);

  const handleCreate = async (vals: {
    name: string; goal?: string;
    projectTeamId?: string; businessTeamId?: string; flowTeamId?: string;
  }) => {
    if (!projectId) return;
    await sprintsApi.createSprint(projectId, {
      name: vals.name, goal: vals.goal,
      projectTeamId: vals.projectTeamId,
      businessTeamId: vals.businessTeamId,
      flowTeamId: vals.flowTeamId,
    });
    setModalOpen(false);
    form.resetFields();
    void load();
  };

  const handleStart = async (id: string) => {
    try { await sprintsApi.startSprint(id); void load(); void message.success('Спринт запущен'); }
    catch (e) {
      const err = e as AxiosError<{ error?: string }>;
      void message.error(err.response?.data?.error ?? 'Ошибка');
    }
  };

  const handleClose = async (id: string) => {
    try { await sprintsApi.closeSprint(id); void load(); void message.success('Спринт закрыт'); }
    catch (e) {
      const err = e as AxiosError<{ error?: string }>;
      void message.error(err.response?.data?.error ?? 'Ошибка');
    }
  };

  const handleMoveToSprint = async () => {
    if (!selectedSprintId || !selectedBacklog.length) return;
    await sprintsApi.moveIssuesToSprint(selectedSprintId, selectedBacklog);
    setSelectedBacklog([]);
    setBacklogOpen(false);
    // Reload both the sprint list/backlog AND the sprint issues list
    // (selectedSprintId doesn't change so the useEffect won't auto-trigger)
    void load();
    void sprintsApi.getSprintIssues(selectedSprintId)
      .then(data => setSprintIssues(data.issues))
      .catch(() => {});
  };

  const selectedSprint = sprints.find(s => s.id === selectedSprintId) ?? null;
  const filteredSprints = sprints.filter(s => s.state === activeTab);

  // Issue stats
  const doneCount       = sprintIssues.filter(i => i.status === 'DONE').length;
  const inProgressCount = sprintIssues.filter(i => i.status === 'IN_PROGRESS').length;
  const reviewCount     = sprintIssues.filter(i => i.status === 'REVIEW').length;
  const openCount       = sprintIssues.filter(i => i.status === 'OPEN').length;
  const totalCount      = sprintIssues.length;
  const donePercent     = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  const timePercent     = selectedSprint ? getTimeProgress(selectedSprint) : 0;

  // ─── JSX ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: T.bg, fontFamily: F.sans, overflow: 'hidden' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 20, paddingBottom: 16, paddingLeft: 28, paddingRight: 28, borderBottom: `1px solid ${T.borderHd}`, backgroundColor: T.bgCard, flexShrink: 0 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ color: T.t4, fontFamily: F.sans, fontSize: 12, lineHeight: '16px' }}>
              {project?.name ?? '…'}
            </span>
            <span style={{ color: T.t4, fontSize: 16, lineHeight: '20px' }}>/</span>
            <span style={{ color: T.t3, fontFamily: F.sans, fontSize: 12, lineHeight: '16px' }}>Sprints</span>
          </div>
          <div style={{ color: T.t1, fontFamily: F.display, fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: '24px' }}>
            Sprints
          </div>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            style={{ backgroundImage: LOGO_GRAD, borderRadius: 8, paddingTop: 6, paddingBottom: 6, paddingLeft: 14, paddingRight: 14, border: 'none', cursor: 'pointer', color: '#fff', fontFamily: F.sans, fontSize: 13, fontWeight: 500, lineHeight: '20px' }}
          >
            + Новый спринт
          </button>
        )}
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, paddingLeft: 28, paddingRight: 28, paddingTop: 12, borderBottom: `1px solid ${T.borderHd}`, backgroundColor: T.bgCard, flexShrink: 0 }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            style={{
              borderTopLeftRadius: 6, borderTopRightRadius: 6,
              paddingTop: 7, paddingBottom: 7, paddingLeft: 16, paddingRight: 16,
              border: 'none', background: 'none', cursor: 'pointer',
              borderBottom: activeTab === tab.key ? `2px solid ${T.acc}` : '2px solid transparent',
              color: activeTab === tab.key ? T.t1 : T.t3,
              fontFamily: F.sans, fontSize: 13,
              fontWeight: activeTab === tab.key ? 500 : 400,
              lineHeight: '16px',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Sprint selector when multiple sprints in tab */}
        {filteredSprints.length > 1 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {filteredSprints.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedSprintId(s.id)}
                style={{
                  paddingTop: 5, paddingBottom: 5, paddingLeft: 12, paddingRight: 12,
                  borderRadius: 6,
                  border: `1px solid ${s.id === selectedSprintId ? T.acc : T.border}`,
                  backgroundColor: s.id === selectedSprintId ? `${T.acc}1A` : T.bgCard,
                  color: s.id === selectedSprintId ? T.acc : T.t3,
                  fontFamily: F.sans, fontSize: 12, cursor: 'pointer',
                }}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}

        {/* Empty state */}
        {filteredSprints.length === 0 && (
          <div style={{ color: T.t3, fontFamily: F.sans, fontSize: 13, paddingTop: 40, textAlign: 'center' }}>
            Нет спринтов со статусом «{TABS.find(t => t.key === activeTab)?.label}»
          </div>
        )}

        {/* ── Hero card ──────────────────────────────────────────────────── */}
        {selectedSprint && selectedSprint.state === activeTab && (
          <div style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14, flexShrink: 0 }}>

            {/* Top row */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ color: T.t1, fontFamily: F.display, fontSize: 16, fontWeight: 700, lineHeight: '20px' }}>
                    {selectedSprint.name}
                  </span>
                  <span style={{
                    backgroundColor: STATE_BADGE[selectedSprint.state].bg,
                    color: STATE_BADGE[selectedSprint.state].color,
                    borderRadius: 20, paddingTop: 3, paddingBottom: 3, paddingLeft: 10, paddingRight: 10,
                    fontFamily: F.sans, fontSize: 10, fontWeight: 600, lineHeight: '12px',
                  }}>
                    {selectedSprint.state}
                  </span>
                </div>
                {selectedSprint.goal && (
                  <span style={{ color: T.t3, fontFamily: F.sans, fontSize: 12, lineHeight: '16px' }}>
                    Цель: {selectedSprint.goal}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <div>
                  <div style={{ color: T.t4, fontFamily: F.sans, fontSize: 10, lineHeight: '12px', textAlign: 'right' }}>Дата начала</div>
                  <div style={{ color: T.t2, fontFamily: F.display, fontSize: 12, fontWeight: 600, lineHeight: '16px', textAlign: 'right' }}>
                    {formatDate(selectedSprint.startDate)}
                  </div>
                </div>
                <span style={{ color: T.t4, fontSize: 16, lineHeight: '20px' }}>→</span>
                <div>
                  <div style={{ color: T.t4, fontFamily: F.sans, fontSize: 10, lineHeight: '12px', textAlign: 'right' }}>Дата окончания</div>
                  <div style={{ color: T.t2, fontFamily: F.display, fontSize: 12, fontWeight: 600, lineHeight: '16px', textAlign: 'right' }}>
                    {formatDate(selectedSprint.endDate)}
                  </div>
                </div>
                {selectedSprint.state === 'PLANNED' && canManage && (
                  <button
                    type="button"
                    onClick={() => void handleStart(selectedSprint.id)}
                    style={{ marginLeft: 8, backgroundImage: LOGO_GRAD, borderRadius: 8, paddingTop: 6, paddingBottom: 6, paddingLeft: 14, paddingRight: 14, border: 'none', cursor: 'pointer', color: '#fff', fontFamily: F.sans, fontSize: 13, fontWeight: 500 }}
                  >
                    Начать спринт
                  </button>
                )}
                {selectedSprint.state === 'ACTIVE' && canManage && (
                  <Popconfirm
                    title="Закрыть спринт?"
                    description="Незавершённые задачи перейдут в бэклог."
                    onConfirm={() => void handleClose(selectedSprint.id)}
                  >
                    <button
                      type="button"
                      style={{ marginLeft: 8, backgroundColor: closeBtnBg, border: `1px solid ${T.border}`, borderRadius: 8, paddingTop: 6, paddingBottom: 6, paddingLeft: 14, paddingRight: 14, cursor: 'pointer', color: T.t3, fontFamily: F.sans, fontSize: 13 }}
                    >
                      Закрыть спринт
                    </button>
                  </Popconfirm>
                )}
              </div>
            </div>

            {/* Progress */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: T.t3, fontFamily: F.sans, fontSize: 11, lineHeight: '14px' }}>Прогресс выполнения</span>
                <span style={{ color: T.t1, fontFamily: F.display, fontSize: 12, fontWeight: 600, lineHeight: '16px' }}>
                  {doneCount} / {totalCount} задач
                </span>
              </div>
              {/* Done progress bar */}
              <div style={{ backgroundColor: progressTrack, borderRadius: 3, height: 4, overflow: 'hidden' }}>
                <div style={{
                  backgroundImage: 'linear-gradient(in oklab 90deg, oklab(59.3% -0.002 -0.207) 0%, oklab(54.1% 0.096 -0.227) 100%)',
                  borderRadius: 3, height: '100%', width: `${donePercent}%`, transition: 'width 0.3s ease',
                }} />
              </div>
              {/* Time progress (secondary) */}
              {(selectedSprint.startDate && selectedSprint.endDate) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, backgroundColor: progressTrack, borderRadius: 2, height: 2, overflow: 'hidden' }}>
                    <div style={{ backgroundColor: T.t4, borderRadius: 2, height: '100%', width: `${timePercent}%` }} />
                  </div>
                  <span style={{ color: T.t4, fontFamily: F.sans, fontSize: 10, lineHeight: '12px', flexShrink: 0 }}>
                    Время: {timePercent}%
                  </span>
                </div>
              )}
              {/* Status dots */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                {[
                  { dot: T.green,  label: `Done: ${doneCount}` },
                  { dot: T.amber,  label: `In Progress: ${inProgressCount}` },
                  { dot: T.violet, label: `Review: ${reviewCount}` },
                  { dot: T.t3,     label: `Open: ${openCount}` },
                ].map(({ dot, label }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ backgroundColor: dot, borderRadius: '50%', width: 6, height: 6, flexShrink: 0 }} />
                    <span style={{ color: T.t3, fontFamily: F.sans, fontSize: 11, lineHeight: '14px' }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Issues table card ───────────────────────────────────────────── */}
        {selectedSprint && selectedSprint.state === activeTab && (
          <div style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1, minHeight: 200 }}>

            {/* Card header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 14, paddingBottom: 14, paddingLeft: 20, paddingRight: 20, borderBottom: `1px solid ${T.borderHd}`, flexShrink: 0 }}>
              <span style={{ color: T.t1, fontFamily: F.display, fontSize: 14, fontWeight: 600, lineHeight: '18px' }}>
                Задачи спринта
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setDetailsOpen(true)}
                  style={{ backgroundColor: closeBtnBg, border: `1px solid ${T.border}`, borderRadius: 6, paddingTop: 5, paddingBottom: 5, paddingLeft: 12, paddingRight: 12, cursor: 'pointer', color: T.t3, fontFamily: F.sans, fontSize: 11, lineHeight: '14px' }}
                >
                  Детали
                </button>
                {canManage && selectedSprint.state !== 'CLOSED' && (
                  <button
                    type="button"
                    onClick={() => setBacklogOpen(true)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.acc, fontFamily: F.sans, fontSize: 11, lineHeight: '14px', padding: 0 }}
                  >
                    + Добавить из беклога
                  </button>
                )}
              </div>
            </div>

            {/* Column headers */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 8, paddingBottom: 8, paddingLeft: 20, paddingRight: 20, borderBottom: `1px solid ${T.borderHd}`, flexShrink: 0 }}>
              <div style={{ width: 76, flexShrink: 0, color: T.t4, fontFamily: F.sans, fontSize: 10, fontWeight: 600, letterSpacing: '0.5px', lineHeight: '12px', textTransform: 'uppercase' }}>Ключ</div>
              <div style={{ width: 56, flexShrink: 0, color: T.t4, fontFamily: F.sans, fontSize: 10, fontWeight: 600, letterSpacing: '0.5px', lineHeight: '12px', textTransform: 'uppercase' }}>Тип</div>
              <div style={{ flex: 1, color: T.t4, fontFamily: F.sans, fontSize: 10, fontWeight: 600, letterSpacing: '0.5px', lineHeight: '12px', textTransform: 'uppercase' }}>Задача</div>
              <div style={{ width: 100, flexShrink: 0, color: T.t4, fontFamily: F.sans, fontSize: 10, fontWeight: 600, letterSpacing: '0.5px', lineHeight: '12px', textTransform: 'uppercase' }}>Статус</div>
              <div style={{ width: 70, flexShrink: 0, color: T.t4, fontFamily: F.sans, fontSize: 10, fontWeight: 600, letterSpacing: '0.5px', lineHeight: '12px', textTransform: 'uppercase' }}>Приоритет</div>
              <div style={{ width: 56, flexShrink: 0, color: T.t4, fontFamily: F.sans, fontSize: 10, fontWeight: 600, letterSpacing: '0.5px', lineHeight: '12px', textTransform: 'uppercase' }}>Срок</div>
              <div style={{ width: 100, flexShrink: 0, color: T.t4, fontFamily: F.sans, fontSize: 10, fontWeight: 600, letterSpacing: '0.5px', lineHeight: '12px', textTransform: 'uppercase' }}>Исполнитель</div>
            </div>

            {/* Rows */}
            <div style={{ flex: 1, overflow: 'auto' }}>
              {sprintIssues.length === 0 ? (
                <div style={{ padding: '32px 20px', color: T.t3, fontFamily: F.sans, fontSize: 13, textAlign: 'center' }}>
                  В спринте нет задач
                </div>
              ) : (
                sprintIssues.map((issue, idx) => {
                  const st = STATUS_STYLE[issue.status];
                  const assigneeName = issue.assignee?.name ?? '';
                  return (
                    <div
                      key={issue.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        paddingTop: 9, paddingBottom: 9, paddingLeft: 20, paddingRight: 20,
                        borderBottom: idx < sprintIssues.length - 1 ? `1px solid ${rowSep}` : 'none',
                      }}
                    >
                      {/* Key */}
                      <div style={{ width: 76, flexShrink: 0 }}>
                        <Link
                          to={`/issues/${issue.id}`}
                          style={{ color: T.issueKey, fontFamily: F.display, fontSize: 11, fontWeight: 600, lineHeight: '14px', textDecoration: 'none' }}
                        >
                          {formatIssueKey(issue)}
                        </Link>
                      </div>
                      {/* Type badge */}
                      <div style={{ width: 56, flexShrink: 0 }}>
                        {(() => {
                          const typeKey = issue.issueTypeConfig?.systemKey ?? 'TASK';
                          const tc = ISSUE_TYPE_CFG[typeKey] ?? ISSUE_TYPE_CFG['TASK'];
                          return (
                            <span style={{ backgroundColor: tc.bg, borderRadius: 3, paddingTop: 2, paddingBottom: 2, paddingLeft: 5, paddingRight: 5, color: tc.color, fontFamily: F.sans, fontSize: 9, fontWeight: 700, lineHeight: '12px', display: 'inline-block', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                              {tc.label}
                            </span>
                          );
                        })()}
                      </div>
                      {/* Title */}
                      <div style={{ flex: 1, color: T.t2, fontFamily: F.sans, fontSize: 12, lineHeight: '16px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {issue.title}
                      </div>
                      {/* Status */}
                      <div style={{ width: 100, flexShrink: 0 }}>
                        <span style={{ backgroundColor: st.bg, borderRadius: 20, paddingTop: 3, paddingBottom: 3, paddingLeft: 8, paddingRight: 8, color: st.color, fontFamily: F.sans, fontSize: 10, lineHeight: '12px', display: 'inline-block' }}>
                          {st.label}
                        </span>
                      </div>
                      {/* Priority */}
                      <div style={{ width: 70, flexShrink: 0, color: PRIORITY_COLOR[issue.priority], fontFamily: F.sans, fontSize: 11, lineHeight: '14px' }}>
                        {issue.priority}
                      </div>
                      {/* Due date */}
                      <div style={{ width: 56, flexShrink: 0, color: T.t3, fontFamily: F.sans, fontSize: 11, lineHeight: '14px' }}>
                        {issue.dueDate ? formatDate(issue.dueDate) : '—'}
                      </div>
                      {/* Assignee */}
                      <div style={{ width: 100, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {assigneeName ? (
                          <>
                            <div
                              title={assigneeName}
                              style={{ width: 20, height: 20, borderRadius: '50%', backgroundImage: avatarGradient(assigneeName), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                            >
                              <span style={{ color: '#fff', fontFamily: F.display, fontSize: 8, fontWeight: 700, lineHeight: '10px' }}>
                                {initials(assigneeName)}
                              </span>
                            </div>
                            <span style={{ color: T.t3, fontFamily: F.sans, fontSize: 11, lineHeight: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {assigneeName.split(' ')[0]}
                            </span>
                          </>
                        ) : (
                          <span style={{ color: T.t4, fontFamily: F.sans, fontSize: 11, lineHeight: '14px' }}>—</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Sprint details drawer ────────────────────────────────────────────── */}
      <SprintIssuesDrawer
        open={detailsOpen}
        sprintId={selectedSprintId}
        onClose={() => setDetailsOpen(false)}
      />

      {/* ── Backlog modal ────────────────────────────────────────────────────── */}
      <Modal
        title="Добавить задачи из беклога"
        open={backlogOpen}
        onCancel={() => { setBacklogOpen(false); setSelectedBacklog([]); }}
        onOk={() => void handleMoveToSprint()}
        okText={`Добавить в спринт${selectedBacklog.length ? ` (${selectedBacklog.length})` : ''}`}
        okButtonProps={{ disabled: selectedBacklog.length === 0 }}
        cancelText="Отмена"
        width={680}
      >
        {/* Sprint info banner */}
        {selectedSprint && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 14px', borderRadius: 8, backgroundColor: isLight ? '#F6F8FA' : '#0F1320', border: `1px solid ${T.border}`, marginBottom: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
              <span style={{ color: T.t1, fontFamily: F.display, fontSize: 13, fontWeight: 600, lineHeight: '16px' }}>
                {selectedSprint.name}
              </span>
              {selectedSprint.goal && (
                <span style={{ color: T.t3, fontFamily: F.sans, fontSize: 11, lineHeight: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selectedSprint.goal}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: T.t4, fontFamily: F.sans, fontSize: 10, lineHeight: '12px' }}>Начало</div>
                <div style={{ color: T.t2, fontFamily: F.display, fontSize: 11, fontWeight: 600, lineHeight: '14px' }}>{formatDate(selectedSprint.startDate)}</div>
              </div>
              <span style={{ color: T.t4 }}>→</span>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: T.t4, fontFamily: F.sans, fontSize: 10, lineHeight: '12px' }}>Конец</div>
                <div style={{ color: T.t2, fontFamily: F.display, fontSize: 11, fontWeight: 600, lineHeight: '14px' }}>{formatDate(selectedSprint.endDate)}</div>
              </div>
              <span style={{
                backgroundColor: STATE_BADGE[selectedSprint.state].bg,
                color: STATE_BADGE[selectedSprint.state].color,
                borderRadius: 20, paddingTop: 3, paddingBottom: 3, paddingLeft: 10, paddingRight: 10,
                fontFamily: F.sans, fontSize: 10, fontWeight: 600, lineHeight: '12px',
              }}>
                {selectedSprint.state}
              </span>
            </div>
          </div>
        )}

        {/* Column headers */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 6, paddingLeft: 36, paddingRight: 12, borderBottom: `1px solid ${T.border}`, marginBottom: 4 }}>
          <div style={{ width: 72, flexShrink: 0, color: T.t4, fontFamily: F.sans, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Ключ</div>
          <div style={{ width: 52, flexShrink: 0, color: T.t4, fontFamily: F.sans, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Тип</div>
          <div style={{ flex: 1, color: T.t4, fontFamily: F.sans, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Задача</div>
          <div style={{ width: 90, flexShrink: 0, color: T.t4, fontFamily: F.sans, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Статус</div>
          <div style={{ width: 60, flexShrink: 0, color: T.t4, fontFamily: F.sans, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Приор.</div>
        </div>

        {backlog.length === 0 ? (
          <p style={{ color: T.t3, fontFamily: F.sans, fontSize: 13, padding: '16px 0' }}>Бэклог пуст</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 380, overflow: 'auto' }}>
            {backlog.map(issue => {
              const typeKey = issue.issueTypeConfig?.systemKey ?? 'TASK';
              const tc = ISSUE_TYPE_CFG[typeKey] ?? ISSUE_TYPE_CFG['TASK'];
              const sc = STATUS_STYLE[issue.status];
              return (
                <label
                  key={issue.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px 7px 8px', borderRadius: 6, cursor: 'pointer', backgroundColor: selectedBacklog.includes(issue.id) ? `${T.acc}14` : 'transparent' }}
                >
                  <div style={{ width: 28, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                    <Checkbox
                      checked={selectedBacklog.includes(issue.id)}
                      onChange={e => {
                        setSelectedBacklog(prev =>
                          e.target.checked ? [...prev, issue.id] : prev.filter(id => id !== issue.id)
                        );
                      }}
                    />
                  </div>
                  {/* Key */}
                  <span style={{ width: 72, flexShrink: 0, color: T.issueKey, fontFamily: F.display, fontSize: 11, fontWeight: 600, lineHeight: '14px' }}>
                    {formatIssueKey(issue)}
                  </span>
                  {/* Type badge */}
                  <div style={{ width: 52, flexShrink: 0 }}>
                    <span style={{ backgroundColor: tc.bg, borderRadius: 3, paddingTop: 2, paddingBottom: 2, paddingLeft: 5, paddingRight: 5, color: tc.color, fontFamily: F.sans, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px', display: 'inline-block' }}>
                      {tc.label}
                    </span>
                  </div>
                  {/* Title */}
                  <span style={{ flex: 1, color: T.t2, fontFamily: F.sans, fontSize: 12, lineHeight: '16px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {issue.title}
                  </span>
                  {/* Status */}
                  <div style={{ width: 90, flexShrink: 0 }}>
                    <span style={{ backgroundColor: sc.bg, borderRadius: 20, paddingTop: 2, paddingBottom: 2, paddingLeft: 7, paddingRight: 7, color: sc.color, fontFamily: F.sans, fontSize: 9, fontWeight: 500, display: 'inline-block' }}>
                      {sc.label}
                    </span>
                  </div>
                  {/* Priority */}
                  <span style={{ width: 60, flexShrink: 0, color: PRIORITY_COLOR[issue.priority], fontFamily: F.sans, fontSize: 11 }}>
                    {issue.priority}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </Modal>

      {/* ── New sprint modal ─────────────────────────────────────────────────── */}
      <Modal
        title="Новый спринт"
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        onOk={() => form.submit()}
        okText="Создать"
        cancelText="Отмена"
      >
        <Form form={form} layout="vertical" onFinish={v => void handleCreate(v)}>
          <Form.Item name="name" label="Название" rules={[{ required: true, message: 'Введите название' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="goal" label="Цель">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="projectTeamId" label="Проектная команда">
            <Select allowClear options={teams.map(t => ({ value: t.id, label: t.name }))} />
          </Form.Item>
          <Form.Item name="businessTeamId" label="Бизнес-функциональная команда">
            <Select allowClear options={teams.map(t => ({ value: t.id, label: t.name }))} />
          </Form.Item>
          <Form.Item name="flowTeamId" label="Flow-команда">
            <Select allowClear options={teams.map(t => ({ value: t.id, label: t.name }))} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
