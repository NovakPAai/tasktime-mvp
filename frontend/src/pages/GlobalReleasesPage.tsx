/**
 * GlobalReleasesPage — TTMP-178 [RM-05] GlobalReleasesPage (frontend)
 * Artboards: 4EO-0 (Dark) + 4JG-0 (Light). Zero CSS classes, zero Ant Design layout.
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { AxiosError } from 'axios';
import {
  Modal,
  Form,
  Input,
  Select,
  DatePicker,
  Radio,
  Table,
  Tooltip,
  Progress,
  message,
  Spin,
  Popconfirm,
} from 'antd';
import {
  PlusOutlined,
  CloseOutlined,
  SearchOutlined,
  ReloadOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  MinusCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import * as releasesApi from '../api/releases';
import * as projectsApi from '../api/projects';
import * as issuesApi from '../api/issues';
import * as sprintsApi from '../api/sprints';
import { useAuthStore } from '../store/auth.store';
import { useThemeStore } from '../store/theme.store';
import type {
  Release,
  ReleaseItem,
  SprintInRelease,
  ReleaseReadiness,
  ReleaseTransition,
  ReleaseAuditEntry,
} from '../types';
import type { SystemRoleType } from '../types';
import type { Project } from '../types/project.types';
import type { Issue } from '../types/issue.types';
import type { Sprint } from '../types/sprint.types';

// ─── Tokens Dark (Paper 4EO-0) ──────────────────────────────────────────────
const DARK_C = {
  bg:           '#080B14',
  bgCard:       '#0F1320',
  bgRow:        '#0F1320',
  bgRowHover:   '#161B22',
  border:       '#21262D',
  borderBtn:    '#30363D',
  t1:           '#E2E8F8',
  t2:           '#C9D1D9',
  t3:           '#8B949E',
  t4:           '#484F58',
  acc:          '#4F6EF7',
  accHover:     '#6B83F5',
  tabActiveBg:  '#4F6EF71A',
  tabActiveText:'#4F6EF7',
  tabText:      '#8B949E',
  inputBg:      '#0D1117',
  inputBorder:  '#30363D',
  panelBg:      '#080B14',
  panelBorder:  '#21262D',
};

// ─── Tokens Light (Paper 4JG-0) ─────────────────────────────────────────────
const LIGHT_C = {
  bg:           '#F6F8FA',
  bgCard:       '#FFFFFF',
  bgRow:        '#FFFFFF',
  bgRowHover:   '#F6F8FA',
  border:       '#D0D7DE',
  borderBtn:    '#D0D7DE',
  t1:           '#1F2328',
  t2:           '#1F2328',
  t3:           '#656D76',
  t4:           '#8C959F',
  acc:          '#4F6EF7',
  accHover:     '#3B57D4',
  tabActiveBg:  '#4F6EF71A',
  tabActiveText:'#4F6EF7',
  tabText:      '#656D76',
  inputBg:      '#FFFFFF',
  inputBorder:  '#D0D7DE',
  panelBg:      '#FFFFFF',
  panelBorder:  '#D0D7DE',
};

const F = {
  display: '"Space Grotesk", system-ui, sans-serif',
  sans:    '"Inter", system-ui, sans-serif',
};

// ─── Release type / level / status helpers ───────────────────────────────────

function typeBadge(type: string) {
  const isInt = type === 'INTEGRATION';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 4,
      fontSize: 11, fontWeight: 600, fontFamily: F.display,
      background: isInt ? '#7C3AED26' : '#1677FF1A',
      color: isInt ? '#A78BFA' : '#4F6EF7',
    }}>
      {isInt ? 'INTEGRATION' : 'ATOMIC'}
    </span>
  );
}

function levelBadge(level: string, isDark: boolean) {
  const isMajor = level === 'MAJOR';
  return (
    <span style={{
      display: 'inline-block', padding: '2px 7px', borderRadius: 4,
      fontSize: 11, fontWeight: 600, fontFamily: F.display,
      background: isMajor ? (isDark ? '#A88BFA26' : '#7C3AED1A') : (isDark ? '#8B949E26' : '#8C959F1A'),
      color: isMajor ? (isDark ? '#A78BFA' : '#7C3AED') : (isDark ? '#8B949E' : '#57606A'),
    }}>
      {isMajor ? 'MAJOR' : 'MINOR'}
    </span>
  );
}

function statusBadge(status: Release['status'] | null | undefined, C: typeof DARK_C) {
  if (!status) return <span style={{ color: C.t4, fontSize: 12 }}>—</span>;
  const cat = status.category;
  const catColor = cat === 'DONE' ? '#4ADE80'
    : cat === 'IN_PROGRESS' ? '#4F6EF7'
    : cat === 'CANCELLED' ? '#F87171'
    : '#8B949E';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 8px', borderRadius: 4,
      fontSize: 12, fontWeight: 500, fontFamily: F.sans,
      background: `${catColor}1F`,
      color: catColor,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: status.color || catColor,
        display: 'inline-block',
      }} />
      {status.name}
    </span>
  );
}

function formatDate(d?: string | null) {
  if (!d) return '—';
  return dayjs(d).format('DD.MM.YYYY');
}

function actionLabel(action: string): string {
  const map: Record<string, string> = {
    'release.created': 'Создан релиз',
    'release.updated': 'Обновлён',
    'release.deleted': 'Удалён',
    'release.items_added': 'Добавлены задачи',
    'release.items_removed': 'Удалены задачи',
    'release.sprints_added': 'Добавлены спринты',
    'release.sprints_removed': 'Удалены спринты',
    'release.transition': 'Переход статуса',
    'release.transition.executed': 'Переход статуса',
  };
  return map[action] || action;
}

// ─── Detail slide panel ───────────────────────────────────────────────────────

type DetailTab = 'issues' | 'sprints' | 'readiness' | 'history';

interface DetailPanelProps {
  release: Release | null;
  C: typeof DARK_C;
  isDark: boolean;
  canManage: boolean;
  onClose: () => void;
  onTransition: (releaseId: string, transitionId: string) => Promise<void>;
  onReleasesRefresh: () => void;
}

function DetailPanel({ release, C, isDark, canManage, onClose, onTransition, onReleasesRefresh }: DetailPanelProps) {
  const [tab, setTab] = useState<DetailTab>('issues');
  const [items, setItems] = useState<ReleaseItem[]>([]);
  const [itemsTotal, setItemsTotal] = useState(0);
  const [itemsPage, setItemsPage] = useState(1);
  const [sprints, setSprints] = useState<SprintInRelease[]>([]);
  const [readiness, setReadiness] = useState<ReleaseReadiness | null>(null);
  const [history, setHistory] = useState<ReleaseAuditEntry[]>([]);
  const [transitions, setTransitions] = useState<ReleaseTransition[]>([]);
  const [currentStatus, setCurrentStatus] = useState<Release['status'] | null>(null);
  const [loadingItems, setLoadingItems] = useState(false);
  const [loadingSprints, setLoadingSprints] = useState(false);
  const [loadingReadiness, setLoadingReadiness] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingTransitions, setLoadingTransitions] = useState(false);
  const [transitioning, setTransitioning] = useState<string | null>(null);
  const [addIssuesOpen, setAddIssuesOpen] = useState(false);
  const [addSprintsOpen, setAddSprintsOpen] = useState(false);
  const [allIssues, setAllIssues] = useState<Issue[]>([]);
  const [allSprints, setAllSprints] = useState<Sprint[]>([]);
  const [selectedIssueIds, setSelectedIssueIds] = useState<string[]>([]);
  const [selectedSprintIds, setSelectedSprintIds] = useState<string[]>([]);
  const [issueSearch, setIssueSearch] = useState('');
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [issueProjectFilter, setIssueProjectFilter] = useState<string | undefined>();
  const [loadingModalIssues, setLoadingModalIssues] = useState(false);

  const loadItems = useCallback(async (id: string, page = 1) => {
    setLoadingItems(true);
    try {
      const r = await releasesApi.getReleaseItems(id, { page, limit: 20 });
      setItems(r.data);
      setItemsTotal(r.total);
      setItemsPage(page);
    } finally {
      setLoadingItems(false);
    }
  }, []);

  const loadSprints = useCallback(async (id: string) => {
    setLoadingSprints(true);
    try {
      setSprints(await releasesApi.getReleaseSprints(id));
    } finally {
      setLoadingSprints(false);
    }
  }, []);

  const loadReadiness = useCallback(async (id: string) => {
    setLoadingReadiness(true);
    try {
      setReadiness(await releasesApi.getReleaseReadiness(id));
    } finally {
      setLoadingReadiness(false);
    }
  }, []);

  const loadHistory = useCallback(async (id: string) => {
    setLoadingHistory(true);
    try {
      setHistory(await releasesApi.getReleaseHistory(id));
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  const loadTransitions = useCallback(async (id: string) => {
    setLoadingTransitions(true);
    try {
      const r = await releasesApi.getAvailableTransitions(id);
      setTransitions(r.transitions);
      setCurrentStatus(r.currentStatus);
    } catch {
      setTransitions([]);
    } finally {
      setLoadingTransitions(false);
    }
  }, []);

  useEffect(() => {
    if (!release) return;
    setTab('issues');
    setItems([]); setSprints([]); setReadiness(null); setHistory([]);
    loadItems(release.id);
    loadTransitions(release.id);
  }, [release?.id]);

  useEffect(() => {
    if (!release) return;
    if (tab === 'sprints') loadSprints(release.id);
    if (tab === 'readiness') loadReadiness(release.id);
    if (tab === 'history') loadHistory(release.id);
  }, [tab, release?.id]);

  const handleTransition = async (transitionId: string) => {
    if (!release) return;
    setTransitioning(transitionId);
    try {
      await onTransition(release.id, transitionId);
      await loadTransitions(release.id);
      onReleasesRefresh();
    } finally {
      setTransitioning(null);
    }
  };

  const handleAddIssues = async () => {
    if (!release || selectedIssueIds.length === 0) return;
    try {
      await releasesApi.addReleaseItems(release.id, selectedIssueIds);
      message.success('Задачи добавлены');
      setAddIssuesOpen(false);
      setSelectedIssueIds([]);
      loadItems(release.id);
    } catch (e) {
      const err = e as AxiosError<{ error?: string }>;
      message.error(err.response?.data?.error || 'Ошибка');
    }
  };

  const handleRemoveIssue = async (issueId: string) => {
    if (!release) return;
    try {
      await releasesApi.removeReleaseItems(release.id, [issueId]);
      message.success('Задача удалена из релиза');
      loadItems(release.id);
    } catch {
      message.error('Ошибка');
    }
  };

  const handleAddSprints = async () => {
    if (!release || selectedSprintIds.length === 0) return;
    try {
      await releasesApi.addSprintsToRelease(release.id, selectedSprintIds);
      message.success('Спринты добавлены');
      setAddSprintsOpen(false);
      setSelectedSprintIds([]);
      loadSprints(release.id);
    } catch (e) {
      const err = e as AxiosError<{ error?: string }>;
      message.error(err.response?.data?.error || 'Ошибка');
    }
  };

  const handleRemoveSprint = async (sprintId: string) => {
    if (!release) return;
    try {
      await releasesApi.removeSprintsFromRelease(release.id, [sprintId]);
      message.success('Спринт удалён из релиза');
      loadSprints(release.id);
    } catch {
      message.error('Ошибка');
    }
  };

  const openAddIssues = async () => {
    if (release?.type === 'INTEGRATION') {
      const projects = await projectsApi.listProjects();
      setAllProjects(projects);
      setIssueProjectFilter(undefined);
      setAllIssues([]);
      setAddIssuesOpen(true);
    } else {
      if (!release?.projectId) return;
      const issues = await issuesApi.listIssues(release.projectId);
      setAllIssues(issues);
      setAddIssuesOpen(true);
    }
  };

  const handleIssueProjectFilterChange = async (projectId: string | undefined) => {
    setIssueProjectFilter(projectId);
    setAllIssues([]);
    if (!projectId) return;
    setLoadingModalIssues(true);
    try {
      const issues = await issuesApi.listIssues(projectId);
      setAllIssues(issues);
    } catch {
      void message.error('Не удалось загрузить задачи проекта');
    } finally {
      setLoadingModalIssues(false);
    }
  };

  const openAddSprints = async () => {
    if (release?.type === 'INTEGRATION') {
      const res = await sprintsApi.listAllSprints({}, { limit: 200 });
      setAllSprints(res.data);
    } else {
      if (!release?.projectId) return;
      const res = await sprintsApi.listSprints(release.projectId);
      setAllSprints(res.data);
    }
    setAddSprintsOpen(true);
  };

  const filteredIssues = issueSearch
    ? allIssues.filter(i => i.title.toLowerCase().includes(issueSearch.toLowerCase()) || String(i.number).includes(issueSearch))
    : allIssues;

  if (!release) return null;

  const TABS: { key: DetailTab; label: string }[] = [
    { key: 'issues', label: 'Задачи' },
    { key: 'sprints', label: 'Спринты' },
    { key: 'readiness', label: 'Готовность' },
    { key: 'history', label: 'История' },
  ];

  return (
    <div style={{
      position: 'fixed', right: 0, top: 0, bottom: 0, zIndex: 1000,
      width: 720,
      background: C.panelBg,
      borderLeft: `1px solid ${C.panelBorder}`,
      display: 'flex', flexDirection: 'column',
      boxShadow: isDark ? '-8px 0 32px rgba(0,0,0,0.6)' : '-4px 0 20px rgba(0,0,0,0.12)',
      fontFamily: F.sans,
    }}>
      {/* Panel header */}
      <div style={{
        padding: '16px 20px 0',
        borderBottom: `1px solid ${C.border}`,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
              {typeBadge(release.type)}
              {levelBadge(release.level, isDark)}
              {statusBadge(currentStatus ?? release.status, C)}
            </div>
            <h2 style={{
              margin: 0, color: C.t1, fontSize: 17, fontWeight: 700,
              fontFamily: F.display, lineHeight: 1.3,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{release.name}</h2>
            {release.description && (
              <p style={{ margin: '4px 0 0', color: C.t3, fontSize: 12, lineHeight: 1.5 }}>
                {release.description}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              border: 'none', background: 'transparent', cursor: 'pointer',
              color: C.t3, padding: 4, lineHeight: 1, flexShrink: 0,
            }}
          >
            <CloseOutlined style={{ fontSize: 16 }} />
          </button>
        </div>

        {/* Transition buttons */}
        {canManage && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
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
                  <button
                    disabled={transitioning === t.id}
                    style={{
                      border: `1px solid ${tColor}60`,
                      background: `${tColor}15`,
                      color: tColor,
                      borderRadius: 6,
                      padding: '4px 12px',
                      fontSize: 12,
                      fontWeight: 600,
                      fontFamily: F.display,
                      cursor: 'pointer',
                      opacity: transitioning === t.id ? 0.6 : 1,
                    }}
                  >
                    → {t.toStatus.name}
                  </button>
                </Popconfirm>
              );
            })}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0 }}>
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                border: 'none',
                borderBottom: tab === key ? `2px solid ${C.acc}` : '2px solid transparent',
                background: 'transparent',
                color: tab === key ? C.tabActiveText : C.tabText,
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: tab === key ? 600 : 400,
                fontFamily: F.sans,
                cursor: 'pointer',
                marginBottom: -1,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Panel body */}
      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>

        {/* ── Issues tab ─────────────────────────────── */}
        {tab === 'issues' && (
          <div>
            {canManage && (
              <div style={{ marginBottom: 12 }}>
                <button
                  onClick={openAddIssues}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    border: `1px solid ${C.borderBtn}`,
                    background: 'transparent', color: C.t2,
                    borderRadius: 6, padding: '5px 12px',
                    fontSize: 12, fontFamily: F.sans, cursor: 'pointer',
                  }}
                >
                  <PlusOutlined /> Добавить задачи
                </button>
              </div>
            )}
            {loadingItems ? (
              <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
            ) : items.length === 0 ? (
              <div style={{ color: C.t3, fontSize: 13, textAlign: 'center', padding: 40 }}>
                Задачи не добавлены
              </div>
            ) : (
              <>
                {/* Group by project for INTEGRATION */}
                {release.type === 'INTEGRATION' ? (
                  (() => {
                    const byProject: Record<string, { key: string; name: string; items: ReleaseItem[] }> = {};
                    for (const item of items) {
                      const pid = item.issue.projectId;
                      if (!byProject[pid]) byProject[pid] = { key: item.issue.project.key, name: item.issue.project.name, items: [] };
                      byProject[pid].items.push(item);
                    }
                    return Object.values(byProject).map(group => (
                      <div key={group.key} style={{ marginBottom: 16 }}>
                        <div style={{
                          fontSize: 11, fontWeight: 700, color: C.t3,
                          fontFamily: F.display, marginBottom: 6, letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                        }}>
                          {group.key} · {group.name}
                        </div>
                        <IssueTable items={group.items} C={C} isDark={isDark} canManage={canManage} onRemove={handleRemoveIssue} />
                      </div>
                    ));
                  })()
                ) : (
                  <IssueTable items={items} C={C} isDark={isDark} canManage={canManage} onRemove={handleRemoveIssue} />
                )}
                {itemsTotal > 20 && (
                  <div style={{ marginTop: 12, textAlign: 'center' }}>
                    <button
                      onClick={() => release && loadItems(release.id, itemsPage + 1)}
                      style={{
                        border: `1px solid ${C.borderBtn}`, background: 'transparent',
                        color: C.t2, borderRadius: 6, padding: '5px 16px',
                        fontSize: 12, fontFamily: F.sans, cursor: 'pointer',
                      }}
                    >
                      Загрузить ещё
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Sprints tab ─────────────────────────────── */}
        {tab === 'sprints' && (
          <div>
            {canManage && (
              <div style={{ marginBottom: 12 }}>
                <button
                  onClick={openAddSprints}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    border: `1px solid ${C.borderBtn}`,
                    background: 'transparent', color: C.t2,
                    borderRadius: 6, padding: '5px 12px',
                    fontSize: 12, fontFamily: F.sans, cursor: 'pointer',
                  }}
                >
                  <PlusOutlined /> Добавить спринт
                </button>
              </div>
            )}
            {loadingSprints ? (
              <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
            ) : sprints.length === 0 ? (
              <div style={{ color: C.t3, fontSize: 13, textAlign: 'center', padding: 40 }}>
                Спринты не добавлены
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sprints.map(s => {
                  const issueCount = s._count?.issues ?? s.issues?.length ?? 0;
                  const doneCount = s.issues?.filter(i => i.status === 'DONE').length ?? 0;
                  const progress = issueCount > 0 ? Math.round((doneCount / issueCount) * 100) : 0;
                  const stateColor = s.state === 'ACTIVE' ? '#4F6EF7' : s.state === 'CLOSED' ? '#4ADE80' : C.t3;
                  const stateLab = s.state === 'ACTIVE' ? 'Активен' : s.state === 'CLOSED' ? 'Закрыт' : 'Запланирован';
                  return (
                    <div key={s.id} style={{
                      border: `1px solid ${C.border}`, borderRadius: 8,
                      padding: '12px 16px', background: C.bgCard,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <span style={{ fontSize: 14, fontWeight: 600, color: C.t1, fontFamily: F.display }}>{s.name}</span>
                            <span style={{
                              fontSize: 11, fontWeight: 600, padding: '1px 6px', borderRadius: 4,
                              background: `${stateColor}1F`, color: stateColor,
                            }}>{stateLab}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <span style={{ color: C.t3, fontSize: 12 }}>{issueCount} задач</span>
                            {s.startDate && <span style={{ color: C.t4, fontSize: 11 }}>{formatDate(s.startDate)} — {formatDate(s.endDate)}</span>}
                          </div>
                          {issueCount > 0 && (
                            <div style={{ marginTop: 8 }}>
                              <Progress percent={progress} size="small" strokeColor={C.acc} showInfo={false} />
                            </div>
                          )}
                        </div>
                        {canManage && (
                          <Popconfirm
                            title="Убрать спринт из релиза?"
                            onConfirm={() => handleRemoveSprint(s.id)}
                            okText="Да" cancelText="Нет"
                          >
                            <button style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: C.t4, padding: 4 }}>
                              <DeleteOutlined />
                            </button>
                          </Popconfirm>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Readiness tab ─────────────────────────────── */}
        {tab === 'readiness' && (
          <div>
            {loadingReadiness ? (
              <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
            ) : readiness ? (
              <div>
                {/* Main metrics */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                  {[
                    { label: 'Готовность', value: `${readiness.completionPercent}%`, icon: <CheckCircleOutlined style={{ color: '#4ADE80' }} /> },
                    { label: 'Задачи', value: `${readiness.doneItems} / ${readiness.totalItems}`, icon: <ClockCircleOutlined style={{ color: C.acc }} /> },
                    { label: 'Спринты закрыты', value: `${readiness.closedSprints} / ${readiness.totalSprints}`, icon: <CheckCircleOutlined style={{ color: C.acc }} /> },
                    { label: 'В работе', value: String(readiness.inProgressItems), icon: <MinusCircleOutlined style={{ color: '#F97316' }} /> },
                  ].map(({ label, value, icon }) => (
                    <div key={label} style={{
                      border: `1px solid ${C.border}`, borderRadius: 8,
                      padding: '14px 16px', background: C.bgCard,
                      display: 'flex', alignItems: 'center', gap: 12,
                    }}>
                      <span style={{ fontSize: 18 }}>{icon}</span>
                      <div>
                        <div style={{ color: C.t3, fontSize: 11, marginBottom: 2 }}>{label}</div>
                        <div style={{ color: C.t1, fontSize: 18, fontWeight: 700, fontFamily: F.display }}>{value}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Progress bar */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ color: C.t2, fontSize: 13 }}>Прогресс завершения</span>
                    <span style={{ color: C.t1, fontWeight: 600 }}>{readiness.completionPercent}%</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: isDark ? '#21262D' : '#E8EAED', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 4,
                      background: readiness.completionPercent >= 80 ? '#4ADE80' : readiness.completionPercent >= 50 ? C.acc : '#F97316',
                      width: `${readiness.completionPercent}%`,
                      transition: 'width 0.4s ease',
                    }} />
                  </div>
                </div>

                {/* By project (INTEGRATION) */}
                {readiness.byProject.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                      По проектам
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {readiness.byProject.map(p => {
                        const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
                        return (
                          <div key={p.projectId} style={{
                            border: `1px solid ${C.border}`, borderRadius: 6, padding: '10px 14px',
                            background: C.bgCard,
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                              <span style={{ color: C.t2, fontSize: 13 }}>
                                <span style={{ color: C.acc, fontWeight: 600, marginRight: 6 }}>{p.key}</span>{p.name}
                              </span>
                              <span style={{ color: C.t3, fontSize: 12 }}>{p.done}/{p.total} ({pct}%)</span>
                            </div>
                            <Progress percent={pct} size="small" strokeColor={C.acc} showInfo={false} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ color: C.t3, fontSize: 13, textAlign: 'center', padding: 40 }}>
                Нет данных
              </div>
            )}
          </div>
        )}

        {/* ── History tab ─────────────────────────────── */}
        {tab === 'history' && (
          <div>
            {loadingHistory ? (
              <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
            ) : history.length === 0 ? (
              <div style={{ color: C.t3, fontSize: 13, textAlign: 'center', padding: 40 }}>
                История пуста
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {history.map((entry, idx) => (
                  <div key={entry.id} style={{
                    display: 'flex', gap: 12, padding: '10px 0',
                    borderBottom: idx < history.length - 1 ? `1px solid ${C.border}` : 'none',
                  }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%',
                      background: isDark ? '#21262D' : '#E8EAED',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, color: C.t2, fontSize: 12, fontWeight: 700,
                    }}>
                      {entry.user?.name?.[0]?.toUpperCase() ?? '?'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ color: C.t1, fontSize: 13, fontWeight: 600 }}>{entry.user?.name ?? 'Система'}</span>
                        <span style={{ color: C.acc, fontSize: 12, fontWeight: 500 }}>{actionLabel(entry.action)}</span>
                        <span style={{ color: C.t4, fontSize: 11 }}>{dayjs(entry.createdAt).format('DD.MM.YYYY HH:mm')}</span>
                      </div>
                      {entry.details && Object.keys(entry.details).length > 0 && (
                        <div style={{
                          marginTop: 4, fontSize: 11, color: C.t3,
                          background: isDark ? '#0D1117' : '#F6F8FA',
                          borderRadius: 4, padding: '4px 8px',
                          fontFamily: 'monospace', wordBreak: 'break-all',
                        }}>
                          {JSON.stringify(entry.details, null, 2).slice(0, 200)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Issues Modal */}
      <Modal
        open={addIssuesOpen}
        title="Добавить задачи в релиз"
        onCancel={() => { setAddIssuesOpen(false); setSelectedIssueIds([]); setIssueSearch(''); setIssueProjectFilter(undefined); setAllIssues([]); }}
        onOk={handleAddIssues}
        okText="Добавить"
        cancelText="Отмена"
        okButtonProps={{ disabled: selectedIssueIds.length === 0 }}
        width={600}
      >
        {release?.type === 'INTEGRATION' && (
          <Select
            placeholder="Выберите проект..."
            style={{ width: '100%', marginBottom: 12 }}
            value={issueProjectFilter}
            onChange={(v) => void handleIssueProjectFilterChange(v)}
            allowClear
            showSearch
            filterOption={(input, opt) => (opt?.label as string)?.toLowerCase().includes(input.toLowerCase())}
            options={allProjects.map(p => ({ value: p.id, label: `${p.key}: ${p.name}` }))}
          />
        )}
        <Input
          placeholder="Поиск задач..."
          prefix={<SearchOutlined />}
          value={issueSearch}
          onChange={e => setIssueSearch(e.target.value)}
          style={{ marginBottom: 12 }}
        />
        {loadingModalIssues ? (
          <div style={{ textAlign: 'center', padding: 24 }}><Spin size="small" /></div>
        ) : release?.type === 'INTEGRATION' && !issueProjectFilter ? (
          <div style={{ color: C.t3, fontSize: 13, textAlign: 'center', padding: 24 }}>
            Выберите проект для загрузки задач
          </div>
        ) : (
        <div style={{ maxHeight: 400, overflow: 'auto' }}>
          {filteredIssues.map(issue => (
            <div key={issue.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px', borderRadius: 6, cursor: 'pointer',
              background: selectedIssueIds.includes(issue.id)
                ? (isDark ? '#4F6EF71A' : '#4F6EF70D')
                : 'transparent',
              marginBottom: 4,
            }} onClick={() => {
              setSelectedIssueIds(prev =>
                prev.includes(issue.id) ? prev.filter(id => id !== issue.id) : [...prev, issue.id]
              );
            }}>
              <input
                type="checkbox"
                checked={selectedIssueIds.includes(issue.id)}
                onChange={() => {}}
                style={{ cursor: 'pointer' }}
              />
              <span style={{ color: C.t3, fontSize: 12, fontFamily: 'monospace' }}>#{issue.number}</span>
              <span style={{ color: C.t1, fontSize: 13, flex: 1 }}>{issue.title}</span>
              <span style={{ color: C.t4, fontSize: 11 }}>{issue.status}</span>
            </div>
          ))}
        </div>
        )}
      </Modal>

      {/* Add Sprints Modal */}
      <Modal
        open={addSprintsOpen}
        title="Добавить спринты в релиз"
        onCancel={() => { setAddSprintsOpen(false); setSelectedSprintIds([]); }}
        onOk={handleAddSprints}
        okText="Добавить"
        cancelText="Отмена"
        okButtonProps={{ disabled: selectedSprintIds.length === 0 }}
        width={500}
      >
        <div style={{ maxHeight: 400, overflow: 'auto' }}>
          {allSprints.map(sprint => (
            <div key={sprint.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px', borderRadius: 6, cursor: 'pointer',
              background: selectedSprintIds.includes(sprint.id)
                ? (isDark ? '#4F6EF71A' : '#4F6EF70D')
                : 'transparent',
              marginBottom: 4,
            }} onClick={() => {
              setSelectedSprintIds(prev =>
                prev.includes(sprint.id) ? prev.filter(id => id !== sprint.id) : [...prev, sprint.id]
              );
            }}>
              <input
                type="checkbox"
                checked={selectedSprintIds.includes(sprint.id)}
                onChange={() => {}}
                style={{ cursor: 'pointer' }}
              />
              <span style={{ color: C.t1, fontSize: 13, flex: 1 }}>{sprint.name}</span>
              <span style={{ color: C.t3, fontSize: 12 }}>{sprint.state}</span>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}

// ─── Issue table inside detail panel ─────────────────────────────────────────

function IssueTable({
  items,
  C,
  isDark,
  canManage,
  onRemove,
}: {
  items: ReleaseItem[];
  C: typeof DARK_C;
  isDark: boolean;
  canManage: boolean;
  onRemove: (issueId: string) => void;
}) {
  const prioColor: Record<string, string> = {
    CRITICAL: '#F87171', HIGH: '#F97316', MEDIUM: '#FBBF24', LOW: '#4ADE80',
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {items.map(item => {
        const issue = item.issue;
        const ws = issue.workflowStatus;
        const wsColor = ws?.color || C.t4;
        return (
          <div key={item.id} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 12px', borderRadius: 6,
            background: isDark ? '#0D111B' : '#F6F8FA',
            border: `1px solid ${C.border}`,
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: prioColor[issue.priority] || C.t4,
              flexShrink: 0,
            }} />
            <Link
              to={`/issues/${issue.id}`}
              style={{ color: C.acc, fontSize: 11, fontFamily: 'monospace', flexShrink: 0, textDecoration: 'none', fontWeight: 600 }}
            >
              {issue.project.key}-{issue.number}
            </Link>
            <span style={{ color: C.t1, fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {issue.title}
            </span>
            {ws && (
              <span style={{
                fontSize: 11, padding: '1px 6px', borderRadius: 3,
                background: `${wsColor}1F`, color: wsColor,
                flexShrink: 0,
              }}>{ws.name}</span>
            )}
            {issue.assignee && (
              <Tooltip title={issue.assignee.name}>
                <span style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: isDark ? '#21262D' : '#E8EAED',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700, color: C.t2, flexShrink: 0,
                }}>
                  {issue.assignee.name[0].toUpperCase()}
                </span>
              </Tooltip>
            )}
            {canManage && (
              <Popconfirm
                title="Убрать задачу из релиза?"
                onConfirm={() => onRemove(issue.id)}
                okText="Да" cancelText="Нет"
              >
                <button style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: C.t4, padding: 2 }}>
                  <DeleteOutlined style={{ fontSize: 12 }} />
                </button>
              </Popconfirm>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function GlobalReleasesPage() {
  const { user } = useAuthStore();
  const { mode } = useThemeStore();
  const isDark = mode !== 'light';
  const C = isDark ? DARK_C : LIGHT_C;
  const canManage = (['SUPER_ADMIN','ADMIN','RELEASE_MANAGER'] as SystemRoleType[]).some(r => user?.systemRoles?.includes(r));
  const [searchParams] = useSearchParams();

  // ─── State ───────────────────────────────────────────────
  const [releases, setReleases] = useState<Release[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const [filterType, setFilterType] = useState<'ALL' | 'ATOMIC' | 'INTEGRATION'>('ALL');
  const [filterProjectId, setFilterProjectId] = useState<string | undefined>();
  const [filterSearch, setFilterSearch] = useState('');
  const [filterFrom, setFilterFrom] = useState<string | undefined>();
  const [filterTo, setFilterTo] = useState<string | undefined>();

  const [sortBy, setSortBy] = useState('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedRelease, setSelectedRelease] = useState<Release | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [createType, setCreateType] = useState<'ATOMIC' | 'INTEGRATION'>('ATOMIC');
  const [createLoading, setCreateLoading] = useState(false);

  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  // ─── Load ─────────────────────────────────────────────────
  const loadReleases = useCallback(async (pg = page) => {
    setLoading(true);
    try {
      const query: releasesApi.ListReleasesQuery = {
        page: pg,
        limit: 20,
        sortBy,
        sortDir,
      };
      if (filterType !== 'ALL') query.type = filterType;
      if (filterProjectId) query.projectId = filterProjectId;
      if (filterSearch) query.search = filterSearch;
      if (filterFrom) query.from = filterFrom;
      if (filterTo) query.to = filterTo;
      const res = await releasesApi.listReleasesGlobal(query);
      setReleases(res.data);
      setTotal(res.total);
      setPage(pg);
    } finally {
      setLoading(false);
    }
  }, [page, sortBy, sortDir, filterType, filterProjectId, filterSearch, filterFrom, filterTo]);

  useEffect(() => { loadReleases(1); }, [filterType, filterProjectId, filterFrom, filterTo, sortBy, sortDir]);

  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => loadReleases(1), 400);
    return () => clearTimeout(searchTimer.current);
  }, [filterSearch]);

  useEffect(() => {
    projectsApi.listProjects().then(setProjects).catch(() => {});
  }, []);

  // Auto-open release from ?releaseId= query param (e.g. linked from project releases page)
  useEffect(() => {
    const releaseId = searchParams.get('releaseId');
    if (!releaseId || releases.length === 0) return;
    const release = releases.find(r => r.id === releaseId);
    if (release) setSelectedRelease(release);
  }, [releases, searchParams]);

  // ─── Handlers ─────────────────────────────────────────────
  const handleCreate = async (vals: {
    type: 'ATOMIC' | 'INTEGRATION';
    projectId?: string;
    name: string;
    description?: string;
    level: 'MINOR' | 'MAJOR';
    plannedDate?: dayjs.Dayjs;
  }) => {
    setCreateLoading(true);
    try {
      await releasesApi.createReleaseGlobal({
        type: vals.type,
        projectId: vals.type === 'ATOMIC' ? vals.projectId : undefined,
        name: vals.name,
        description: vals.description,
        level: vals.level,
        plannedDate: vals.plannedDate ? vals.plannedDate.format('YYYY-MM-DD') : undefined,
      });
      message.success('Релиз создан');
      setCreateOpen(false);
      createForm.resetFields();
      loadReleases(1);
    } catch (e) {
      const err = e as AxiosError<{ error?: string }>;
      message.error(err.response?.data?.error || 'Ошибка создания');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleTransition = async (releaseId: string, transitionId: string) => {
    await releasesApi.executeTransition(releaseId, transitionId);
    message.success('Статус обновлён');
  };

  // ─── Table columns ────────────────────────────────────────
  const columns: ColumnsType<Release> = [
    {
      title: 'Название',
      dataIndex: 'name',
      sorter: true,
      render: (name: string, row) => (
        <div>
          <div style={{ color: C.t1, fontWeight: 600, fontSize: 13, fontFamily: F.display }}>{name}</div>
          {row.description && (
            <div style={{ color: C.t3, fontSize: 11, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
              {row.description}
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Тип',
      dataIndex: 'type',
      width: 130,
      render: (type: string) => typeBadge(type),
    },
    {
      title: 'Проекты',
      width: 140,
      render: (_: unknown, row) => {
        if (row.type === 'ATOMIC') {
          return row.project ? (
            <span style={{ color: C.acc, fontWeight: 600, fontSize: 12 }}>{row.project.key}</span>
          ) : '—';
        }
        const projects = row._projects ?? [];
        return projects.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {projects.map((k: string) => (
              <span key={k} style={{
                fontSize: 11, padding: '1px 6px', borderRadius: 3,
                background: isDark ? '#21262D' : '#E8EAED', color: C.t2,
              }}>{k}</span>
            ))}
          </div>
        ) : <span style={{ color: C.t4 }}>—</span>;
      },
    },
    {
      title: 'Статус',
      width: 140,
      render: (_: unknown, row) => statusBadge(row.status, C),
    },
    {
      title: 'Уровень',
      dataIndex: 'level',
      width: 90,
      render: (level: string) => levelBadge(level, isDark),
    },
    {
      title: 'Задачи',
      width: 120,
      render: (_: unknown, row) => {
        const total = row._count?.items ?? 0;
        return (
          <div style={{ fontSize: 12, color: C.t2 }}>{total} задач</div>
        );
      },
    },
    {
      title: 'Плановая дата',
      dataIndex: 'plannedDate',
      width: 120,
      sorter: true,
      render: (d: string | null) => (
        <span style={{ color: d ? C.t2 : C.t4, fontSize: 12 }}>{formatDate(d)}</span>
      ),
    },
    {
      title: 'Дата выпуска',
      dataIndex: 'releaseDate',
      width: 120,
      sorter: true,
      render: (d: string | null) => (
        <span style={{ color: d ? '#4ADE80' : C.t4, fontSize: 12 }}>{formatDate(d)}</span>
      ),
    },
    {
      title: 'Автор',
      width: 120,
      render: (_: unknown, row) => row.createdBy ? (
        <Tooltip title={row.createdBy.name}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              width: 22, height: 22, borderRadius: '50%',
              background: isDark ? '#21262D' : '#E8EAED',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 700, color: C.t2,
            }}>
              {row.createdBy.name[0]?.toUpperCase()}
            </span>
            <span style={{ color: C.t3, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 80 }}>
              {row.createdBy.name}
            </span>
          </div>
        </Tooltip>
      ) : <span style={{ color: C.t4 }}>—</span>,
    },
  ];

  const TYPE_TABS: { key: 'ALL' | 'ATOMIC' | 'INTEGRATION'; label: string }[] = [
    { key: 'ALL', label: 'Все' },
    { key: 'ATOMIC', label: 'Атомарные' },
    { key: 'INTEGRATION', label: 'Интеграционные' },
  ];

  return (
    <div style={{
      minHeight: '100vh',
      background: C.bg,
      fontFamily: F.sans,
      padding: '24px 32px',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 24,
      }}>
        <div>
          <h1 style={{
            margin: 0, color: C.t1, fontSize: 22, fontWeight: 700,
            fontFamily: F.display, lineHeight: 1.2,
          }}>
            Релизы
          </h1>
          <p style={{ margin: '4px 0 0', color: C.t3, fontSize: 13 }}>
            Управление релизами всех проектов
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setCreateOpen(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: C.acc, color: '#fff',
              border: 'none', borderRadius: 8,
              padding: '8px 16px', fontSize: 13, fontWeight: 600,
              fontFamily: F.display, cursor: 'pointer',
            }}
          >
            <PlusOutlined /> Создать релиз
          </button>
        )}
      </div>

      {/* Type tabs */}
      <div style={{
        display: 'flex', gap: 0, marginBottom: 16,
        borderBottom: `1px solid ${C.border}`,
      }}>
        {TYPE_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilterType(key)}
            style={{
              border: 'none',
              borderBottom: filterType === key ? `2px solid ${C.acc}` : '2px solid transparent',
              background: 'transparent',
              color: filterType === key ? C.tabActiveText : C.tabText,
              padding: '8px 18px',
              fontSize: 13, fontWeight: filterType === key ? 600 : 400,
              fontFamily: F.sans, cursor: 'pointer', marginBottom: -1,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center',
      }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
          <SearchOutlined style={{
            position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
            color: C.t4, zIndex: 1, pointerEvents: 'none',
          }} />
          <input
            placeholder="Поиск по названию..."
            value={filterSearch}
            onChange={e => setFilterSearch(e.target.value)}
            style={{
              width: '100%', paddingLeft: 32, paddingRight: 12,
              height: 34, border: `1px solid ${C.inputBorder}`,
              borderRadius: 6, background: C.inputBg, color: C.t1,
              fontSize: 13, fontFamily: F.sans, boxSizing: 'border-box',
              outline: 'none',
            }}
          />
        </div>

        <Select
          allowClear
          placeholder="Проект"
          style={{ width: 160 }}
          value={filterProjectId}
          onChange={v => setFilterProjectId(v)}
          options={projects.map(p => ({ value: p.id, label: `${p.key} — ${p.name}` }))}
        />

        <DatePicker.RangePicker
          placeholder={['Период с', 'по']}
          style={{ width: 240 }}
          onChange={dates => {
            setFilterFrom(dates?.[0] ? dates[0].format('YYYY-MM-DD') : undefined);
            setFilterTo(dates?.[1] ? dates[1].format('YYYY-MM-DD') : undefined);
          }}
        />

        <button
          onClick={() => loadReleases(page)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            border: `1px solid ${C.borderBtn}`, background: 'transparent',
            color: C.t2, borderRadius: 6, padding: '5px 12px',
            fontSize: 12, fontFamily: F.sans, cursor: 'pointer',
          }}
        >
          <ReloadOutlined /> Обновить
        </button>
      </div>

      {/* Table */}
      <div style={{
        background: C.bgCard,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        overflow: 'hidden',
      }}>
        <Table<Release>
          columns={columns}
          dataSource={releases}
          rowKey="id"
          loading={loading}
          pagination={{
            current: page,
            pageSize: 20,
            total,
            showSizeChanger: false,
            showTotal: (t) => `Всего ${t}`,
            onChange: (pg) => loadReleases(pg),
          }}
          onChange={(_pagination, _filters, sorter) => {
            if (!Array.isArray(sorter) && sorter.field) {
              const field = Array.isArray(sorter.field) ? sorter.field.join('.') : String(sorter.field);
              setSortBy(field);
              setSortDir(sorter.order === 'ascend' ? 'asc' : 'desc');
            }
          }}
          onRow={(row) => ({
            onClick: () => setSelectedRelease(row),
            style: { cursor: 'pointer' },
          })}
          scroll={{ x: 900 }}
          style={{ background: C.bgCard }}
        />
      </div>

      {/* Detail slide panel */}
      {selectedRelease && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setSelectedRelease(null)}
            style={{
              position: 'fixed', inset: 0, zIndex: 999,
              background: 'rgba(0,0,0,0.4)',
            }}
          />
          <DetailPanel
            release={selectedRelease}
            C={C}
            isDark={isDark}
            canManage={canManage}
            onClose={() => setSelectedRelease(null)}
            onTransition={handleTransition}
            onReleasesRefresh={() => loadReleases(page)}
          />
        </>
      )}

      {/* Create Release Modal */}
      <Modal
        open={createOpen}
        title="Создать релиз"
        onCancel={() => { setCreateOpen(false); createForm.resetFields(); setCreateType('ATOMIC'); }}
        onOk={() => createForm.submit()}
        okText="Создать"
        cancelText="Отмена"
        confirmLoading={createLoading}
        width={520}
      >
        <Form
          form={createForm}
          layout="vertical"
          onFinish={handleCreate}
          initialValues={{ type: 'ATOMIC', level: 'MINOR' }}
        >
          <Form.Item name="type" label="Тип релиза" rules={[{ required: true }]}>
            <Radio.Group onChange={e => setCreateType(e.target.value)}>
              <Radio value="ATOMIC">ATOMIC — один проект</Radio>
              <Radio value="INTEGRATION">INTEGRATION — кросс-проект</Radio>
            </Radio.Group>
          </Form.Item>

          {createType === 'ATOMIC' && (
            <Form.Item name="projectId" label="Проект" rules={[{ required: true, message: 'Выберите проект' }]}>
              <Select
                placeholder="Выберите проект"
                options={projects.map(p => ({ value: p.id, label: `${p.key} — ${p.name}` }))}
              />
            </Form.Item>
          )}

          <Form.Item name="name" label="Название" rules={[{ required: true, min: 1, max: 100 }]}>
            <Input placeholder="v1.2.0 — Релиз управления правами" />
          </Form.Item>

          <Form.Item name="description" label="Описание">
            <Input.TextArea rows={3} placeholder="Краткое описание релиза..." />
          </Form.Item>

          <Form.Item name="level" label="Уровень">
            <Radio.Group>
              <Radio value="MINOR">Minor</Radio>
              <Radio value="MAJOR">Major</Radio>
            </Radio.Group>
          </Form.Item>

          <Form.Item name="plannedDate" label="Плановая дата выпуска">
            <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
