import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Typography,
  Tag,
  Space,
  Button,
  Select,
  Input,
  List,
  Avatar,
  Timeline,
  message,
  Popconfirm,
  InputNumber,
  Form,
  Modal,
  Switch,
  DatePicker,
  Divider,
} from 'antd';
import dayjs from 'dayjs';
import {
  ArrowLeftOutlined,
  CommentOutlined,
  HistoryOutlined,
  ClockCircleOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  DeleteOutlined,
  MoreOutlined,
  EditOutlined,
  ThunderboltOutlined,
  ApartmentOutlined,
} from '@ant-design/icons';
import * as issuesApi from '../api/issues';
import * as commentsApi from '../api/comments';
import * as timeApi from '../api/time';
import * as aiApi from '../api/ai';
import * as authApi from '../api/auth';
import { getProjectIssueTypes } from '../api/issue-type-configs';
import IssueLinksSection from '../components/issues/IssueLinksSection';
import IssueCustomFieldsSection from '../components/issues/IssueCustomFieldsSection';
import CustomFieldInput from '../components/issues/CustomFieldInput';
import StatusTransitionPanel from '../components/issues/StatusTransitionPanel';
import { issueCustomFieldsApi, type IssueCustomFieldValue } from '../api/issue-custom-fields';
import { useAuthStore } from '../store/auth.store';
import type { Issue, Comment, TimeLog, AuditEntry, IssuePriority, IssueTypeConfig, User, AiExecutionStatus } from '../types';
import api from '../api/client';
import { hasAnyRequiredRole, hasRequiredRole } from '../lib/roles';
import { IssueStatusTag, IssuePriorityTag, IssueTypeBadge } from '../lib/issue-kit';

