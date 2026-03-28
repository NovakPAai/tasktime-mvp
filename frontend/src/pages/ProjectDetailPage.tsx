/**
 * ProjectDetailPage — rebuilt from zero using Paper as sole source of truth.
 * Artboards: FW-0 (Dark) + QK-0 (Light). Zero CSS classes, zero Ant Design layout.
 */
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Table, Button, Space, Modal, Form, Input, Select, message, Popconfirm } from 'antd';
import {
  PlusOutlined,
  AppstoreOutlined,
  ThunderboltOutlined,
  TagOutlined,
  ApartmentOutlined,
  SearchOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import type { Issue } from '../types';
import { useIssuesStore } from '../store/issues.store';
import { useAuthStore } from '../store/auth.store';
import { useThemeStore } from '../store/theme.store';
import * as projectsApi from '../api/projects';
import * as issuesApi from '../api/issues';
import * as authApi from '../api/auth';
import type { Project, IssuePriority, IssueStatus, User, IssueTypeConfig } from '../types';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { hasAnyRequiredRole, hasRequiredRole } from '../lib/roles';
import { getProjectIssueTypes } from '../api/issue-type-configs';
import { IssueTypeBadge } from '../lib/issue-kit';

// ─── Tokens Dark (Paper FW-0) ────────────────────────────────
const DARK_C = {
  bg:          '#080B14',
  bgCard:      '#0F1320',
  bgRow:       '#080B14',
  bgRowHover:  '#0F1320',
  border:      '#1E2640',
  borderInner: '#1A2035',
  t1:          '#E2E8F8',
  t2:          '#C9D1D9',
  t3:          '#3D4D6B',
  t4:          '#4A5568',
  acc:         '#4F6EF7',
  green:       '#22C55E',
  // status
  sDone:       '#4ADE80',   sdDone:       '#4ADE801F',
  sProgress:   '#60A5FA',   sdProgress:   '#60A5FA1F',
  sReview:     '#C084FC',   sdReview:     '#C084FC1F',
  sOpen:       '#8B949E',   sdOpen:       '#8B949E1F',
  sCancelled:  '#6B7280',   sdCancelled:  '#6B72801F',
  // priority
  pCritical:   '#EF4444',
  pHigh:       '#F59E0B',
  pMedium:     '#34D399',
  pLow:        '#9CA3AF',
  // sprint bar
  barBg:       '#21262D',
};

// ─── Tokens Light (Paper QK-0) ────────────────────────────────
const LIGHT_C = {
  bg:          '#F0F2FA',
  bgCard:      '#FFFFFF',
  bgRow:       '#FFFFFF',
  bgRowHover:  '#F9FAFB',
  border:      '#E5E7EB',
  borderInner: '#F3F4F6',
  t1:          '#111827',
  t2:          '#374151',
  t3:          '#6B7280',
  t4:          '#9CA3AF',
  acc:         '#4F6EF7',
  green:       '#16A34A',
  // status
  sDone:       '#16A34A',   sdDone:       '#16A34A1F',
  sProgress:   '#2563EB',   sdProgress:   '#2563EB1F',
  sReview:     '#9333EA',   sdReview:     '#9333EA1F',
  sOpen:       '#9CA3AF',   sdOpen:       '#9CA3AF1F',
  sCancelled:  '#D1D5DB',   sdCancelled:  '#D1D5DB1F',
  // priority
  pCritical:   '#DC2626',
  pHigh:       '#D97706',
  pMedium:     '#059669',
  pLow:        '#9CA3AF',
  // sprint bar
  barBg:       '#E5E7EB',
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

// ─── Status helpers ───────────────────────────────────────────
function getStatusDot(s: IssueStatus, C: typeof DARK_C): string {
  switch (s) {
    case 'DONE':        return C.sDone;
    case 'IN_PROGRESS': return C.sProgress;
    case 'REVIEW':      return C.sReview;
    case 'CANCELLED':   return C.sCancelled;
    default:            return C.sOpen;
  }
}
function getPriorityColor(p: IssuePriority, C: typeof DARK_C): string {
  switch (p) {
    case 'CRITICAL': return C.pCritical;
    case 'HIGH':     return C.pHigh;
    case 'MEDIUM':   return C.pMedium;
    default:         return C.pLow;
  }
}

// ─── buildTree ────────────────────────────────────────────────
function buildTree(issues: Issue[]): Issue[] {
  const map = new Map(issues.map((i) => [i.id, { ...i, children: [] as Issue[] }]));
  const roots: Issue[] = [];
  for (const issue of map.values()) {
    if (issue.parentId && map.has(issue.parentId)) {
      map.get(issue.parentId)!.children!.push(issue);
    } else {
      roots.push(issue);
    }
  }
  for (const node of map.values()) {
    if (node.children && node.children.length === 0) {
      delete (node as Issue & { children?: Issue[] }).children;
    }
  }
  return roots;
}

// ─── Component ───────────────────────────────────────────────
export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { mode } = useThemeStore();
  const C = mode === 'light' ? LIGHT_C : DARK_C;

  const { issues, loading: issuesLoading, fetchIssues, filters, setFilters, resetFilters } = useIssuesStore();
  const { user } = useAuthStore();
  const [project, setProject] = useState<Project | null>(null);
  const [dashboard, setDashboard] = useState<projectsApi.ProjectDashboard | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [selectedIssueIds, setSelectedIssueIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<IssueStatus | undefined>(undefined);
  const [bulkAssigneeId, setBulkAssigneeId] = useState<string | undefined>(undefined);
  const [treeMode, setTreeMode] = useState(true);
  const [issueTypeConfigs, setIssueTypeConfigs] = useState<IssueTypeConfig[]>([]);

  useEffect(() => {
    if (id) {
      projectsApi.getProject(id).then(setProject);
      projectsApi.getProjectDashboard(id).then(setDashboard);
      fetchIssues(id);
      authApi.listUsers().then(setAllUsers).catch(() => {});
      getProjectIssueTypes(id).then(setIssueTypeConfigs).catch(() => {});
    }
  }, [id, fetchIssues]);

  const canCreate  = user?.role !== 'VIEWER';
  const canBulkEdit = hasAnyRequiredRole(user?.role, ['ADMIN', 'MANAGER']);

  const handleCreate = async (values: issuesApi.CreateIssueBody) => {
    if (!id) return;
    try {
      await issuesApi.createIssue(id, values);
      message.success('Issue created');
      setModalOpen(false);
      form.resetFields();
      fetchIssues(id);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      message.error(error.response?.data?.error || 'Failed to create issue');
    }
  };

  const handleStatusChange = async (issueId: string, status: IssueStatus) => {
    try {
      await issuesApi.updateStatus(issueId, status);
      if (id) fetchIssues(id);
    } catch {
      message.error('Failed to update status');
    }
  };

  const handleApplyFilters = () => { if (id) fetchIssues(id); };
  const handleResetFilters  = () => { if (id) { resetFilters(); fetchIssues(id); } };

  const handleBulkUpdate = async () => {
    if (!id || selectedIssueIds.length === 0) return;
    if (!bulkStatus && bulkAssigneeId === undefined) {
      message.warning('Select status and/or assignee to update');
      return;
    }
    try {
      await issuesApi.bulkUpdateIssues(id, {
        issueIds:   selectedIssueIds,
        status:     bulkStatus,
        assigneeId: bulkAssigneeId === 'UNASSIGNED' ? null : bulkAssigneeId,
      });
      message.success('Issues updated');
      setSelectedIssueIds([]);
      setBulkStatus(undefined);
      setBulkAssigneeId(undefined);
      fetchIssues(id);
    } catch {
      message.error('Failed to update issues');
    }
  };

  const handleBulkDelete = async () => {
    if (!id || selectedIssueIds.length === 0) return;
    try {
      const result = await issuesApi.bulkDeleteIssues(id, selectedIssueIds);
      message.success(`Удалено задач: ${result.deletedCount}`);
      setSelectedIssueIds([]);
      fetchIssues(id);
      projectsApi.getProjectDashboard(id).then(setDashboard);
    } catch {
      message.error('Failed to delete issues');
    }
  };

  if (!project || !dashboard) return <LoadingSpinner />;

  const sprintPercent =
    dashboard.activeSprint && dashboard.activeSprint.totalIssues > 0
      ? Math.round((dashboard.activeSprint.doneIssues / dashboard.activeSprint.totalIssues) * 100)
      : 0;

  // ─── Table columns ─────────────────────────────────────────
  const columns = [
    {
      title: (
        <span style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 600, color: C.t4, letterSpacing: '0.5px', textTransform: 'uppercase' as const }}>
          KEY
        </span>
      ),
      width: 96,
      render: (_: unknown, r: Issue) => (
        <span
          style={{
            fontFamily: F.display, fontSize: 11, fontWeight: 600,
            color: C.acc, cursor: 'pointer', whiteSpace: 'nowrap' as const,
          }}
        >
          {`${project.key}-${r.number}`}
        </span>
      ),
    },
    {
      title: (
        <span style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 600, color: C.t4, letterSpacing: '0.5px', textTransform: 'uppercase' as const }}>
          TYPE
        </span>
      ),
      width: 160,
      render: (_: unknown, r: Issue) => (
        <IssueTypeBadge typeConfig={r.issueTypeConfig} showLabel />
      ),
    },
    {
      title: (
        <span style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 600, color: C.t4, letterSpacing: '0.5px', textTransform: 'uppercase' as const }}>
          TITLE
        </span>
      ),
      dataIndex: 'title',
      render: (title: string, r: Issue) => (
        <span style={{
          fontFamily: F.sans, fontSize: 13, color: C.t2,
          textDecoration: r.status === 'CANCELLED' ? 'line-through' : 'none',
          opacity: r.status === 'CANCELLED' ? 0.5 : 1,
        }}>
          {title}
        </span>
      ),
    },
    {
      title: (
        <span style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 600, color: C.t4, letterSpacing: '0.5px', textTransform: 'uppercase' as const }}>
          STATUS
        </span>
      ),
      dataIndex: 'status',
      width: 138,
      render: (s: IssueStatus, r: Issue) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: getStatusDot(s, C), flexShrink: 0 }} />
          <Select
            value={s}
            size="small"
            variant="borderless"
            onChange={(v) => handleStatusChange(r.id, v)}
            options={(['OPEN', 'IN_PROGRESS', 'REVIEW', 'DONE', 'CANCELLED'] as IssueStatus[]).map((v) => ({
              value: v, label: v,
            }))}
            style={{ fontFamily: F.sans, fontSize: 11 }}
          />
        </div>
      ),
    },
    {
      title: (
        <span style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 600, color: C.t4, letterSpacing: '0.5px', textTransform: 'uppercase' as const }}>
          PRIORITY
        </span>
      ),
      dataIndex: 'priority',
      width: 100,
      render: (p: IssuePriority) => (
        <span style={{
          fontFamily: F.sans, fontSize: 11, fontWeight: 600,
          color: getPriorityColor(p, C),
        }}>
          {p}
        </span>
      ),
    },
    {
      title: (
        <span style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 600, color: C.t4, letterSpacing: '0.5px', textTransform: 'uppercase' as const }}>
          ASSIGNEE
        </span>
      ),
      dataIndex: ['assignee', 'name'],
      width: 140,
      render: (n: string) =>
        n ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              width: 22, height: 22, borderRadius: '50%',
              background: avatarGradient(n),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: F.display, fontSize: 8, fontWeight: 700, color: '#FFFFFF',
              flexShrink: 0,
            }}>
              {initials(n)}
            </span>
            <span style={{ fontFamily: F.sans, fontSize: 12, color: C.t2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
              {n}
            </span>
          </div>
        ) : (
          <span style={{ fontFamily: F.sans, fontSize: 12, color: C.t4 }}>—</span>
        ),
    },
    {
      title: (
        <span style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 600, color: C.t4, letterSpacing: '0.5px', textTransform: 'uppercase' as const }}>
          SPRINT
        </span>
      ),
      width: 120,
      render: (_: unknown, r: Issue) => {
        const sprintName = (r as Issue & { sprint?: { name: string } }).sprint?.name;
        return sprintName
          ? <span style={{ fontFamily: F.sans, fontSize: 11, color: C.t3 }}>{sprintName}</span>
          : <span style={{ fontFamily: F.sans, fontSize: 11, color: C.t4, fontStyle: 'italic' }}>Backlog</span>;
      },
    },
  ];

  const rowSelection = canBulkEdit
    ? {
        selectedRowKeys: selectedIssueIds,
        onChange: (keys: React.Key[]) => setSelectedIssueIds(keys as string[]),
      }
    : undefined;

  // ─── Stats counts ──────────────────────────────────────────
  const statusStats = [
    { key: 'OPEN',        color: C.sOpen,     label: 'Open' },
    { key: 'IN_PROGRESS', color: C.sProgress, label: 'In Progress' },
    { key: 'REVIEW',      color: C.sReview,   label: 'Review' },
    { key: 'DONE',        color: C.sDone,     label: 'Done' },
    { key: 'CANCELLED',   color: C.sCancelled,label: 'Cancelled' },
  ] as const;

  // ─── Action button style helper ───────────────────────────
  const actionBtnStyle: React.CSSProperties = {
    background: C.bgCard,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    color: C.t2,
    fontFamily: F.sans,
    fontSize: 12,
    height: 32,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '0 12px',
    cursor: 'pointer',
  };

