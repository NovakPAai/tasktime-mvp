// TTMP-160 PR-6: canonical "Checkpoints on this release" block used by both
// GlobalReleasesPage / ReleasesPage DetailPanel and (via a compact variant) the
// IssueDetailPage. Renders per-checkpoint breakdown N/M/K (FR-25), expandable
// "Прошли" and "Нарушают" lists with issue links (FR-16), and inline
// "Пересчитать" / "Удалить" actions when the caller is allowed to mutate.

import {
  DeleteOutlined,
  DownOutlined,
  ReloadOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { Button, Empty, Popconfirm, Space, Tag, message } from 'antd';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  deleteReleaseCheckpoint,
  type EvaluatedCheckpoint,
  recomputeRelease,
} from '../../api/release-checkpoints';
import type { CheckpointWeight } from '../../api/release-checkpoint-types';
import CheckpointTrafficLight from './CheckpointTrafficLight';

const WEIGHT_COLOR: Record<CheckpointWeight, string> = {
  CRITICAL: 'red',
  HIGH: 'orange',
  MEDIUM: 'gold',
  LOW: 'default',
};

type Props = {
  releaseId: string;
  checkpoints: EvaluatedCheckpoint[];
  canMutate: boolean;
  onChanged: () => void;
};

export default function CheckpointsBlock({
  releaseId,
  checkpoints,
  canMutate,
  onChanged,
}: Props) {
  if (!checkpoints || checkpoints.length === 0) {
    return <Empty description="Контрольные точки не назначены" />;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {canMutate && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <RecomputeButton releaseId={releaseId} onDone={onChanged} />
        </div>
      )}
      {checkpoints.map((cp) => (
        <CheckpointRow
          key={cp.id}
          releaseId={releaseId}
          checkpoint={cp}
          canMutate={canMutate}
          onChanged={onChanged}
        />
      ))}
    </div>
  );
}

function RecomputeButton({ releaseId, onDone }: { releaseId: string; onDone: () => void }) {
  const [loading, setLoading] = useState(false);
  return (
    <Button
      size="small"
      icon={<ReloadOutlined />}
      loading={loading}
      onClick={async () => {
        setLoading(true);
        try {
          const res = await recomputeRelease(releaseId);
          message.success(
            `Пересчитано: обновлено ${res.updatedCount}, без изменений ${res.unchangedCount}`,
          );
          onDone();
        } catch {
          message.error('Не удалось пересчитать');
        } finally {
          setLoading(false);
        }
      }}
    >
      Пересчитать
    </Button>
  );
}

function CheckpointRow({
  releaseId,
  checkpoint,
  canMutate,
  onChanged,
}: {
  releaseId: string;
  checkpoint: EvaluatedCheckpoint;
  canMutate: boolean;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState<'none' | 'passed' | 'violated'>('none');
  const toggle = (which: 'passed' | 'violated') =>
    setExpanded((prev) => (prev === which ? 'none' : which));

  const { breakdown } = checkpoint;

  const handleDelete = async () => {
    try {
      await deleteReleaseCheckpoint(releaseId, checkpoint.id);
      message.success('Контрольная точка удалена');
      onChanged();
    } catch {
      message.error('Не удалось удалить');
    }
  };

  return (
    <div
      style={{
        border: '1px solid #f0f0f0',
        borderRadius: 6,
        padding: '10px 12px',
        background: '#fafafa',
      }}
    >
      <Space
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', gap: 12 }}
        wrap
      >
        <Space size={10} wrap>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: checkpoint.checkpointType.color,
              display: 'inline-block',
            }}
            aria-hidden
          />
          <strong>{checkpoint.checkpointType.name}</strong>
          <Tag color={WEIGHT_COLOR[checkpoint.checkpointType.weight]}>
            {checkpoint.checkpointType.weight}
          </Tag>
          <CheckpointTrafficLight state={checkpoint.state} isWarning={checkpoint.isWarning} />
          <span style={{ color: '#666' }}>Дедлайн: {checkpoint.deadline}</span>
        </Space>
        <Space size={8} wrap>
          <BreakdownBadge label="Применимо" value={breakdown.applicable} color="default" />
          <BreakdownBadge
            label="Прошли"
            value={breakdown.passed}
            color="green"
            interactive={breakdown.passed > 0}
            onClick={() => toggle('passed')}
            expanded={expanded === 'passed'}
          />
          <BreakdownBadge
            label="Нарушают"
            value={breakdown.violated}
            color="red"
            interactive={breakdown.violated > 0}
            onClick={() => toggle('violated')}
            expanded={expanded === 'violated'}
          />
          {canMutate && (
            <Popconfirm
              title="Удалить контрольную точку с релиза?"
              onConfirm={handleDelete}
              okText="Удалить"
              okButtonProps={{ danger: true }}
            >
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      </Space>

      {expanded === 'passed' && (
        <IssuesSubList
          title="Прошли"
          emptyText="Ни одна задача не прошла"
          items={checkpoint.passedIssues.map((p) => ({
            issueId: p.issueId,
            issueKey: p.issueKey,
            issueTitle: p.issueTitle,
          }))}
        />
      )}
      {expanded === 'violated' && (
        <IssuesSubList
          title="Нарушают"
          emptyText="Нет нарушителей"
          items={checkpoint.violatedIssues.map((v) => ({
            issueId: v.issueId,
            issueKey: v.issueKey,
            issueTitle: v.issueTitle,
            reason: v.reason,
          }))}
        />
      )}
    </div>
  );
}

function BreakdownBadge({
  label,
  value,
  color,
  interactive,
  onClick,
  expanded,
}: {
  label: string;
  value: number;
  color: 'default' | 'green' | 'red';
  interactive?: boolean;
  onClick?: () => void;
  expanded?: boolean;
}) {
  const Caret = expanded ? DownOutlined : RightOutlined;
  const body = (
    <Tag color={color} style={{ margin: 0, cursor: interactive ? 'pointer' : 'default' }}>
      {interactive && <Caret style={{ fontSize: 10, marginRight: 4 }} />}
      {label}: {value}
    </Tag>
  );
  if (!interactive) return body;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={!!expanded}
      style={{ padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
    >
      {body}
    </button>
  );
}

interface SubListItem {
  issueId: string;
  issueKey: string;
  issueTitle: string;
  reason?: string;
}

function IssuesSubList({
  title,
  emptyText,
  items,
}: {
  title: string;
  emptyText: string;
  items: SubListItem[];
}) {
  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed #e0e0e0' }}>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>{title}</div>
      {items.length === 0 ? (
        <div style={{ color: '#999' }}>{emptyText}</div>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {items.map((i) => (
            <li key={i.issueId} style={{ marginBottom: 4 }}>
              <Link to={`/issues/${i.issueId}`}>
                <strong>{i.issueKey}</strong>
              </Link>{' '}
              — {i.issueTitle}
              {i.reason && <span style={{ color: '#c0392b' }}> — {i.reason}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
