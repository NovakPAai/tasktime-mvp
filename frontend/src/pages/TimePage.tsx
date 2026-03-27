/**
 * TimePage — rebuilt from Paper artboards 2RY-0 (Dark) + 2WD-0 (Light).
 * Zero CSS classes, zero Ant Design layout. Dual-theme pattern.
 */
import { useEffect, useMemo, useState } from 'react';
import { message, Select } from 'antd';
import { Link } from 'react-router-dom';
import * as timeApi from '../api/time';
import { useAuthStore } from '../store/auth.store';
import { useThemeStore } from '../store/theme.store';
import type { TimeLog, UserTimeSummary } from '../types';

// ─── Constants ────────────────────────────────────────────────────────────────
const LOGO_GRAD =
  'linear-gradient(in oklab 135deg, oklab(59.3% -0.002 -0.207) 0%, oklab(54.1% 0.096 -0.227) 100%)';

// ─── Tokens Dark (Paper 2RY-0) ────────────────────────────────────────────────
const DARK_C = {
  bg:          '#080B14',
  bgCard:      '#0F1320',
  bgRow:       '#080B14',
  bgRowAlt:    '#0F1320',
  bgRowHover:  '#141928',
  border:      '#1E2640',
  borderInner: '#0D1017',
  t1:          '#E2E8F8',
  t2:          '#C9D1D9',
  t3:          '#8B949E',
  t4:          '#484F58',
  acc:         '#4F6EF7',
  accKey:      '#6366F1',
  green:       '#4ADE80',
  amber:       '#F59E0B',
  timerBorder: '#4F6EF7',
  stopBg:      'rgba(207, 34, 46, 0.08)',
  stopBorder:  'rgba(207, 34, 46, 0.25)',
  stopText:    '#F85149',
  aiBadgeBg:   'rgba(163, 139, 250, 0.12)',
  aiBadgeText: '#A78BFA',
  humanBg:     'rgba(79, 110, 247, 0.12)',
  humanText:   '#4F6EF7',
};

