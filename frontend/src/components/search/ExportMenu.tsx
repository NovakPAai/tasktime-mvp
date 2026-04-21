/**
 * TTSRH-1 PR-14 — ExportMenu.
 *
 * Dropdown для экспорта текущего JQL в CSV/XLSX. Использует `/search/export`
 * endpoint из PR-8.
 *
 * Инварианты:
 *   • Пустой JQL → button disabled.
 *   • `saveAs`-паттерн: создаём `<a>`, attach to DOM, click, revoke URL в
 *     setTimeout(0) — избегает Firefox/Safari race (pre-push-reviewer паттерн PR-9).
 *   • Columns передаются из parent (current `selected` columns).
 */
import { useState } from 'react';
import { Button, Dropdown, message, type MenuProps } from 'antd';
import { DownOutlined, DownloadOutlined } from '@ant-design/icons';

import { exportIssues } from '../../api/search';

export interface ExportMenuProps {
  jql: string;
  columns: string[];
  disabled?: boolean;
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

export default function ExportMenu({ jql, columns, disabled = false }: ExportMenuProps) {
  const [busy, setBusy] = useState(false);

  const handleExport = async (format: 'csv' | 'xlsx') => {
    if (!jql.trim()) return;
    setBusy(true);
    try {
      const blob = await exportIssues(jql, format, columns.length > 0 ? columns : undefined);
      saveBlob(blob, `search-export.${format}`);
      message.success(`Экспортировано (${format.toUpperCase()})`);
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Ошибка экспорта');
    } finally {
      setBusy(false);
    }
  };

  const menu: MenuProps = {
    items: [
      { key: 'csv', label: 'CSV', icon: <DownloadOutlined /> },
      { key: 'xlsx', label: 'XLSX', icon: <DownloadOutlined /> },
    ],
    onClick: ({ key }) => handleExport(key as 'csv' | 'xlsx'),
  };

  return (
    <Dropdown menu={menu} disabled={disabled || busy || !jql.trim()} data-testid="export-menu">
      <Button size="small" disabled={disabled || busy || !jql.trim()} icon={<DownloadOutlined />}>
        Экспорт <DownOutlined />
      </Button>
    </Dropdown>
  );
}
