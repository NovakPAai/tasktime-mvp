/**
 * ProjectsPage — rebuilt from zero using Paper (FlowUniverse) as sole source.
 * All values taken directly from Paper JSX export for artboards 1-0 (Dark) + 81-0 (Light).
 * Zero CSS class dependencies, zero Ant Design layout, zero component reuse.
 * Logic preserved: data fetching, filter, create project modal.
 */
import { useEffect, useState, useCallback } from 'react';
import { Modal, Form, Input, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useProjectsStore } from '../store/projects.store';
import { useAuthStore } from '../store/auth.store';
import { useThemeStore } from '../store/theme.store';
import * as projectsApi from '../api/projects';
import type { Project } from '../types';
import type { ProjectDashboard } from '../api/projects';
import { hasAnyRequiredRole } from '../lib/roles';

// ─── Tokens Dark (Paper 1-0) ─────────────────────────────────────────────
const DARK_C = {
  bg:       '#080B14',
  bgCard:   '#0F1320',
  border:   '#1E2640',
  borderHd: '#1A2035',
  t1: '#E2E8F8',
  t3: '#3D4D6B',
  t4: '#4A5568',
  t5: '#2D3A52',   // archived dimmed
  acc: '#4F6EF7',
  green: '#22C55E',
  amber: '#F59E0B',
};

// ─── Tokens Light (Paper 81-0) ───────────────────────────────────────────
const LIGHT_C = {
  bg:       '#F0F2FA',
  bgCard:   '#FFFFFF',
  border:   '#E4E7F5',
  borderHd: '#E4E7F5',
  t1: '#1A1E32',
  t3: '#B0B9D4',
  t4: '#8490B0',
  t5: '#B0B9D4',   // archived dimmed
  acc: '#4F6EF7',
  green: '#22C55E',
  amber: '#F59E0B',
};

const F = {
  display: '"Space Grotesk", system-ui, sans-serif',
  sans:    '"Inter", system-ui, sans-serif',
};
const LOGO_GRAD =
  'linear-gradient(in oklab 135deg, oklab(59.3% -0.002 -0.207) 0%, oklab(54.1% 0.096 -0.227) 100%)';
const PROGRESS_GRAD =
  'linear-gradient(in oklab 90deg, oklab(59.3% -0.002 -0.207) 0%, oklab(54.1% 0.096 -0.227) 100%)';
const RADIAL_GLOW =
  'radial-gradient(circle farthest-corner at 50% 50% in oklab, oklab(59.3% -0.002 -0.207 / 18%) 0%, oklab(0% 0 -.0001 / 0%) 70%)';

const GRADIENTS = [
  'linear-gradient(in oklab 135deg, oklab(80% -0.160 0.086) 0%, oklab(59.6% -0.122 0.037) 100%)',
  'linear-gradient(in oklab 135deg, oklab(59.3% -0.002 -0.207) 0%, oklab(54.1% 0.096 -0.227) 100%)',
  'linear-gradient(in oklab 135deg, oklab(76.9% 0.056 0.155) 0%, oklab(66.6% 0.083 0.134) 100%)',
  'linear-gradient(in oklab 135deg, oklab(62.7% 0.130 -0.193) 0%, oklab(54.1% 0.096 -0.227) 100%)',
  'linear-gradient(in oklab 135deg, oklab(70% 0.18 0.10) 0%, oklab(55% 0.15 0.08) 100%)',
];

// ─── Types ──────────────────────────────────────────────────────────────────
type ProjectStatus = 'active' | 'onhold' | 'archived';
type FilterType = 'all' | 'active' | 'onhold' | 'archived';

const FILTER_TABS: { key: FilterType; label: string; dot: string | null }[] = [
  { key: 'all',      label: 'All',      dot: null       },
  { key: 'active',   label: 'Active',   dot: '#22C55E'  },
  { key: 'onhold',   label: 'On Hold',  dot: '#F59E0B'  },
  { key: 'archived', label: 'Archived', dot: null       },
];

