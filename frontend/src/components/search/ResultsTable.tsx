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
import { Link } from 'react-router-dom';

import type { IssueSearchRow, SchemaField } from '../../api/search';

export interface ResultsTableProps {
  issues: IssueSearchRow[];
  columns: string[];
  /**
   * Custom-field metadata from `/search/schema`. Used to resolve column names
   * that aren't system fields — the compiler stores values under
   * `issue.customFieldValues[]` keyed by `customFieldId`, so the table needs
   * the `{ id, name }` mapping to find them. Optional so the legacy prop
   * shape (system-only columns) keeps working.
   */
  customFields?: SchemaField[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  currentJql: string;
  onJqlChange: (jql: string) => void;
  onSelectionChange?: (ids: string[]) => void;
  /** Controlled selection — parent resets on JQL/page change so the bulk bar doesn't lie. */
  selectedIds?: string[];
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

// Must mirror backend SYSTEM_FIELDS `sortable: true` flags (search.schema.ts).
const SORTABLE = new Set([
  'key',
  'summary',
  'status',
  'priority',
  'assignee',
  'type',
  'project',
  'due',
  'created',
  'updated',
  'sprint',
  'release',
]);

type SortState = 'ascend' | 'descend' | null;

function parseOrderBy(jql: string): { field: string; dir: SortState } | null {
  const m = /\border\s+by\s+([A-Za-z_][A-Za-z0-9_]*)\s*(asc|desc)?/i.exec(jql);
  if (!m) return null;
  // Missing direction keyword → SQL default (ascending in most dialects). Return
  // `null` so the header indicator doesn't lie about descending. If the user
  // clicks again, the 3-way toggle promotes to `descend`.
  const raw = m[2]?.toLowerCase();
  const dir: SortState = raw === 'asc' ? 'ascend' : raw === 'desc' ? 'descend' : null;
  return { field: m[1]!.toLowerCase(), dir };
}

function rewriteOrderBy(jql: string, field: string, dir: SortState): string {
  const withoutOrderBy = jql.replace(/\s*\border\s+by\s+.+$/i, '');
  if (dir === null) return withoutOrderBy.trim();
  const kw = dir === 'ascend' ? 'ASC' : 'DESC';
  return `${withoutOrderBy.trim()} ORDER BY ${field} ${kw}`.trim();
}

/**
 * Unwrap the JSON envelope `{ v: ... }` used for custom-field values in
 * Postgres. Backend stores every CF value under the `v` key so queries can
 * target a stable path; when rendering we transparently drop the wrapper.
 */
function extractCustomFieldValue(raw: unknown): unknown {
  if (raw && typeof raw === 'object' && 'v' in raw) {
    return (raw as { v: unknown }).v;
  }
  return raw;
}

function formatCustomFieldValue(v: unknown): React.ReactNode {
  if (v === null || v === undefined) return '—';
  if (Array.isArray(v)) {
    if (v.length === 0) return '—';
    return v.map((x) => (x === null || x === undefined ? '' : String(x))).join(', ');
  }
  if (typeof v === 'boolean') return v ? 'Да' : 'Нет';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function renderCell(
  col: string,
  issue: IssueSearchRow,
  customFieldsByName: Map<string, SchemaField>,
): React.ReactNode {
  switch (col) {
    case 'key':
      return (
        <Link
          to={`/issues/${issue.id}`}
          style={{
            fontFamily: '"JetBrains Mono", monospace',
            color: '#4F6EF7',
            textDecoration: 'none',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {issue.project?.key}-{issue.number}
        </Link>
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
    default: {
      // Custom fields — look up by configured name (case-insensitive to match
      // the backend schema loader), then extract the `{ v: ... }` envelope.
      const cf = customFieldsByName.get(col.toLowerCase());
      if (cf?.uuid && issue.customFieldValues) {
        const row = issue.customFieldValues.find((r) => r.customFieldId === cf.uuid);
        if (!row) return '—';
        return formatCustomFieldValue(extractCustomFieldValue(row.value));
      }
      // Unknown column — attempt the legacy flat-key lookup so older
      // integrations (exported rows with flat keys) don't silently render '—'.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const v = (issue as any)[col];
      if (v === null || v === undefined) return '—';
      if (typeof v === 'object') return JSON.stringify(v);
      return String(v);
    }
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
  customFields,
  total,
  page,
  pageSize,
  onPageChange,
  currentJql,
  onJqlChange,
  onSelectionChange,
  selectedIds,
}: ResultsTableProps) {
  const currentSort = useMemo(() => parseOrderBy(currentJql), [currentJql]);
  // Case-insensitive name → SchemaField index. Built once per customFields
  // change so renderCell can resolve custom-field columns in O(1).
  const customFieldsByName = useMemo(() => {
    const map = new Map<string, SchemaField>();
    for (const cf of customFields ?? []) map.set(cf.name.toLowerCase(), cf);
    return map;
  }, [customFields]);

  const tableCols: TableProps<IssueSearchRow>['columns'] = columns.map((col) => {
    const isSortable = SORTABLE.has(col);
    const sortOrder: SortState =
      currentSort?.field === col.toLowerCase() ? currentSort.dir : null;
    const cf = customFieldsByName.get(col.toLowerCase());
    return {
      key: col,
      title: COLUMN_LABELS[col] ?? cf?.label ?? col,
      dataIndex: col,
      // `compare: false` suppresses Ant Table client-side sort — we rewrite
      // JQL's ORDER BY on onChange and let the backend re-order. Without this,
      // Ant does a visual client-sort flicker before the server response lands.
      sorter: isSortable ? { compare: () => 0, multiple: 0 } : false,
      sortOrder,
      showSorterTooltip: isSortable ? undefined : false,
      render: (_: unknown, issue: IssueSearchRow) => renderCell(col, issue, customFieldsByName),
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
              selectedRowKeys: selectedIds,
              onChange: (keys) => onSelectionChange(keys.map(String)),
            }
          : undefined
      }
      data-testid="results-table"
    />
  );
}
