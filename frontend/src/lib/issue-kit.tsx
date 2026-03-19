/**
 * issue-kit.tsx — единая библиотека UI-компонентов для задач.
 * Один источник правды для статусов, приоритетов, типов задач.
 * TTUI-4 — Компонентная библиотека
 */
import { Tag, Tooltip } from 'antd';
import type { IssueStatus, IssuePriority, IssueType, IssueTypeConfig } from '../types';

// ─── Статусы ─────────────────────────────────────────────────────────────────

export const STATUS_LABEL: Record<IssueStatus, string> = {
  OPEN:        'Открыта',
  IN_PROGRESS: 'В работе',
  REVIEW:      'На ревью',
  DONE:        'Готово',
  CANCELLED:   'Отменена',
};

/** CSS-класс для тонального кружка/строки (совместим с SprintIssuesDrawer) */
export const STATUS_TONE: Record<IssueStatus, string> = {
  OPEN:        'tone-open',
  IN_PROGRESS: 'tone-inprog',
  REVIEW:      'tone-review',
  DONE:        'tone-done',
  CANCELLED:   'tone-cancelled',
};

/** Цвет для Ant Design <Tag color=...> */
export const STATUS_TAG_COLOR: Record<IssueStatus, string> = {
  OPEN:        'default',
  IN_PROGRESS: 'processing',
  REVIEW:      'warning',
  DONE:        'success',
  CANCELLED:   'error',
};

// ─── Приоритеты ───────────────────────────────────────────────────────────────

export const PRIORITY_LABEL: Record<IssuePriority, string> = {
  CRITICAL: 'Критический',
  HIGH:     'Высокий',
  MEDIUM:   'Средний',
  LOW:      'Низкий',
};

export const PRIORITY_TAG_COLOR: Record<IssuePriority, string> = {
  CRITICAL: 'red',
  HIGH:     'orange',
  MEDIUM:   'blue',
  LOW:      'default',
};

/** Символ-индикатор приоритета (Linear-style) */
export const PRIORITY_DOT: Record<IssuePriority, string> = {
  CRITICAL: '🔴',
  HIGH:     '🟠',
  MEDIUM:   '🔵',
  LOW:      '⚪',
};

// ─── Типы задач ───────────────────────────────────────────────────────────────

export const TYPE_LABEL: Record<IssueType, string> = {
  EPIC:    'Эпик',
  STORY:   'История',
  TASK:    'Задача',
  SUBTASK: 'Подзадача',
  BUG:     'Баг',
};

export const TYPE_COLOR: Record<IssueType, string> = {
  EPIC:    '#8b5cf6',
  STORY:   '#3b82f6',
  TASK:    '#5e6ad2',
  SUBTASK: '#6b7280',
  BUG:     '#e5534b',
};

/** Буква-иконка типа задачи (Linear-style) */
export const TYPE_LETTER: Record<IssueType, string> = {
  EPIC:    'E',
  STORY:   'S',
  TASK:    'T',
  SUBTASK: '↳',
  BUG:     'B',
};

// ─── Компоненты ───────────────────────────────────────────────────────────────

interface StatusTagProps {
  status: IssueStatus;
  size?: 'small' | 'default';
}

/** Тег статуса задачи — единый для всех страниц */
export function IssueStatusTag({ status, size = 'default' }: StatusTagProps) {
  return (
    <Tag
      color={STATUS_TAG_COLOR[status]}
      style={{ fontSize: size === 'small' ? 11 : 12, fontWeight: 500, margin: 0 }}
    >
      {STATUS_LABEL[status]}
    </Tag>
  );
}

interface PriorityTagProps {
  priority: IssuePriority;
  size?: 'small' | 'default';
}

/** Тег приоритета задачи — единый для всех страниц */
export function IssuePriorityTag({ priority, size = 'default' }: PriorityTagProps) {
  return (
    <Tag
      color={PRIORITY_TAG_COLOR[priority]}
      style={{ fontSize: size === 'small' ? 11 : 12, fontWeight: 500, margin: 0 }}
    >
      {PRIORITY_LABEL[priority]}
    </Tag>
  );
}

interface TypeBadgeProps {
  type: IssueType | null;
  typeConfig?: IssueTypeConfig | null;
  showLabel?: boolean;
}

function resolveTypeMeta(
  type: IssueType | null,
  typeConfig?: IssueTypeConfig | null,
): { color: string; letter: string; label: string } {
  if (typeConfig) {
    return {
      color: typeConfig.iconColor,
      letter: typeConfig.name.charAt(0).toUpperCase(),
      label: typeConfig.name,
    };
  }
  if (type) {
    return {
      color: TYPE_COLOR[type],
      letter: TYPE_LETTER[type],
      label: TYPE_LABEL[type],
    };
  }
  return { color: '#8C8C8C', letter: '?', label: 'Unknown' };
}

/** Бейдж типа задачи (цветной кружок с буквой + опциональный лейбл).
 *  Приоритет: typeConfig > type (enum fallback) */
export function IssueTypeBadge({ type, typeConfig, showLabel = false }: TypeBadgeProps) {
  const meta = resolveTypeMeta(type, typeConfig);

  const badge = (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 18,
        height: 18,
        borderRadius: 3,
        background: meta.color,
        color: '#fff',
        fontSize: 10,
        fontWeight: 700,
        lineHeight: 1,
        flexShrink: 0,
      }}
    >
      {meta.letter}
    </span>
  );

  if (showLabel) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {badge}
        <span style={{ fontSize: 12, color: 'var(--t2)' }}>{meta.label}</span>
      </span>
    );
  }

  return <Tooltip title={meta.label}>{badge}</Tooltip>;
}

interface IssueKeyProps {
  projectKey: string;
  number: number;
}

/** Ключ задачи в стиле Linear (TTMP-42) */
export function IssueKey({ projectKey, number }: IssueKeyProps) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: 'var(--t3)',
        letterSpacing: '0.02em',
        flexShrink: 0,
      }}
    >
      {projectKey}-{number}
    </span>
  );
}