export default function IssueDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [issue, setIssue] = useState<Issue | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [timeLogs, setTimeLogs] = useState<TimeLog[]>([]);
  const [history, setHistory] = useState<AuditEntry[]>([]);
  const [newComment, setNewComment] = useState('');
  const [activeTimer, setActiveTimer] = useState<TimeLog | null>(null);
  const [timeModalOpen, setTimeModalOpen] = useState(false);
  const [timeForm] = Form.useForm();
  const [aiEstimateLoading, setAiEstimateLoading] = useState(false);
  const [aiDecomposeLoading, setAiDecomposeLoading] = useState(false);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [issueTypeConfigs, setIssueTypeConfigs] = useState<IssueTypeConfig[]>([]);
  const [editModalOpen, setEditModalOpen] = useState(false);
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
    } catch {
      message.error('Could not update assignee');
    }
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
    } catch {
      message.error('Could not update agent flag');
    }
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
    } finally {
      setAiEstimateLoading(false);
    }
  };

  const handleDeleteIssue = async () => {
    if (!id) return;
    try {
      await issuesApi.deleteIssue(id);
      message.success('Issue deleted');
      navigate(-1);
    } catch {
      message.error('Failed to delete issue');
    }
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
    } catch {
      message.error('Could not save changes');
    }
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
    } finally {
      setAiDecomposeLoading(false);
    }
  };

  if (!issue) return <div style={{ padding: 'var(--space-8)' }}>Loading...</div>;

  const issueKey = issue.project ? `${issue.project.key}-${issue.number}` : `#${issue.number}`;
  const timerRunning = activeTimer?.issueId === id;

  return (
    <div className="tt-page tt-issue-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(-1)}
          style={{ padding: 'var(--space-2) var(--space-4)', color: 'var(--t2)' }}
        >
          Back
        </Button>
      </div>

      <header className="tt-issue-header">
        <div className="tt-issue-header-main">
          <div className="tt-issue-breadcrumbs">
            <span>Issues</span>
            <span className="tt-issue-breadcrumb-sep">/</span>
            <span>{issue.project?.name || 'Project'}</span>
          </div>
          <div className="tt-issue-title-row">
            <h1 className="tt-page-title">{issue.title}</h1>
            <div className="tt-issue-id-badge">
              <span>{issueKey}</span>
            </div>
            <IssueTypeBadge typeConfig={issue.issueTypeConfig} showLabel />
          </div>
          <div className="tt-issue-header-meta">
            <span>
              Created by {issue.creator?.name ?? 'Unknown'} on{' '}
              {new Date(issue.createdAt).toLocaleDateString()}
            </span>
            {issue.parent && (
              <span>
                Parent:{' '}
                <Link to={`/issues/${issue.parent.id}`}>
                  {issue.parent.issueTypeConfig?.systemKey ?? 'ISSUE'}-{issue.parent.number}: {issue.parent.title}
                </Link>
              </span>
            )}
          </div>
        </div>
        <div className="tt-issue-header-actions">
          <Button size="small" icon={<EditOutlined />} onClick={handleEditOpen}>
            Edit
          </Button>
          {hasRequiredRole(user?.role, 'ADMIN') && (
            <Popconfirm
              title={`Удалить задачу ${issueKey}?`}
              description="Это действие нельзя отменить."
              okText="Удалить"
              okButtonProps={{ danger: true }}
              cancelText="Отмена"
              onConfirm={handleDeleteIssue}
            >
              <Button size="small" danger icon={<DeleteOutlined />}>
                Delete
              </Button>
            </Popconfirm>
          )}
          <Button size="small" icon={<MoreOutlined />} />
        </div>
      </header>

      <div className="tt-issue-main">
        <div className="tt-issue-main-body">
          {issue.description && (
            <section>
              <h3 className="tt-issue-section-title">Description</h3>
              <div className="tt-issue-description">
                <div className="markdown-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{issue.description}</ReactMarkdown>
                </div>
              </div>
            </section>
          )}

          {issue.acceptanceCriteria && (
            <section>
              <h3 className="tt-issue-section-title">Acceptance Criteria</h3>
              <div className="tt-issue-description">
                <div className="markdown-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{issue.acceptanceCriteria}</ReactMarkdown>
                </div>
              </div>
            </section>
          )}

          {issue.children && issue.children.length > 0 && (
            <section>
              <h3 className="tt-issue-section-title">
                Sub-issues ({issue.children.length})
              </h3>
              <List
                size="small"
                className="tt-issue-subissues-list"
                dataSource={issue.children}
                renderItem={(child) => (
                  <List.Item>
                    <Link to={`/issues/${child.id}`}>
                      <IssueTypeBadge typeConfig={child.issueTypeConfig} />{' '}
                      <IssueStatusTag status={child.status} size="small" />{' '}
                      {child.title}
                    </Link>
                  </List.Item>
                )}
              />
            </section>
          )}

          <IssueLinksSection issueId={issue.id} />

          <section className="tt-issue-activity">
            <h3 className="tt-issue-section-title">
              <CommentOutlined style={{ marginRight: 6 }} />
              Activity &amp; Comments ({comments.length})
            </h3>

            <div className="tt-issue-comments">
              <List
                dataSource={comments}
                locale={{ emptyText: 'No comments yet' }}
                renderItem={(c) => (
                  <List.Item style={{ paddingInline: 0 }}>
                    <div className="tt-comment-item">
                      <div className="tt-comment-avatar">
                        <Avatar size={28}>{c.author?.name?.charAt(0)}</Avatar>
                      </div>
                      <div className="tt-comment-bubble">
                        <div className="tt-comment-meta">
                          <span className="tt-comment-author">{c.author?.name}</span>
                          <span className="tt-comment-date">
                            {new Date(c.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="tt-comment-body">{c.body}</div>
                      </div>
                      {(c.authorId === user?.id || hasRequiredRole(user?.role, 'ADMIN')) && (
                        <div className="tt-comment-actions">
                          <Popconfirm
                            title="Delete comment?"
                            onConfirm={() => handleDeleteComment(c.id)}
                          >
                            <Button
                              size="small"
                              type="text"
                              icon={<DeleteOutlined />}
                              danger
                            />
                          </Popconfirm>
                        </div>
                      )}
                    </div>
                  </List.Item>
                )}
              />

              <Space.Compact
                style={{ width: '100%', marginTop: 'var(--space-2)' }}
                className="tt-comment-input"
              >
                <Input.TextArea
                  rows={2}
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Write a comment... (Ctrl+Enter to send)"
                  onPressEnter={(e) => {
                    if (e.ctrlKey) {
                      handleAddComment();
                    }
                  }}
                />
                <Button
                  type="primary"
                  onClick={handleAddComment}
                  disabled={!newComment.trim()}
                >
                  Send
                </Button>
              </Space.Compact>
            </div>

            <div className="tt-issue-history">
              <h3 className="tt-issue-section-title">
                <HistoryOutlined style={{ marginRight: 6 }} />
                History
              </h3>
              <Timeline
                items={history.map((h) => ({
                  children: (
                    <span>
                      <strong>{h.user?.name || 'System'}</strong>{' '}
                      {h.action.replace('issue.', '').replace('_', ' ')}{' '}
                      {h.details && (
                        <Typography.Text type="secondary" code>
                          {JSON.stringify(h.details)}
                        </Typography.Text>
                      )}
                      <br />
                      <Typography.Text type="secondary">
                        {new Date(h.createdAt).toLocaleString()}
                      </Typography.Text>
                    </span>
                  ),
                }))}
              />
            </div>
          </section>
        </div>

        <aside className="tt-issue-main-aside">
          <div className="tt-panel">
            <div className="tt-panel-header">Details</div>
            <div className="tt-panel-body">
              <div className="tt-panel-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
                <span>Status</span>
                <StatusTransitionPanel issueId={issue.id} onTransitioned={load} />
              </div>
              <div className="tt-panel-row">
                <span>Priority</span>
                <IssuePriorityTag priority={issue.priority} size="small" />
              </div>
              <div className="tt-panel-row">
                <span>Assignee</span>
                {canAssign ? (
                  <Select
                    allowClear
                    size="small"
                    style={{ width: 160 }}
                    placeholder="Unassigned"
                    value={issue.assigneeId ?? undefined}
                    onChange={(val) => handleAssigneeChange(val ?? null)}
                    options={allUsers.map((u) => ({ value: u.id, label: u.name }))}
                  />
                ) : (
                  <span>{issue.assignee?.name || 'Unassigned'}</span>
                )}
              </div>
              <div className="tt-panel-row">
                <span>Key</span>
                <span className="tt-mono" style={{ fontSize: 11 }}>
                  {issueKey}
                </span>
              </div>
              {(issue.estimatedHours != null && issue.estimatedHours !== undefined) && (
                <div className="tt-panel-row">
                  <span>Estimated</span>
                  <span className="tt-mono">{Number(issue.estimatedHours).toFixed(1)} h</span>
                </div>
              )}
              <div className="tt-panel-row">
                <span>Срок исполнения</span>
                {issue.dueDate ? (
                  <span>
                    {dayjs(issue.dueDate).format('DD.MM.YYYY')}
                    {issue.status !== 'DONE' && issue.status !== 'CANCELLED' && dayjs(issue.dueDate).isBefore(dayjs(), 'day') && (
                      <Tag color="red" style={{ marginLeft: 'var(--space-2)', fontSize: 10 }}>просрочено</Tag>
                    )}
                  </span>
                ) : (
                  <span style={{ color: '#bbb' }}>—</span>
                )}
              </div>
              <div className="tt-panel-row">
                <span>Created</span>
                <span>{new Date(issue.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          <div ref={customFieldsRef}>
            <IssueCustomFieldsSection issueId={issue.id} refreshKey={customFieldsVersion} />
          </div>

          <div className="tt-panel">
            <div className="tt-panel-header">AI Execution</div>
            <div className="tt-panel-body">
              <div className="tt-panel-row">
                <span>Agent can do this</span>
                <Switch
                  size="small"
                  checked={!!issue.aiEligible}
                  disabled={!canEditAi}
                  onChange={handleToggleAiEligible}
                />
              </div>
              <div className="tt-panel-row">
                <span>Executor</span>
                <span>
                  {issue.aiAssigneeType === 'AGENT' || (issue.aiEligible && !issue.aiAssigneeType)
                    ? 'Agent'
                    : issue.aiAssigneeType === 'MIXED'
                      ? 'Agent + Human'
                      : 'Human'}
                </span>
              </div>
              <div className="tt-panel-row">
                <span>Agent status</span>
                {canEditAi ? (
                  <Select
                    size="small"
                    style={{ width: 140 }}
                    value={issue.aiExecutionStatus ?? 'NOT_STARTED'}
                    onChange={async (val) => {
                      if (!id) return;
                      try {
                        await issuesApi.updateAiStatus(id, val as AiExecutionStatus);
                        const updated = await issuesApi.getIssue(id);
                        setIssue(updated);
                        message.success('Agent status updated');
                      } catch {
                        message.error('Could not update agent status');
                      }
                    }}
                    options={[
                      { value: 'NOT_STARTED', label: 'NOT_STARTED' },
                      { value: 'IN_PROGRESS', label: 'IN_PROGRESS' },
                      { value: 'DONE', label: 'DONE' },
                      { value: 'FAILED', label: 'FAILED' },
                    ]}
                  />
                ) : (
                  <span>{issue.aiExecutionStatus ?? 'NOT_STARTED'}</span>
                )}
              </div>
              <div className="tt-panel-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 'var(--space-4)' }}>
                <Button
                  type="default"
                  size="small"
                  icon={<ThunderboltOutlined />}
                  loading={aiEstimateLoading}
                  onClick={handleAiEstimate}
                >
                  Оценить трудоёмкость
                </Button>
                <Button
                  type="default"
                  size="small"
                  icon={<ApartmentOutlined />}
                  loading={aiDecomposeLoading}
                  onClick={handleAiDecompose}
                  disabled={!issue.issueTypeConfig || issue.issueTypeConfig?.isSubtask === true}
                >
                  Декомпозировать в подзадачи
                </Button>
              </div>
            </div>
          </div>

          <div className="tt-panel">
            <div className="tt-panel-header">
              <span>
                <ClockCircleOutlined style={{ marginRight: 6 }} />
                Time Tracking
              </span>
            </div>
            <div className="tt-panel-body" style={{ padding: 10 }}>
              <Space style={{ marginBottom: 'var(--space-4)' }}>
                {timerRunning ? (
                  <Button
                    icon={<PauseCircleOutlined />}
                    danger
                    size="small"
                    onClick={handleStopTimer}
                  >
                    Stop
                  </Button>
                ) : (
                  <Button
                    icon={<PlayCircleOutlined />}
                    type="primary"
                    size="small"
                    onClick={handleStartTimer}
                  >
                    Start
                  </Button>
                )}
                <Button size="small" onClick={() => setTimeModalOpen(true)}>
                  Log time
                </Button>
              </Space>
              {timeLogs.length > 0 && (
                <List
                  size="small"
                  dataSource={timeLogs}
                  renderItem={(log) => {
                    const isAgent = log.source === 'AGENT';
                    const modelLabel =
                      isAgent && log.agentSession
                        ? `${log.agentSession.model}`
                        : undefined;

                    return (
                      <List.Item style={{ paddingInline: 0 }}>
                        <Space size={6}>
                          <strong>{Number(log.hours).toFixed(2)}h</strong>
                          {isAgent ? (
                            <Tag color="purple" style={{ marginInlineEnd: 0 }}>
                              AI{modelLabel ? ` · ${modelLabel}` : ''}
                            </Tag>
                          ) : (
                            <Tag color="blue" style={{ marginInlineEnd: 0 }}>
                              Human
                            </Tag>
                          )}
                          {!isAgent && <span>{log.user?.name}</span>}
                          {isAgent && log.costMoney != null && (
                            <Typography.Text type="secondary" className="tt-mono">
                              · {Number(log.costMoney).toFixed(4)}
                            </Typography.Text>
                          )}
                          {log.note && (
                            <Typography.Text type="secondary">
                              — {log.note}
                            </Typography.Text>
                          )}
                          <Typography.Text type="secondary">
                            {new Date(log.createdAt).toLocaleDateString()}
                          </Typography.Text>
                        </Space>
                      </List.Item>
                    );
                  }}
                />
              )}
            </div>
          </div>
        </aside>
      </div>

      <Modal
        title="Edit Issue"
        open={editModalOpen}
        onCancel={() => {
          setEditModalOpen(false);
          setEditCustomFields([]);
          setEditCustomValues({});
        }}
        onOk={() => editForm.submit()}
        okText="Save"
        cancelText="Cancel"
        width={600}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" onFinish={handleEditSave}>
          <Form.Item name="title" label="Title" rules={[{ required: true, message: 'Title is required' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="issueTypeConfigId" label="Type">
            <Select
              options={issueTypeConfigs.map((c) => ({
                value: c.id,
                label: c.name,
              }))}
              onChange={handleEditTypeChange}
            />
          </Form.Item>
          <Form.Item name="priority" label="Priority" rules={[{ required: true }]}>
            <Select
              options={(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as IssuePriority[]).map((v) => ({
                value: v,
                label: v,
              }))}
            />
          </Form.Item>
          <Form.Item name="assigneeId" label="Assignee">
            <Select
              allowClear
              placeholder="Unassigned"
              options={allUsers.map((u) => ({ value: u.id, label: u.name }))}
            />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={4} />
          </Form.Item>
          <Form.Item name="acceptanceCriteria" label="Acceptance Criteria">
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
                <Form.Item
                  key={field.customFieldId}
                  label={
                    <span>
                      {field.isRequired && <Typography.Text type="danger">* </Typography.Text>}
                      {field.name}
                    </span>
                  }
                  style={{ marginBottom: 12 }}
                >
                  <CustomFieldInput
                    field={{ ...field, currentValue: editCustomValues[field.customFieldId] ?? field.currentValue }}
                    allUsers={allUsers}
                    inlineEdit={false}
                    onSave={async (v) => {
                      setEditCustomValues(prev => ({ ...prev, [field.customFieldId]: v }));
                    }}
                  />
                </Form.Item>
              ))}
            </>
          )}
        </Form>
      </Modal>

      <Modal
        title="Log Time"
        open={timeModalOpen}
        onCancel={() => setTimeModalOpen(false)}
        onOk={() => timeForm.submit()}
      >
        <Form form={timeForm} layout="vertical" onFinish={handleLogManual}>
          <Form.Item name="hours" label="Hours" rules={[{ required: true }]}>
            <InputNumber
              min={0.01}
              max={24}
              step={0.25}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item name="note" label="Note">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

    </div>
  );
}
