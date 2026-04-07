import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  message,
  Popconfirm,
  InputNumber,
  Form,
  Modal,
  Input,
  Select,
  Switch,
  DatePicker,
  Divider,
} from 'antd';
import dayjs from 'dayjs';
import * as issuesApi from '../api/issues';
import * as commentsApi from '../api/comments';
import * as timeApi from '../api/time';
import * as aiApi from '../api/ai';
import * as authApi from '../api/auth';
import { getProjectIssueTypes } from '../api/issue-type-configs';
import IssueLinksSection from '../components/issues/IssueLinksSection';
import MoveIssueModal from '../components/issues/MoveIssueModal';
import IssueCustomFieldsSection from '../components/issues/IssueCustomFieldsSection';
import CustomFieldInput from '../components/issues/CustomFieldInput';
import StatusTransitionPanel from '../components/issues/StatusTransitionPanel';
import { issueCustomFieldsApi, type IssueCustomFieldValue } from '../api/issue-custom-fields';
import { useAuthStore } from '../store/auth.store';
import { useThemeStore } from '../store/theme.store';
import type { Issue, Comment, TimeLog, AuditEntry, IssuePriority, IssueTypeConfig, User, AiExecutionStatus } from '../types';
import api from '../api/client';
import { hasAnyRequiredRole, hasRequiredRole } from '../lib/roles';

// ─── Design tokens ────────────────────────────────────────────────────────────

const DARK_C = {
  bg: '#080B14',
  bgCard: '#0F1320',
  bgComment: '#161B22',
  bgCommentNew: '#161B22',
  border: '#21262D',
  borderComment: '#30363D',
  t1: '#E2E8F8',
  t2: '#C9D1D9',
  t3: '#8B949E',
  t4: '#484F58',
  acc: '#6366F1',
  accSoft: '#4F6EF7',
  rightPanelBg: 'transparent',
  timerBg: '#161B22',
  labelColor: '#484F58',
  sep: '#484F58',
};

const LIGHT_C = {
  bg: '#F6F8FA',
  bgCard: '#FFFFFF',
  bgComment: '#F6F8FA',
  bgCommentNew: '#FFFFFF',
  border: '#D0D7DE',
  borderComment: '#D0D7DE',
  t1: '#1F2328',
  t2: '#1F2328',
  t3: '#656D76',
  t4: '#8C959F',
  acc: '#6366F1',
  accSoft: '#4F6EF7',
  rightPanelBg: '#F6F8FA',
  timerBg: '#FFFFFF',
  labelColor: '#8C959F',
  sep: '#D0D7DE',
};

const LOGO_GRAD = 'linear-gradient(in oklab 135deg, oklab(59.3% -0.002 -0.207) 0%, oklab(54.1% 0.096 -0.227) 100%)';

const AVATAR_GRADS = [
  LOGO_GRAD,
  'linear-gradient(in oklab 135deg, oklab(69.6% -0.142 0.045) 0%, oklab(59.6% -0.122 0.037) 100%)',
  'linear-gradient(in oklab 135deg, oklab(62% 0.12 -0.18) 0%, oklab(55% 0.15 -0.22) 100%)',
  'linear-gradient(in oklab 135deg, oklab(65% -0.08 0.15) 0%, oklab(57% -0.12 0.18) 100%)',
];

function getInitials(name?: string | null) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length === 1
    ? parts[0].substring(0, 2).toUpperCase()
    : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getAvatarGrad(name?: string | null) {
  if (!name) return AVATAR_GRADS[0];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_GRADS[Math.abs(h) % AVATAR_GRADS.length];
}

function Avatar({ name, size = 28 }: { name?: string | null; size?: number }) {
  const fontSize = Math.round(size * 0.36);
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      backgroundImage: getAvatarGrad(name),
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{ color: '#FFFFFF', fontSize, fontWeight: 700, fontFamily: '"Space Grotesk", system-ui, sans-serif', lineHeight: 1 }}>
        {getInitials(name)}
      </span>
    </div>
  );
}

// ─── Status pill styles ───────────────────────────────────────────────────────

type IssueStatus = 'OPEN' | 'IN_PROGRESS' | 'REVIEW' | 'DONE' | 'CANCELLED';

