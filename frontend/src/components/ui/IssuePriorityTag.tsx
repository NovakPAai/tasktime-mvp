/**
 * IssuePriorityTag — Ф2.2 UI Kit 2.0 (TTUI-95)
 * CRITICAL / HIGH / MEDIUM / LOW — единый компонент для всех страниц.
 * Реэкспортирует логику из lib/issue-kit с UI Kit токенами.
 */

import type { IssuePriority } from '../../types';

const PRIORITY_CONFIG: Record<IssuePriority, { label: string; color: string; bg: string }> = {
  CRITICAL: { label: 'Критический', color: 'var(--semantic-error)', bg: 'rgba(229, 83, 75, 0.12)' },
  HIGH:     { label: 'Высокий',     color: 'var(--s-in-progress)', bg: 'rgba(232, 128, 74, 0.12)' },
  MEDIUM:   { label: 'Средний',     color: 'var(--s-in-progress)', bg: 'rgba(232, 184, 74, 0.12)' },
  LOW:      { label: 'Низкий',      color: 'var(--t3)', bg: 'var(--bg-hover)' },
};

interface IssuePriorityTagProps {
  priority: IssuePriority;
  size?: 'sm' | 'md';
  showLabel?: boolean;
}

export function IssuePriorityTag({ priority, size = 'md', showLabel = true }: IssuePriorityTagProps) {
  const cfg = PRIORITY_CONFIG[priority];
  const fs = size === 'sm' ? 11 : 12;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: size === 'sm' ? '2px 6px' : '3px 8px',
        borderRadius: 6,
        background: cfg.bg,
        fontSize: fs,
        fontWeight: 500,
        color: cfg.color,
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
      }}
    >
      {showLabel ? cfg.label : priority}
    </span>
  );
}
