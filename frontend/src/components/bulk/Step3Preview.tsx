/**
 * TTBULK-1 PR-9b — Step 3 wizard: preview eligible/skipped/conflicts
 * + virtualized-списки через react-window v2 (`List` component).
 *
 * Получает `BulkPreviewResponse` от parent'а (который вызывает preview API
 * на enter step 3). Три collapsible-секции с virtualized списками: eligible,
 * skipped, conflicts. Default rowHeight = 40px; height секции = min(300,
 * rowCount * 40).
 *
 * Conflicts inline controls (INCLUDE/EXCLUDE/USE_OVERRIDE) — не включены в
 * PR-9b (backend PR-5 preflight уже корректно classifyет items, inline
 * resolution — cross-PR feature для PR-12 polish).
 *
 * См. docs/tz/TTBULK-1.md §3.2, §8.1, §13.6 PR-9.
 */

import { Alert, Collapse, Spin, Tag, Typography } from 'antd';
import { List } from 'react-window';
import type { RowComponentProps } from 'react-window';
import type {
  BulkConflictItem,
  BulkEligibleItem,
  BulkPreviewResponse,
  BulkSkippedItem,
} from '../../types/bulk.types';

const { Text } = Typography;

const ROW_HEIGHT = 40;
const MAX_SECTION_HEIGHT = 300;

export interface Step3PreviewProps {
  loading: boolean;
  error: string | null;
  preview: BulkPreviewResponse | null;
}

export default function Step3Preview({ loading, error, preview }: Step3PreviewProps) {
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0' }}>
        <Spin tip="Резолвим scope…" />
      </div>
    );
  }
  if (error) {
    return <Alert type="error" showIcon message="Ошибка preview" description={error} />;
  }
  if (!preview) return null;

  const { eligible, skipped, conflicts, totalMatched, warnings } = preview;

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Tag color="blue">Всего scope: {totalMatched}</Tag>
        <Tag color="green">Eligible: {eligible.length}</Tag>
        <Tag color="orange">Skipped: {skipped.length}</Tag>
        <Tag color="red">Conflicts: {conflicts.length}</Tag>
      </div>

      {warnings.length > 0 && (
        <Alert
          type="warning"
          showIcon
          message="Preview warnings"
          description={
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          }
          style={{ marginBottom: 12 }}
        />
      )}

      <Collapse
        defaultActiveKey={['eligible']}
        items={[
          {
            key: 'eligible',
            label: `Eligible (${eligible.length})`,
            children: <EligibleSection items={eligible} />,
          },
          {
            key: 'skipped',
            label: `Skipped (${skipped.length})`,
            children: <SkippedSection items={skipped} />,
          },
          {
            key: 'conflicts',
            label: `Conflicts (${conflicts.length})`,
            children: <ConflictsSection items={conflicts} />,
          },
        ]}
      />
    </div>
  );
}

function sectionHeight(n: number): number {
  return Math.min(MAX_SECTION_HEIGHT, Math.max(ROW_HEIGHT, n * ROW_HEIGHT));
}

// ────── Eligible ────────────────────────────────────────────────────────────

function EligibleSection({ items }: { items: BulkEligibleItem[] }) {
  if (items.length === 0) {
    return <Text type="secondary">Нет eligible задач в выборке.</Text>;
  }
  return (
    <List
      rowComponent={EligibleRow}
      rowCount={items.length}
      rowHeight={ROW_HEIGHT}
      rowProps={{ items }}
      style={{ height: sectionHeight(items.length) }}
    />
  );
}

function EligibleRow({
  index,
  style,
  items,
  ariaAttributes,
}: RowComponentProps<{ items: BulkEligibleItem[] }>) {
  const item = items[index];
  return (
    <div
      {...ariaAttributes}
      style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 8px',
        borderBottom: '1px solid rgba(0,0,0,0.06)',
      }}
    >
      <Tag>{item.issueKey}</Tag>
      <Text ellipsis style={{ flex: 1 }}>{item.title}</Text>
    </div>
  );
}

// ────── Skipped ─────────────────────────────────────────────────────────────

function SkippedSection({ items }: { items: BulkSkippedItem[] }) {
  if (items.length === 0) {
    return <Text type="secondary">Нет skipped задач.</Text>;
  }
  return (
    <List
      rowComponent={SkippedRow}
      rowCount={items.length}
      rowHeight={ROW_HEIGHT}
      rowProps={{ items }}
      style={{ height: sectionHeight(items.length) }}
    />
  );
}

function SkippedRow({
  index,
  style,
  items,
  ariaAttributes,
}: RowComponentProps<{ items: BulkSkippedItem[] }>) {
  const item = items[index];
  return (
    <div
      {...ariaAttributes}
      style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 8px',
        borderBottom: '1px solid rgba(0,0,0,0.06)',
      }}
    >
      <Tag color="orange">{item.issueKey}</Tag>
      <Text type="secondary" style={{ fontSize: 11 }}>{item.reasonCode}</Text>
      <Text ellipsis style={{ flex: 1 }}>{item.reason}</Text>
    </div>
  );
}

// ────── Conflicts ───────────────────────────────────────────────────────────

function ConflictsSection({ items }: { items: BulkConflictItem[] }) {
  if (items.length === 0) {
    return <Text type="secondary">Нет conflicts.</Text>;
  }
  return (
    <>
      <Alert
        type="info"
        showIcon
        message="Conflicts будут исключены из run'а"
        description="INCLUDE/EXCLUDE/USE_OVERRIDE inline-controls появятся в PR-12 polish. Сейчас — все conflicts автоматически исключаются."
        style={{ marginBottom: 8 }}
      />
      <List
        rowComponent={ConflictRow}
        rowCount={items.length}
        rowHeight={ROW_HEIGHT}
        rowProps={{ items }}
        style={{ height: sectionHeight(items.length) }}
      />
    </>
  );
}

function ConflictRow({
  index,
  style,
  items,
  ariaAttributes,
}: RowComponentProps<{ items: BulkConflictItem[] }>) {
  const item = items[index];
  return (
    <div
      {...ariaAttributes}
      style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 8px',
        borderBottom: '1px solid rgba(0,0,0,0.06)',
      }}
    >
      <Tag color="red">{item.issueKey}</Tag>
      <Text type="danger" style={{ fontSize: 11 }}>{item.code}</Text>
      <Text ellipsis style={{ flex: 1 }}>{item.message}</Text>
    </div>
  );
}
