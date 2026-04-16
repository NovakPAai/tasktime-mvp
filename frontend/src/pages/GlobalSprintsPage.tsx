/**
 * GlobalSprintsPage — rebuilt from Paper artboards 2HH-0 (Dark) + 2MD-0 (Light).
 * Zero CSS classes, zero Ant Design layout. Dual-theme pattern.
 */
import { useEffect, useState, useMemo, useCallback } from 'react';
import { Select } from 'antd';
import { useAuthStore } from '../store/auth.store';
import { useThemeStore } from '../store/theme.store';
import type { Project, Sprint, SprintState, Team } from '../types';
import apiClient from '../api/client';
import * as sprintsApi from '../api/sprints';
import * as teamsApi from '../api/teams';
import SprintIssuesDrawer from '../components/sprints/SprintIssuesDrawer';

// ─── Constants ────────────────────────────────────────────────────────────────
const LOGO_GRAD =
  'linear-gradient(in oklab 135deg, oklab(59.3% -0.002 -0.207) 0%, oklab(54.1% 0.096 -0.227) 100%)';

// ─── Tokens Dark (Paper 2HH-0) ────────────────────────────────────────────────
const DARK_C = {
  bg:           '#080B14',
  bgCard:       '#0F1320',
  bgCardClosed: '#0F1320',
  bgNewCard:    'transparent',
  border:       '#1E2640',
  borderDash:   '#1E2640',
  t1:           '#E2E8F8',
  t2:           '#C9D1D9',
  t3:           '#8B949E',
  t4:           '#484F58',
  acc:          '#4F6EF7',
  green:        '#4ADE80',
  accentActive:   '#4ADE80',
  accentPlanned:  '#484F58',
  accentClosed:   '#484F58',
  badgeActiveBg:    '#4ADE801F',
  badgeActiveText:  '#4ADE80',
  badgePlannedBg:   '#484F5833',
  badgePlannedText: '#8B949E',
  badgeClosedBg:    '#484F5833',
  badgeClosedText:  '#484F58',
  progressBg:   '#21262D',
  progressFill: LOGO_GRAD,
  avatarBorder: '#0F1320',
};

// ─── Tokens Light (Paper 2MD-0) ───────────────────────────────────────────────
const LIGHT_C = {
  bg:           '#F6F8FA',
  bgCard:       '#FFFFFF',
  bgCardClosed: '#F6F8FA',
  bgNewCard:    'transparent',
  border:       '#D0D7DE',
  borderDash:   '#D0D7DE',
  t1:           '#1F2328',
  t2:           '#3D444D',
  t3:           '#656D76',
  t4:           '#8C959F',
  acc:          '#4F6EF7',
  green:        '#1A7F37',
  accentActive:   '#1A7F37',
  accentPlanned:  '#8C959F',
  accentClosed:   '#8C959F',
  badgeActiveBg:    '#1A7F371A',
  badgeActiveText:  '#1A7F37',
  badgePlannedBg:   '#8C959F1F',
  badgePlannedText: '#656D76',
  badgeClosedBg:    '#8C959F1F',
  badgeClosedText:  '#8C959F',
  progressBg:   '#D0D7DE',
  progressFill: 'linear-gradient(90deg, #1A7F37 0%, #2DA44E 100%)',
  avatarBorder: '#FFFFFF',
};

// ─── State config ─────────────────────────────────────────────────────────────
const STATE_LABEL_RU: Record<SprintState, string> = {
  PLANNED: 'Планируется',
  ACTIVE:  'Активен',
  CLOSED:  'Закрыт',
};

// ─── Avatar helper ────────────────────────────────────────────────────────────
const AVATAR_GRADS = [
  'linear-gradient(135deg, #4F6EF7, #A78BFA)',
  'linear-gradient(135deg, #F59E0B, #F87171)',
  'linear-gradient(135deg, #4ADE80, #06B6D4)',
  'linear-gradient(135deg, #EC4899, #8B5CF6)',
  'linear-gradient(135deg, #6366F1, #22D3EE)',
];

