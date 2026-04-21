/**
 * TTSRH-1 PR-14 — ResultsTable.
 *
 * Ant Design Table с динамическими колонками из `selected` prop.
 *
 * Публичный API:
 *   • issues — результат `/search/issues`.
 *   • columns — названия колонок для отображения (string[]).
 *   • currentJql — для click-sort → ORDER BY rewrite (canonical).
 *   • onJqlChange — запись новой JQL с обновлённым ORDER BY.
 *   • onSelectionChange — callback с выбранными issue.id[] (для BulkActionsBar).
 *   • total — для пагинации.
 *
 * Инварианты:
 *   • Click по заголовку колонки → переписываем `ORDER BY <col> [ASC|DESC]` в
 *     JQL. 3-way toggle: none → DESC → ASC → none.
 *   • `rowKey="id"` — issue.id уникален и стабилен (pre-push-reviewer паттерн).
 *   • Virtualized при >200 строк — Ant Table v5 имеет `virtual` prop.
 *   • Formatter'ы по известным колонкам (key, status, priority, assignee, даты).
 */
import { useMemo } from 'react';
import { Table, Tag, type TableProps } from 'antd';

import type { IssueSearchRow } from '../../api/search';

export interface ResultsTableProps {
  issues: IssueSearchRow[];
  columns: string[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  currentJql: string;
  onJqlChange: (jql: string) => void;
  onSelectionChange?: (ids: string[]) => void;
  isLight?: boolean;
}

const COLUMN_LABELS: Record<string, string> = {
  key: 'Ключ',
  summary: 'Название',
  status: 'Статус',
  priority: 'Приоритет',
  assignee: 'Исполнитель',
  creator: 'Автор',
  type: 'Тип',
  project: 'Проект',
  projectKey: 'Key проекта',
  due: 'Дедлайн',
  created: 'Создана',
  updated: 'Обновлена',
  sprint: 'Спринт',
  release: 'Релиз',
};

const SORTABLE = new Set([
  'key',
  'summary',
  'status',
  'priority',
  'assignee',
  'type',
  'due',
  'created',
  'updated',
  'sprint',
]);

type SortState = 'ascend' | 'descend' | null;

function parseOrderBy(jql: string): { field: string; dir: SortState } | null {
  const m = /\border\s+by\s+([A-Za-z_][A-Za-z0-9_]*)\s*(asc|desc)?/i.exec(jql);
  if (!m) return null;
  const dir: SortState = m[2]?.toLowerCase() === 'asc' ? 'ascend' : 'descend';
  return { field: m[1]!.toLowerCase(), dir };
}

function rewriteOrderBy(jql: string, field: string, dir: SortState): string {
  const withoutOrderBy = jql.replace(/\s*\border\s+by\s+.+$/i, '');
  if (dir === null) return withoutOrderBy.trim();
  const kw = dir === 'ascend' ? 'ASC' : 'DESC';
  return `${withoutOrderBy.trim()} ORDER BY ${field} ${kw}`.trim();
}

function renderCell(col: string, issue: IssueSearchRow): React.ReactNode {
  switch (col) {
    case 'key':
      return (
        <span style={{ fontFamily: '"JetBrains Mono", monospace', color: '#4F6EF7' }}>
          {issue.project?.key}-{issue.number}
        </span>
      );
    case 'summary':
      return <span>{issue.title}</span>;
    case 'status':
      return issue.workflowStatus?.name ? <Tag>{issue.workflowStatus.name}</Tag> : '—';
    case 'priority':
      return issue.priority ? <Tag color={priorityColor(issue.priority)}>{issue.priority}</Tag> : '—';
    case 'assignee':
      return issue.assignee ? issue.assignee.name : '—';
    case 'creator':
      return (issue as unknown as { creator?: { name: string } }).creator?.name ?? '—';
    case 'project':
      return issue.project?.name ?? '—';
    case 'projectKey':
      return issue.project?.key ?? '—';
    case 'due':
    case 'created':
    case 'updated': {
      const raw = issue[col] as string | Date | null | undefined;
      if (!raw) return '—';
      const d = typeof raw === 'string' ? new Date(raw) : raw;
      if (Number.isNaN(d.getTime())) return '—';
      return d.toLocaleDateString();
    }
    case 'sprint':
      return (issue as unknown as { sprint?: { name: string } }).sprint?.name ?? '—';
    case 'release':
      return (issue as unknown as { release?: { name: string } }).release?.name ?? '—';
    default:
      // Custom fields / unknown — render raw value as string.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const v = (issue as any)[col];
      if (v === null || v === undefined) return '—';
      if (typeof v === 'object') return JSON.stringify(v);
      return String(v);
  }
}

function priorityColor(p: string): string {
  switch (p) {
    case 'CRITICAL': return 'red';
    case 'HIGH': return 'orange';
    case 'MEDIUM': return 'blue';
    case 'LOW': return 'default';
    default: return 'default';
  }
}

export default function ResultsTable({
  issues,
  columns,
  total,
  page,
  pageSize,
  onPageChange,
  currentJql,
  onJqlChange,
  onSelectionChange,
}: ResultsTableProps) {
  const currentSort = useMemo(() => parseOrderBy(currentJql), [currentJql]);

  const tableCols: TableProps<IssueSearchRow>['columns'] = columns.map((col) => {
    const isSortable = SORTABLE.has(col);
    const sortOrder: SortState =
      currentSort?.field === col.toLowerCase() ? currentSort.dir : null;
    return {
      key: col,
      title: COLUMN_LABELS[col] ?? col,
      dataIndex: col,
      sorter: isSortable ? true : false,
      sortOrder,
      showSorterTooltip: isSortable ? undefined : false,
      render: (_: unknown, issue: IssueSearchRow) => renderCell(col, issue),
    };
  });

  const handleChange: TableProps<IssueSearchRow>['onChange'] = (_pagination, _filters, sorter) => {
    if (!sorter || Array.isArray(sorter)) return;
    const field = (sorter.field as string | undefined)?.toLowerCase();
    const order = sorter.order as SortState;
    if (!field) return;
    onJqlChange(rewriteOrderBy(currentJql, field, order ?? null));
  };

  return (
    <Table<IssueSearchRow>
      dataSource={issues}
      columns={tableCols}
      rowKey="id"
      size="small"
      virtual={issues.length > 200}
      scroll={issues.length > 200 ? { y: 480 } : undefined}
      pagination={{
        current: page,
        pageSize,
        total,
        showSizeChanger: false,
        onChange: onPageChange,
      }}
      onChange={handleChange}
      rowSelection={
        onSelectionChange
          ? {
              onChange: (keys) => onSelectionChange(keys.map(String)),
            }
          : undefined
      }
      data-testid="results-table"
    />
  );
}
