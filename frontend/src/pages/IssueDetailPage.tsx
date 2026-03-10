import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Typography, Tag, Space, Button, Select, Descriptions, Divider, Input, List, Avatar,
  Timeline, message, Popconfirm, Card, InputNumber, Form, Modal,
} from 'antd';
import {
  ArrowLeftOutlined, CommentOutlined, HistoryOutlined, ClockCircleOutlined,
  PlayCircleOutlined, PauseCircleOutlined, DeleteOutlined,
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
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>Back</Button>
        <Tag>{issue.type}</Tag>
        <Typography.Title level={4} style={{ margin: 0 }}>{issueKey}: {issue.title}</Typography.Title>
      </Space>

      <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
        <Descriptions.Item label="Status">
          <Select value={issue.status} size="small" style={{ width: 140 }} onChange={handleStatusChange}
            options={(['OPEN','IN_PROGRESS','REVIEW','DONE','CANCELLED'] as IssueStatus[]).map(v => ({ value: v, label: v }))} />
        </Descriptions.Item>
        <Descriptions.Item label="Priority"><Tag color={PRIORITY_COLORS[issue.priority]}>{issue.priority}</Tag></Descriptions.Item>
        <Descriptions.Item label="Assignee">{issue.assignee?.name || 'Unassigned'}</Descriptions.Item>
        <Descriptions.Item label="Creator">{issue.creator?.name}</Descriptions.Item>
        {issue.parent && (
          <Descriptions.Item label="Parent">
            <Link to={`/issues/${issue.parent.id}`}>{issue.parent.type}-{issue.parent.number}: {issue.parent.title}</Link>
          </Descriptions.Item>
        )}
        <Descriptions.Item label="Created">{new Date(issue.createdAt).toLocaleDateString()}</Descriptions.Item>
      </Descriptions>

      {issue.description && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{issue.description}</Typography.Paragraph>
        </Card>
      )}

      {issue.children && issue.children.length > 0 && (
        <>
          <Divider orientation="left">Sub-issues ({issue.children.length})</Divider>
          <List size="small" dataSource={issue.children} renderItem={child => (
            <List.Item>
              <Link to={`/issues/${child.id}`}>
                <Tag>{child.type}</Tag> <Tag color={STATUS_COLORS[child.status]}>{child.status}</Tag> {child.title}
              </Link>
            </List.Item>
          )} />
        </>
      )}

      {/* Time Tracking */}
      <Divider orientation="left"><ClockCircleOutlined /> Time Tracking</Divider>
      <Space style={{ marginBottom: 12 }}>
        {timerRunning ? (
          <Button icon={<PauseCircleOutlined />} danger onClick={handleStopTimer}>Stop Timer</Button>
        ) : (
          <Button icon={<PlayCircleOutlined />} type="primary" onClick={handleStartTimer}>Start Timer</Button>
        )}
        <Button onClick={() => setTimeModalOpen(true)}>Log Time</Button>
      </Space>
      {timeLogs.length > 0 && (
        <List size="small" dataSource={timeLogs} renderItem={log => (
          <List.Item>
            <Space>
              <strong>{Number(log.hours).toFixed(2)}h</strong>
              <span>{log.user?.name}</span>
              {log.note && <Typography.Text type="secondary">— {log.note}</Typography.Text>}
              <Typography.Text type="secondary">{new Date(log.createdAt).toLocaleDateString()}</Typography.Text>
            </Space>
          </List.Item>
        )} />
      )}

      {/* Comments */}
      <Divider orientation="left"><CommentOutlined /> Comments ({comments.length})</Divider>
      <List dataSource={comments} locale={{ emptyText: 'No comments yet' }} renderItem={c => (
        <List.Item actions={c.authorId === user?.id || user?.role === 'ADMIN' ? [
          <Popconfirm key="del" title="Delete?" onConfirm={() => handleDeleteComment(c.id)}>
            <Button size="small" type="text" icon={<DeleteOutlined />} danger />
          </Popconfirm>
        ] : []}>
          <List.Item.Meta
            avatar={<Avatar>{c.author?.name?.charAt(0)}</Avatar>}
            title={<Space>{c.author?.name} <Typography.Text type="secondary">{new Date(c.createdAt).toLocaleString()}</Typography.Text></Space>}
            description={c.body}
          />
        </List.Item>
      )} />
      <Space.Compact style={{ width: '100%', marginTop: 8 }}>
        <Input.TextArea rows={2} value={newComment} onChange={e => setNewComment(e.target.value)}
          placeholder="Write a comment..." onPressEnter={e => { if (e.ctrlKey) handleAddComment(); }} />
        <Button type="primary" onClick={handleAddComment} disabled={!newComment.trim()}>Send</Button>
      </Space.Compact>

      {/* History */}
      <Divider orientation="left"><HistoryOutlined /> History</Divider>
      <Timeline items={history.map(h => ({
        children: (
          <span>
            <strong>{h.user?.name || 'System'}</strong>{' '}
            {h.action.replace('issue.', '').replace('_', ' ')}{' '}
            {h.details && <Typography.Text type="secondary" code>{JSON.stringify(h.details)}</Typography.Text>}
            <br /><Typography.Text type="secondary">{new Date(h.createdAt).toLocaleString()}</Typography.Text>
          </span>
        ),
      }))} />

      <Modal title="Log Time" open={timeModalOpen} onCancel={() => setTimeModalOpen(false)} onOk={() => timeForm.submit()}>
        <Form form={timeForm} layout="vertical" onFinish={handleLogManual}>
          <Form.Item name="hours" label="Hours" rules={[{ required: true }]}>
            <InputNumber min={0.01} max={24} step={0.25} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="note" label="Note">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
