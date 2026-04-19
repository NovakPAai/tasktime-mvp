// TTMP-160 PR-11 / FR-29 + FR-30 + FR-31: release burndown chart.
//
// - Two series: actual (solid, from daily snapshots) + ideal (dashed, linear from the
//   first snapshot to plannedDate).
// - Metric switcher: issues / hours / violations (FR-30).
// - Empty state with a "Backfill" CTA for SUPER_ADMIN / ADMIN (FR-31).
//
// The component is self-contained: it fetches on mount and on every metric change,
// disposing previous results via a sequence counter so a slow first request can't
// overwrite the fresher response after the user toggles the metric quickly.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Empty, Segmented, Space, Spin, message } from 'antd';
import { ReloadOutlined, ThunderboltOutlined } from '@ant-design/icons';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  type BurndownMetric,
  type BurndownResponse,
  backfillBurndown,
  getBurndown,
} from '../../api/release-burndown';

type Props = {
  releaseId: string;
  canBackfill: boolean;
};

// Single chart-row shape — combines one actual point with the corresponding ideal value
// for the same date. Unknown dates on either side produce `undefined`, and recharts
// renders gaps (solid line breaks; dashed ideal line stays continuous across them).
interface ChartRow {
  date: string;
  actual?: number;
  ideal?: number;
  // Tooltip-only fields carried through for richer display.
  total?: number;
  done?: number;
  open?: number;
  violatedCheckpoints?: number;
  totalCheckpoints?: number;
}

const METRIC_LABEL: Record<BurndownMetric, string> = {
  issues: 'Открытые задачи',
  hours: 'Открытые часы',
  violations: 'Нарушения КТ',
};

function actualValue(p: BurndownResponse['series'][number], metric: BurndownMetric): number {
  switch (metric) {
    case 'issues':
      return p.total - p.done - p.cancelled;
    case 'hours':
      return Math.round(p.openEstimatedHours * 100) / 100;
    case 'violations':
      return p.violatedCheckpoints;
  }
}