// ─── Helpers ────────────────────────────────────────────────────────────────
function avatarGradient(name: string): string {
  const h = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
  return GRADIENTS[h % GRADIENTS.length];
}
function initials(name: string): string {
  return name.split(' ').map(n => n[0] ?? '').join('').slice(0, 2).toUpperCase();
}
function timeAgo(d?: string): string {
  if (!d) return '';
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1)   return 'только что';
  if (m < 60)  return `${m} мин. назад`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h} ч. назад`;
  const days = Math.floor(h / 24);
  if (days === 1) return 'вчера';
  if (days < 7)   return `${days} дн. назад`;
  if (days < 14)  return 'нед. назад';
  return `${Math.floor(days / 7)} нед. назад`;
}

// ─── Types ──────────────────────────────────────────────────────────────────
interface CardData {
  project: Project;
  dashboard: ProjectDashboard | null;
  loading: boolean;
}

// ─── Component ──────────────────────────────────────────────────────────────
export default function ProjectsPage() {
  const { projects, loading, fetchProjects } = useProjectsStore();
  const { user } = useAuthStore();
  const { mode } = useThemeStore();
  const C = mode === 'light' ? LIGHT_C : DARK_C;
  const navigate = useNavigate();

  // ─── Status config — theme-aware (Paper 1-0 Dark / 81-0 Light) ───────────
  const STATUS_CFG: Record<ProjectStatus, { label: string; dot: string | null; bg: string; border: string; color: string }> = mode === 'light' ? {
    active:   { label: 'Active',   dot: '#22C55E', bg: '#F0FDF4',   border: '#BBF7D0', color: '#16A34A' },
    onhold:   { label: 'On Hold',  dot: '#F59E0B', bg: '#FFFBEB',   border: '#FDE68A', color: '#D97706' },
    archived: { label: 'Archived', dot: null,       bg: '#F4F5FC',   border: '#E4E7F5', color: '#B0B9D4' },
  } : {
    active:   { label: 'Active',   dot: C.green,   bg: '#22C55E1A', border: '#22C55E33', color: C.green },
    onhold:   { label: 'On Hold',  dot: C.amber,   bg: '#F59E0B1A', border: '#F59E0B40', color: C.amber },
    archived: { label: 'Archived', dot: null,       bg: '#2D3A5266', border: C.border,   color: C.t3    },
  };
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [cards, setCards] = useState<CardData[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [hoveredFilter, setHoveredFilter] = useState<FilterType | null>(null);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  const canCreate = hasAnyRequiredRole(user?.systemRoles, ['ADMIN']);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const loadDashboards = useCallback(async (ps: Project[]) => {
    setCards(ps.map((p) => ({ project: p, dashboard: null, loading: true })));
    const results = await Promise.allSettled(
      ps.map((p) => projectsApi.getProjectDashboard(p.id)),
    );
    setCards(
      ps.map((p, i) => ({
        project: p,
        dashboard: results[i].status === 'fulfilled' ? results[i].value : null,
        loading: false,
      })),
    );
  }, []);

  useEffect(() => {
    if (projects.length > 0) loadDashboards(projects);
  }, [projects, loadDashboards]);

  const handleCreate = async (values: { name: string; key: string; description?: string }) => {
    try {
      await projectsApi.createProject(values);
      message.success('Проект создан');
      setModalOpen(false);
      form.resetFields();
      fetchProjects();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      message.error(error.response?.data?.error || 'Ошибка создания проекта');
    }
  };

  const getStatus = (d: ProjectDashboard | null): ProjectStatus => {
    if (!d) return 'active';
    if (d.activeSprint) return 'active';
    if (d.totals.totalIssues === 0) return 'archived';
    return 'onhold';
  };

  const filteredCards = cards.filter(({ dashboard }) => {
    if (filter === 'all') return true;
    return getStatus(dashboard) === filter;
  });

  const activeCount = cards.filter(({ dashboard }) => getStatus(dashboard) === 'active').length;

  // ─── Inline card renderer (Paper 1-0) ──────────────────────────────────────
  function renderCard({ project, dashboard }: CardData) {
    const total  = dashboard?.totals.totalIssues ?? project._count?.issues ?? 0;
    const done   = dashboard?.totals.doneIssues ?? 0;
    const open   = total - done;
    const pct    = total > 0 ? Math.round((done / total) * 100) : 0;
    const sprint = dashboard?.activeSprint;
    const status = getStatus(dashboard);
    const cfg    = STATUS_CFG[status];
    const isArch = status === 'archived';
    const isHov  = hoveredCard === project.id;

    const valColor = isArch ? C.t3 : C.t1;
    const lblColor = isArch ? C.t5 : C.t3;
    const divColor = isArch ? (mode === 'light' ? '#E4E7F5' : '#161E30') : C.border;
    const descColor = isArch ? C.t5 : C.t4;

    return (
      <div
        key={project.id}
        data-testid={`project-card-${project.id}`}
        onClick={() => navigate(`/projects/${project.id}`)}
        onMouseEnter={() => setHoveredCard(project.id)}
        onMouseLeave={() => setHoveredCard(null)}
        style={{
          backgroundColor: C.bgCard,
          border: `1px solid ${isHov ? (mode === 'light' ? '#C5CCE5' : '#2D3A5A') : C.border}`,
          borderRadius: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          overflow: 'clip',
          padding: '24px',
          position: 'relative',
          cursor: 'pointer',
          transition: 'border-color 0.15s, box-shadow 0.15s',
          boxShadow: isHov ? '0 4px 24px rgba(0,0,0,0.35)' : 'none',
        }}
      >
        {/* Radial glow — Paper: absolute top-right */}
        <div style={{
          backgroundImage: RADIAL_GLOW,
          borderRadius: '50%',
          height: 100,
          width: 100,
          position: 'absolute',
          right: -30,
          top: -30,
          pointerEvents: 'none',
        }} />

        {/* Row 1: header — avatar + name/key + status badge */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Avatar 36×36 */}
            <div style={{
              alignItems: 'center',
              backgroundImage: avatarGradient(project.name),
              borderRadius: 8,
              display: 'flex',
              flexShrink: 0,
              height: 36,
              justifyContent: 'center',
              width: 36,
            }}>
              <span style={{ color: '#FFFFFF', fontFamily: F.display, fontSize: 11, fontWeight: 700, lineHeight: '14px' }}>
                {initials(project.name)}
              </span>
            </div>
            {/* Name + key */}
            <div>
              <div style={{ color: C.t1, fontFamily: F.display, fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: '18px' }}>
                {project.name}
              </div>
              <div style={{ color: C.t3, fontFamily: F.sans, fontSize: 11, lineHeight: '14px', marginTop: 1 }}>
                {project.key}
              </div>
            </div>
          </div>
          {/* Status badge */}
          <div style={{
            alignItems: 'center',
            backgroundColor: cfg.bg,
            border: `1px solid ${cfg.border}`,
            borderRadius: 20,
            display: 'flex',
            flexShrink: 0,
            gap: 5,
            paddingBlock: 3,
            paddingInline: 9,
          }}>
            {cfg.dot && (
              <div style={{ backgroundColor: cfg.dot, borderRadius: '50%', flexShrink: 0, height: 5, width: 5 }} />
            )}
            <span style={{ color: cfg.color, fontFamily: F.sans, fontSize: 11, fontWeight: 500, lineHeight: '14px' }}>
              {cfg.label}
            </span>
          </div>
        </div>

        {/* Row 2: description */}
        <div style={{ color: descColor, fontFamily: F.sans, fontSize: 12, lineHeight: '18px' }}>
          {project.description || <span style={{ opacity: 0.5 }}>Нет описания</span>}
        </div>

        {/* Row 3: stats — open issues / sprint / completion % */}
        <div style={{ display: 'flex', gap: 12 }}>
          {/* Open issues */}
          <div>
            <div style={{ color: valColor, fontFamily: F.display, fontSize: 20, fontWeight: 700, lineHeight: '24px' }}>
              {open}
            </div>
            <div style={{ color: lblColor, fontFamily: F.sans, fontSize: 11, lineHeight: '14px' }}>
              открытых задач
            </div>
          </div>
          <div style={{ backgroundColor: divColor, flexShrink: 0, width: 1 }} />
          {/* Sprint */}
          <div>
            <div style={{ color: valColor, fontFamily: F.display, fontSize: 20, fontWeight: 700, lineHeight: '24px', whiteSpace: 'nowrap', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {sprint?.name ?? 'Backlog'}
            </div>
            <div style={{ color: lblColor, fontFamily: F.sans, fontSize: 11, lineHeight: '14px' }}>
              {sprint ? 'текущий спринт' : 'нет спринта'}
            </div>
          </div>
          <div style={{ backgroundColor: divColor, flexShrink: 0, width: 1 }} />
          {/* Completion % */}
          <div>
            <div style={{ color: isArch ? C.t3 : C.acc, fontFamily: F.display, fontSize: 20, fontWeight: 700, lineHeight: '24px' }}>
              {pct}%
            </div>
            <div style={{ color: lblColor, fontFamily: F.sans, fontSize: 11, lineHeight: '14px' }}>
              выполнено
            </div>
          </div>
        </div>

        {/* Row 4: progress bar */}
        <div style={{ backgroundColor: C.border, borderRadius: 99, flexShrink: 0, height: 3, overflow: 'clip' }}>
          <div style={{
            backgroundImage: PROGRESS_GRAD,
            borderRadius: 99,
            height: '100%',
            width: `${pct}%`,
            transition: 'width 0.3s',
          }} />
        </div>

        {/* Row 5: footer — member avatars + timestamp */}
        <div style={{ alignItems: 'center', display: 'flex', justifyContent: 'space-between' }}>
          {/* Avatar stack */}
          <div style={{ display: 'flex' }}>
            {/* Show project key initials as a representative avatar */}
            <div style={{
              alignItems: 'center',
              backgroundImage: avatarGradient(project.name),
              backgroundOrigin: 'border-box',
              border: `2px solid ${C.bgCard}`,
              borderRadius: '50%',
              display: 'flex',
              flexShrink: 0,
              height: 22,
              justifyContent: 'center',
              width: 22,
            }}>
              <span style={{ color: '#FFFFFF', fontFamily: F.sans, fontSize: 9, fontWeight: 600, lineHeight: '12px' }}>
                {initials(project.name)}
              </span>
            </div>
            {total > 0 && (
              <div style={{
                alignItems: 'center',
                backgroundImage: avatarGradient(project.key),
                backgroundOrigin: 'border-box',
                border: `2px solid ${C.bgCard}`,
                borderRadius: '50%',
                display: 'flex',
                flexShrink: 0,
                height: 22,
                justifyContent: 'center',
                marginLeft: -6,
                width: 22,
              }}>
                <span style={{ color: '#FFFFFF', fontFamily: F.sans, fontSize: 9, fontWeight: 600, lineHeight: '12px' }}>
                  {project.key.slice(0, 2)}
                </span>
              </div>
            )}
          </div>
          {/* Timestamp */}
          <div style={{ color: C.t3, flexShrink: 0, fontFamily: F.sans, fontSize: 11, lineHeight: '14px' }}>
            {timeAgo(project.updatedAt)}
          </div>
        </div>
      </div>
    );
  }

  return (
    // Paper: full height flex column, overflow hidden
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', backgroundColor: C.bg, WebkitFontSmoothing: 'antialiased', fontFamily: F.sans, fontSize: 12, lineHeight: '16px' }}>

      {/* ── Page header bar — Paper: height 64px, px-9, border-bottom #1A2035 ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, height: 64, flexShrink: 0, paddingInline: 36, borderBottom: `1px solid ${C.borderHd}` }}>
        <div style={{ flex: '1 1 0' }}>
          {/* Space Grotesk 700 22px #E2E8F8 tracking -0.03em */}
          <div style={{ color: C.t1, fontFamily: F.display, fontWeight: 700, fontSize: 22, letterSpacing: '-0.03em', lineHeight: '28px' }}>
            Projects
          </div>
          {/* Inter 12px #3D4D6B */}
          <div style={{ color: C.t3, fontFamily: F.sans, fontSize: 12, lineHeight: '16px', marginTop: 1 }}>
            {loading ? '…' : `${projects.length} projects · ${activeCount} active`}
          </div>
        </div>
        {/* Search — 240px, bg #0F1320, border #1E2640, px-3.5 py-2 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 240, flexShrink: 0, backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 14px' }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="6" cy="6" r="4.5" stroke={C.t3} strokeWidth="1.4" />
            <path d="M9.5 9.5L13 13" stroke={C.t3} strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <span style={{ color: C.t3, fontFamily: F.sans, fontSize: 13, lineHeight: '16px', flexShrink: 0 }}>
            Search projects…
          </span>
        </div>
        {/* New Project — gradient bg */}
        {canCreate && (
          <button
            data-testid="project-create-btn"
            onClick={() => setModalOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, border: 'none', borderRadius: 8, padding: '9px 18px', cursor: 'pointer', backgroundImage: LOGO_GRAD, color: '#fff', fontFamily: F.sans, fontSize: 13, fontWeight: 600, letterSpacing: '0.01em', lineHeight: '16px', flexShrink: 0 }}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0 }}>
              <line x1="6.5" y1="1" x2="6.5" y2="12" stroke="#FFF" strokeWidth="1.8" strokeLinecap="round" />
              <line x1="1" y1="6.5" x2="12" y2="6.5" stroke="#FFF" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            New Project
          </button>
        )}
      </div>

      {/* ── Scrollable content ─────────────────────────────────────────────── */}
      <div style={{ flex: '1 1 0', overflowY: 'auto', padding: '32px 36px' }}>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          {FILTER_TABS.map(({ key, label, dot }) => {
            const isActive  = filter === key;
            const isHovered = hoveredFilter === key;
            return (
              <button
                key={key}
                onClick={() => setFilter(key)}
                onMouseEnter={() => setHoveredFilter(key)}
                onMouseLeave={() => setHoveredFilter(null)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '5px 12px', borderRadius: 20,
                  border: isActive ? `1px solid rgba(79,110,247,0.25)` : '1px solid transparent',
                  backgroundColor: isActive ? 'rgba(79,110,247,0.12)' : isHovered ? (mode === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)') : 'transparent',
                  cursor: 'pointer', transition: 'background-color 0.15s',
                  fontFamily: F.sans, fontSize: 12, lineHeight: '16px',
                  color: isActive ? C.acc : C.t4,
                  fontWeight: isActive ? 500 : 400,
                }}
              >
                {dot && (
                  <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: dot, flexShrink: 0, display: 'inline-block' }} />
                )}
                {label}
              </button>
            );
          })}
        </div>

        {/* Card grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
          {loading && cards.length === 0
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{ height: 240, backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, opacity: 0.5 }} />
              ))
            : filteredCards.map((card) => renderCard(card))}
        </div>
      </div>

      {/* New Project modal — Ant Design kept for form validation */}
      <Modal
        title="New Project"
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        onOk={() => form.submit()}
        okText="Create"
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input placeholder="e.g. Core Platform" />
          </Form.Item>
          <Form.Item
            name="key"
            label="Key"
            rules={[{ required: true, pattern: /^[A-Z][A-Z0-9]*$/, message: 'Uppercase letters/digits, starting with letter' }]}
            extra="e.g. PROJ, BACK, FRONT"
          >
            <Input placeholder="PROJ" style={{ textTransform: 'uppercase' }} />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} placeholder="What is this project about?" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
