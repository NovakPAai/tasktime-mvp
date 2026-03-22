/**
 * ProjectCard — Ф2.6 UI Kit 2.0 (TTUI-99)
 * 3 варианта: Active (violet glow) / OnHold (amber glow) / Archived (no glow, dim)
 * Radial glow: position:absolute, right:-30px top:-30px, 100×100px
 * Avatar: gradient 36×36px square с 2-буквенными инициалами (детерминировано из key)
 */

import type { AvatarUser } from './AvatarGroup';
import { AvatarGroup } from './AvatarGroup';
import { ProgressBar } from './ProgressBar';
import { ProjectStatusBadge, type ProjectStatus } from './ProjectStatusBadge';

const GRADIENTS = [
  'linear-gradient(135deg, #4f6ef7, #7c3aed)', // синий-фиолетовый
  'linear-gradient(135deg, #10b981, #06b6d4)', // зелёный-голубой
  'linear-gradient(135deg, #f59e0b, #ef4444)', // оранжевый-красный
  'linear-gradient(135deg, #8b5cf6, #ec4899)', // фиолетовый-розовый
  'linear-gradient(135deg, #06b6d4, #3b82f6)', // голубой-синий
  'linear-gradient(135deg, #84cc16, #10b981)', // лайм-зелёный
];

function projectGradient(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) & 0xffff;
  return GRADIENTS[h % GRADIENTS.length]!;
}

function timeAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'только что';
  if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} д назад`;
  if (diff < 30 * 86400) return `${Math.floor(diff / (7 * 86400))} нед. назад`;
  return `${Math.floor(diff / (30 * 86400))} мес. назад`;
}

export interface ProjectCardData {
  id: string;
  name: string;
  key: string;
  description?: string;
  status: ProjectStatus;
  openIssues?: number;
  currentSprint?: string | null;
  completionPct?: number;
  members?: AvatarUser[];
  updatedAt?: string;
}

interface ProjectCardProps {
  project: ProjectCardData;
  onClick?: () => void;
}

const GLOW_CONFIG: Record<ProjectStatus, string | null> = {
  active:   'rgba(99,102,241,0.22)',
  onhold:   'rgba(245,158,11,0.14)',
  archived: null,
  empty:    null,
};

const CARD_BG: Record<ProjectStatus, string> = {
  active:   'var(--bg-el)',
  onhold:   'var(--bg-el)',
  archived: '#0c1019',
  empty:    'var(--bg-el)',
};

export function ProjectCard({ project, onClick }: ProjectCardProps) {
  const glowColor = GLOW_CONFIG[project.status];
  const isArchived = project.status === 'archived';
  const completion = project.completionPct ?? 0;

  const updatedLabel = project.updatedAt ? timeAgo(project.updatedAt) : null;
  const gradient = projectGradient(project.key);

  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: CARD_BG[project.status],
        border: '1px solid var(--b)',
        borderRadius: 'var(--r)',
        padding: 24,
        width: 340,
        cursor: onClick ? 'pointer' : 'default',
        opacity: isArchived ? 0.7 : 1,
        transition: 'box-shadow 0.18s, border-color 0.18s',
        boxSizing: 'border-box',
      }}
      onMouseEnter={(e) => {
        if (!isArchived) {
          (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-md)';
          (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--b2)';
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
        (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--b)';
      }}
    >
      {/* Radial glow — signature UI Kit 2.0 element */}
      {glowColor && (
        <div
          style={{
            position: 'absolute',
            right: -30,
            top: -30,
            width: 100,
            height: 100,
            borderRadius: '50%',
            background: `radial-gradient(circle farthest-corner at 50% 50%, ${glowColor} 0%, rgba(0,0,0,0) 70%)`,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 36,
              borderRadius: 8,
              background: gradient,
              color: '#ffffff',
              fontSize: 13,
              fontWeight: 700,
              fontFamily: 'var(--font-display)',
              flexShrink: 0,
              letterSpacing: '0.02em',
            }}
          >
            {project.key.slice(0, 2)}
          </span>
          <div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 15,
                fontWeight: 600,
                color: 'var(--t1)',
                lineHeight: 1.2,
              }}
            >
              {project.name}
            </div>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
              {project.key}
            </div>
          </div>
        </div>
        <ProjectStatusBadge status={project.status} size="sm" />
      </div>

      {/* Description */}
      {project.description && (
        <div
          style={{
            fontSize: 12,
            color: 'var(--t3)',
            lineHeight: 1.5,
            marginBottom: 16,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {project.description}
        </div>
      )}
      {!project.description && <div style={{ marginBottom: 16 }} />}

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--t1)', lineHeight: 1 }}>
            {project.openIssues ?? 0}
          </div>
          <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>открытых задач</div>
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--t1)', lineHeight: 1 }}>
            {project.currentSprint ?? '—'}
          </div>
          <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>текущий спринт</div>
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--acc)', lineHeight: 1 }}>
            {completion}%
          </div>
          <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>выполнено</div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: 16 }}>
        <ProgressBar value={completion} height={3} />
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {project.members && project.members.length > 0 ? (
          <AvatarGroup users={project.members} max={4} size={22} />
        ) : (
          updatedLabel ? (
            <span style={{ fontSize: 11, color: 'var(--t3)' }}>{updatedLabel}</span>
          ) : (
            <span />
          )
        )}
        {project.members && project.members.length > 0 && updatedLabel && (
          <span style={{ fontSize: 11, color: 'var(--t3)' }}>{updatedLabel}</span>
        )}
      </div>
    </div>
  );
}
