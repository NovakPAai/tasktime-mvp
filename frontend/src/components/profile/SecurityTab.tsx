import { useEffect, useState } from 'react';
import { Table, Tag, Tooltip, Button, Alert, Space, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ReloadOutlined, DownloadOutlined } from '@ant-design/icons';
import {
  userSecurityApi,
  type UserSecurityPayload,
  type SecurityProjectRole,
} from '../../api/user-security';

/**
 * TTSEC-2 Phase 3: "Безопасность" block for SettingsPage (spec §5.8).
 *
 * Read-only — the user cannot grant themselves a role here. Shows:
 *   - groups the user is a member of
 *   - effective roles per project with `source` (DIRECT / GROUP) + `sourceGroups` list
 *   - per-role permissions tooltip on hover
 *   - CSV export for offline review
 *
 * Shape is driven by the backend `UserSecurityPayload` type.
 */

/**
 * Proper CSV escaping per RFC 4180: wrap in double quotes, double any embedded quote.
 * AI review #66 🟡 — previous version used JSON.stringify, which is NOT CSV and broke on
 * values containing `;`, newlines, or quotes. Excel-friendly BOM prefix so Cyrillic renders
 * correctly on Windows out of the box.
 */
function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function downloadCsv(payload: UserSecurityPayload): void {
  const rows: string[] = [
    ['Проект', 'Ключ', 'Роль', 'Источник', 'Через группы']
      .map(csvField)
      .join(';'),
    ...payload.projectRoles.map(r => {
      const via = r.sourceGroups.map(g => g.name).join(', ');
      return [
        csvField(r.project.name),
        csvField(r.project.key),
        csvField(r.role.name),
        csvField(r.source === 'DIRECT' ? 'Прямое' : 'Группа'),
        csvField(via),
      ].join(';');
    }),
  ];
  // `\uFEFF` = UTF-8 BOM — Excel needs it to auto-detect Cyrillic text.
  const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  // AI review #66 round 5 🟡 — user.id (UUID) is filesystem-safe; email could contain @/spaces.
  a.download = `security-${payload.user.id}.csv`;
  // AI review #66 round 6 🟠 — Firefox/Safari sometimes miss the click on a detached <a>, and
  // revoking the blob URL synchronously right after click can race the download fetch. Attach
  // to DOM, click, detach, then revoke on the next tick.
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function SecurityTab() {
  const [data, setData] = useState<UserSecurityPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      setData(await userSecurityApi.getMine());
    } catch {
      message.error('Не удалось загрузить данные безопасности');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const columns: ColumnsType<SecurityProjectRole> = [
    {
      title: 'Проект',
      render: (_, r) => (
        <Space>
          <code>{r.project.key}</code>
          <span>{r.project.name}</span>
        </Space>
      ),
    },
    {
      title: 'Роль',
      render: (_, r) => (
        <Tooltip title={r.role.permissions.length > 0 ? r.role.permissions.join(', ') : 'Нет прав'}>
          <Tag>{r.role.name}</Tag>
        </Tooltip>
      ),
    },
    {
      title: 'Источник',
      render: (_, r) => {
        const direct = r.source === 'DIRECT';
        const groups = r.sourceGroups;
        return (
          <Space wrap size={4}>
            <Tag color={direct ? 'blue' : 'purple'}>{direct ? 'Прямое назначение' : 'Через группу'}</Tag>
            {groups.length > 0 && (
              <Tooltip title={groups.map(g => g.name).join(', ')}>
                <Tag>{direct ? 'также через' : ''} {groups.length} {groups.length === 1 ? 'группу' : 'групп(ы)'}</Tag>
              </Tooltip>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Безопасность</h3>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Обновить</Button>
          <Button
            icon={<DownloadOutlined />}
            disabled={!data || data.projectRoles.length === 0}
            onClick={() => data && downloadCsv(data)}
          >
            Экспорт CSV
          </Button>
        </Space>
      </div>

      {data && data.groups.length > 0 ? (
        <Alert
          type="info"
          showIcon
          message="Ваши группы"
          description={
            <Space wrap>
              {data.groups.map(g => (
                <Tooltip key={g.id} title={`В группе: ${g.memberCount} участник(а/ов)`}>
                  <Tag color="purple">{g.name}</Tag>
                </Tooltip>
              ))}
            </Space>
          }
          style={{ marginBottom: 16 }}
        />
      ) : (
        !loading && <Alert type="info" message="Вы не состоите ни в одной группе" style={{ marginBottom: 16 }} />
      )}

      <Table
        // AI review #66 round 4 🟠 — use the actual unique identifier from the API contract.
        // `computeEffectiveRole` returns exactly one effective row per (userId, projectId), so
        // `project.id` is the stable unique key. If the contract ever changes to support
        // multiple rows per project, the `SecurityProjectRole` type in `api/user-security.ts`
        // should gain an explicit `id` field and this key updated to match — a compile-time
        // signal rather than a silent rendering bug.
        rowKey={(r) => r.project.id}
        dataSource={data?.projectRoles ?? []}
        columns={columns}
        loading={loading}
        pagination={false}
        size="small"
        locale={{ emptyText: 'Нет проектных ролей' }}
      />

      {data && (
        <div style={{ marginTop: 12, color: '#888', fontSize: 12 }}>
          Обновлено: {new Date(data.updatedAt).toLocaleString('ru-RU')}
        </div>
      )}
    </div>
  );
}
