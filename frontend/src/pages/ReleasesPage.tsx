/**
 * ReleasesPage — rebuilt from zero using Paper as sole source.
 * Artboards: 4EO-0 (Dark) + 4JG-0 (Light). Zero CSS classes, zero Ant Design layout.
 */
import { useEffect, useState, useCallback } from 'react';
import type { AxiosError } from 'axios';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Modal,
  Form,
  Input,
  message,
  Popconfirm,
  Select,
  Table,
  Tag,
  Progress,
  Button,
  Spin,
} from 'antd';
import {
  DeleteOutlined,
  UserOutlined,
} from '@ant-design/icons';
import * as releasesApi from '../api/releases';
import * as issuesApi from '../api/issues';
import * as projectsApi from '../api/projects';
import * as sprintsApi from '../api/sprints';
import { useAuthStore } from '../store/auth.store';
import { useThemeStore } from '../store/theme.store';
import type { Release, Issue, ReleaseLevel, ReleaseState, SprintInRelease, ReleaseReadiness, Sprint, ReleaseTransition, ReleaseStatus, SystemRoleType } from '../types';

// ─── Tokens Dark (Paper 4EO-0) ──────────────────────────
const DARK_C = {
  bg:           '#080B14',
  bgCard:       '#0F1320',
  bgHeaderRow:  '#161B22',
  bgActiveRow:  '#4F6EF708',
  border:       '#21262D',
  borderBtn:    '#30363D',
  t1:           '#E2E8F8',
  t2:           '#C9D1D9',
  t3:           '#8B949E',
  t4:           '#484F58',
  acc:          '#4F6EF7',
  tabActiveBg:  'linear-gradient(in oklab 135deg, oklab(59.3% -0.002 -0.207 / 20%) 0%, oklab(54.1% 0.096 -0.227 / 12%) 100%)',
  tabActiveText:'#4F6EF7',
  tabText:      '#8B949E',
  btnBg:        'transparent',
  btnText:      '#C9D1D9',
};

// ─── Tokens Light (Paper 4JG-0) ─────────────────────────
const LIGHT_C = {
  bg:           '#F6F8FA',
  bgCard:       '#FFFFFF',
  bgHeaderRow:  '#F6F8FA',
  bgActiveRow:  '#4F6EF708',
  border:       '#D0D7DE',
  borderBtn:    '#D0D7DE',
  t1:           '#1F2328',
  t2:           '#1F2328',
  t3:           '#656D76',
  t4:           '#8C959F',
  acc:          '#4F6EF7',
  tabActiveBg:  '#4F6EF71A',
  tabActiveText:'#4F6EF7',
  tabText:      '#656D76',
  btnBg:        '#F6F8FA',
  btnText:      '#1F2328',
};

const F = {
  display: '"Space Grotesk", system-ui, sans-serif',
  sans:    '"Inter", system-ui, sans-serif',
};

const LOGO_GRAD = 'linear-gradient(in oklab 135deg, oklab(59.3% -0.002 -0.207) 0%, oklab(54.1% 0.096 -0.227) 100%)';

const SPRINT_STATE_LABEL: Record<string, string> = {
  PLANNED: 'Запланирован',
  ACTIVE:  'Активен',
  CLOSED:  'Закрыт',
};
const SPRINT_STATE_COLOR: Record<string, string> = {
  PLANNED: 'default',
  ACTIVE:  'processing',
  CLOSED:  'success',
};

type FilterTab = 'ALL' | 'TODO' | 'IN_PROGRESS' | 'DONE';

