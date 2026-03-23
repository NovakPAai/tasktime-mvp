/**
 * AvatarGroup — Ф2.4 UI Kit 2.0 (TTUI-97)
 * Стековые аватары с +N overflow, border var(--bg-el)
 */

import { Tooltip } from 'antd';

export interface AvatarUser {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string;
}

interface AvatarGroupProps {
  users: AvatarUser[];
  max?: number;
  size?: number;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? '')
    .join('');
}

function getAvatarColor(name: string): string {
  const colors = [
    'var(--acc)', 'var(--s-review)', 'var(--s-in-progress)', 'var(--s-done)',
    'var(--type-bug)', 'var(--type-epic)', 'var(--type-story)', 'var(--type-task)',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function Avatar({ user, size }: { user: AvatarUser; size: number }) {
  const initials = getInitials(user.name);
  const color = getAvatarColor(user.name);

  return (
    <Tooltip title={user.name} placement="top">
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size,
          height: size,
          borderRadius: '50%',
          background: user.avatarUrl ? 'transparent' : color,
          border: 'var(--space-1) solid var(--bg-el)',
          fontSize: Math.max(9, size * 0.38),
          fontWeight: 600,
          color: 'var(--bg)',
          flexShrink: 0,
          overflow: 'hidden',
          cursor: 'default',
          userSelect: 'none',
        }}
      >
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt={user.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          initials
        )}
      </span>
    </Tooltip>
  );
}

export function AvatarGroup({ users, max = 4, size = 24 }: AvatarGroupProps) {
  const visible = users.slice(0, max);
  const overflow = users.length - max;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
      {visible.map((u, i) => (
        <span key={u.id} style={{ marginLeft: i === 0 ? 0 : -(size * 0.3) }}>
          <Avatar user={u} size={size} />
        </span>
      ))}
      {overflow > 0 && (
        <Tooltip title={users.slice(max).map((u) => u.name).join(', ')} placement="top">
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: size,
              height: size,
              borderRadius: '50%',
              background: 'var(--bg-hover)',
              border: 'var(--space-1) solid var(--bg-el)',
              fontSize: Math.max(9, size * 0.35),
              fontWeight: 600,
              color: 'var(--t2)',
              marginLeft: -(size * 0.3),
              cursor: 'default',
              flexShrink: 0,
            }}
          >
            +{overflow}
          </span>
        </Tooltip>
      )}
    </span>
  );
}
