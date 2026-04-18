/**
 * DashboardPage — built from zero using Paper (FlowUniverse) as sole source.
 * Artboards: 1KQ-0 (Dark) + 1R5-0 (Light). Zero CSS classes, zero Ant Design layout.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getMyCheckpointViolations, type IssueViolationSummary } from '../api/release-checkpoints';
import { pluralize } from '../utils/pluralize';
import { useProjectsStore } from '../store/projects.store';
import { useAuthStore } from '../store/auth.store';
import { useThemeStore } from '../store/theme.store';
import * as adminApi from '../api/admin';
import * as issuesApi from '../api/issues';
import type { Issue, IssueStatus, IssuePriority } from '../types';
import LoadingSpinner from '../components/common/LoadingSpinner';

// ─── Tokens Dark (Paper 1KQ-0) ────────────────────────────────────────────────
const DARK_C = {
  bgMain:   '#080B14',
  bgCard:   '#0F1320',
  border:   '#21262D',
  borderHd: '#161B22',
  borderRw: '#0D1017',
  todayBg:  '#161B22',
  t1: '#E2E8F8',
  t2: '#C9D1D9',
  t3: '#8B949E',
  t4: '#484F58',
  acc:    '#4F6EF7',
  green:  '#4ADE80',
  amber:  '#F59E0B',
  purple: '#A78BFA',
  red:    '#EF4444',
  indigo: '#6366F1',
};

// ─── Tokens Light (Paper 1R5-0) ───────────────────────────────────────────────
const LIGHT_C = {
  bgMain:   '#F6F8FA',
  bgCard:   '#FFFFFF',
  border:   '#D0D7DE',
  borderHd: '#D0D7DE',
  borderRw: '#EEF0F2',
  todayBg:  '#F6F8FA',
  t1: '#1F2328',
  t2: '#656D76',
  t3: '#8C959F',
  t4: '#656D76',
  acc:    '#4F6EF7',
  green:  '#1A7F37',
  amber:  '#D97706',
  purple: '#7C3AED',
  red:    '#DC2626',
  indigo: '#6366F1',
};

const F = {
  display: "'Space Grotesk', system-ui, sans-serif",
  sans:    "'Inter', system-ui, sans-serif",
};

// ─── Avatar gradients (Paper activity feed, 5 distinct) ───────────────────────
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1)  return 'только что';
  if (m < 60) return `${m} мин. назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч. назад`;
  return `${Math.floor(h / 24)} дн. назад`;
}

function formatAction(action: string): string {
  const a = action.toLowerCase();
  if (a.includes('created') || a.includes('create')) return 'создал(а)';
  if (a.includes('updated') || a.includes('update')) return 'обновил(а)';
  if (a.includes('deleted') || a.includes('delete')) return 'удалил(а)';
  if (a.includes('closed')  || a.includes('close'))  return 'закрыл(а)';
  if (a.includes('opened')  || a.includes('open'))   return 'открыл(а)';
  if (a.includes('added')   || a.includes('add'))    return 'добавил(а)';
  if (a.includes('removed') || a.includes('remove')) return 'удалил(а)';
  if (a.includes('started') || a.includes('start'))  return 'запустил(а)';
  if (a.includes('comment'))                         return 'прокомментировал(а)';
  if (a.includes('assigned'))                        return 'назначил(а)';
  return action.replace(/_/g, ' ').toLowerCase();
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Доброе утро,';
  if (h < 18) return 'Добрый день,';
  return 'Добрый вечер,';
}

// ─── Inline SVG icons (exact from Paper main content JSX) ────────────────────
const IcoProjects = () => (
  <svg width="14" height="14" fill="none" viewBox="0 0 14 14" style={{ flexShrink: 0 }}>
    <rect x="1" y="1" width="5" height="5" rx="1.2" fill="#4F6EF7" />
    <rect x="8" y="1" width="5" height="5" rx="1.2" fill="#4F6EF7" opacity=".5" />
    <rect x="1" y="8" width="5" height="5" rx="1.2" fill="#4F6EF7" opacity=".5" />
    <rect x="8" y="8" width="5" height="5" rx="1.2" fill="#4F6EF7" opacity=".3" />
  </svg>
);
const IcoTasks = () => (
  <svg width="14" height="14" fill="none" viewBox="0 0 14 14" style={{ flexShrink: 0 }}>
    <circle cx="7" cy="7" r="5.5" stroke="#F59E0B" strokeWidth="1.3" />
    <circle cx="7" cy="7" r="2" fill="#F59E0B" />
  </svg>
);
const IcoClock = () => (
  <svg width="14" height="14" fill="none" viewBox="0 0 14 14" style={{ flexShrink: 0 }}>
    <circle cx="7" cy="7" r="5.5" stroke="#6366F1" strokeWidth="1.3" />
    <path d="M7 4v3l2 2" stroke="#6366F1" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);
const IcoBug = () => (
  <svg width="14" height="14" fill="none" viewBox="0 0 14 14" style={{ flexShrink: 0 }}>
    <path d="M7 2.5C5.07 2.5 3.5 4.07 3.5 6v2.5C3.5 10.43 5.07 12 7 12s3.5-1.57 3.5-3.5V6C10.5 4.07 8.93 2.5 7 2.5z" stroke="#EF4444" strokeWidth="1.3" />
    <path d="M5 1.5l-1.5 1M9 1.5l1.5 1M2 7h1.5M12 7h-1.5" stroke="#EF4444" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);
const IcoToday = ({ color }: { color: string }) => (
  <svg width="14" height="14" fill="none" viewBox="0 0 14 14" style={{ flexShrink: 0 }}>
    <circle cx="7" cy="7" r="5.5" stroke={color} strokeWidth="1.3" />
    <path d="M7 4.5v2.5l1.5 1.5" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);

// ─── Stat card ────────────────────────────────────────────────────────────────
type TokenSet = typeof DARK_C;
function StatCard({ label, value, sub, subColor, iconBg, Icon, C }: {
  label: string; value: string | number; sub: string;
  subColor: string; iconBg: string; Icon: React.FC; C: TokenSet;
}) {
  return (
    // Paper: grow shrink basis-[0%] flex flex-col rounded-xl py-5 px-5.5 gap-2.5 bg-[#0F1320] border border-[#21262D]
    <div style={{ flex: '1 1 0', display: 'flex', flexDirection: 'column', borderRadius: 12, padding: '20px 22px', gap: 10, background: C.bgCard, border: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: C.t3, fontFamily: F.sans, fontSize: 12, lineHeight: '16px', flexShrink: 0 }}>{label}</span>
        {/* Paper: flex items-center justify-center rounded-[7px] size-7 */}
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, background: iconBg, width: 28, height: 28, flexShrink: 0 }}>
          <Icon />
        </span>
      </div>
      <div>
        {/* Paper: tracking-[-0.03em] text-[28px]/8.5 */}
        <div style={{ color: C.t1, fontFamily: F.display, fontWeight: 700, fontSize: 28, lineHeight: '34px', letterSpacing: '-0.03em' }}>{value}</div>
        {/* Paper: text-[11px]/3.5 */}
        <div style={{ color: subColor, fontFamily: F.sans, fontSize: 11, lineHeight: '14px' }}>{sub}</div>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const navigate = useNavigate();
  const { projects, loading, fetchProjects } = useProjectsStore();
  const { user } = useAuthStore();
  const { mode } = useThemeStore();
  const C = mode === 'light' ? LIGHT_C : DARK_C;
  const [adminStats, setAdminStats] = useState<adminApi.AdminStats | null>(null);
  const [myIssues,   setMyIssues]   = useState<Issue[]>([]);
  const [statsReady, setStatsReady] = useState(false);
  // TTMP-160 FR-12 filter — when the TopBar badge link opens the page, show only at-risk.
  const [searchParams, setSearchParams] = useSearchParams();
  const atRiskMode = searchParams.get('filter') === 'my-checkpoint-violations';
  const [atRiskIssues, setAtRiskIssues] = useState<IssueViolationSummary[]>([]);
  const [atRiskLoading, setAtRiskLoading] = useState(false);
  const [atRiskError, setAtRiskError] = useState(false);

  // ─── Status / Priority config (depends on C) ──────────────────────────────
  const STATUS: Record<IssueStatus, { label: string; bg: string; color: string }> = {
    OPEN:        { label: 'Открыта',    bg: `${C.t3}1A`,    color: C.t3    },
    IN_PROGRESS: { label: 'В работе',   bg: `${C.amber}1A`, color: C.amber },
    REVIEW:      { label: 'Ревью',      bg: `${C.purple}1A`,color: C.purple},
    DONE:        { label: 'Готово',     bg: `${C.green}1A`, color: C.green },
    CANCELLED:   { label: 'Отменена',   bg: `${C.t3}1A`,    color: C.t3    },
  };
  const PRIORITY_COLOR: Record<IssuePriority, string> = {
    CRITICAL: C.red,
    HIGH:     C.amber,
    MEDIUM:   C.t3,
    LOW:      C.t3,
  };

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  useEffect(() => {
    if (statsReady || !user) return;
    void (async () => {
      try { setAdminStats(await adminApi.getStats()); }
      catch { /* server enforces role, fail silently */ }
      finally { setStatsReady(true); }
    })();
  }, [user, statsReady]);

  useEffect(() => {
    if (!user || projects.length === 0) return;
    void (async () => {
      try {
        const chunks = await Promise.all(
          projects.map(p => issuesApi.listAllIssues(p.id, { assigneeId: user.id }))
        );
        setMyIssues(
          chunks.flat()
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
            .slice(0, 5)
        );
      } catch { /* non-critical */ }
    })();
  }, [user, projects]);

  // TTMP-160 FR-12: load at-risk list when the filter is active. Refresh on mode switch.
  useEffect(() => {
    if (!atRiskMode) return;
    setAtRiskLoading(true);
    setAtRiskError(false);
    void (async () => {
      try {
        setAtRiskIssues(await getMyCheckpointViolations());
      } catch {
        setAtRiskError(true);
        setAtRiskIssues([]);
      } finally {
        setAtRiskLoading(false);
      }
    })();
  }, [atRiskMode]);

  const projectKeyMap = useMemo(
    () => Object.fromEntries(projects.map(p => [p.id, p.key])),
    [projects]
  );

  if (loading) return <LoadingSpinner />;

  const reviewCount = adminStats?.issuesByStatus?.find(s => s.status === 'REVIEW')?._count._all ?? 0;
  const userCount   = adminStats?.counts?.users ?? 0;
  const timeCount   = adminStats?.counts?.timeLogs ?? 0;

  return (
    // Paper: grow shrink basis-[0%] flex flex-col overflow-clip antialiased text-xs/4
    <div style={{ flex: '1 1 0', display: 'flex', flexDirection: 'column', overflow: 'hidden', WebkitFontSmoothing: 'antialiased', fontFamily: F.sans, fontSize: 12, lineHeight: '16px' }}>

      {/* ── Header — Paper: flex items-start justify-between pt-7 pb-5 border-b-[#161B22] px-8 */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', paddingTop: 28, paddingBottom: 20, paddingLeft: 32, paddingRight: 32, borderBottom: `1px solid ${C.borderHd}` }}>
        <div>
          {/* Paper: mt-0 mb-1 text-[#484F58] text-xs/4 mx-0 */}
          <div style={{ color: C.t4, fontFamily: F.sans, fontSize: 12, lineHeight: '16px', marginBottom: 4 }}>
            {greeting()}
          </div>
          {/* Paper: tracking-[-0.03em] text-[#E2E8F8] font-bold text-[26px]/8 */}
          <div style={{ color: C.t1, fontFamily: F.display, fontWeight: 700, fontSize: 26, lineHeight: '32px', letterSpacing: '-0.03em' }}>
            {user?.name ?? ''}
          </div>
        </div>
        {/* Paper: flex items-center mt-1.5 gap-2 */}
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 6, gap: 8 }}>
          {/* "Сегодня" — Paper: flex items-center rounded-lg py-1.75 px-3.5 gap-1.5 bg-[#161B22] border-[#21262D] */}
          <div style={{ display: 'flex', alignItems: 'center', borderRadius: 8, padding: '7px 14px', gap: 6, background: C.todayBg, border: `1px solid ${C.border}` }}>
            <IcoToday color={C.t3} />
            <span style={{ color: C.t3, fontFamily: F.sans, fontSize: 12, lineHeight: '16px', flexShrink: 0 }}>Сегодня</span>
          </div>
          {/* "+ Новая задача" — Paper: rounded-lg py-1.75 px-3.5 gradient bg */}
          <button
            onClick={() => navigate('/projects')}
            style={{ display: 'flex', alignItems: 'center', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', backgroundImage: 'linear-gradient(in oklab 135deg, oklab(59.3% -0.002 -0.207) 0%, oklab(54.1% 0.096 -0.227) 100%)', color: '#fff', fontFamily: F.sans, fontSize: 12, lineHeight: '16px', fontWeight: 500 }}
          >
            + Новая задача
          </button>
        </div>
      </div>

      {/* ── Stat cards — Paper: flex py-5 px-8 gap-4 */}
      <div style={{ display: 'flex', paddingTop: 20, paddingBottom: 20, paddingLeft: 32, paddingRight: 32, gap: 16 }}>
        <StatCard label="Всего проектов"  value={projects.length}               sub={`${adminStats?.counts?.issues ?? 0} задач`}                       subColor={C.green} iconBg="#4F6EF71F" Icon={IcoProjects} C={C} />
        <StatCard label="Активных задач"  value={adminStats?.counts?.issues ?? 0}  sub={reviewCount > 0 ? `${reviewCount} в ревью` : 'нет данных'}        subColor={C.amber} iconBg="#F59E0B1F" Icon={IcoTasks}    C={C} />
        <StatCard label="Пользователей"   value={userCount}                      sub="в системе"                                                          subColor={C.green} iconBg="#6366F11F" Icon={IcoClock}   C={C} />
        <StatCard label="Записей времени" value={timeCount}                      sub={timeCount > 0 ? 'всего' : 'нет данных'}                             subColor={C.red}   iconBg="#EF44441F" Icon={IcoBug}     C={C} />
      </div>

      {/* ── Bottom two columns — Paper: grow shrink basis-[0%] flex min-h-0 pb-6 gap-4 px-8 */}
      <div style={{ flex: '1 1 0', display: 'flex', minHeight: 0, paddingBottom: 24, gap: 16, paddingLeft: 32, paddingRight: 32 }}>

        {/* Issues panel — Paper: grow-[1.6] shrink basis-[0%] flex flex-col rounded-xl overflow-clip bg-[#0F1320] border-[#21262D] */}
        <div style={{ flex: '1.6 1 0', display: 'flex', flexDirection: 'column', borderRadius: 12, overflow: 'hidden', background: C.bgCard, border: `1px solid ${C.border}` }}>

          {/* Panel header — Paper: flex items-center justify-between py-4 px-5 border-b-[#161B22] */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${C.borderHd}`, gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: C.t1, fontFamily: F.display, fontWeight: 600, fontSize: 14, lineHeight: '18px', flexShrink: 0 }}>
                {atRiskMode ? 'Мои задачи с нарушенными КТ' : 'Мои задачи'}
              </span>
              {/* TTMP-160 FR-12 filter toggle */}
              {(() => {
                const toggleAtRisk = () => {
                  const next = new URLSearchParams(searchParams);
                  if (atRiskMode) next.delete('filter');
                  else next.set('filter', 'my-checkpoint-violations');
                  setSearchParams(next);
                };
                return (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={toggleAtRisk}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleAtRisk();
                      }
                    }}
                    style={{
                      color: atRiskMode ? C.red : C.t3,
                      fontFamily: F.sans,
                      fontSize: 11,
                      lineHeight: '14px',
                      cursor: 'pointer',
                      border: `1px solid ${atRiskMode ? C.red : C.border}`,
                      borderRadius: 10,
                      padding: '2px 8px',
                    }}
                    aria-pressed={atRiskMode}
                    aria-label={atRiskMode ? 'Выключить фильтр «в риске»' : 'Показать только задачи в риске'}
                  >
                    {atRiskMode ? '× В риске' : 'В риске'}
                  </span>
                );
              })()}
            </div>
            <span role="button" onClick={() => navigate('/projects')} style={{ color: C.acc, fontFamily: F.sans, fontSize: 11, lineHeight: '14px', flexShrink: 0, cursor: 'pointer' }}>
              Все задачи →
            </span>
          </div>

          {/* Column headers — Paper: flex items-center py-2 px-5 gap-2 border-b-[#161B22] */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '8px 20px', gap: 8, borderBottom: `1px solid ${C.borderHd}` }}>
            {/* Paper: uppercase tracking-[0.5px] text-[#484F58] font-semibold text-[10px]/3 */}
            {[
              { label: 'Ключ',      w: 80,  flex: false },
              { label: 'Задача',    w: 0,   flex: true  },
              { label: 'Статус',    w: 90,  flex: false },
              { label: 'Приоритет', w: 70,  flex: false },
            ].map(col => (
              <div key={col.label} style={{ ...(col.flex ? { flex: 1 } : { width: col.w, flexShrink: 0 }), color: C.t4, fontFamily: F.sans, fontWeight: 600, fontSize: 10, lineHeight: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {col.label}
              </div>
            ))}
          </div>

          {/* Rows — at-risk mode renders the violation list directly. */}
          {atRiskMode ? (
            atRiskLoading ? (
              <div style={{ padding: '16px 20px', color: C.t3, fontFamily: F.sans, fontSize: 12 }}>Загрузка…</div>
            ) : atRiskError ? (
              <div style={{ padding: '16px 20px', color: C.red, fontFamily: F.sans, fontSize: 12 }}>
                Не удалось загрузить список задач. Попробуйте обновить страницу.
              </div>
            ) : atRiskIssues.length === 0 ? (
              <div style={{ padding: '16px 20px', color: C.t3, fontFamily: F.sans, fontSize: 12 }}>
                У вас нет задач с нарушенными контрольными точками. 🎉
              </div>
            ) : (
              atRiskIssues.map((it, idx) => {
                const isLast = idx === atRiskIssues.length - 1;
                const firstViolation = it.violations[0];
                return (
                  <div
                    key={it.issueId}
                    onClick={() => navigate(`/issues/${it.issueId}`)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '10px 20px',
                      gap: 8,
                      borderBottom: isLast ? 'none' : `1px solid ${C.borderRw}`,
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.025)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ width: 80, flexShrink: 0, color: C.indigo, fontFamily: F.display, fontWeight: 600, fontSize: 11, lineHeight: '14px' }}>
                      {it.issueKey}
                    </div>
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div style={{ color: C.t2, fontFamily: F.sans, fontSize: 12, lineHeight: '16px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {it.issueTitle}
                      </div>
                      {firstViolation && (
                        <div style={{ color: C.red, fontFamily: F.sans, fontSize: 11, lineHeight: '14px', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {firstViolation.checkpointName} — {firstViolation.reason}
                        </div>
                      )}
                    </div>
                    <div style={{ width: 120, flexShrink: 0, color: C.red, fontFamily: F.sans, fontSize: 10, lineHeight: '12px' }}>
                      {it.violations.length}{' '}
                      {pluralize(it.violations.length, 'нарушение', 'нарушения', 'нарушений')}
                    </div>
                  </div>
                );
              })
            )
          ) : myIssues.length === 0 ? (
            <div style={{ padding: '16px 20px', color: C.t3, fontFamily: F.sans, fontSize: 12 }}>
              Нет задач, назначенных на вас
            </div>
          ) : (
            myIssues.map((issue, idx) => {
              const pKey  = issue.project?.key ?? projectKeyMap[issue.projectId];
              const key   = pKey ? `${pKey}-${issue.number}` : `#${issue.number}`;
              const st    = STATUS[issue.status] ?? STATUS.OPEN;
              const isLast = idx === myIssues.length - 1;
              return (
                // Paper: flex items-center py-2.5 px-5 gap-2 border-b-[#0D1017]
                <div
                  key={issue.id}
                  onClick={() => navigate(`/issues/${issue.id}`)}
                  style={{ display: 'flex', alignItems: 'center', padding: '10px 20px', gap: 8, borderBottom: isLast ? 'none' : `1px solid ${C.borderRw}`, cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.025)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* Paper: w-20 text-[#6366F1] font-['Space_Grotesk'] font-semibold text-[11px]/3.5 */}
                  <div style={{ width: 80, flexShrink: 0, color: C.indigo, fontFamily: F.display, fontWeight: 600, fontSize: 11, lineHeight: '14px' }}>{key}</div>
                  {/* Paper: grow shrink basis-[0%] inline-block overflow-clip line-clamp-1 text-[#C9D1D9] text-xs/4 */}
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ color: C.t2, fontFamily: F.sans, fontSize: 12, lineHeight: '16px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{issue.title}</div>
                  </div>
                  {/* Paper: w-22.5 — status pill: rounded-[20px] py-0.75 px-2 */}
                  <div style={{ width: 90, flexShrink: 0 }}>
                    <span style={{ display: 'inline-block', borderRadius: 20, padding: '3px 8px', background: st.bg, color: st.color, fontFamily: F.sans, fontSize: 10, lineHeight: '12px' }}>
                      {st.label}
                    </span>
                  </div>
                  {/* Paper: w-17.5 text-[11px]/3.5 */}
                  <div style={{ width: 70, flexShrink: 0, color: PRIORITY_COLOR[issue.priority] ?? C.t3, fontFamily: F.sans, fontSize: 11, lineHeight: '14px' }}>
                    {issue.priority}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Activity panel — Paper: grow shrink basis-[0%] flex flex-col rounded-xl overflow-clip bg-[#0F1320] border-[#21262D] */}
        <div style={{ flex: '1 1 0', display: 'flex', flexDirection: 'column', borderRadius: 12, overflow: 'hidden', background: C.bgCard, border: `1px solid ${C.border}` }}>

          {/* Panel header — Paper: py-4 px-5 border-b-[#161B22] */}
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.borderHd}` }}>
            {/* Paper: text-[#E2E8F8] font-['Space_Grotesk'] font-semibold text-sm/4.5 */}
            <span style={{ color: C.t1, fontFamily: F.display, fontWeight: 600, fontSize: 14, lineHeight: '18px' }}>Последние события</span>
          </div>

          {/* Activity items — Paper: flex flex-col py-3 px-5 overflow-clip gap-4 */}
          <div style={{ display: 'flex', flexDirection: 'column', padding: '12px 20px', gap: 16, overflow: 'hidden' }}>
            {!adminStats || adminStats.recentActivity.length === 0 ? (
              <div style={{ color: C.t3, fontFamily: F.sans, fontSize: 12 }}>Нет событий</div>
            ) : (
              adminStats.recentActivity.slice(0, 6).map((ev, idx) => {
                const name   = ev.user?.name ?? 'Система';
                const ini    = initials(name);
                const grad   = avatarGradient(name);
                const isLast = idx === Math.min(adminStats.recentActivity.length, 6) - 1;
                const verb   = formatAction(ev.action);
                return (
                  // Paper: flex gap-3
                  <div key={ev.id} style={{ display: 'flex', gap: 12, paddingBottom: isLast ? 0 : 16, borderBottom: isLast ? 'none' : `1px solid ${C.borderRw}` }}>
                    {/* Avatar — Paper: w-6.5 h-6.5 flex items-center justify-center shrink-0 mt-px rounded-[50%] */}
                    <div style={{ width: 26, height: 26, minWidth: 26, borderRadius: '50%', backgroundImage: grad, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                      {/* Paper: text-white font-['Space_Grotesk'] font-bold text-[9px]/3 */}
                      <span style={{ color: '#fff', fontFamily: F.display, fontWeight: 700, fontSize: 9, lineHeight: '12px' }}>{ini}</span>
                    </div>
                    {/* Text — Paper: grow shrink basis-[0%] min-w-0 */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Paper: mt-0 mb-0.5 mx-0 */}
                      <div style={{ marginBottom: 2 }}>
                        {/* Paper: text-[12px] leading-[140%] text-[#E2E8F8] font-medium */}
                        <span style={{ fontFamily: F.sans, fontWeight: 500, fontSize: 12, lineHeight: '1.4', color: C.t1 }}>{name}</span>
                        {' '}
                        {/* Paper: text-[12px] leading-[140%] text-[#C9D1D9] */}
                        <span style={{ fontFamily: F.sans, fontSize: 12, lineHeight: '1.4', color: C.t2 }}>{verb}</span>
                        {' '}
                        {/* Paper: text-[11px] text-[#6366F1] font-['Space_Grotesk'] font-semibold */}
                        <span style={{ fontFamily: F.display, fontWeight: 600, fontSize: 11, lineHeight: '1.4', color: C.indigo }}>{ev.entityType}</span>
                      </div>
                      {/* Paper: text-[#484F58] text-[10px]/3 */}
                      <div style={{ color: C.t4, fontFamily: F.sans, fontSize: 10, lineHeight: '12px' }}>{timeAgo(ev.createdAt)}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
