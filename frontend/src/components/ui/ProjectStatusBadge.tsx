/**
 * ProjectStatusBadge — Ф2.1 UI Kit 2.0 (TTUI-94)
 * Active / OnHold / Archived с цветным dot-индикатором
 */


export type ProjectStatus = 'active' | 'onhold' | 'archived' | 'empty';

const STATUS_CONFIG: Record<ProjectStatus, { label: string; color: string; dot: string }> = {
  active:   { label: 'Active',    color: 'color-mix(in srgb, var(--s-done), transparent 85%)',  dot: 'var(--s-done)' },
  onhold:   { label: 'On Hold',   color: 'color-mix(in srgb, var(--s-in-progress), transparent 85%)', dot: 'var(--s-in-progress)' },
  archived: { label: 'Archived',  color: 'color-mix(in srgb, var(--t3), transparent 85%)', dot: 'var(--t3)' },
  empty:    { label: 'Empty',     color: 'color-mix(in srgb, var(--t3), transparent 88%)', dot: 'var(--t3)' },
};

interface ProjectStatusBadgeProps {
  status: ProjectStatus;
  size?: 'sm' | 'md';
}

export function ProjectStatusBadge({ status, size = 'md' }: ProjectStatusBadgeProps) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.empty;
  const fs = size === 'sm' ? 11 : 12;
  const px = size === 'sm' ? 'var(--space-2) var(--space-4)' : 'var(--space-2) var(--space-5)';
  const dotSz = size === 'sm' ? 5 : 6;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: px,
        borderRadius: 99,
        background: cfg.color,
        fontSize: fs,
        fontWeight: 500,
        color: cfg.dot,
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: dotSz,
          height: dotSz,
          borderRadius: '50%',
          background: cfg.dot,
          flexShrink: 0,
        }}
      />
      {cfg.label}
    </span>
  );
}
