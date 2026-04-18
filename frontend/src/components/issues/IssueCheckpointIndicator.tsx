// TTMP-160 PR-7 / FR-11: compact "violates a checkpoint" indicator for a task card.
// - Red left border + ExclamationCircle icon + counter when `violations.length > 0`.
// - Tooltip lists each violating checkpoint + its reason.
// - Renders nothing when `violations` is empty (caller always mounts it — zero DOM cost).
// - Accessibility: role="status", aria-label summarises the total count.

import { ExclamationCircleFilled } from '@ant-design/icons';
import { Tooltip } from 'antd';
import type { CSSProperties } from 'react';

export interface CheckpointViolationSlot {
  checkpointName: string;
  releaseName: string;
  reason: string;
}

type Props = {
  violations: CheckpointViolationSlot[];
  /**
   * `stripe` renders the red 3px accent as a flex-row prefix so the caller can drop the
   * indicator into the card's title area. `compact` renders just the icon + count,
   * suitable for tight inline positions. Default: `stripe`.
   */
  variant?: 'stripe' | 'compact';
  style?: CSSProperties;
};

export default function IssueCheckpointIndicator({ violations, variant = 'stripe', style }: Props) {
  if (!violations || violations.length === 0) return null;

  const summary = violations
    .map((v) => `${v.checkpointName} (${v.releaseName}): ${v.reason}`)
    .join('\n');
  const ariaLabel = `Нарушает ${violations.length} контрольных точек`;

  const tooltipContent = (
    <div style={{ maxWidth: 320 }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Нарушает контрольные точки:</div>
      <ul style={{ margin: 0, paddingLeft: 16 }}>
        {violations.map((v) => (
          // Composite key — checkpoint names may repeat across releases, so pair them.
          <li key={`${v.releaseName}::${v.checkpointName}`} style={{ marginBottom: 4 }}>
            <strong>{v.checkpointName}</strong> — {v.releaseName}
            <div style={{ color: '#fca5a5', fontSize: 12 }}>{v.reason}</div>
          </li>
        ))}
      </ul>
    </div>
  );

  if (variant === 'compact') {
    return (
      <Tooltip title={tooltipContent}>
        <span
          role="status"
          aria-label={ariaLabel}
          title={summary}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            color: '#9F1239',
            fontSize: 11,
            fontWeight: 600,
            ...style,
          }}
        >
          <ExclamationCircleFilled aria-hidden />
          {violations.length > 1 && <span>{violations.length}</span>}
        </span>
      </Tooltip>
    );
  }

  // `stripe` variant — left accent + icon + count, inline so caller controls surrounding layout.
  return (
    <Tooltip title={tooltipContent}>
      <span
        role="status"
        aria-label={ariaLabel}
        title={summary}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '2px 6px',
          borderLeft: '3px solid #E5534B',
          background: 'rgba(229, 83, 75, 0.1)',
          color: '#9F1239',
          borderRadius: 3,
          fontSize: 11,
          fontWeight: 600,
          ...style,
        }}
      >
        <ExclamationCircleFilled aria-hidden />
        <span>{violations.length === 1 ? 'КТ' : `КТ ×${violations.length}`}</span>
      </span>
    </Tooltip>
  );
}