// ─── Tokens Light (Paper 2WD-0) ───────────────────────────────────────────────
const LIGHT_C = {
  bg:          '#F0F2FA',
  bgCard:      '#FFFFFF',
  bgRow:       '#FFFFFF',
  bgRowAlt:    '#F8F9FC',
  bgRowHover:  '#F0F2FA',
  border:      '#D0D7DE',
  borderInner: '#E8EBF0',
  t1:          '#1F2328',
  t2:          '#3D444D',
  t3:          '#656D76',
  t4:          '#9198A1',
  acc:         '#4F6EF7',
  accKey:      '#4F6EF7',
  green:       '#1A7F37',
  amber:       '#9A6700',
  timerBorder: '#4F6EF7',
  stopBg:      'rgba(207, 34, 46, 0.08)',
  stopBorder:  'rgba(207, 34, 46, 0.25)',
  stopText:    '#CF222E',
  aiBadgeBg:   'rgba(138, 75, 215, 0.08)',
  aiBadgeText: '#6F42C1',
  humanBg:     'rgba(79, 110, 247, 0.08)',
  humanText:   '#4F6EF7',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function emptySummary(userId?: string): UserTimeSummary {
  return { userId: userId ?? '', humanHours: 0, agentHours: 0, totalHours: 0, agentCost: 0 };
}

function getBusinessDateText(logDate: string): string {
  return logDate.slice(0, 10);
}

function getBusinessDate(logDate: string): Date {
  return new Date(`${getBusinessDateText(logDate)}T00:00:00`);
}

function formatHoursMin(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}м`;
  if (m === 0) return `${h}ч`;
  return `${h}ч ${m}м`;
}

type Period = 'today' | 'week' | 'month' | 'all';

const PERIOD_LABELS: Record<Period, string> = {
  today: 'Сегодня',
  week:  'Неделя',
  month: 'Месяц',
  all:   'Всё время',
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function TimePage() {
  const { user } = useAuthStore();
  const { mode } = useThemeStore();
  const C = mode === 'light' ? LIGHT_C : DARK_C;

  const [logs, setLogs]       = useState<TimeLog[]>([]);
  const [summary, setSummary] = useState<UserTimeSummary>(emptySummary());
  const [active, setActive]   = useState<TimeLog | null>(null);
  const [elapsed, setElapsed] = useState('00:00:00');
  const [period, setPeriod]   = useState<Period>('week');
  const [projectKey, setProjectKey] = useState<string | 'all'>('all');
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  const loadUserLogs = async (userId: string) => {
    try {
      const nextLogs = await timeApi.getUserLogs(userId);
      setLogs(nextLogs);
    } catch {
      message.error('Failed to load time logs');
    }
  };

  const loadUserSummary = async (userId: string) => {
    try {
      const nextSummary = await timeApi.getUserTimeSummary(userId);
      setSummary(nextSummary);
    } catch {
      setSummary(emptySummary(userId));
    }
  };

  useEffect(() => {
    if (user) {
      setSummary(emptySummary(user.id));
      void loadUserLogs(user.id);
      void loadUserSummary(user.id);
      void timeApi.getActiveTimer().then(setActive);
    }
  }, [user]);

  // Live timer
  useEffect(() => {
    if (!active?.startedAt) return;
    const iv = setInterval(() => {
      const diff = Date.now() - new Date(active.startedAt!).getTime();
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setElapsed(
        `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`,
      );
    }, 1000);
    return () => clearInterval(iv);
  }, [active]);

  const handleStop = async () => {
    if (!active) return;
    try {
      await timeApi.stopTimer(active.issueId);
      setActive(null);
      if (user) {
        await Promise.all([loadUserLogs(user.id), loadUserSummary(user.id)]);
      }
      message.success('Таймер остановлен');
    } catch {
      message.error('Ошибка');
    }
  };

  const filteredLogs = useMemo(() => {
    const now = new Date();
    let from: Date | null = null;
    if (period === 'today') {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (period === 'week') {
      from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === 'month') {
      from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
    return logs.filter((log) => {
      if (from && getBusinessDate(log.logDate) < from) return false;
      if (projectKey !== 'all') {
        const key = log.issue?.project?.key;
        if (!key || key !== projectKey) return false;
      }
      return true;
    });
  }, [logs, period, projectKey]);

  const projectOptions = useMemo(() => {
    const keys = Array.from(
      new Set(logs.map((l) => l.issue?.project?.key).filter((k): k is string => Boolean(k))),
    ).sort();
    return keys.map((key) => ({ label: key, value: key }));
  }, [logs]);

  // Period total hours
  const periodHours = useMemo(
    () => filteredLogs.reduce((sum, l) => sum + (Number(l.hours) || 0), 0),
    [filteredLogs],
  );

  // ─── Styles ─────────────────────────────────────────────────────────────────
  const colStyles = {
    date:  { width: 100, flexShrink: 0 },
    issue: { flex: 1, minWidth: 0 },
    who:   { width: 90,  flexShrink: 0 },
    time:  { width: 80,  flexShrink: 0, textAlign: 'right' as const },
  };

  return (
    <div style={{
      width:      '100%',
      minHeight:  '100vh',
      background: C.bg,
      paddingInline: 28,
      paddingTop:    20,
      paddingBottom: 40,
      boxSizing:     'border-box',
      display:       'flex',
      flexDirection: 'column',
      gap:           16,
    }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{
          margin:        0,
          fontFamily:    'Space Grotesk, sans-serif',
          fontSize:      20,
          fontWeight:    700,
          color:         C.t1,
          letterSpacing: '-0.02em',
        }}>
          Моё время
        </h1>
      </div>

      {/* ── Active timer card ── */}
      {active && (
        <div style={{
          background:   C.bgCard,
          border:       `1px solid ${C.border}`,
          borderLeft:   `3px solid ${C.timerBorder}`,
          borderRadius: 12,
          padding:      '16px 20px',
          display:      'flex',
          alignItems:   'center',
          gap:          16,
        }}>
          {/* Clock */}
          <div>
            <div style={{
              fontFamily: 'Space Grotesk, sans-serif',
              fontSize:   28,
              fontWeight: 700,
              color:      C.t1,
              lineHeight: 1,
              letterSpacing: '-0.02em',
            }}>
              {elapsed}
            </div>
            {active.issue && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                <Link
                  to={`/issues/${active.issue.id}`}
                  style={{
                    fontFamily:  'Space Grotesk, sans-serif',
                    fontSize:    11,
                    fontWeight:  600,
                    color:       C.accKey,
                    textDecoration: 'none',
                  }}
                >
                  {active.issue.project?.key}-{active.issue.number}
                </Link>
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: C.t2 }}>
                  {active.issue.title}
                </span>
              </div>
            )}
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {/* Stop button */}
            <button
              onClick={handleStop}
              style={{
                background:   C.stopBg,
                border:       `1px solid ${C.stopBorder}`,
                borderRadius: 8,
                paddingBlock: 6,
                paddingInline: 14,
                fontFamily:   'Inter, sans-serif',
                fontSize:     12,
                fontWeight:   500,
                color:        C.stopText,
                cursor:       'pointer',
                display:      'flex',
                alignItems:   'center',
                gap:          6,
              }}
            >
              ■ Остановить
            </button>
          </div>
        </div>
      )}

      {/* ── Filters row ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {/* Period tabs */}
        <div style={{
          display:      'flex',
          background:   C.bgCard,
          border:       `1px solid ${C.border}`,
          borderRadius: 8,
          padding:      3,
          gap:          2,
        }}>
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => {
            const isActive = p === period;
            return (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                style={{
                  background:   isActive ? LOGO_GRAD : 'transparent',
                  border:       'none',
                  borderRadius: 6,
                  paddingBlock: 5,
                  paddingInline: 12,
                  fontFamily:   'Inter, sans-serif',
                  fontSize:     12,
                  fontWeight:   isActive ? 600 : 400,
                  color:        isActive ? '#FFFFFF' : C.t3,
                  cursor:       'pointer',
                  transition:   'all 0.15s',
                  whiteSpace:   'nowrap',
                }}
              >
                {PERIOD_LABELS[p]}
              </button>
            );
          })}
        </div>

        {/* Project filter */}
        <Select
          size="small"
          placeholder="Все проекты"
          value={projectKey}
          onChange={(value) => setProjectKey(value)}
          style={{ minWidth: 140 }}
          options={[{ label: 'Все проекты', value: 'all' }, ...projectOptions]}
        />

        {/* Period stats */}
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div style={{
            fontFamily:  'Space Grotesk, sans-serif',
            fontSize:    20,
            fontWeight:  700,
            color:       C.t1,
            lineHeight:  1,
          }}>
            {formatHoursMin(periodHours)}
          </div>
          <div style={{
            fontFamily: 'Inter, sans-serif',
            fontSize:   11,
            fontWeight: 400,
            color:      C.t3,
            marginTop:  2,
          }}>
            {PERIOD_LABELS[period]}
          </div>
        </div>
      </div>

      {/* ── Summary stat pills ── */}
      <div style={{ display: 'flex', gap: 10 }}>
        {[
          { label: 'Человек',   value: formatHoursMin(summary.humanHours) },
          { label: 'AI',        value: formatHoursMin(summary.agentHours) },
          { label: 'Всего',     value: formatHoursMin(summary.totalHours) },
          { label: 'AI стоимость', value: `$${summary.agentCost.toFixed(4)}` },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              background:   C.bgCard,
              border:       `1px solid ${C.border}`,
              borderRadius: 10,
              padding:      '10px 16px',
              flex:         1,
            }}
          >
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, color: C.t3, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
              {stat.label}
            </div>
            <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 18, fontWeight: 700, color: C.t1 }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Table card ── */}
      <div style={{
        background:   C.bgCard,
        border:       `1px solid ${C.border}`,
        borderRadius: 12,
        overflow:     'hidden',
      }}>
        {/* Table header */}
        <div style={{
          display:       'flex',
          alignItems:    'center',
          gap:           8,
          paddingBlock:  8,
          paddingInline: 20,
          borderBottom:  `1px solid ${C.border}`,
        }}>
          {[
            { label: 'ДАТА',    style: colStyles.date },
            { label: 'ЗАДАЧА',  style: colStyles.issue },
            { label: 'КТО',     style: colStyles.who },
            { label: 'ВРЕМЯ',   style: colStyles.time },
          ].map((col) => (
            <div
              key={col.label}
              style={{
                ...col.style,
                fontFamily:    'Inter, sans-serif',
                fontSize:      10,
                fontWeight:    600,
                color:         C.t4,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              {col.label}
            </div>
          ))}
        </div>

        {/* Rows */}
        {filteredLogs.length === 0 ? (
          <div style={{
            padding:    '32px 20px',
            textAlign:  'center',
            fontFamily: 'Inter, sans-serif',
            fontSize:   13,
            color:      C.t3,
          }}>
            Нет записей за выбранный период
          </div>
        ) : (
          filteredLogs.map((log, idx) => {
            const isHovered = hoveredRow === log.id;
            const isAlt = idx % 2 === 1;
            const rowBg = isHovered ? C.bgRowHover : (isAlt ? C.bgRowAlt : C.bgRow);
            const issueKey = log.issue ? `${log.issue.project?.key}-${log.issue.number}` : null;
            const isAgent = log.source === 'AGENT';

            return (
              <div
                key={log.id}
                onMouseEnter={() => setHoveredRow(log.id)}
                onMouseLeave={() => setHoveredRow(null)}
                style={{
                  display:       'flex',
                  alignItems:    'center',
                  gap:           8,
                  paddingBlock:  9,
                  paddingInline: 20,
                  background:    rowBg,
                  borderBottom:  `1px solid ${C.borderInner}`,
                  transition:    'background 0.1s',
                  minHeight:     44,
                  boxSizing:     'border-box',
                }}
              >
                {/* Date */}
                <div style={{ ...colStyles.date, fontFamily: 'Space Grotesk, sans-serif', fontSize: 11, fontWeight: 500, color: C.t3 }}>
                  {getBusinessDateText(log.logDate)}
                </div>

                {/* Issue */}
                <div style={{ ...colStyles.issue, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  {issueKey && log.issue ? (
                    <>
                      <Link
                        to={`/issues/${log.issue.id}`}
                        style={{
                          fontFamily:     'Space Grotesk, sans-serif',
                          fontSize:       11,
                          fontWeight:     600,
                          color:          C.accKey,
                          textDecoration: 'none',
                          flexShrink:     0,
                        }}
                      >
                        {issueKey}
                      </Link>
                      <span style={{
                        fontFamily: 'Inter, sans-serif',
                        fontSize:   12,
                        color:      C.t2,
                        overflow:   'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {log.issue.title}
                      </span>
                    </>
                  ) : (
                    <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: C.t3 }}>—</span>
                  )}
                  {log.note && (
                    <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: C.t4, flexShrink: 0 }}>
                      · {log.note}
                    </span>
                  )}
                </div>

                {/* Who */}
                <div style={colStyles.who}>
                  <span style={{
                    display:      'inline-flex',
                    alignItems:   'center',
                    borderRadius: 20,
                    paddingBlock: 3,
                    paddingInline: 8,
                    fontFamily:  'Inter, sans-serif',
                    fontSize:    10,
                    fontWeight:  600,
                    background:  isAgent ? C.aiBadgeBg  : C.humanBg,
                    color:       isAgent ? C.aiBadgeText : C.humanText,
                  }}>
                    {isAgent ? 'AI' : 'Human'}
                  </span>
                </div>

                {/* Time */}
                <div style={{ ...colStyles.time, fontFamily: 'Space Grotesk, sans-serif', fontSize: 13, fontWeight: 600, color: C.t1 }}>
                  {Number(log.hours).toFixed(2)}ч
                </div>
              </div>
            );
          })
        )}

        {/* Footer */}
        {filteredLogs.length > 0 && (
          <div style={{
            display:       'flex',
            alignItems:    'center',
            justifyContent: 'space-between',
            paddingBlock:  10,
            paddingInline: 20,
            borderTop:     `1px solid ${C.border}`,
          }}>
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: C.t3 }}>
              {filteredLogs.length} {filteredLogs.length !== logs.length ? `из ${logs.length}` : ''} записей
            </span>
            <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 13, fontWeight: 600, color: C.t1 }}>
              {formatHoursMin(periodHours)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
