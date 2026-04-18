// TTMP-160 PR-9 / FR-26: "Issues × Checkpoints" matrix view for a release.
//
// Rows = issues in the release, columns = checkpoints. Cell states: 🟢 passed /
// 🔴 violated / 🟡 pending / — not applicable. Clicking an issue-key heading navigates
// to the issue detail page. Backend returns a pre-computed matrix; we render as a table
// with sticky first column and horizontal scroll for projects with many checkpoints.
//
// Virtualisation: for releases with ≤100 issues, standard Ant Table pagination (page size
// 50) is sufficient. Large-project virtualisation via `virtual` prop + fixed scroll is
// tracked as a follow-up — acceptable for MVP.

import {
  CheckCircleFilled,
  ClockCircleFilled,
  CloseCircleFilled,
  DownloadOutlined,
  MinusCircleFilled,
  ReloadOutlined,
} from '@ant-design/icons';
import { Alert, Button, Result, Space, Spin, Table, Tag, Tooltip, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  type CheckpointsMatrixResponse,
  type MatrixCell,
  type MatrixCellState,
  downloadCheckpointsMatrixCsv,
  getCheckpointsMatrix,
} from '../../api/release-checkpoints';

type Props = { releaseId: string };

interface MatrixRow {
  key: string;
  issueId: string;
  issueKey: string;
  issueTitle: string;
  cellByCheckpoint: Map<string, MatrixCell>;
}

export default function CheckpointsMatrix({ releaseId }: Props) {
  const [data, setData] = useState<CheckpointsMatrixResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      setData(await getCheckpointsMatrix(releaseId));
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [releaseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCsv = async () => {
    setDownloading(true);
    try {
      const blob = await downloadCheckpointsMatrixCsv(releaseId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `checkpoints-matrix-${releaseId.slice(0, 8)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Defer revoke so Safari/Firefox don't abort the download.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      message.error('Не удалось скачать CSV');
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <Spin />
      </div>
    );
  }
  if (loadError) {
    return (
      <Result
        status="warning"
        title="Не удалось загрузить матрицу"
        extra={
          <Button icon={<ReloadOutlined />} onClick={() => void load()}>
            Повторить
          </Button>
        }
      />
    );
  }
  if (!data || data.issues.length === 0 || data.checkpoints.length === 0) {
    return (
      <Alert
        type="info"
        showIcon
        message="Матрица пуста"
        description={
          data && data.issues.length === 0
            ? 'К релизу не добавлены задачи.'
            : 'У релиза нет контрольных точек. Добавьте тип точки или применить шаблон.'
        }
      />
    );
  }

  // Map per issue for O(1) lookup; we still render in the table's row order.
  const rows: MatrixRow[] = data.issues.map((issue, i) => {
    const cellByCheckpoint = new Map<string, MatrixCell>();
    for (let j = 0; j < data.checkpoints.length; j++) {
      cellByCheckpoint.set(data.checkpoints[j]!.id, data.cells[i]![j]!);
    }
    return {
      key: issue.id,
      issueId: issue.id,
      issueKey: issue.key,
      issueTitle: issue.title,
      cellByCheckpoint,
    };
  });

  const columns: ColumnsType<MatrixRow> = [
    {
      title: 'Задача',
      dataIndex: 'issueKey',
      fixed: 'left',
      width: 260,
      render: (_: string, row) => (
        <Link to={`/issues/${row.issueId}`} style={{ display: 'inline-block', maxWidth: 240 }}>
          <Space size={6}>
            <strong>{row.issueKey}</strong>
            <span
              style={{
                color: '#666',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                display: 'inline-block',
                maxWidth: 160,
              }}
            >
              {row.issueTitle}
            </span>
          </Space>
        </Link>
      ),
    },
    ...data.checkpoints.map((cp) => ({
      title: (
        <Tooltip title={`Дедлайн: ${cp.deadline} · состояние: ${cp.state}`}>
          <Space size={4} style={{ cursor: 'help' }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: cp.color,
                display: 'inline-block',
              }}
              aria-hidden
            />
            <span style={{ fontSize: 12 }}>{cp.name}</span>
          </Space>
        </Tooltip>
      ),
      dataIndex: cp.id,
      key: cp.id,
      align: 'center' as const,
      width: 120,
      render: (_: unknown, row: MatrixRow) => {
        const cell = row.cellByCheckpoint.get(cp.id);
        return <MatrixCellBadge cell={cell} />;
      },
    })),
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={12}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <Space size={12} wrap>
          <LegendItem state="passed" label="Прошли" />
          <LegendItem state="violated" label="Нарушают" />
          <LegendItem state="pending" label="Ожидание" />
          <LegendItem state="na" label="Не применимо" />
        </Space>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void load()} />
          <Button
            icon={<DownloadOutlined />}
            onClick={handleCsv}
            loading={downloading}
            type="primary"
          >
            Экспорт CSV
          </Button>
        </Space>
      </div>
      <Table<MatrixRow>
        rowKey="key"
        columns={columns}
        dataSource={rows}
        scroll={{ x: 'max-content', y: 520 }}
        pagination={{
          pageSize: 50,
          showSizeChanger: rows.length > 50,
          showTotal: (t) => `Задач: ${t} · КТ: ${data.checkpoints.length}`,
        }}
        size="small"
      />
    </Space>
  );
}

function MatrixCellBadge({ cell }: { cell: MatrixCell | undefined }) {
  if (!cell) return <span style={{ color: '#ccc' }}>—</span>;
  switch (cell.state) {
    case 'passed':
      return (
        <Tooltip title="Прошла критерии">
          <CheckCircleFilled style={{ color: '#52C41A', fontSize: 18 }} aria-label="Прошла" />
        </Tooltip>
      );
    case 'violated':
      return (
        <Tooltip title={cell.reason || 'Нарушает критерии'}>
          <CloseCircleFilled style={{ color: '#E5534B', fontSize: 18 }} aria-label="Нарушает" />
        </Tooltip>
      );
    case 'pending':
      return (
        <Tooltip title="Ожидание расчёта">
          <ClockCircleFilled style={{ color: '#F59E0B', fontSize: 18 }} aria-label="Ожидание" />
        </Tooltip>
      );
    case 'na':
    default:
      return (
        <Tooltip title="Критерий не применим к этой задаче">
          <MinusCircleFilled
            style={{ color: '#d9d9d9', fontSize: 18 }}
            aria-label="Не применимо"
          />
        </Tooltip>
      );
  }
}

function LegendItem({ state, label }: { state: MatrixCellState; label: string }) {
  return (
    <Space size={4}>
      <MatrixCellBadge cell={{ state }} />
      <Tag style={{ margin: 0 }}>{label}</Tag>
    </Space>
  );
}
