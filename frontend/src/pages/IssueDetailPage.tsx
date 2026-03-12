import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Typography,
  Tag,
  Space,
  Button,
  Select,
  Descriptions,
  Input,
  List,
  Avatar,
  Timeline,
  message,
  Popconfirm,
  InputNumber,
  Form,
  Modal,
} from 'antd';
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
} from '@ant-design/icons';
import * as issuesApi from '../api/issues';
import * as commentsApi from '../api/comments';
import * as timeApi from '../api/time';
import { useAuthStore } from '../store/auth.store';
import type { Issue, Comment, TimeLog, AuditEntry, IssueStatus, IssuePriority } from '../types';
import api from '../api/client';

const PRIORITY_COLORS: Record<IssuePriority, string> = { CRITICAL: 'red', HIGH: 'orange', MEDIUM: 'blue', LOW: 'default' };
const STATUS_COLORS: Record<IssueStatus, string> = { OPEN: 'default', IN_PROGRESS: 'processing', REVIEW: 'warning', DONE: 'success', CANCELLED: 'error' };

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

  const load = useCallback(async () => {
    if (!id) return;
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
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { timeApi.getActiveTimer().then(setActiveTimer); }, []);

  const handleStatusChange = async (status: IssueStatus) => {
    if (!id) return;
    await issuesApi.updateStatus(id, status);
    load();
  };

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

  if (!issue) return <div style={{ padding: 24 }}>Loading...</div>;

  const issueKey = issue.project ? `${issue.project.key}-${issue.number}` : `#${issue.number}`;
  const timerRunning = activeTimer?.issueId === id;

  return (
    <div className="tt-page tt-issue-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(-1)}
          style={{ padding: '4px 8px', color: 'var(--t2)' }}
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
            <Tag>{issue.type}</Tag>
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
                  {issue.parent.type}-{issue.parent.number}: {issue.parent.title}
                </Link>
              </span>
            )}
          </div>
        </div>
        <div className="tt-issue-header-actions">
          <Button size="small" icon={<EditOutlined />}>
            Edit
          </Button>
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
                      <Tag>{child.type}</Tag>{' '}
                      <Tag color={STATUS_COLORS[child.status]}>{child.status}</Tag>{' '}
                      {child.title}
                    </Link>
                  </List.Item>
                )}
              />
            </section>
          )}

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
                      {(c.authorId === user?.id || user?.role === 'ADMIN') && (
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
                style={{ width: '100%', marginTop: 4 }}
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
              <div className="tt-panel-row">
                <span>Status</span>
                <Select
                  value={issue.status}
                  size="small"
                  style={{ width: 140 }}
                  onChange={handleStatusChange}
                  options={(
                    ['OPEN', 'IN_PROGRESS', 'REVIEW', 'DONE', 'CANCELLED'] as IssueStatus[]
                  ).map((v) => ({ value: v, label: v }))}
                />
              </div>
              <div className="tt-panel-row">
                <span>Priority</span>
                <Tag color={PRIORITY_COLORS[issue.priority]}>{issue.priority}</Tag>
              </div>
              <div className="tt-panel-row">
                <span>Assignee</span>
                <span>{issue.assignee?.name || 'Unassigned'}</span>
              </div>
              <div className="tt-panel-row">
                <span>Key</span>
                <span className="tt-mono" style={{ fontSize: 11 }}>
                  {issueKey}
                </span>
              </div>
              <div className="tt-panel-row">
                <span>Created</span>
                <span>{new Date(issue.createdAt).toLocaleDateString()}</span>
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
              <Space style={{ marginBottom: 8 }}>
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
                  renderItem={(log) => (
                    <List.Item style={{ paddingInline: 0 }}>
                      <Space size={6}>
                        <strong>{Number(log.hours).toFixed(2)}h</strong>
                        <span>{log.user?.name}</span>
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
                  )}
                />
              )}
            </div>
          </div>
        </aside>
      </div>

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