function getStatusCfg(status: string, isDark: boolean) {
  const cfg: Record<string, { dot: string; bg: string; text: string; label: string }> = isDark ? {
    OPEN:        { dot: '#8B949E', bg: '#1E2640',     text: '#8B949E', label: 'OPEN' },
    IN_PROGRESS: { dot: '#F59E0B', bg: '#F59E0B26',   text: '#F59E0B', label: 'IN PROGRESS' },
    REVIEW:      { dot: '#A78BFA', bg: '#A78BFA1F',   text: '#A78BFA', label: 'REVIEW' },
    DONE:        { dot: '#4ADE80', bg: '#4ADE801F',   text: '#4ADE80', label: 'DONE' },
    CANCELLED:   { dot: '#484F58', bg: '#161B22',     text: '#484F58', label: 'CANCELLED' },
  } : {
    OPEN:        { dot: '#8C959F', bg: '#EFF1F5',     text: '#8C959F', label: 'OPEN' },
    IN_PROGRESS: { dot: '#D97706', bg: '#D77B001A',   text: '#D97706', label: 'IN PROGRESS' },
    REVIEW:      { dot: '#7C3AED', bg: '#7C3AED1A',   text: '#7C3AED', label: 'REVIEW' },
    DONE:        { dot: '#1A7F37', bg: '#1A7F371A',   text: '#1A7F37', label: 'DONE' },
    CANCELLED:   { dot: '#8C959F', bg: '#EFF1F5',     text: '#8C959F', label: 'CANCELLED' },
  };
  return cfg[status] ?? cfg['OPEN'];
}

function getPriorityCfg(priority: string, isDark: boolean) {
  const colors: Record<string, string> = isDark
    ? { CRITICAL: '#EF4444', HIGH: '#F59E0B', MEDIUM: '#8B949E', LOW: '#8B949E' }
    : { CRITICAL: '#EF4444', HIGH: '#D97706', MEDIUM: '#8C959F', LOW: '#8C959F' };
  return colors[priority] ?? colors['MEDIUM'];
}

function getTypeCfg(systemKey?: string | null) {
  const map: Record<string, { bg: string; text: string }> = {
    TASK:    { bg: '#10B98126', text: '#10B981' },
    BUG:     { bg: '#EF444426', text: '#EF4444' },
    STORY:   { bg: '#3B82F626', text: '#3B82F6' },
    EPIC:    { bg: '#A855F726', text: '#A855F7' },
    SUBTASK: { bg: '#10B98126', text: '#10B981' },
  };
  return map[systemKey ?? ''] ?? { bg: '#4F6EF726', text: '#4F6EF7' };
}

// ─── Timer live display ───────────────────────────────────────────────────────

