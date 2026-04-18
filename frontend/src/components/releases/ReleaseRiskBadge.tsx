// TTMP-160 PR-6: LOW / MEDIUM / HIGH / CRITICAL release-risk badge (FR-5, FR-8).

import { Tag, Tooltip } from 'antd';
import type { ReleaseRiskLevel } from '../../api/release-checkpoints';

const CONFIG: Record<ReleaseRiskLevel, { label: string; color: string; bg: string }> = {
  LOW: { label: 'LOW', color: '#1F6F43', bg: 'rgba(82, 196, 26, 0.15)' },
  MEDIUM: { label: 'MEDIUM', color: '#8B5A00', bg: 'rgba(245, 158, 11, 0.18)' },
  HIGH: { label: 'HIGH', color: '#A34C00', bg: 'rgba(232, 128, 74, 0.22)' },
  CRITICAL: { label: 'CRITICAL', color: '#9F1239', bg: 'rgba(229, 83, 75, 0.18)' },
};

type Props = {
  level: ReleaseRiskLevel;
  score: number; // 0..1
};

export default function ReleaseRiskBadge({ level, score }: Props) {
  const cfg = CONFIG[level];
  const pct = Math.round(score * 1000) / 10; // 0..100 with one decimal
  return (
    <Tooltip title={`Риск: ${cfg.label} (${pct}%)`}>
      <Tag
        role="status"
        aria-label={`Уровень риска релиза: ${cfg.label}, ${pct}%`}
        style={{
          color: cfg.color,
          background: cfg.bg,
          border: 'none',
          fontWeight: 600,
          margin: 0,
        }}
      >
        {cfg.label}
      </Tag>
    </Tooltip>
  );
}