// ─── JSX ──────────────────────────────────────────────────
  return (
    <div style={{
      width: '100%',
      minHeight: '100vh',
      background: C.bg,
      display: 'flex',
      flexDirection: 'column',
      gap: 0,
    }}>

      {/* ── Header ── */}
      <div style={{
        background: C.bgCard,
        borderBottom: `1px solid ${C.border}`,
        padding: '16px 28px 0',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}>

        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            onClick={() => navigate('/projects')}
            style={{ fontFamily: F.sans, fontSize: 12, color: C.t3, cursor: 'pointer' }}
          >
            Projects
          </span>
          <span style={{ fontFamily: F.sans, fontSize: 12, color: C.t4 }}>/</span>
          <span style={{ fontFamily: F.sans, fontSize: 12, color: C.t3, cursor: 'pointer' }}
            onClick={() => navigate(`/projects/${id}`)}>
            {project.name}
          </span>
          <span style={{ fontFamily: F.sans, fontSize: 12, color: C.t4 }}>/</span>
          <span style={{ fontFamily: F.sans, fontSize: 12, color: C.t2 }}>Issues</span>
        </div>

        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          {/* Left: avatar + title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Project avatar */}
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: avatarGradient(project.name),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: F.display, fontSize: 14, fontWeight: 700, color: '#FFFFFF',
              flexShrink: 0,
            }}>
              {project.key.slice(0, 2)}
            </div>

            {/* Title + badges */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const }}>
              <h1 style={{
                fontFamily: F.display, fontSize: 18, fontWeight: 700,
                color: C.t1, margin: 0, letterSpacing: '-0.02em',
              }}>
                {project.name}
              </h1>
              <span style={{
                fontFamily: F.sans, fontSize: 10, fontWeight: 600,
                color: C.t3, background: C.bg, border: `1px solid ${C.border}`,
                borderRadius: 4, padding: '2px 6px',
              }}>
                {project.key}
              </span>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontFamily: F.sans, fontSize: 10, fontWeight: 600,
                color: C.sDone, background: C.sdDone,
                borderRadius: 20, padding: '2px 8px',
              }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.sDone }} />
                Active
              </span>
            </div>
          </div>

          {/* Right: action buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button style={actionBtnStyle} onClick={() => navigate(`/projects/${id}/board`)}>
              <AppstoreOutlined style={{ fontSize: 12 }} />
              Board
            </button>
            <button style={actionBtnStyle} onClick={() => navigate(`/projects/${id}/sprints`)}>
              <ThunderboltOutlined style={{ fontSize: 12 }} />
              Sprints
            </button>
            <button style={actionBtnStyle} onClick={() => navigate(`/projects/${id}/releases`)}>
              <TagOutlined style={{ fontSize: 12 }} />
              Релизы
            </button>
            <button
              style={{
                ...actionBtnStyle,
                background: treeMode ? C.acc : C.bgCard,
                color: treeMode ? '#FFFFFF' : C.t2,
                border: `1px solid ${treeMode ? C.acc : C.border}`,
              }}
              onClick={() => setTreeMode((v) => !v)}
            >
              <ApartmentOutlined style={{ fontSize: 12 }} />
              {treeMode ? 'Tree' : 'Flat'}
            </button>
            {canCreate && (
              <button
                style={{
                  background: LOGO_GRAD,
                  border: 'none',
                  borderRadius: 8,
                  color: '#FFFFFF',
                  fontFamily: F.sans,
                  fontSize: 12,
                  fontWeight: 600,
                  height: 32,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '0 14px',
                  cursor: 'pointer',
                }}
                onClick={() => setModalOpen(true)}
              >
                <PlusOutlined style={{ fontSize: 11 }} />
                New Issue
              </button>
            )}
          </div>
        </div>

        {/* Stats bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16,
          paddingBottom: 14, flexWrap: 'wrap' as const,
        }}>
          <span style={{ fontFamily: F.sans, fontSize: 12, color: C.t3 }}>
            Total{' '}
            <strong style={{ fontFamily: F.display, color: C.t1, fontWeight: 600 }}>
              {dashboard.totals.totalIssues}
            </strong>
          </span>

          {statusStats.map(({ key, color, label }) => {
            const count = issues.filter(i => i.status === key).length;
            return (
              <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: F.sans, fontSize: 12, color: C.t3 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                {label}{' '}
                <strong style={{ fontFamily: F.display, color: C.t2, fontWeight: 600 }}>{count}</strong>
              </span>
            );
          })}

          {dashboard.activeSprint && (
            <>
              <span style={{ width: 1, height: 14, background: C.border, flexShrink: 0 }} />
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: F.sans, fontSize: 12, color: C.t3 }}>
                {dashboard.activeSprint.name}
                <div style={{
                  width: 80, height: 4, borderRadius: 3,
                  background: C.barBg, overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%', borderRadius: 3,
                    width: `${sprintPercent}%`,
                    background: LOGO_GRAD,
                  }} />
                </div>
                <strong style={{ fontFamily: F.display, color: C.acc, fontWeight: 600 }}>
                  {sprintPercent}%
                </strong>
              </span>
            </>
          )}
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 28px',
        background: C.bgCard,
        borderBottom: `1px solid ${C.border}`,
        flexWrap: 'wrap' as const,
      }}>
        {/* Search */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: C.bg, border: `1px solid ${C.border}`,
          borderRadius: 8, padding: '0 10px', height: 30, minWidth: 200,
        }}>
          <SearchOutlined style={{ fontSize: 12, color: C.t4 }} />
          <Input
            variant="borderless"
            placeholder="Search issues..."
            value={filters.search}
            onChange={(e) => setFilters({ search: e.target.value })}
            onPressEnter={handleApplyFilters}
            style={{ fontFamily: F.sans, fontSize: 12, color: C.t2, padding: 0, height: 28 }}
          />
        </div>

        <Select<string[]>
          mode="multiple"
          placeholder="Type"
          value={filters.issueTypeConfigId}
          maxTagCount={1}
          onChange={(value) => { setFilters({ issueTypeConfigId: value }); if (id) fetchIssues(id); }}
          options={issueTypeConfigs.map((c) => ({ value: c.id, label: c.name.replace(/^->\s*/, '') }))}
          style={{ minWidth: 100, fontFamily: F.sans, fontSize: 12 }}
          size="small"
        />
        <Select<IssueStatus[]>
          mode="multiple"
          placeholder="Status"
          value={filters.status}
          maxTagCount={1}
          onChange={(value) => { setFilters({ status: value }); if (id) fetchIssues(id); }}
          options={(['OPEN', 'IN_PROGRESS', 'REVIEW', 'DONE', 'CANCELLED'] as IssueStatus[]).map((v) => ({ value: v, label: v }))}
          style={{ minWidth: 100, fontFamily: F.sans, fontSize: 12 }}
          size="small"
        />
        <Select<IssuePriority[]>
          mode="multiple"
          placeholder="Priority"
          value={filters.priority}
          maxTagCount={1}
          onChange={(value) => { setFilters({ priority: value }); if (id) fetchIssues(id); }}
          options={(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as IssuePriority[]).map((v) => ({ value: v, label: v }))}
          style={{ minWidth: 100, fontFamily: F.sans, fontSize: 12 }}
          size="small"
        />
        <Select
          allowClear
          placeholder="Assignee"
          value={filters.assigneeId}
          onChange={(value) => { setFilters({ assigneeId: value }); if (id) fetchIssues(id); }}
          options={[
            { value: 'UNASSIGNED', label: 'Unassigned' },
            ...allUsers.map((u) => ({ value: u.id, label: u.name })),
          ]}
          style={{ minWidth: 130, fontFamily: F.sans, fontSize: 12 }}
          size="small"
        />
        <Button size="small" onClick={handleApplyFilters}
          style={{ fontFamily: F.sans, fontSize: 11, background: C.bg, border: `1px solid ${C.border}`, color: C.t2 }}>
          Apply
        </Button>
        <Button size="small" onClick={handleResetFilters}
          style={{ fontFamily: F.sans, fontSize: 11, background: C.bg, border: `1px solid ${C.border}`, color: C.t3 }}>
          Reset
        </Button>

        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: F.sans, fontSize: 12, color: C.t3 }}>
          {issues.length} issues
        </span>

        {canBulkEdit && selectedIssueIds.length > 0 && (
          <>
            <span style={{ width: 1, height: 14, background: C.border }} />
            <Space size={6}>
              <Select<IssueStatus>
                allowClear
                placeholder="Set status"
                value={bulkStatus}
                onChange={(value) => setBulkStatus(value)}
                options={(['OPEN', 'IN_PROGRESS', 'REVIEW', 'DONE', 'CANCELLED'] as IssueStatus[]).map((v) => ({
                  value: v, label: v,
                }))}
                size="small"
                style={{ minWidth: 120, fontFamily: F.sans, fontSize: 11 }}
              />
              <Select
                allowClear
                placeholder="Set assignee"
                value={bulkAssigneeId}
                onChange={(value) => setBulkAssigneeId(value)}
                options={[
                  { value: 'UNASSIGNED', label: 'Unassigned' },
                  ...allUsers.map((u) => ({ value: u.id, label: u.name })),
                ]}
                size="small"
                style={{ minWidth: 130, fontFamily: F.sans, fontSize: 11 }}
              />
              <Button
                type="primary"
                size="small"
                disabled={!bulkStatus && bulkAssigneeId === undefined}
                onClick={handleBulkUpdate}
                style={{ fontFamily: F.sans, fontSize: 11 }}
              >
                Apply to {selectedIssueIds.length}
              </Button>
              {hasRequiredRole(user?.role, 'ADMIN') && (
                <Popconfirm
                  title={`Удалить ${selectedIssueIds.length} задач?`}
                  description="Это действие нельзя отменить."
                  okText="Удалить"
                  okButtonProps={{ danger: true }}
                  cancelText="Отмена"
                  onConfirm={handleBulkDelete}
                >
                  <Button danger size="small" icon={<DeleteOutlined />}
                    style={{ fontFamily: F.sans, fontSize: 11 }}>
                    Delete {selectedIssueIds.length}
                  </Button>
                </Popconfirm>
              )}
            </Space>
          </>
        )}
      </div>

      {/* ── Table ── */}
      <div style={{ padding: '0 28px 28px' }}>
        <div style={{
          marginTop: 16,
          background: C.bgCard,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          overflow: 'hidden',
        }}>
          <Table
            dataSource={treeMode ? buildTree(issues) : issues}
            columns={columns}
            rowKey="id"
            loading={issuesLoading}
            pagination={{ pageSize: 25, size: 'small', showTotal: (t) => `${t} issues` }}
            size="small"
            rowSelection={rowSelection}
            onRow={(record) => ({
              onClick: (e) => {
                const target = e.target as HTMLElement;
                if (target.closest('.ant-table-row-expand-icon') || target.closest('.ant-table-row-indent')) return;
                navigate(`/issues/${record.id}`);
              },
              style: { cursor: 'pointer' },
            })}
            indentSize={24}
            expandable={treeMode ? { defaultExpandAllRows: false } : undefined}
          />
        </div>
      </div>

      {/* ── New Issue Modal ── */}
      <Modal
        title="New Issue"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText="Create"
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreate}
          initialValues={{
            issueTypeConfigId: issueTypeConfigs.find((c) => c.systemKey === 'TASK')?.id ?? issueTypeConfigs[0]?.id,
            priority: 'MEDIUM',
          }}
        >
          <Form.Item name="title" label="Title" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Space style={{ width: '100%' }} size="middle">
            <Form.Item name="issueTypeConfigId" label="Type">
              <Select
                style={{ width: 180 }}
                options={issueTypeConfigs.map((c) => ({
                  value: c.id,
                  label: c.name,
                }))}
              />
            </Form.Item>
            <Form.Item name="priority" label="Priority">
              <Select
                style={{ width: 140 }}
                options={(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as IssuePriority[]).map((v) => ({ value: v, label: v }))}
              />
            </Form.Item>
          </Space>
          <Form.Item name="parentId" label="Parent Issue">
            <Select
              allowClear
              placeholder="None (top level)"
              style={{ width: '100%' }}
              options={issues
                .filter((i) => !i.issueTypeConfig?.isSubtask)
                .map((i) => ({ value: i.id, label: `${project.key}-${i.number} ${i.title}` }))}
            />
          </Form.Item>
          <Form.Item name="assigneeId" label="Assignee">
            <Select
              allowClear
              placeholder="Unassigned"
              style={{ width: '100%' }}
              options={allUsers.map((u) => ({ value: u.id, label: `${u.name} (${u.email})` }))}
            />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={4} />
          </Form.Item>
          <Form.Item name="acceptanceCriteria" label="Acceptance Criteria">
            <Input.TextArea
              rows={3}
              placeholder="What conditions must be met for this issue to be considered done?"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