function formatElapsed(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ─── Section label ────────────────────────────────────────────────────────────

function SectionLabel({ children, C }: { children: React.ReactNode; C: typeof DARK_C }) {
  return (
    <div style={{
      color: C.labelColor,
      fontFamily: '"Inter", system-ui, sans-serif',
      fontSize: 10, fontWeight: 600,
      letterSpacing: '0.5px',
      lineHeight: '12px',
      marginBottom: 6,
      textTransform: 'uppercase' as const,
    }}>
      {children}
    </div>
  );
}

/**
 * Renders the issue detail page, showing issue metadata, description, comments, time tracking, custom fields, AI controls, and edit/move workflows.
 *
 * The component loads issue data, comments, time logs, and history; provides handlers for commenting, timing, assignment, editing, moving, AI actions, and custom-field management; and displays a two-column layout with main content and a right-side properties panel.
 *
 * @returns The rendered Issue Detail page React element.
 */

export default function IssueDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { mode } = useThemeStore();
  const isDark = mode !== 'light';
  const C = isDark ? DARK_C : LIGHT_C;

  const [issue, setIssue] = useState<Issue | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [timeLogs, setTimeLogs] = useState<TimeLog[]>([]);
  const [history, setHistory] = useState<AuditEntry[]>([]);
  const [newComment, setNewComment] = useState('');
  const [activeTimer, setActiveTimer] = useState<TimeLog | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [timeModalOpen, setTimeModalOpen] = useState(false);
  const [timeForm] = Form.useForm();
  const [aiEstimateLoading, setAiEstimateLoading] = useState(false);
  const [aiDecomposeLoading, setAiDecomposeLoading] = useState(false);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [issueTypeConfigs, setIssueTypeConfigs] = useState<IssueTypeConfig[]>([]);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [editForm] = Form.useForm();
  const [editCustomFields, setEditCustomFields] = useState<IssueCustomFieldValue[]>([]);
  const [editCustomValues, setEditCustomValues] = useState<Record<string, unknown>>({});
  const [customFieldsVersion, setCustomFieldsVersion] = useState(0);
  const customFieldsRef = useRef<HTMLDivElement>(null);
  const canEditAi = hasAnyRequiredRole(user?.role, ['ADMIN', 'MANAGER']);
  const canAssign = hasAnyRequiredRole(user?.role, ['ADMIN', 'MANAGER']);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [iss, cmts, logs, hist] = await Promise.all([
        issuesApi.getIssue(id),
        commentsApi.listComments(id),
        timeApi.getIssueLogs(id),
        api.get<AuditEntry[]>(`/issues/${id}/history`).then(r => r.data),
      ]);
      setIssue(iss);
      setComments(cmts);
      setTimeLogs(logs);
      setHistory(hist);
    } catch {
      message.error('Failed to load issue');
      navigate(-1);
    }
  }, [id, navigate]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { timeApi.getActiveTimer().then(setActiveTimer); }, []);
  useEffect(() => { authApi.listUsers().then(setAllUsers).catch(() => {}); }, []);
  useEffect(() => {
    if (issue?.projectId) {
      getProjectIssueTypes(issue.projectId).then(setIssueTypeConfigs).catch(() => {});
    }
  }, [issue?.projectId]);

  // Live timer
  const timerRunning = activeTimer?.issueId === id;
  useEffect(() => {
    if (!timerRunning || !activeTimer?.startedAt) { setElapsedSec(0); return; }
    const update = () => {
      const diff = Math.floor((Date.now() - new Date(activeTimer.startedAt!).getTime()) / 1000);
      setElapsedSec(Math.max(0, diff));
    };
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, [timerRunning, activeTimer?.startedAt]);

  const handleAddComment = async () => {
    if (!id || !newComment.trim()) return;
    await commentsApi.createComment(id, newComment);
    setNewComment('');
    load();
  };

  const handleDeleteComment = async (commentId: string) => {
    await commentsApi.deleteComment(commentId);
    load();
  };

  const handleStartTimer = async () => {
    if (!id) return;
    try {
      await timeApi.startTimer(id);
      const t = await timeApi.getActiveTimer();
      setActiveTimer(t);
      message.success('Timer started');
    } catch { message.error('Could not start timer'); }
  };

  const handleStopTimer = async () => {
    if (!id) return;
    try {
      await timeApi.stopTimer(id);
      setActiveTimer(null);
      setElapsedSec(0);
      load();
      message.success('Timer stopped');
    } catch { message.error('No running timer'); }
  };

  const handleLogManual = async (vals: { hours: number; note?: string }) => {
    if (!id) return;
    await timeApi.logManual(id, vals);
    setTimeModalOpen(false);
    timeForm.resetFields();
    load();
  };

  const handleAssigneeChange = async (assigneeId: string | null) => {
    if (!id) return;
    try {
      await issuesApi.assignIssue(id, assigneeId);
      load();
      message.success('Assignee updated');
    } catch { message.error('Could not update assignee'); }
  };

  const handleToggleAiEligible = async (checked: boolean) => {
    if (!id || !issue) return;
    try {
      await issuesApi.updateAiFlags(id, {
        aiEligible: checked,
        aiAssigneeType: checked ? 'AGENT' : 'HUMAN',
      });
      const updated = await issuesApi.getIssue(id);
      setIssue(updated);
      message.success(checked ? 'Marked as agent-eligible' : 'Marked as human-only');
    } catch { message.error('Could not update agent flag'); }
  };

  const handleAiEstimate = async () => {
    if (!id) return;
    setAiEstimateLoading(true);
    try {
      await aiApi.estimateIssue({ issueId: id });
      await load();
      message.success('Оценка трудоёмкости обновлена');
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : null;
      message.error(msg || 'Не удалось оценить трудоёмкость');
    } finally { setAiEstimateLoading(false); }
  };

  const handleDeleteIssue = async () => {
    if (!id) return;
    try {
      await issuesApi.deleteIssue(id);
      message.success('Issue deleted');
      navigate(-1);
    } catch { message.error('Failed to delete issue'); }
  };

  const handleEditOpen = async () => {
    if (!issue) return;
    editForm.setFieldsValue({
      title: issue.title,
      issueTypeConfigId: issue.issueTypeConfigId ?? undefined,
      priority: issue.priority,
      assigneeId: issue.assigneeId ?? undefined,
      description: issue.description ?? '',
      acceptanceCriteria: issue.acceptanceCriteria ?? '',
      dueDate: issue.dueDate ? dayjs(issue.dueDate) : null,
    });
    try {
      const res = await issueCustomFieldsApi.getFields(issue.id);
      setEditCustomFields(res.fields);
      setEditCustomValues(Object.fromEntries(res.fields.map(f => [f.customFieldId, f.currentValue])));
    } catch {
      setEditCustomFields([]);
      setEditCustomValues({});
    }
    setEditModalOpen(true);
  };

  const handleEditTypeChange = async (newTypeId: string) => {
    if (!issue) return;
    try {
      const res = await issueCustomFieldsApi.getFields(issue.id, { issueTypeConfigId: newTypeId });
      setEditCustomFields(res.fields);
      setEditCustomValues(Object.fromEntries(res.fields.map(f => [f.customFieldId, f.currentValue])));
    } catch {
      setEditCustomFields([]);
      setEditCustomValues({});
    }
  };

  const handleEditSave = async (vals: {
    title: string;
    issueTypeConfigId?: string;
    priority: IssuePriority;
    assigneeId?: string;
    description?: string;
    acceptanceCriteria?: string;
    dueDate?: dayjs.Dayjs | null;
  }) => {
    if (!id) return;
    try {
      await issuesApi.updateIssue(id, {
        title: vals.title,
        issueTypeConfigId: vals.issueTypeConfigId,
        priority: vals.priority,
        assigneeId: vals.assigneeId,
        description: vals.description || undefined,
        acceptanceCriteria: vals.acceptanceCriteria || undefined,
        dueDate: vals.dueDate ? vals.dueDate.format('YYYY-MM-DD') : null,
      });
      if (editCustomFields.length > 0) {
        await issueCustomFieldsApi.updateFields(id, editCustomFields.map(f => ({
          customFieldId: f.customFieldId,
          value: editCustomValues[f.customFieldId] ?? null,
        })));
      }
      setEditModalOpen(false);
      setEditCustomFields([]);
      setEditCustomValues({});
      await load();
      setCustomFieldsVersion(v => v + 1);
      message.success('Issue updated');
    } catch { message.error('Could not save changes'); }
  };

  const handleAiDecompose = async () => {
    if (!id) return;
    setAiDecomposeLoading(true);
    try {
      const res = await aiApi.decomposeIssue({ issueId: id });
      await load();
      message.success(`Создано подзадач: ${res.createdCount}`);
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : null;
      message.error(msg || 'Не удалось декомпозировать задачу');
    } finally { setAiDecomposeLoading(false); }
  };

  if (!issue) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.t3, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 13 }}>
        Загрузка...
      </div>
    );
  }

  const issueKey = issue.project ? `${issue.project.key}-${issue.number}` : `#${issue.number}`;
  const typeCfg = getTypeCfg(issue.issueTypeConfig?.systemKey);
  const priorityColor = getPriorityCfg(issue.priority, isDark);

  // Total logged hours
  const totalLogged = timeLogs.reduce((sum, l) => sum + Number(l.hours), 0);

  return (
    <div style={{ display: 'flex', flex: 1, height: '100%', overflow: 'hidden' }}>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        borderRight: `1px solid ${C.border}`,
        paddingBlock: 24,
        paddingInline: 28,
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
      }}>

        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
          <button
            onClick={() => navigate(-1)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: C.t3, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 12, lineHeight: '16px' }}
          >
            ← Назад
          </button>
          <span style={{ color: C.sep, fontSize: 12, fontFamily: '"Inter", system-ui, sans-serif' }}>/</span>
          <span style={{ color: C.t3, fontSize: 12, fontFamily: '"Inter", system-ui, sans-serif' }}>
            {issue.project?.name || 'Проект'}
          </span>
          <span style={{ color: C.sep, fontSize: 12, fontFamily: '"Inter", system-ui, sans-serif' }}>/</span>
          <span style={{ color: C.acc, fontSize: 12, fontWeight: 600, fontFamily: '"Space Grotesk", system-ui, sans-serif' }}>
            {issueKey}
          </span>
        </div>

        {/* Type badge + key row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ backgroundColor: typeCfg.bg, borderRadius: 3, paddingBlock: 3, paddingInline: 8, flexShrink: 0 }}>
            <span style={{ color: typeCfg.text, fontSize: 10, fontWeight: 600, letterSpacing: '0.3px', lineHeight: '12px', fontFamily: '"Inter", system-ui, sans-serif' }}>
              {issue.issueTypeConfig?.systemKey ?? 'ISSUE'}
            </span>
          </div>
          <span style={{ color: C.acc, fontSize: 11, fontWeight: 600, fontFamily: '"Space Grotesk", system-ui, sans-serif', lineHeight: '14px' }}>
            {issueKey}
          </span>
          {/* Actions */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button
              onClick={handleEditOpen}
              style={{ background: isDark ? '#161B22' : '#FFFFFF', border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer', color: C.t2, fontSize: 12, fontFamily: '"Inter", system-ui, sans-serif' }}
            >
              Редактировать
            </button>
            <button
              onClick={() => setMoveModalOpen(true)}
              style={{ background: isDark ? '#161B22' : '#FFFFFF', border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer', color: C.t3, fontSize: 12, fontFamily: '"Inter", system-ui, sans-serif' }}
            >
              Перенести
            </button>
            {hasRequiredRole(user?.role, 'ADMIN') && (
              <Popconfirm
                title={`Удалить задачу ${issueKey}?`}
                description="Это действие нельзя отменить."
                okText="Удалить"
                okButtonProps={{ danger: true }}
                cancelText="Отмена"
                onConfirm={handleDeleteIssue}
              >
                <button style={{ background: isDark ? '#1A1A1A' : '#FFF5F5', border: `1px solid ${isDark ? '#3D1A1A' : '#FECACA'}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer', color: '#EF4444', fontSize: 12, fontFamily: '"Inter", system-ui, sans-serif' }}>
                  Удалить
                </button>
              </Popconfirm>
            )}
          </div>
        </div>

        {/* Title */}
        <h1 style={{
          color: C.t1,
          fontFamily: '"Space Grotesk", system-ui, sans-serif',
          fontSize: 20,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          lineHeight: 1.3,
          margin: 0,
          marginBottom: 20,
        }}>
          {issue.title}
        </h1>

        {/* Parent */}
        {issue.parent && (
          <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: C.t4, fontSize: 11, fontFamily: '"Inter", system-ui, sans-serif' }}>Родитель:</span>
            <Link
              to={`/issues/${issue.parent.id}`}
              style={{ color: C.acc, fontSize: 11, fontFamily: '"Inter", system-ui, sans-serif', textDecoration: 'none' }}
            >
              {issue.parent.issueTypeConfig?.systemKey ?? 'ISSUE'}-{issue.parent.number}: {issue.parent.title}
            </Link>
          </div>
        )}

        {/* Description */}
        {issue.description && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ color: C.t3, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 12, fontWeight: 600, letterSpacing: '0.5px', lineHeight: '16px', marginBottom: 8, textTransform: 'uppercase' }}>
              Описание
            </div>
            <div style={{ color: C.t2, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 13, lineHeight: 1.6 }}>
              <div className="markdown-body" style={{ color: C.t2 }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{issue.description}</ReactMarkdown>
              </div>
            </div>
          </div>
        )}

        {/* Acceptance criteria */}
        {issue.acceptanceCriteria && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ color: C.t3, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 12, fontWeight: 600, letterSpacing: '0.5px', lineHeight: '16px', marginBottom: 8, textTransform: 'uppercase' }}>
              Критерии приёмки
            </div>
            <div style={{ color: C.t2, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 13, lineHeight: 1.6 }}>
              <div className="markdown-body" style={{ color: C.t2 }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{issue.acceptanceCriteria}</ReactMarkdown>
              </div>
            </div>
          </div>
        )}

        {/* Sub-issues */}
        {issue.children && issue.children.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ color: C.t3, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 12, fontWeight: 600, letterSpacing: '0.5px', lineHeight: '16px', marginBottom: 8, textTransform: 'uppercase' }}>
              Подзадачи ({issue.children.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {issue.children.map(child => {
                const childTypeCfg = getTypeCfg(child.issueTypeConfig?.systemKey);
                const childStatusCfg = getStatusCfg(child.status as IssueStatus, isDark);
                return (
                  <Link
                    key={child.id}
                    to={`/issues/${child.id}`}
                    style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 6, backgroundColor: isDark ? '#0F1320' : '#FFFFFF', border: `1px solid ${C.border}` }}
                  >
                    <span style={{ backgroundColor: childTypeCfg.bg, color: childTypeCfg.text, fontSize: 9, fontWeight: 600, padding: '2px 5px', borderRadius: 3, fontFamily: '"Inter", system-ui, sans-serif', lineHeight: '12px' }}>
                      {child.issueTypeConfig?.systemKey ?? 'ISSUE'}
                    </span>
                    <span style={{ backgroundColor: childStatusCfg.bg, color: childStatusCfg.text, fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 10, fontFamily: '"Inter", system-ui, sans-serif', lineHeight: '14px' }}>
                      {childStatusCfg.label}
                    </span>
                    <span style={{ color: C.t2, fontSize: 12, fontFamily: '"Inter", system-ui, sans-serif', flex: 1 }}>{child.title}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Links */}
        <IssueLinksSection issueId={issue.id} />

        {/* Comments */}
        <div style={{ marginTop: 4 }}>
          <div style={{ color: C.t3, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 12, fontWeight: 600, letterSpacing: '0.5px', lineHeight: '16px', marginBottom: 12, textTransform: 'uppercase' }}>
            Комментарии ({comments.length})
          </div>

          {/* Comment list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 14 }}>
            {comments.length === 0 && (
              <span style={{ color: C.t4, fontSize: 12, fontFamily: '"Inter", system-ui, sans-serif' }}>Нет комментариев</span>
            )}
            {comments.map(c => (
              <div key={c.id} style={{ display: 'flex', gap: 10 }}>
                <Avatar name={c.author?.name} size={28} />
                <div style={{ flex: 1, backgroundColor: C.bgComment, border: `1px solid ${C.borderComment}`, borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ color: C.t2, fontSize: 12, fontWeight: 500, fontFamily: '"Inter", system-ui, sans-serif', lineHeight: '16px' }}>
                      {c.author?.name}
                    </span>
                    <span style={{ color: C.t4, fontSize: 11, fontFamily: '"Inter", system-ui, sans-serif', lineHeight: '14px' }}>
                      {new Date(c.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {(c.authorId === user?.id || hasRequiredRole(user?.role, 'ADMIN')) && (
                      <Popconfirm title="Удалить комментарий?" onConfirm={() => handleDeleteComment(c.id)}>
                        <button style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: C.t4, fontSize: 11, padding: 0 }}>
                          ✕
                        </button>
                      </Popconfirm>
                    )}
                  </div>
                  <div style={{ color: C.t3, fontSize: 12, fontFamily: '"Inter", system-ui, sans-serif', lineHeight: 1.5 }}>
                    {c.body}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* New comment input */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <Avatar name={user?.name} size={28} />
            <div style={{ flex: 1, backgroundColor: C.bgCommentNew, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <textarea
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                placeholder="Добавить комментарий... (Ctrl+Enter для отправки)"
                onKeyDown={e => { if (e.ctrlKey && e.key === 'Enter') handleAddComment(); }}
                rows={3}
                style={{
                  background: 'none', border: 'none', outline: 'none', resize: 'none', width: '100%',
                  color: C.t2, fontSize: 13, fontFamily: '"Inter", system-ui, sans-serif', lineHeight: 1.5,
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={handleAddComment}
                  disabled={!newComment.trim()}
                  style={{
                    backgroundImage: newComment.trim() ? LOGO_GRAD : 'none',
                    backgroundColor: newComment.trim() ? 'transparent' : (isDark ? '#21262D' : '#E0E0E0'),
                    border: 'none', borderRadius: 6, padding: '6px 14px',
                    color: newComment.trim() ? '#FFFFFF' : C.t4,
                    fontSize: 12, fontWeight: 500, fontFamily: '"Inter", system-ui, sans-serif',
                    cursor: newComment.trim() ? 'pointer' : 'default',
                  }}
                >
                  Отправить
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* History (full) */}
        {history.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <div style={{ color: C.t3, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 12, fontWeight: 600, letterSpacing: '0.5px', lineHeight: '16px', marginBottom: 12, textTransform: 'uppercase' }}>
              История изменений
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {history.map((h, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <Avatar name={h.user?.name} size={16} />
                  <div>
                    <span style={{ color: C.t3, fontSize: 11, fontFamily: '"Inter", system-ui, sans-serif', lineHeight: '14px' }}>
                      {h.user?.name ?? 'System'} · {h.action.replace('issue.', '').replace(/_/g, ' ')}
                      {h.details ? ` — ${JSON.stringify(h.details)}` : ''}
                    </span>
                    <div style={{ color: C.t4, fontSize: 10, fontFamily: '"Inter", system-ui, sans-serif', lineHeight: '12px' }}>
                      {new Date(h.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Right panel ─────────────────────────────────────────────────────── */}
      <div style={{
        width: 260,
        flexShrink: 0,
        overflowY: 'auto',
        backgroundColor: C.rightPanelBg,
        paddingBlock: 24,
        paddingInline: 20,
        display: 'flex',
        flexDirection: 'column',
      }}>

        {/* Status */}
        <div style={{ marginBottom: 16 }}>
          <SectionLabel C={C}>Статус</SectionLabel>
          <StatusTransitionPanel issueId={issue.id} onTransitioned={load} />
        </div>

        {/* Priority */}
        <div style={{ marginBottom: 16 }}>
          <SectionLabel C={C}>Приоритет</SectionLabel>
          <span style={{ color: priorityColor, fontSize: 12, fontWeight: 600, fontFamily: '"Inter", system-ui, sans-serif', lineHeight: '16px' }}>
            {issue.priority}
          </span>
        </div>

        {/* Assignee */}
        <div style={{ marginBottom: 16 }}>
          <SectionLabel C={C}>Исполнитель</SectionLabel>
          {canAssign ? (
            <Select
              allowClear
              size="small"
              style={{ width: '100%' }}
              placeholder="Не назначен"
              value={issue.assigneeId ?? undefined}
              onChange={val => handleAssigneeChange(val ?? null)}
              options={allUsers.map(u => ({ value: u.id, label: u.name }))}
            />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar name={issue.assignee?.name} size={24} />
              <span style={{ color: C.t2, fontSize: 12, fontFamily: '"Inter", system-ui, sans-serif', lineHeight: '16px' }}>
                {issue.assignee?.name ?? 'Не назначен'}
              </span>
            </div>
          )}
        </div>


        {/* Estimation / Actual */}
        <div style={{ marginBottom: 16 }}>
          <SectionLabel C={C}>Оценка / Факт</SectionLabel>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: C.t1, fontSize: 13, fontWeight: 700, fontFamily: '"Space Grotesk", system-ui, sans-serif', lineHeight: '16px' }}>
              {issue.estimatedHours != null ? `${Number(issue.estimatedHours).toFixed(0)}ч` : '—'}
            </span>
            <span style={{ color: C.border, fontSize: 12, fontFamily: '"Inter", system-ui, sans-serif' }}>/</span>
            <span style={{ color: priorityColor, fontSize: 13, fontWeight: 600, fontFamily: '"Space Grotesk", system-ui, sans-serif', lineHeight: '16px' }}>
              {totalLogged > 0 ? `${totalLogged.toFixed(1)}ч` : '—'}
            </span>
          </div>
        </div>

        {/* Due date */}
        {issue.dueDate && (
          <div style={{ marginBottom: 16 }}>
            <SectionLabel C={C}>Срок</SectionLabel>
            <span style={{
              color: issue.status !== 'DONE' && issue.status !== 'CANCELLED' && dayjs(issue.dueDate).isBefore(dayjs(), 'day') ? '#EF4444' : C.t2,
              fontSize: 12, fontFamily: '"Inter", system-ui, sans-serif', lineHeight: '16px',
            }}>
              {dayjs(issue.dueDate).format('DD.MM.YYYY')}
            </span>
          </div>
        )}

        {/* Divider */}
        <div style={{ height: 1, backgroundColor: C.border, marginBottom: 16, flexShrink: 0 }} />

        {/* Timer */}
        <div style={{ marginBottom: 16 }}>
          <SectionLabel C={C}>Таймер</SectionLabel>
          <div style={{ backgroundColor: C.timerBg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ color: C.accSoft, fontFamily: '"Space Grotesk", system-ui, sans-serif', fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: '24px' }}>
              {timerRunning ? formatElapsed(elapsedSec) : '00:00:00'}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {timerRunning ? (
                <button
                  onClick={handleStopTimer}
                  style={{
                    flex: 1, backgroundColor: isDark ? '#EF444426' : '#CF222E14',
                    border: `1px solid ${isDark ? '#EF44444D' : '#CF222E40'}`,
                    borderRadius: 6, padding: '6px 0', cursor: 'pointer',
                    color: isDark ? '#EF4444' : '#CF222E',
                    fontFamily: '"Inter", system-ui, sans-serif', fontSize: 11, lineHeight: '14px',
                  }}
                >
                  Стоп
                </button>
              ) : (
                <>
                  <button
                    onClick={handleStartTimer}
                    style={{
                      flex: 1, backgroundImage: LOGO_GRAD,
                      border: 'none', borderRadius: 6, padding: '6px 0', cursor: 'pointer',
                      color: '#FFFFFF',
                      fontFamily: '"Inter", system-ui, sans-serif', fontSize: 11, lineHeight: '14px',
                    }}
                  >
                    Старт
                  </button>
                  <button
                    onClick={() => setTimeModalOpen(true)}
                    style={{
                      flex: 1, backgroundColor: isDark ? '#161B22' : '#FFFFFF',
                      border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 0', cursor: 'pointer',
                      color: C.t3,
                      fontFamily: '"Inter", system-ui, sans-serif', fontSize: 11, lineHeight: '14px',
                    }}
                  >
                    Вручную
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Time logs */}
          {timeLogs.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {timeLogs.map((log, i) => {
                const isAgent = log.source === 'AGENT';
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontFamily: '"Inter", system-ui, sans-serif', color: C.t3 }}>
                    <span style={{ color: C.t2, fontWeight: 600 }}>{Number(log.hours).toFixed(2)}ч</span>
                    <span style={{ backgroundColor: isAgent ? '#A855F726' : '#3B82F626', color: isAgent ? '#A855F7' : '#3B82F6', fontSize: 9, padding: '1px 5px', borderRadius: 3, fontWeight: 600 }}>
                      {isAgent ? 'AI' : 'H'}
                    </span>
                    <span style={{ color: C.t4 }}>{new Date(log.createdAt).toLocaleDateString('ru-RU')}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ height: 1, backgroundColor: C.border, marginBottom: 16, flexShrink: 0 }} />

        {/* History (compact) */}
        {history.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <SectionLabel C={C}>История изменений</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {history.slice(0, 3).map((h, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <Avatar name={h.user?.name} size={16} />
                  <div>
                    <div>
                      <span style={{ color: C.t3, fontSize: 11, fontFamily: '"Inter", system-ui, sans-serif', lineHeight: '14px' }}>
                        {h.action.replace('issue.', '').replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div style={{ color: C.t4, fontSize: 10, fontFamily: '"Inter", system-ui, sans-serif', lineHeight: '12px' }}>
                      {new Date(h.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Custom fields */}
        <div ref={customFieldsRef}>
          <IssueCustomFieldsSection issueId={issue.id} refreshKey={customFieldsVersion} />
        </div>

        {/* AI Execution */}
        <div style={{ marginTop: 16 }}>
          <div style={{ height: 1, backgroundColor: C.border, marginBottom: 16 }} />
          <SectionLabel C={C}>AI Execution</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: C.t3, fontSize: 11, fontFamily: '"Inter", system-ui, sans-serif' }}>Agent can do this</span>
              <Switch
                size="small"
                checked={!!issue.aiEligible}
                disabled={!canEditAi}
                onChange={handleToggleAiEligible}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: C.t3, fontSize: 11, fontFamily: '"Inter", system-ui, sans-serif' }}>Agent status</span>
              {canEditAi ? (
                <Select
                  size="small"
                  style={{ width: 120 }}
                  value={issue.aiExecutionStatus ?? 'NOT_STARTED'}
                  onChange={async val => {
                    if (!id) return;
                    try {
                      await issuesApi.updateAiStatus(id, val as AiExecutionStatus);
                      const updated = await issuesApi.getIssue(id);
                      setIssue(updated);
                    } catch { message.error('Could not update agent status'); }
                  }}
                  options={[
                    { value: 'NOT_STARTED', label: 'NOT_STARTED' },
                    { value: 'IN_PROGRESS', label: 'IN_PROGRESS' },
                    { value: 'DONE', label: 'DONE' },
                    { value: 'FAILED', label: 'FAILED' },
                  ]}
                />
              ) : (
                <span style={{ color: C.t3, fontSize: 11, fontFamily: '"Inter", system-ui, sans-serif' }}>{issue.aiExecutionStatus ?? 'NOT_STARTED'}</span>
              )}
            </div>
            <button
              onClick={handleAiEstimate}
              disabled={aiEstimateLoading}
              style={{
                width: '100%', backgroundColor: isDark ? '#1E2640' : '#EEF2FF',
                border: `1px solid ${isDark ? '#2A3A6B' : '#C7D2FE'}`,
                borderRadius: 6, padding: '6px 0', cursor: 'pointer',
                color: isDark ? '#818CF8' : '#4338CA',
                fontFamily: '"Inter", system-ui, sans-serif', fontSize: 11, lineHeight: '14px',
              }}
            >
              {aiEstimateLoading ? '...' : '⚡ Оценить трудоёмкость'}
            </button>
            <button
              onClick={handleAiDecompose}
              disabled={aiDecomposeLoading || !issue.issueTypeConfig || issue.issueTypeConfig?.isSubtask === true}
              style={{
                width: '100%', backgroundColor: isDark ? '#1E2640' : '#EEF2FF',
                border: `1px solid ${isDark ? '#2A3A6B' : '#C7D2FE'}`,
                borderRadius: 6, padding: '6px 0', cursor: 'pointer',
                color: isDark ? '#818CF8' : '#4338CA',
                fontFamily: '"Inter", system-ui, sans-serif', fontSize: 11, lineHeight: '14px',
              }}
            >
              {aiDecomposeLoading ? '...' : '⬡ Декомпозировать'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Edit modal ──────────────────────────────────────────────────────── */}
      <Modal
        title="Редактировать задачу"
        open={editModalOpen}
        onCancel={() => { setEditModalOpen(false); setEditCustomFields([]); setEditCustomValues({}); }}
        onOk={() => editForm.submit()}
        okText="Сохранить"
        cancelText="Отмена"
        width={600}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" onFinish={handleEditSave}>
          <Form.Item name="title" label="Название" rules={[{ required: true, message: 'Введите название' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="issueTypeConfigId" label="Тип">
            <Select options={issueTypeConfigs.map(c => ({ value: c.id, label: c.name }))} onChange={handleEditTypeChange} />
          </Form.Item>
          <Form.Item name="priority" label="Приоритет" rules={[{ required: true }]}>
            <Select options={(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as IssuePriority[]).map(v => ({ value: v, label: v }))} />
          </Form.Item>
          <Form.Item name="assigneeId" label="Исполнитель">
            <Select allowClear placeholder="Не назначен" options={allUsers.map(u => ({ value: u.id, label: u.name }))} />
          </Form.Item>
          <Form.Item name="description" label="Описание">
            <Input.TextArea rows={4} />
          </Form.Item>
          <Form.Item name="acceptanceCriteria" label="Критерии приёмки">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="dueDate" label="Срок исполнения">
            <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
          </Form.Item>
          {editCustomFields.length > 0 && (
            <>
              <Divider orientation="left" orientationMargin={0} style={{ fontSize: 13, color: '#8c8c8c' }}>
                Дополнительные поля
              </Divider>
              {editCustomFields.map(field => (
                <Form.Item key={field.customFieldId} label={field.name} style={{ marginBottom: 12 }}>
                  <CustomFieldInput
                    field={{ ...field, currentValue: editCustomValues[field.customFieldId] ?? field.currentValue }}
                    allUsers={allUsers}
                    inlineEdit={false}
                    onSave={async v => { setEditCustomValues(prev => ({ ...prev, [field.customFieldId]: v })); }}
                  />
                </Form.Item>
              ))}
            </>
          )}
        </Form>
      </Modal>

      {/* ── Log time modal ──────────────────────────────────────────────────── */}
      <Modal
        title="Записать время"
        open={timeModalOpen}
        onCancel={() => setTimeModalOpen(false)}
        onOk={() => timeForm.submit()}
      >
        <Form form={timeForm} layout="vertical" onFinish={handleLogManual}>
          <Form.Item name="hours" label="Часы" rules={[{ required: true }]}>
            <InputNumber min={0.01} max={24} step={0.25} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="note" label="Заметка">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {moveModalOpen && issue && (
        <MoveIssueModal
          open={moveModalOpen}
          issue={issue}
          onCancel={() => setMoveModalOpen(false)}
          onSuccess={(movedIssue) => {
            setMoveModalOpen(false);
            // If moved to another project, navigate to new issue URL
            if (movedIssue.projectId !== issue.projectId) {
              navigate(`/issues/${movedIssue.id}`);
            } else {
              setIssue(movedIssue);
            }
          }}
        />
      )}
    </div>
  );
}