function avatarGradient(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffff;
  return AVATAR_GRADS[hash % AVATAR_GRADS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function GlobalSprintsPage() {
  const { user } = useAuthStore();
  const { mode } = useThemeStore();
  const C = mode === 'light' ? LIGHT_C : DARK_C;

  const [projects, setProjects]           = useState<Project[]>([]);
  const [teams, setTeams]                 = useState<Team[]>([]);
  const [sprints, setSprints]             = useState<Sprint[]>([]);
  const [stateFilter, setStateFilter]     = useState<'ALL' | SprintState>('ALL');
  const [projectFilter, setProjectFilter] = useState<string | undefined>();
  const [teamFilter, setTeamFilter]       = useState<string | undefined>();
  const [detailsOpen, setDetailsOpen]     = useState(false);
  const [selectedSprintId, setSelectedSprintId] = useState<string | null>(null);

  useEffect(() => {
    async function loadLookups() {
      const [projectsRes, teamsRes] = await Promise.all([
        apiClient.get<Project[]>('/projects'),
        teamsApi.listTeams(),
      ]);
      setProjects(projectsRes.data);
      setTeams(teamsRes);
    }
    loadLookups();
  }, []);

  const loadSprints = useCallback(async () => {
    const page = await sprintsApi.listAllSprints({
      state:     stateFilter === 'ALL' ? undefined : stateFilter,
      projectId: projectFilter,
      teamId:    teamFilter,
    });
    setSprints(page.data);
  }, [stateFilter, projectFilter, teamFilter]);

  useEffect(() => {
    void loadSprints();
  }, [loadSprints]);

  const grouped = useMemo(() => {
    const byState: Record<'PLANNED' | 'ACTIVE' | 'CLOSED', Sprint[]> = {
      PLANNED: [],
      ACTIVE:  [],
      CLOSED:  [],
    };
    for (const s of sprints) byState[s.state].push(s);
    return byState;
  }, [sprints]);

  // ─── Sprint card ─────────────────────────────────────────────────────────────
  const renderSprintCard = (sprint: Sprint) => {
    const state = sprint.state as SprintState;
    const accentColor =
      state === 'ACTIVE'  ? C.accentActive  :
      state === 'PLANNED' ? C.accentPlanned :
      C.accentClosed;
    const badgeBg =
      state === 'ACTIVE'  ? C.badgeActiveBg  :
      state === 'PLANNED' ? C.badgePlannedBg :
      C.badgeClosedBg;
    const badgeText =
      state === 'ACTIVE'  ? C.badgeActiveText  :
      state === 'PLANNED' ? C.badgePlannedText :
      C.badgeClosedText;

    const totalIssues     = sprint.stats?.totalIssues ?? 0;
    const estimatedIssues = sprint.stats?.estimatedIssues ?? 0;
    const readiness       = sprint.stats?.planningReadiness ?? 0;

    const projectLabel = sprint.project
      ? `${sprint.project.key} — ${sprint.project.name}`
      : sprint.projectId;

    // Collect team member names (mock based on project)
    const memberNames: string[] = [];
    if (sprint.projectTeam) memberNames.push(sprint.projectTeam.name);
    if (sprint.businessTeam) memberNames.push(sprint.businessTeam.name);
    if (sprint.flowTeam) memberNames.push(sprint.flowTeam.name);

    return (
      <div
        key={sprint.id}
        style={{
          background:    state === 'CLOSED' ? C.bgCardClosed : C.bgCard,
          opacity:       state === 'CLOSED' && mode === 'light' ? 0.8 : 1,
          border:        `1px solid ${C.border}`,
          borderLeft:    `3px solid ${accentColor}`,
          borderRadius:  10,
          padding:       '18px 20px',
          display:       'flex',
          flexDirection: 'column',
          gap:           12,
          cursor:        'pointer',
        }}
        onClick={() => { setSelectedSprintId(sprint.id); setDetailsOpen(true); }}
      >
        {/* Top row: name + badge + project */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{
                fontFamily:  'Space Grotesk, sans-serif',
                fontSize:    14,
                fontWeight:  700,
                color:       C.t1,
              }}>
                {sprint.name}
              </span>
              <span style={{
                display:      'inline-flex',
                alignItems:   'center',
                borderRadius: 20,
                paddingBlock: 2,
                paddingInline: 7,
                background:   badgeBg,
                color:        badgeText,
                fontFamily:   'Inter, sans-serif',
                fontSize:     9,
                fontWeight:   600,
                textTransform: 'uppercase',
                letterSpacing: '0.3px',
              }}>
                {STATE_LABEL_RU[state]}
              </span>
            </div>
            <div style={{
              fontFamily: 'Inter, sans-serif',
              fontSize:   11,
              color:      C.t3,
              marginTop:  4,
            }}>
              {projectLabel}
            </div>
            {/* Teams */}
            {(sprint.projectTeam || sprint.businessTeam || sprint.flowTeam) && (
              <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                {sprint.projectTeam && (
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, color: C.t4 }}>
                    {sprint.projectTeam.name}
                  </span>
                )}
                {sprint.businessTeam && (
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, color: C.t4 }}>
                    · {sprint.businessTeam.name}
                  </span>
                )}
                {sprint.flowTeam && (
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, color: C.t4 }}>
                    · {sprint.flowTeam.name}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Task count + avatars */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: C.t3 }}>
              {totalIssues} задач
            </span>
            {memberNames.length > 0 && (
              <div style={{ display: 'flex' }}>
                {memberNames.slice(0, 4).map((name, i) => (
                  <div
                    key={name}
                    title={name}
                    style={{
                      width:        20,
                      height:       20,
                      borderRadius: '50%',
                      background:   avatarGradient(name),
                      border:       `1.5px solid ${C.avatarBorder}`,
                      marginLeft:   i === 0 ? 0 : -6,
                      display:      'flex',
                      alignItems:   'center',
                      justifyContent: 'center',
                      fontFamily:   'Space Grotesk, sans-serif',
                      fontSize:     7,
                      fontWeight:   700,
                      color:        '#FFFFFF',
                      flexShrink:   0,
                    }}
                  >
                    {initials(name)}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Progress */}
        {state !== 'PLANNED' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: C.t3 }}>
                Готовность
              </span>
              <span style={{
                fontFamily: 'Space Grotesk, sans-serif',
                fontSize:   12,
                fontWeight: 600,
                color:      C.t1,
              }}>
                {readiness}%
              </span>
            </div>
            <div style={{
              background:   C.progressBg,
              height:       4,
              borderRadius: 3,
              overflow:     'hidden',
            }}>
              <div style={{
                height:       '100%',
                width:        `${readiness}%`,
                background:   C.progressFill,
                borderRadius: 3,
              }} />
            </div>
            {totalIssues > 0 && (
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, color: C.t4, marginTop: 4 }}>
                {estimatedIssues} / {totalIssues} с оценкой
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ─── Section renderer ─────────────────────────────────────────────────────────
  const renderSection = (title: string, items: Sprint[], state: SprintState) => {
    const accentColor =
      state === 'ACTIVE'  ? C.accentActive  :
      state === 'PLANNED' ? C.accentPlanned :
      C.accentClosed;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Section header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: accentColor, flexShrink: 0 }} />
          <span style={{
            fontFamily: 'Space Grotesk, sans-serif',
            fontSize:   13,
            fontWeight: 600,
            color:      C.t1,
          }}>
            {title}
          </span>
          <span style={{
            fontFamily: 'Inter, sans-serif',
            fontSize:   11,
            color:      C.t3,
          }}>
            {items.length}
          </span>
        </div>

        {items.length === 0 ? (
          <div style={{
            background:   C.bgNewCard,
            border:       `2px dashed ${C.borderDash}`,
            borderRadius: 10,
            padding:      '20px',
            textAlign:    'center',
            fontFamily:   'Inter, sans-serif',
            fontSize:     12,
            color:        C.t4,
          }}>
            Нет спринтов
          </div>
        ) : (
          <div style={{
            display:             'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap:                 12,
          }}>
            {items.map(renderSprintCard)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{
      width:         '100%',
      minHeight:     '100vh',
      background:    C.bg,
      paddingInline: 28,
      paddingTop:    20,
      paddingBottom: 40,
      boxSizing:     'border-box',
      display:       'flex',
      flexDirection: 'column',
      gap:           20,
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
          Все спринты
        </h1>
        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: C.t3 }}>
          {user?.name}
        </span>
      </div>

      {/* ── Filters ── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Select
          placeholder="Все состояния"
          value={stateFilter}
          onChange={(v) => setStateFilter(v)}
          style={{ width: 160 }}
          options={[
            { value: 'ALL',     label: 'Все состояния' },
            { value: 'PLANNED', label: 'Планируется' },
            { value: 'ACTIVE',  label: 'Активен' },
            { value: 'CLOSED',  label: 'Закрыт' },
          ]}
        />
        <Select
          allowClear
          placeholder="Все проекты"
          value={projectFilter}
          onChange={(v) => setProjectFilter(v)}
          style={{ width: 200 }}
          options={projects.map((p) => ({ value: p.id, label: `${p.key} — ${p.name}` }))}
        />
        <Select
          allowClear
          placeholder="Все команды"
          value={teamFilter}
          onChange={(v) => setTeamFilter(v)}
          style={{ width: 200 }}
          options={teams.map((t) => ({ value: t.id, label: t.name }))}
        />
      </div>

      {/* ── ACTIVE section ── */}
      {(stateFilter === 'ALL' || stateFilter === 'ACTIVE') &&
        renderSection('Активные', grouped.ACTIVE, 'ACTIVE')}

      {/* ── PLANNED section ── */}
      {(stateFilter === 'ALL' || stateFilter === 'PLANNED') &&
        renderSection('Планируемые', grouped.PLANNED, 'PLANNED')}

      {/* ── CLOSED section ── */}
      {(stateFilter === 'ALL' || stateFilter === 'CLOSED') &&
        renderSection('Закрытые', grouped.CLOSED, 'CLOSED')}

      {/* ── Drawer ── */}
      <SprintIssuesDrawer
        open={detailsOpen}
        sprintId={selectedSprintId}
        onClose={() => { setDetailsOpen(false); void loadSprints(); }}
      />
    </div>
  );
}