export default function ReleasesPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { mode } = useThemeStore();
  const isDark = mode !== 'light';
  const C = isDark ? DARK_C : LIGHT_C;

  // ─── Status badge — dynamic from workflow ────────────────
  const legacyStatusCfg: Record<ReleaseState, { bg: string; text: string; label: string }> = {
    RELEASED: isDark
      ? { bg: '#4ADE801F', text: '#4ADE80',  label: 'RELEASED' }
      : { bg: '#1A7F371A', text: '#1A7F37',  label: 'RELEASED' },
    READY:    isDark
      ? { bg: '#4F6EF726', text: '#4F6EF7',  label: 'READY' }
      : { bg: '#4F6EF71F', text: '#4F6EF7',  label: 'READY' },
    DRAFT:    isDark
      ? { bg: '#8B949E1F', text: '#8B949E',  label: 'DRAFT' }
      : { bg: '#8C959F1A', text: '#8C959F',  label: 'DRAFT' },
  };

  const getStatusBadge = (r: Release): { bg: string; text: string; label: string } => {
    if (r.status?.color && r.status?.name) {
      const c = r.status.color;
      return { bg: `${c}26`, text: c, label: r.status.name };
    }
    return legacyStatusCfg[r.state] ?? legacyStatusCfg.DRAFT;
  };

  const getReleaseCategory = (r: Release): string => r.status?.category ?? (
    r.state === 'RELEASED' ? 'DONE' : r.state === 'READY' ? 'IN_PROGRESS' : 'TODO'
  );

  const LEVEL_CFG: Record<ReleaseLevel, { bg: string; text: string }> = {
    MAJOR: isDark
      ? { bg: '#A88BFA26', text: '#A78BFA' }
      : { bg: '#7C3AED1A', text: '#7C3AED' },
    MINOR: isDark
      ? { bg: '#8B949E26', text: '#8B949E' }
      : { bg: '#8C959F1A', text: '#57606A' },
  };

  // ─── State ───────────────────────────────────────────────
  const [project, setProject] = useState<projectsApi.ProjectDashboard['project'] | null>(null);
  const [releases, setReleases] = useState<Release[]>([]);
  const [filterTab, setFilterTab] = useState<FilterTab>('ALL');
  const [selectedRelease, setSelectedRelease] = useState<(Release & { issues?: Issue[]; sprints?: SprintInRelease[] }) | null>(null);
  const [readiness, setReadiness] = useState<ReleaseReadiness | null>(null);
  const [projectIssues, setProjectIssues] = useState<Issue[]>([]);
  const [projectSprints, setProjectSprints] = useState<Sprint[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addSprintsModalOpen, setAddSprintsModalOpen] = useState(false);
  const [selectedIssueIds, setSelectedIssueIds] = useState<string[]>([]);
  const [selectedSprintIds, setSelectedSprintIds] = useState<string[]>([]);
  const [transitions, setTransitions] = useState<ReleaseTransition[]>([]);
  const [currentStatus, setCurrentStatus] = useState<ReleaseStatus | null>(null);
  const [transitioning, setTransitioning] = useState<string | null>(null);
  const [loadingTransitions, setLoadingTransitions] = useState(false);
  const [integrationReleases, setIntegrationReleases] = useState<Release[]>([]);
  const [form] = Form.useForm();
  const canManage = (['ADMIN','RELEASE_MANAGER','SUPER_ADMIN'] as SystemRoleType[]).some(r => user?.systemRoles?.includes(r));

  // ─── Load ─────────────────────────────────────────────────
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
    setProjectSprints(sprints.data);
  }, [projectId]);

  const loadSelectedRelease = useCallback(async (releaseId: string) => {
    const full = await releasesApi.getReleaseWithIssues(releaseId);
    setSelectedRelease(full as typeof full & { issues?: Issue[] });
    const r = await releasesApi.getReleaseReadiness(releaseId);
    setReadiness(r);
  }, []);

  const loadTransitions = useCallback(async (releaseId: string) => {
    setLoadingTransitions(true);
    try {
      const r = await releasesApi.getAvailableTransitions(releaseId);
      setTransitions(r.transitions);
      setCurrentStatus(r.currentStatus);
    } catch {
      setTransitions([]);
      setCurrentStatus(null);
    } finally {
      setLoadingTransitions(false);
    }
  }, []);

  const loadIntegrationReleases = useCallback(async () => {
    if (!projectId) return;
    try {
      // Backend filters by projectId — returns only INTEGRATION releases containing issues from this project
      const r = await releasesApi.listReleasesGlobal({ type: 'INTEGRATION', projectId, limit: 50 });
      setIntegrationReleases(r.data);
    } catch {
      setIntegrationReleases([]);
    }
  }, [projectId]);

  useEffect(() => { loadProject(); loadReleases(); loadIntegrationReleases(); }, [loadProject, loadReleases, loadIntegrationReleases]);

  useEffect(() => {
    if (selectedRelease?.id) {
      loadSelectedRelease(selectedRelease.id);
      loadTransitions(selectedRelease.id);
    } else {
      setSelectedRelease(null);
      setReadiness(null);
      setTransitions([]);
      setCurrentStatus(null);
    }
  }, [selectedRelease?.id, loadSelectedRelease, loadTransitions]);

  useEffect(() => {
    if (projectId && (addModalOpen || (selectedRelease && canManage))) loadProjectIssues();
  }, [projectId, addModalOpen, selectedRelease, canManage, loadProjectIssues]);

  useEffect(() => {
    if (projectId && addSprintsModalOpen) loadProjectSprints();
  }, [projectId, addSprintsModalOpen, loadProjectSprints]);

  // ─── Handlers ────────────────────────────────────────────
  const handleCreate = async (vals: { name: string; description?: string; level: ReleaseLevel }) => {
    if (!projectId) return;
    try {
      await releasesApi.createRelease(projectId, { name: vals.name, description: vals.description, level: vals.level });
      message.success('Релиз создан');
      setModalOpen(false);
      form.resetFields();
      loadReleases();
    } catch (e) {
      const err = e as AxiosError<{ error?: string }>;
      message.error(err.response?.data?.error || 'Ошибка');
    }
  };

  const handleTransition = async (transitionId: string) => {
    if (!selectedRelease) return;
    setTransitioning(transitionId);
    try {
      await releasesApi.executeTransition(selectedRelease.id, transitionId);
      message.success('Статус обновлён');
      loadReleases();
      loadSelectedRelease(selectedRelease.id);
      loadTransitions(selectedRelease.id);
    } catch (e) {
      const err = e as AxiosError<{ error?: string }>;
      message.error(err.response?.data?.error || 'Ошибка');
    } finally {
      setTransitioning(null);
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

  // ─── Derived data ─────────────────────────────────────────
  const issuesInRelease = selectedRelease?.issues ?? [];
  const sprintsInRelease = selectedRelease?.sprints ?? [];
  const issueIdsInRelease = new Set(issuesInRelease.map((i) => i.id));
  const sprintIdsInRelease = new Set(sprintsInRelease.map((s) => s.id));
  const candidatesToAdd = projectIssues.filter((i) => !issueIdsInRelease.has(i.id));
  const sprintCandidates = projectSprints.filter((s) => !sprintIdsInRelease.has(s.id));

  const filteredReleases = filterTab === 'ALL'
    ? releases
    : releases.filter((r) => getReleaseCategory(r) === filterTab);

  // First DONE in filtered list — not dimmed; rest are dimmed
  const firstReleasedId = filteredReleases.find((r) => getReleaseCategory(r) === 'DONE')?.id;

  const formatDate = (iso?: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  // ─── Sub-table columns ────────────────────────────────────
  const issueColumns = [
    {
      title: 'Key', width: 100,
      render: (_: unknown, r: Issue) =>
        r.project ? <Link to={`/issues/${r.id}`}>{`${r.project.key}-${r.number}`}</Link> : r.number,
    },
    { title: 'Название', dataIndex: 'title', ellipsis: true },
    { title: 'Тип', dataIndex: 'type', width: 80, render: (t: string) => <Tag>{t}</Tag> },
    { title: 'Статус', dataIndex: 'status', width: 100 },
    { title: 'Исполнитель', dataIndex: ['assignee', 'name'], width: 120, render: (n: string) => n || '—' },
  ];

  const sprintColumns = [
    { title: 'Спринт', dataIndex: 'name', render: (name: string) => <span style={{ fontWeight: 500 }}>{name}</span> },
    {
      title: 'Статус', dataIndex: 'state', width: 120,
      render: (state: string) => (
        <Tag color={SPRINT_STATE_COLOR[state]}>{SPRINT_STATE_LABEL[state] ?? state}</Tag>
      ),
    },
    { title: 'Задач', width: 70, render: (_: unknown, r: SprintInRelease) => r._count?.issues ?? 0 },
    {
      title: 'Период', width: 160,
      render: (_: unknown, r: SprintInRelease) =>
        r.startDate ? `${formatDate(r.startDate)} — ${formatDate(r.endDate)}` : '—',
    },
    ...(canManage && getReleaseCategory(selectedRelease ?? { state: 'DRAFT' } as Release) !== 'DONE'
      ? [{
          title: '', width: 40,
          render: (_: unknown, r: SprintInRelease) => (
            <Popconfirm title="Убрать спринт из релиза?" onConfirm={() => handleRemoveSprint(r.id)}>
              <Button size="small" type="text" icon={<DeleteOutlined />} danger />
            </Popconfirm>
          ),
        }]
      : []),
  ];

  // ─── Reusable style helpers ───────────────────────────────
  const colHeaderStyle: React.CSSProperties = {
    fontFamily: F.sans, fontSize: 10, fontWeight: 600,
    color: C.t3, letterSpacing: '0.5px', textTransform: 'uppercase',
    paddingTop: 10, paddingBottom: 10, flexShrink: 0,
  };

  const btnOutlined: React.CSSProperties = {
    display: 'inline-block', paddingBlock: 4, paddingInline: 10,
    border: `1px solid ${C.borderBtn}`, borderRadius: 6, cursor: 'pointer',
    background: isDark ? 'transparent' : C.btnBg,
  };

  // ─── JSX ─────────────────────────────────────────────────
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', flex: 1,
      height: '100%', overflowY: 'auto',
      backgroundColor: C.bg,
      paddingTop: 28, paddingBottom: 24, paddingInline: 28,
      fontFamily: F.sans,
    }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
        <span
          style={{ fontFamily: F.sans, fontSize: 12, color: C.t3, cursor: 'pointer' }}
          onClick={() => navigate(`/projects/${projectId}`)}
        >
          {project?.name ?? 'Project'}
        </span>
        <span style={{ fontFamily: F.sans, fontSize: 12, color: C.t4 }}>/</span>
        <span style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 500, color: C.t1 }}>Releases</span>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{
            fontFamily: F.display, fontSize: 22, fontWeight: 700,
            letterSpacing: '-0.03em', color: C.t1, lineHeight: '28px', marginBottom: 4,
          }}>
            Релизы
          </div>
          <div style={{ fontFamily: F.sans, fontSize: 13, color: C.t3, lineHeight: '16px' }}>
            {project?.name ?? '...'} · {releases.length} релизов · {releases.filter(r => getReleaseCategory(r) !== 'DONE').length} в работе
          </div>
        </div>
        {canManage && (
          <div
            data-testid="release-create-btn"
            style={{ backgroundImage: LOGO_GRAD, borderRadius: 8, paddingBlock: 9, paddingInline: 18, cursor: 'pointer' }}
            onClick={() => setModalOpen(true)}
          >
            <span style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 500, color: '#FFFFFF' }}>
              + Новый релиз
            </span>
          </div>
        )}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {([
          { key: 'ALL',         label: 'Все' },
          { key: 'TODO',        label: 'Открытые' },
          { key: 'IN_PROGRESS', label: 'В работе' },
          { key: 'DONE',        label: 'Завершённые' },
        ] as const).map(({ key, label }) => {
          const isActive = filterTab === key;
          return (
            <div
              key={key}
              style={{
                borderRadius: 6, paddingBlock: 6, paddingInline: 14, cursor: 'pointer',
                backgroundImage: isActive && isDark ? C.tabActiveBg : undefined,
                backgroundColor: isActive && !isDark ? C.tabActiveBg as string : undefined,
              }}
              onClick={() => setFilterTab(key)}
            >
              <span style={{
                fontFamily: F.sans, fontSize: 12, fontWeight: isActive ? 500 : 400,
                color: isActive ? C.tabActiveText : C.tabText,
              }}>
                {label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Table container */}
      <div style={{
        backgroundColor: C.bgCard, border: `1px solid ${C.border}`,
        borderRadius: 12, overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        marginBottom: selectedRelease ? 16 : 0,
      }}>
        {/* Table header */}
        <div style={{
          display: 'flex', alignItems: 'center',
          backgroundColor: C.bgHeaderRow,
          borderBottom: `1px solid ${C.border}`,
          paddingInline: 20,
        }}>
          <div style={{ ...colHeaderStyle, width: 220 }}>Релиз</div>
          <div style={{ ...colHeaderStyle, width: 100 }}>Уровень</div>
          <div style={{ ...colHeaderStyle, width: 120 }}>Статус</div>
          <div style={{ ...colHeaderStyle, width: 80 }}>Задач</div>
          <div style={{ ...colHeaderStyle, width: 130 }}>Дата выпуска</div>
          <div style={{ ...colHeaderStyle, flex: 1 }}>Действия</div>
        </div>

        {/* Table rows */}
        {filteredReleases.length === 0 ? (
          <div style={{
            paddingBlock: 32, paddingInline: 20, textAlign: 'center',
            fontFamily: F.sans, fontSize: 13, color: C.t3,
          }}>
            Нет релизов
          </div>
        ) : (
          filteredReleases.map((r, idx) => {
            const cat = getReleaseCategory(r);
            const isDimmed = cat === 'DONE' && r.id !== firstReleasedId;
            const isHighlighted = cat === 'IN_PROGRESS';
            const isLast = idx === filteredReleases.length - 1;
            const isSelected = selectedRelease?.id === r.id;
            const levelCfg = LEVEL_CFG[r.level] ?? LEVEL_CFG.MINOR;
            const statusCfg = getStatusBadge(r);

            return (
              <div
                key={r.id}
                style={{
                  display: 'flex', alignItems: 'center',
                  paddingInline: 20,
                  backgroundColor: isSelected
                    ? (isDark ? '#4F6EF714' : '#4F6EF70A')
                    : isHighlighted ? C.bgActiveRow : undefined,
                  borderBottom: isLast ? undefined : `1px solid ${isDark ? C.border : '#EAEEF2'}`,
                  opacity: isDimmed ? 0.65 : 1,
                }}
              >
                {/* Release name + desc */}
                <div style={{ flexShrink: 0, width: 220, paddingBlock: 12 }}>
                  <div style={{
                    fontFamily: F.display, fontSize: 13, fontWeight: 700,
                    letterSpacing: '-0.01em', color: isDimmed ? C.t3 : C.t1, lineHeight: '16px',
                  }}>
                    {r.name}
                  </div>
                  {r.description && (
                    <div style={{
                      fontFamily: F.sans, fontSize: 11,
                      color: isDimmed ? C.t4 : C.t3,
                      lineHeight: '14px', marginTop: 2,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200,
                    }}>
                      {r.description}
                    </div>
                  )}
                </div>

                {/* Level badge */}
                <div style={{ flexShrink: 0, width: 100 }}>
                  <div style={{
                    display: 'inline-block', backgroundColor: isDimmed
                      ? (isDark ? '#8B949E1A' : '#8C959F1A')
                      : levelCfg.bg,
                    borderRadius: 4, paddingBlock: 3, paddingInline: 8,
                  }}>
                    <span style={{
                      fontFamily: F.sans, fontSize: 10, fontWeight: 600,
                      letterSpacing: '0.3px', lineHeight: '12px',
                      color: isDimmed ? C.t4 : levelCfg.text,
                    }}>
                      {r.level}
                    </span>
                  </div>
                </div>

                {/* Status badge */}
                <div style={{ flexShrink: 0, width: 120 }}>
                  <div style={{
                    display: 'inline-block',
                    backgroundColor: isDimmed
                      ? (isDark ? '#4ADE8014' : '#1A7F3714')
                      : statusCfg.bg,
                    borderRadius: 20, paddingBlock: 4, paddingInline: 10,
                  }}>
                    <span style={{
                      fontFamily: F.sans, fontSize: 10, fontWeight: 600,
                      letterSpacing: '0.3px', lineHeight: '12px',
                      color: isDimmed
                        ? (r.state === 'RELEASED' ? (isDark ? '#4ADE80' : '#1A7F37') : C.t3)
                        : statusCfg.text,
                    }}>
                      {statusCfg.label}
                    </span>
                  </div>
                </div>

                {/* Issue count */}
                <div style={{
                  flexShrink: 0, width: 80,
                  fontFamily: F.display, fontSize: 13, fontWeight: 700,
                  color: isDimmed ? C.t3 : C.t1, lineHeight: '16px',
                }}>
                  {r._count?.issues ?? 0}
                </div>

                {/* Release date */}
                <div style={{
                  flexShrink: 0, width: 130,
                  fontFamily: F.sans, fontSize: 12, lineHeight: '16px',
                  color: cat === 'IN_PROGRESS'
                    ? (isDark ? '#4ADE80' : '#1A7F37')
                    : isDimmed ? C.t4 : C.t3,
                }}>
                  {formatDate(r.releaseDate)}
                </div>

                {/* Actions */}
                <div style={{ flex: 1, display: 'flex', gap: 6, alignItems: 'center' }}>
                  {/* Открыть/Закрыть — transitions available in detail panel */}
                  <div style={{ ...btnOutlined }} onClick={() => {
                    if (isSelected) {
                      setSelectedRelease(null);
                    } else {
                      setSelectedRelease(r);
                    }
                  }}>
                    <span style={{ fontFamily: F.sans, fontSize: 11, color: isDimmed ? C.t3 : C.btnText, lineHeight: '14px' }}>
                      {isSelected ? 'Закрыть' : 'Открыть'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Detail section — shown below table when a release is selected */}
      {selectedRelease && (
        <div style={{
          backgroundColor: C.bgCard, border: `1px solid ${C.border}`,
          borderRadius: 12, overflow: 'hidden', marginBottom: 16,
        }}>
          {/* Detail header */}
          <div style={{
            backgroundColor: isDark ? '#161B22' : C.bgHeaderRow,
            borderBottom: `1px solid ${C.border}`,
            paddingInline: 20, paddingBlock: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: transitions.length > 0 || loadingTransitions ? 10 : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: F.display, fontSize: 14, fontWeight: 700, color: C.t1 }}>
                  {selectedRelease.name}
                </span>
                {currentStatus && (
                  <div style={{
                    display: 'inline-block',
                    backgroundColor: `${currentStatus.color}26`,
                    borderRadius: 20, paddingBlock: 3, paddingInline: 10,
                  }}>
                    <span style={{
                      fontFamily: F.sans, fontSize: 10, fontWeight: 600,
                      letterSpacing: '0.3px', color: currentStatus.color,
                    }}>
                      {currentStatus.name}
                    </span>
                  </div>
                )}
              </div>
              {readiness && getReleaseCategory(selectedRelease) !== 'DONE' && (
                <span style={{ fontFamily: F.sans, fontSize: 11, color: C.t3 }}>
                  Спринтов: {readiness.closedSprints}/{readiness.totalSprints} · Задач: {readiness.doneIssues ?? readiness.doneItems ?? 0}/{readiness.totalIssues ?? readiness.totalItems ?? 0}
                </span>
              )}
            </div>
            {/* Transition buttons */}
            {canManage && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {loadingTransitions ? (
                  <Spin size="small" />
                ) : transitions.map(t => {
                  const tColor = t.toStatus.color || C.acc;
                  return (
                    <Popconfirm
                      key={t.id}
                      title={`Перейти в статус «${t.toStatus.name}»?`}
                      onConfirm={() => handleTransition(t.id)}
                      okText="Да"
                      cancelText="Отмена"
                    >
                      <div
                        style={{
                          border: `1px solid ${tColor}60`,
                          background: `${tColor}15`,
                          borderRadius: 6,
                          paddingBlock: 4, paddingInline: 12,
                          cursor: transitioning === t.id ? 'not-allowed' : 'pointer',
                          opacity: transitioning === t.id ? 0.6 : 1,
                        }}
                      >
                        <span style={{
                          fontFamily: F.display, fontSize: 12, fontWeight: 600, color: tColor,
                        }}>
                          → {t.toStatus.name}
                        </span>
                      </div>
                    </Popconfirm>
                  );
                })}
              </div>
            )}
          </div>

          {/* Readiness progress bars */}
          {readiness && getReleaseCategory(selectedRelease) !== 'DONE' && (
            <div style={{ paddingInline: 20, paddingBlock: 12, borderBottom: `1px solid ${isDark ? C.border : '#EAEEF2'}` }}>
              <div style={{ display: 'flex', gap: 32 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: F.sans, fontSize: 11, color: C.t3, marginBottom: 4 }}>
                    Спринты закрыты: {readiness.closedSprints}/{readiness.totalSprints}
                  </div>
                  <Progress
                    percent={readiness.totalSprints > 0 ? Math.round((readiness.closedSprints / readiness.totalSprints) * 100) : 0}
                    size="small"
                    status={readiness.closedSprints === readiness.totalSprints && readiness.totalSprints > 0 ? 'success' : 'active'}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: F.sans, fontSize: 11, color: C.t3, marginBottom: 4 }}>
                    Задачи выполнены: {(readiness.doneIssues ?? readiness.doneItems ?? 0)}/{(readiness.totalIssues ?? readiness.totalItems ?? 0)}
                  </div>
                  <Progress
                    percent={(readiness.totalIssues ?? readiness.totalItems ?? 0) > 0 ? Math.round(((readiness.doneIssues ?? readiness.doneItems ?? 0) / (readiness.totalIssues ?? readiness.totalItems ?? 0)) * 100) : 0}
                    size="small"
                    status={(readiness.doneIssues ?? readiness.doneItems ?? 0) === (readiness.totalIssues ?? readiness.totalItems ?? 0) && (readiness.totalIssues ?? readiness.totalItems ?? 0) > 0 ? 'success' : 'active'}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Sprints section */}
          <div style={{ paddingInline: 20, paddingTop: 16, paddingBottom: 16, borderBottom: `1px solid ${isDark ? C.border : '#EAEEF2'}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontFamily: F.display, fontSize: 13, fontWeight: 700, color: C.t1 }}>
                Спринты
              </span>
              {canManage && getReleaseCategory(selectedRelease) !== 'DONE' && (
                <div style={{ ...btnOutlined, cursor: 'pointer' }} onClick={() => setAddSprintsModalOpen(true)}>
                  <span style={{ fontFamily: F.sans, fontSize: 11, color: C.btnText, lineHeight: '14px' }}>
                    + Добавить спринт
                  </span>
                </div>
              )}
            </div>
            <Table
              dataSource={sprintsInRelease}
              columns={sprintColumns}
              rowKey="id"
              size="small"
              pagination={false}
              locale={{ emptyText: 'Спринты не добавлены' }}
            />
          </div>

          {/* Issues section */}
          <div style={{ paddingInline: 20, paddingTop: 16, paddingBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontFamily: F.display, fontSize: 13, fontWeight: 700, color: C.t1 }}>
                Задачи
              </span>
              {canManage && getReleaseCategory(selectedRelease) !== 'DONE' && (
                <div style={{ ...btnOutlined, cursor: 'pointer' }} onClick={() => setAddModalOpen(true)}>
                  <span style={{ fontFamily: F.sans, fontSize: 11, color: C.btnText, lineHeight: '14px' }}>
                    <UserOutlined style={{ marginRight: 4 }} />Добавить задачи
                  </span>
                </div>
              )}
            </div>
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

      {/* Integration releases section (TTMP-212) */}
      {integrationReleases.length > 0 && (
        <div style={{
          backgroundColor: C.bgCard, border: `1px solid ${C.border}`,
          borderRadius: 12, overflow: 'hidden', marginBottom: 16,
        }}>
          {/* Section header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            backgroundColor: C.bgHeaderRow,
            borderBottom: `1px solid ${C.border}`,
            paddingInline: 20, paddingBlock: 10,
          }}>
            <span style={{ fontFamily: F.display, fontSize: 13, fontWeight: 700, color: C.t1 }}>
              Интеграционные релизы
            </span>
            <div style={{
              backgroundColor: isDark ? '#A78BFA26' : '#7C3AED1A',
              borderRadius: 4, paddingBlock: 2, paddingInline: 7,
            }}>
              <span style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 600, color: isDark ? '#A78BFA' : '#7C3AED' }}>
                {integrationReleases.length}
              </span>
            </div>
            <span style={{ fontFamily: F.sans, fontSize: 11, color: C.t3 }}>
              Только просмотр · Управление в разделе{' '}
              <Link to="/releases" style={{ color: C.acc }}>Релизы</Link>
            </span>
          </div>

          {/* Rows */}
          {integrationReleases.map((r, idx) => {
            const statusCfg = getStatusBadge(r);
            const isLast = idx === integrationReleases.length - 1;
            return (
              <div
                key={r.id}
                style={{
                  display: 'flex', alignItems: 'center',
                  paddingInline: 20, paddingBlock: 10,
                  borderBottom: isLast ? undefined : `1px solid ${isDark ? C.border : '#EAEEF2'}`,
                }}
              >
                {/* Name */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: F.display, fontSize: 13, fontWeight: 700,
                    letterSpacing: '-0.01em', color: C.t1, lineHeight: '16px',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {r.name}
                  </div>
                  {r.description && (
                    <div style={{
                      fontFamily: F.sans, fontSize: 11, color: C.t3,
                      lineHeight: '14px', marginTop: 2,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {r.description}
                    </div>
                  )}
                </div>

                {/* Status badge */}
                <div style={{ flexShrink: 0, marginLeft: 16 }}>
                  <div style={{
                    display: 'inline-block',
                    backgroundColor: statusCfg.bg,
                    borderRadius: 20, paddingBlock: 3, paddingInline: 10,
                  }}>
                    <span style={{
                      fontFamily: F.sans, fontSize: 10, fontWeight: 600,
                      letterSpacing: '0.3px', color: statusCfg.text,
                    }}>
                      {statusCfg.label}
                    </span>
                  </div>
                </div>

                {/* Integration badge */}
                <div style={{ flexShrink: 0, marginLeft: 8 }}>
                  <div style={{
                    display: 'inline-block',
                    backgroundColor: isDark ? '#A78BFA26' : '#7C3AED1A',
                    borderRadius: 4, paddingBlock: 3, paddingInline: 8,
                  }}>
                    <span style={{
                      fontFamily: F.sans, fontSize: 10, fontWeight: 600,
                      color: isDark ? '#A78BFA' : '#7C3AED',
                    }}>
                      Интеграционный
                    </span>
                  </div>
                </div>

                {/* Planned date */}
                <div style={{
                  flexShrink: 0, width: 130, marginLeft: 16,
                  fontFamily: F.sans, fontSize: 12, color: C.t3, textAlign: 'right',
                }}>
                  {r.plannedDate ? formatDate(r.plannedDate) : '—'}
                </div>

                {/* Link to /releases?releaseId=... — opens detail panel for this release */}
                <div style={{ flexShrink: 0, marginLeft: 12 }}>
                  <Link to={`/releases?releaseId=${r.id}`} style={{ textDecoration: 'none' }}>
                    <div style={{ ...btnOutlined }}>
                      <span style={{ fontFamily: F.sans, fontSize: 11, color: C.t3, lineHeight: '14px' }}>
                        Подробнее
                      </span>
                    </div>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create release modal */}
      <Modal
        title="Новый релиз"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText="Создать"
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} initialValues={{ level: 'MINOR' }}>
          <Form.Item name="name" label="Версия (например 1.2.0)" rules={[{ required: true }]}>
            <Input placeholder="1.0.0" />
          </Form.Item>
          <Form.Item name="level" label="Уровень" rules={[{ required: true }]}>
            <Select options={[
              { value: 'MINOR', label: 'Минорный (улучшения, баг-фиксы)' },
              { value: 'MAJOR', label: 'Мажорный (новые фичи)' },
            ]} />
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
            { title: 'Статус', dataIndex: 'state', width: 120, render: (s: string) => <Tag color={SPRINT_STATE_COLOR[s]}>{SPRINT_STATE_LABEL[s] ?? s}</Tag> },
            { title: 'Задач', width: 70, render: (_: unknown, r: Sprint) => r._count?.issues ?? 0 },
          ]}
          rowKey="id"
          size="small"
          pagination={false}
          rowSelection={{ selectedRowKeys: selectedSprintIds, onChange: (keys) => setSelectedSprintIds(keys as string[]) }}
        />
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
          rowSelection={{ selectedRowKeys: selectedIssueIds, onChange: (keys) => setSelectedIssueIds(keys as string[]) }}
        />
      </Modal>
    </div>
  );
}
