// TTMP-160 PR-6 — FR-20 + FR-22 block for IssueDetailPage.
// FR-20: group active checkpoints by release (one issue may belong to several).
// FR-22: show violation history (open + resolved events) below the active groups.

import { Alert, Collapse, Empty, Space, Spin, Tag } from 'antd';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  type CheckpointViolationEvent,
  type IssueCheckpointsGroup,
  getIssueCheckpointEvents,
  getIssueCheckpoints,
} from '../../api/release-checkpoints';
import type { CheckpointWeight } from '../../api/release-checkpoint-types';
import CheckpointTrafficLight from './CheckpointTrafficLight';

const WEIGHT_COLOR: Record<CheckpointWeight, string> = {
  CRITICAL: 'red',
  HIGH: 'orange',
  MEDIUM: 'gold',
  LOW: 'default',
};

type Props = { issueId: string };

export default function IssueCheckpointsSection({ issueId }: Props) {
  const [groups, setGroups] = useState<IssueCheckpointsGroup[] | null>(null);
  const [events, setEvents] = useState<CheckpointViolationEvent[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    // Cancellation guard: if `issueId` changes (or the component unmounts) while the
    // parallel fetches are in flight, we must not write stale state for the prior issue.
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(false);
      const [g, e] = await Promise.allSettled([
        getIssueCheckpoints(issueId),
        getIssueCheckpointEvents(issueId),
      ]);
      if (cancelled) return;
      setGroups(g.status === 'fulfilled' ? g.value : []);
      setEvents(e.status === 'fulfilled' ? e.value : []);
      if (g.status === 'rejected' && e.status === 'rejected') setError(true);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [issueId]);

  if (loading) {
    return (
      <div style={{ padding: 12 }}>
        <Spin />
      </div>
    );
  }
  if (error) {
    return <Alert type="warning" message="Не удалось загрузить контрольные точки" showIcon />;
  }

  const hasGroups = groups && groups.length > 0;
  const hasEvents = events && events.length > 0;

  if (!hasGroups && !hasEvents) {
    return <Empty description="Контрольные точки этой задачи не затрагивают" />;
  }

  const items: Array<{ key: string; label: React.ReactNode; children: React.ReactNode }> = [];

  if (hasGroups) {
    for (const g of groups!) {
      items.push({
        key: `group-${g.releaseId}`,
        label: (
          <Space>
            <strong>{g.releaseName}</strong>
            <Tag>{g.checkpoints.length} контрольных точек</Tag>
          </Space>
        ),
        children: (
          <Space direction="vertical" style={{ width: '100%' }} size={6}>
            {g.checkpoints.map((cp) => {
              const isViolator = cp.violatedIssues.some((v) => v.issueId === issueId);
              const thisIssueReason = cp.violatedIssues.find((v) => v.issueId === issueId)?.reason;
              return (
                <div
                  key={cp.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    border: '1px solid #f0f0f0',
                    borderRadius: 6,
                    padding: '8px 10px',
                    background: isViolator ? 'rgba(229, 83, 75, 0.04)' : '#fafafa',
                    flexWrap: 'wrap',
                    gap: 8,
                  }}
                >
                  <Space size={8} wrap>
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: cp.checkpointType.color,
                        display: 'inline-block',
                      }}
                      aria-hidden
                    />
                    <strong>{cp.checkpointType.name}</strong>
                    <Tag color={WEIGHT_COLOR[cp.checkpointType.weight]}>
                      {cp.checkpointType.weight}
                    </Tag>
                    <span style={{ color: '#666' }}>до {cp.deadline}</span>
                  </Space>
                  <Space size={8} wrap>
                    <CheckpointTrafficLight
                      state={isViolator ? 'VIOLATED' : cp.state}
                      isWarning={!isViolator && cp.isWarning}
                    />
                    {isViolator && thisIssueReason && (
                      <span style={{ color: '#c0392b', fontSize: 12 }}>{thisIssueReason}</span>
                    )}
                  </Space>
                </div>
              );
            })}
          </Space>
        ),
      });
    }
  }

  if (hasEvents) {
    items.push({
      key: 'history',
      label: (
        <Space>
          <strong>История нарушений</strong>
          <Tag>{events!.length}</Tag>
        </Space>
      ),
      children: <EventsList events={events!} />,
    });
  }

  return <Collapse items={items} defaultActiveKey={hasGroups ? [`group-${groups![0]!.releaseId}`] : ['history']} />;
}

function EventsList({ events }: { events: CheckpointViolationEvent[] }) {
  if (events.length === 0) return <Empty description="Нарушений не было" />;
  return (
    <ul style={{ margin: 0, paddingLeft: 18 }}>
      {events.map((e) => (
        <li key={e.id} style={{ marginBottom: 6 }}>
          <Space size={6} wrap>
            <span style={{ color: '#666' }}>{formatDateTime(e.occurredAt)}</span>
            <span>—</span>
            <span>
              нарушена КТ <strong>«{e.checkpointName}»</strong> в релизе{' '}
              <Link to={`/releases?selected=${e.releaseId}`}>{e.releaseName}</Link>
            </span>
            <span style={{ color: '#c0392b' }}>({e.reason})</span>
            {e.resolvedAt ? (
              <Tag color="green">исправлена {formatDateTime(e.resolvedAt)}</Tag>
            ) : (
              <Tag color="red">открыта</Tag>
            )}
          </Space>
        </li>
      ))}
    </ul>
  );
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}
