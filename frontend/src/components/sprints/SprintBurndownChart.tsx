import { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { getSprintBurndown, type SprintBurndownData } from '../../api/sprints';

interface Props {
  sprintId: string;
  isDark?: boolean;
}

export default function SprintBurndownChart({ sprintId, isDark = true }: Props) {
  const [data, setData] = useState<SprintBurndownData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getSprintBurndown(sprintId)
      .then(setData)
      .catch(() => setError('Не удалось загрузить данные'))
      .finally(() => setLoading(false));
  }, [sprintId]);

  const bg = isDark ? '#0F1320' : '#FFFFFF';
  const borderColor = isDark ? '#1E2640' : '#E5E7EB';
  const textColor = isDark ? '#8B949E' : '#6B7280';
  const t1 = isDark ? '#E2E8F8' : '#111827';

  if (loading) {
    return (
      <div style={{ padding: '16px 0', color: textColor, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 12 }}>
        Загрузка диаграммы...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: '16px 0', color: '#EF4444', fontFamily: '"Inter", system-ui, sans-serif', fontSize: 12 }}>
        {error ?? 'Нет данных'}
      </div>
    );
  }

  if (data.series.length === 0 && data.idealLine.length === 0) {
    return (
      <div style={{ padding: '16px 0', color: textColor, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 12 }}>
        Даты спринта не заданы. Установите начало и конец спринта для отображения диаграммы.
      </div>
    );
  }

  // Merge series and idealLine by date for recharts
  const dateSet = new Set([
    ...data.series.map(p => p.date),
    ...data.idealLine.map(p => p.date),
  ]);
  const seriesMap = new Map(data.series.map(p => [p.date, p.value]));
  const idealMap = new Map(data.idealLine.map(p => [p.date, p.value]));
  const chartData = [...dateSet].sort().map(date => ({
    date,
    remaining: seriesMap.get(date),
    ideal: idealMap.get(date),
  }));

  const formatDate = (d: string) => {
    const [, month, day] = d.split('-');
    return `${day}.${month}`;
  };

  return (
    <div style={{
      background: bg,
      border: `1px solid ${borderColor}`,
      borderRadius: 10,
      padding: '16px 20px',
    }}>
      <div style={{
        fontFamily: '"Space Grotesk", system-ui, sans-serif',
        fontSize: 13,
        fontWeight: 600,
        color: t1,
        marginBottom: 12,
      }}>
        BurnDown — {data.totalIssues} задач
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid stroke={borderColor} strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tick={{ fill: textColor, fontSize: 10, fontFamily: '"Inter", system-ui, sans-serif' }}
            axisLine={{ stroke: borderColor }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: textColor, fontSize: 10, fontFamily: '"Inter", system-ui, sans-serif' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: isDark ? '#161B22' : '#FFFFFF',
              border: `1px solid ${borderColor}`,
              borderRadius: 6,
              fontFamily: '"Inter", system-ui, sans-serif',
              fontSize: 12,
              color: t1,
            }}
            labelFormatter={(label) => formatDate(String(label))}
          />
          <Legend
            wrapperStyle={{ fontFamily: '"Inter", system-ui, sans-serif', fontSize: 11, color: textColor }}
          />
          <Line
            type="monotone"
            dataKey="remaining"
            name="Осталось"
            stroke="#4F6EF7"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="ideal"
            name="Идеально"
            stroke={isDark ? '#4ADE80' : '#16A34A'}
            strokeWidth={1.5}
            strokeDasharray="5 3"
            dot={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