export default function ReleaseBurndownChart({ releaseId, canBackfill }: Props) {
  const [metric, setMetric] = useState<BurndownMetric>('issues');
  const [data, setData] = useState<BurndownResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  // Sequence counter — discard stale results if the user toggles metric while a fetch
  // is mid-flight. Without this, a slow first request can clobber a faster second one.
  const seqRef = useRef(0);

  const load = useCallback(async () => {
    const seq = ++seqRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await getBurndown(releaseId, { metric });
      if (seq !== seqRef.current) return;
      setData(res);
    } catch (err) {
      // `finally` still runs after this catch — the `seq === seqRef.current` guard below
      // is what actually prevents stale state from leaking, so no explicit early return.
      if (seq === seqRef.current) {
        console.error('burndown load failed', err);
        setError('Не удалось загрузить диаграмму сгорания');
      }
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, [releaseId, metric]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows: ChartRow[] = useMemo(() => {
    if (!data) return [];
    const byDate = new Map<string, ChartRow>();
    for (const p of data.series) {
      byDate.set(p.date, {
        date: p.date,
        actual: actualValue(p, data.metric),
        total: p.total,
        done: p.done,
        open: p.open,
        violatedCheckpoints: p.violatedCheckpoints,
        totalCheckpoints: p.totalCheckpoints,
      });
    }
    for (const p of data.idealLine) {
      const existing = byDate.get(p.date);
      if (existing) existing.ideal = p.value;
      else byDate.set(p.date, { date: p.date, ideal: p.value });
    }
    // Sort by date — the Map insertion order mixes series + ideal with potentially
    // overlapping but not identical date ranges.
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);

  const handleBackfill = useCallback(async () => {
    setBackfilling(true);
    try {
      await backfillBurndown(releaseId);
      message.success('Снапшот захвачен');
      await load();
    } catch (err) {
      console.error('backfill failed', err);
      message.error('Не удалось выполнить backfill');
    } finally {
      setBackfilling(false);
    }
  }, [releaseId, load]);

  if (loading && !data) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <Spin />
      </div>
    );
  }

  if (error) {
    return <Alert type="warning" showIcon message={error} />;
  }

  const hasAnyData = data && data.series.length > 0;

  return (
    <div>
      <Space style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }}>
        <Segmented
          value={metric}
          onChange={(v) => setMetric(v as BurndownMetric)}
          options={[
            { value: 'issues', label: 'Задачи' },
            { value: 'hours', label: 'Часы' },
            { value: 'violations', label: 'Нарушения' },
          ]}
          aria-label="Переключатель метрики burndown"
        />
        <Space>
          <Button
            icon={<ReloadOutlined />}
            size="small"
            onClick={() => void load()}
            loading={loading}
          >
            Обновить
          </Button>
          {canBackfill && (
            <Button
              icon={<ThunderboltOutlined />}
              size="small"
              onClick={() => void handleBackfill()}
              loading={backfilling}
            >
              Создать снапшот
            </Button>
          )}
        </Space>
      </Space>

      {!hasAnyData ? (
        <Empty
          description={
            <div>
              <div>Нет снапшотов для этого релиза</div>
              {canBackfill && (
                <div style={{ marginTop: 8, color: '#8c8c8c', fontSize: 12 }}>
                  Нажмите «Создать снапшот», чтобы захватить первый снапшот
                </div>
              )}
            </div>
          }
        />
      ) : (
        <div style={{ width: '100%', height: 320 }}>
          <ResponsiveContainer>
            <LineChart
              data={rows}
              margin={{ top: 8, right: 24, left: 0, bottom: 0 }}
              accessibilityLayer
            >
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10 }}
                interval="preserveStartEnd"
                angle={-35}
                textAnchor="end"
                height={50}
              />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip
                // recharts v3 infers the Tooltip's ValueType/NameType from the provided
                // content function; casting the renderer to `ContentType` bypasses the
                // generic-narrowing mismatch between our explicit <number,string> types
                // and the default <ValueType, NameType> the component registers.
                content={renderBurndownTooltip(data?.metric ?? metric)}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="ideal"
                stroke="#9CA3AF"
                strokeDasharray="5 5"
                name="Идеальная"
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="actual"
                stroke="#1677FF"
                strokeWidth={2}
                name={METRIC_LABEL[data?.metric ?? metric]}
                dot={{ r: 3 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// Recharts' Tooltip `content` renderer is typed against internal ValueType/NameType
// generics that don't accept `<number, string>` specializations cleanly; we accept the
// loose `unknown` shape and narrow via a `ChartRow` cast.
interface ChartTooltipProps {
  active?: boolean;
  label?: string;
  payload?: Array<{ payload?: ChartRow; dataKey?: unknown; value?: unknown; color?: string }>;
}

function renderBurndownTooltip(metric: BurndownMetric) {
  return function BurndownTooltip(rawProps: unknown) {
    const { active, payload, label } = rawProps as ChartTooltipProps;
    if (!active || !payload || payload.length === 0) return null;
    const rowData = payload[0]?.payload ?? null;
    if (!rowData) return null;

  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #d9d9d9',
        borderRadius: 4,
        padding: '8px 12px',
        fontSize: 12,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{label}</div>
      {payload.map((p, idx) => {
        const keyLabel = typeof p.dataKey === 'string' ? p.dataKey : '';
        return (
          <div key={`${idx}-${keyLabel}`} style={{ color: p.color }}>
            {keyLabel === 'ideal' ? 'Идеальная' : METRIC_LABEL[metric]}:{' '}
            {typeof p.value === 'number' ? p.value : '—'}
          </div>
        );
      })}
      {rowData.total !== undefined && metric === 'issues' && (
        <div style={{ color: '#8c8c8c', marginTop: 4 }}>
          всего: {rowData.total} · закрыто: {rowData.done ?? 0}
        </div>
      )}
      {rowData.totalCheckpoints !== undefined && metric === 'violations' && (
        <div style={{ color: '#8c8c8c', marginTop: 4 }}>
          КТ всего: {rowData.totalCheckpoints}
        </div>
      )}
    </div>
  );
  };
}
