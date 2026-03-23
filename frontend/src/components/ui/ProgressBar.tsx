/**
 * ProgressBar — Ф2.5 UI Kit 2.0 (TTUI-98)
 * Градиент #4F6EF7 → #7C3AED, height 3px, border-radius 99px
 */

import { Tooltip } from 'antd';

interface ProgressBarProps {
  /** 0–100 */
  value: number;
  height?: number;
  showLabel?: boolean;
  label?: string;
}

export function ProgressBar({ value, height = 3, showLabel = false, label }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));
  const tooltip = label ?? `${clamped}%`;

  const bar = (
    <div
      style={{
        width: '100%',
        height,
        borderRadius: 99,
        background: 'var(--b)',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: `${clamped}%`,
          height: '100%',
          borderRadius: 99,
          background: 'linear-gradient(90deg, var(--acc), var(--type-epic))',
          transition: 'width 0.3s ease',
        }}
      />
    </div>
  );

  if (showLabel) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
        <div style={{ flex: 1 }}>{bar}</div>
        <span style={{ fontSize: 11, color: 'var(--t2)', whiteSpace: 'nowrap', fontWeight: 500 }}>
          {clamped}%
        </span>
      </div>
    );
  }

  return <Tooltip title={tooltip}>{bar}</Tooltip>;
}
