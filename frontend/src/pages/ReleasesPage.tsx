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
  Tooltip,
  Progress,
  Button,
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
import type { Release, Issue, ReleaseLevel, ReleaseState, SprintInRelease, ReleaseReadiness, Sprint } from '../types';

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

type FilterTab = 'ALL' | ReleaseState;

export default function ReleasesPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { mode } = useThemeStore();
  const isDark = mode !== 'light';
  const C = isDark ? DARK_C : LIGHT_C;

  // ─── Status badge configs (theme-aware) ──────────────────
  const STATUS_CFG: Record<ReleaseState, { bg: string; text: string; label: string }> = {
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
  const [form] = Form.useForm();
  const canManage = user?.role === 'ADMIN' || user?.role === 'MANAGER';

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
    setProjectSprints(sprints);
  }, [projectId]);

  const loadSelectedRelease = useCallback(async (releaseId: string) => {
    const full = await releasesApi.getReleaseWithIssues(releaseId);
    setSelectedRelease(full);
    const r = await releasesApi.getReleaseReadiness(releaseId);
    setReadiness(r);
  }, []);

  useEffect(() => { loadProject(); loadReleases(); }, [loadProject, loadReleases]);

  useEffect(() => {
    if (selectedRelease?.id) {
      loadSelectedRelease(selectedRelease.id);
    } else {
      setSelectedRelease(null);
      setReadiness(null);
    }
  }, [selectedRelease?.id, loadSelectedRelease]);

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

  // ─── Derived data ─────────────────────────────────────────
  const issuesInRelease = selectedRelease?.issues ?? [];
  const sprintsInRelease = selectedRelease?.sprints ?? [];
  const issueIdsInRelease = new Set(issuesInRelease.map((i) => i.id));
  const sprintIdsInRelease = new Set(sprintsInRelease.map((s) => s.id));
  const candidatesToAdd = projectIssues.filter((i) => !issueIdsInRelease.has(i.id));
  const sprintCandidates = projectSprints.filter((s) => !sprintIdsInRelease.has(s.id));

  const filteredReleases = filterTab === 'ALL'
    ? releases
    : releases.filter((r) => r.state === filterTab);

  // First RELEASED in filtered list — not dimmed; rest are dimmed
  const firstReleasedId = filteredReleases.find((r) => r.state === 'RELEASED')?.id;

  const formatDate = (iso?: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
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
    if (readiness.totalSprints > readiness.closedSprints)
      parts.push(`${readiness.totalSprints - readiness.closedSprints} спринт(ов) не закрыто`);
    if (readiness.totalIssues > readiness.doneIssues)
      parts.push(`${readiness.totalIssues - readiness.doneIssues} задач(и) не выполнено`);
    return parts.join(', ');
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
    ...(canManage && selectedRelease?.state !== 'RELEASED'
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

  const btnPrimary: React.CSSProperties = {
    display: 'inline-block', paddingBlock: 4, paddingInline: 10,
    backgroundImage: LOGO_GRAD, borderRadius: 6, cursor: 'pointer',
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
            {project?.name ?? '...'} · {releases.length} релизов · {releases.filter(r => r.state !== 'RELEASED').length} в работе
          </div>
        </div>
        {canManage && (
          <div
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
        {(['ALL', 'DRAFT', 'READY', 'RELEASED'] as const).map((tab) => {
          const isActive = filterTab === tab;
          return (
            <div
              key={tab}
              style={{
                borderRadius: 6, paddingBlock: 6, paddingInline: 14, cursor: 'pointer',
                backgroundImage: isActive && isDark ? C.tabActiveBg : undefined,
                backgroundColor: isActive && !isDark ? C.tabActiveBg as string : undefined,
              }}
              onClick={() => setFilterTab(tab)}
            >
              <span style={{
                fontFamily: F.sans, fontSize: 12, fontWeight: isActive ? 500 : 400,
                color: isActive ? C.tabActiveText : C.tabText,
              }}>
                {tab === 'ALL' ? 'Все' : tab}
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
            const isDimmed = r.state === 'RELEASED' && r.id !== firstReleasedId;
            const isHighlighted = r.state === 'READY';
            const isLast = idx === filteredReleases.length - 1;
            const isSelected = selectedRelease?.id === r.id;
            const levelCfg = LEVEL_CFG[r.level] ?? LEVEL_CFG.MINOR;
            const statusCfg = STATUS_CFG[r.state];

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
                  color: r.state === 'READY'
                    ? (isDark ? '#4ADE80' : '#1A7F37')
                    : isDimmed ? C.t4 : C.t3,
                }}>
                  {formatDate(r.releaseDate)}
                </div>

                {/* Actions */}
                <div style={{ flex: 1, display: 'flex', gap: 6, alignItems: 'center' }}>
                  {/* READY: Выпустить + Открыть */}
                  {r.state === 'READY' && canManage && (
                    <Popconfirm title="Выпустить релиз?" onConfirm={() => handleMarkReleased(r.id)}>
                      <div style={{ ...btnPrimary }}>
                        <span style={{ fontFamily: F.sans, fontSize: 11, color: '#FFFFFF', lineHeight: '14px' }}>
                          Выпустить
                        </span>
                      </div>
                    </Popconfirm>
                  )}

                  {/* Открыть */}
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

                  {/* DRAFT: … (mark ready) */}
                  {r.state === 'DRAFT' && canManage && (
                    <Popconfirm title="Отметить релиз готовым к выпуску?" onConfirm={() => handleMarkReady(r.id)}>
                      <div style={{ ...btnOutlined }}>
                        <span style={{ fontFamily: F.sans, fontSize: 11, color: C.t3, lineHeight: '14px' }}>
                          …
                        </span>
                      </div>
                    </Popconfirm>
                  )}
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
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            backgroundColor: isDark ? '#161B22' : C.bgHeaderRow,
            borderBottom: `1px solid ${C.border}`,
            paddingInline: 20, paddingBlock: 12,
          }}>
            <span style={{ fontFamily: F.display, fontSize: 14, fontWeight: 700, color: C.t1 }}>
              {selectedRelease.name}
            </span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {/* Readiness progress */}
              {readiness && selectedRelease.state !== 'RELEASED' && (
                <span style={{ fontFamily: F.sans, fontSize: 11, color: C.t3 }}>
                  Спринтов: {readiness.closedSprints}/{readiness.totalSprints} · Задач: {readiness.doneIssues}/{readiness.totalIssues}
                </span>
              )}
              {canManage && selectedRelease.state === 'DRAFT' && readiness && (
                <Tooltip title={getReadyTooltip()}>
                  <div
                    style={{
                      ...btnOutlined,
                      opacity: readiness.canMarkReady ? 1 : 0.5,
                      cursor: readiness.canMarkReady ? 'pointer' : 'not-allowed',
                    }}
                    onClick={() => { if (readiness.canMarkReady) handleMarkReady(selectedRelease.id); }}
                  >
                    <span style={{ fontFamily: F.sans, fontSize: 11, color: C.btnText, lineHeight: '14px' }}>
                      Отметить готовым
                    </span>
                  </div>
                </Tooltip>
              )}
              {canManage && selectedRelease.state === 'READY' && readiness && (
                <Tooltip title={getReleaseTooltip()}>
                  <Popconfirm title="Выпустить релиз?" onConfirm={() => handleMarkReleased(selectedRelease.id)} disabled={!readiness.canRelease}>
                    <div style={{
                      ...btnPrimary,
                      opacity: readiness.canRelease ? 1 : 0.5,
                      cursor: readiness.canRelease ? 'pointer' : 'not-allowed',
                    }}>
                      <span style={{ fontFamily: F.sans, fontSize: 11, color: '#FFFFFF', lineHeight: '14px' }}>
                        Выпустить релиз
                      </span>
                    </div>
                  </Popconfirm>
                </Tooltip>
              )}
            </div>
          </div>

          {/* Readiness progress bars */}
          {readiness && selectedRelease.state !== 'RELEASED' && (
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
                    Задачи выполнены: {readiness.doneIssues}/{readiness.totalIssues}
                  </div>
                  <Progress
                    percent={readiness.totalIssues > 0 ? Math.round((readiness.doneIssues / readiness.totalIssues) * 100) : 0}
                    size="small"
                    status={readiness.doneIssues === readiness.totalIssues && readiness.totalIssues > 0 ? 'success' : 'active'}
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
              {canManage && selectedRelease.state !== 'RELEASED' && (
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
              {canManage && selectedRelease.state !== 'RELEASED' && (
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
