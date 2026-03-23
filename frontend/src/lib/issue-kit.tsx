/**
 * issue-kit.tsx — единая библиотека UI-компонентов для задач.
 * Один источник правды для статусов, приоритетов, типов задач.
 * TTUI-4 — Компонентная библиотека
 */
import React from 'react';
import { Tag, Tooltip } from 'antd';
import {
  ThunderboltOutlined, BookOutlined, CheckSquareOutlined, BugOutlined,
  MinusSquareOutlined, FlagOutlined, RocketOutlined, StarOutlined,
  FireOutlined, HeartOutlined, ToolOutlined, AlertOutlined, CrownOutlined,
  DatabaseOutlined, CloudOutlined, CodeOutlined, SafetyOutlined,
  ExperimentOutlined, CompassOutlined, AimOutlined,
} from '@ant-design/icons';
import type { IssueStatus, IssuePriority, IssueTypeConfig } from '../types';

const ICON_MAP: Record<string, React.ReactNode> = {
  ThunderboltOutlined:  <ThunderboltOutlined />,
  BookOutlined:         <BookOutlined />,
  CheckSquareOutlined:  <CheckSquareOutlined />,
  BugOutlined:          <BugOutlined />,
  MinusSquareOutlined:  <MinusSquareOutlined />,
  FlagOutlined:         <FlagOutlined />,
  RocketOutlined:       <RocketOutlined />,
  StarOutlined:         <StarOutlined />,
  FireOutlined:         <FireOutlined />,
  HeartOutlined:        <HeartOutlined />,
  ToolOutlined:         <ToolOutlined />,
  AlertOutlined:        <AlertOutlined />,
  CrownOutlined:        <CrownOutlined />,
  DatabaseOutlined:     <DatabaseOutlined />,
  CloudOutlined:        <CloudOutlined />,
  CodeOutlined:         <CodeOutlined />,
  SafetyOutlined:       <SafetyOutlined />,
  ExperimentOutlined:   <ExperimentOutlined />,
  CompassOutlined:      <CompassOutlined />,
  AimOutlined:          <AimOutlined />,
};

function getIcon(name: string): React.ReactNode {
  return ICON_MAP[name] ?? <CheckSquareOutlined />;
}

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



/** Буква-иконка типа задачи (fallback для системных типов без iconName) */


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
  typeConfig?: IssueTypeConfig | null;
  showLabel?: boolean;
}

function resolveTypeMeta(
  typeConfig?: IssueTypeConfig | null,
): { color: string; icon: React.ReactNode; label: string } {
  if (typeConfig) {
    return {
      color: typeConfig.iconColor,
      icon: getIcon(typeConfig.iconName),
      label: typeConfig.name,
    };
  }
  return { color: 'var(--t3)', icon: <CheckSquareOutlined />, label: 'Unknown' };
}

/** Бейдж типа задачи (цветной квадрат с иконкой + опциональный лейбл).
 *  Приоритет: typeConfig > type (enum fallback) */
export function IssueTypeBadge({ typeConfig, showLabel = false }: TypeBadgeProps) {
  const meta = resolveTypeMeta(typeConfig);

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
        color: 'var(--t1)',
        fontSize: 11,
        lineHeight: 1,
        flexShrink: 0,
      }}
    >
      {meta.icon}
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
