import { useEffect, useState } from 'react';
import { List, Button, Select, Space, Popconfirm, Typography, message, Spin, Alert } from 'antd';
import { PlusOutlined, DeleteOutlined, LinkOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import * as linksApi from '../../api/links';
import * as issuesApi from '../../api/issues';
import type { IssueLink, IssueLinkType } from '../../types';
import { IssueStatusTag, IssueTypeBadge } from '../../lib/issue-kit';

interface Props {
  issueId: string;
  readonly?: boolean;
}

interface DirectionOption {
  value: string; // `${typeId}:outbound` | `${typeId}:inbound`
  label: string;
}

function buildDirectionOptions(linkTypes: IssueLinkType[]): DirectionOption[] {
  const options: DirectionOption[] = [];
  for (const t of linkTypes) {
    options.push({ value: `${t.id}:outbound`, label: t.outboundName });
    if (t.inboundName !== t.outboundName) {
      options.push({ value: `${t.id}:inbound`, label: t.inboundName });
    }
  }
  return options;
}

function parseDirection(value: string): { linkTypeId: string; direction: 'outbound' | 'inbound' } {
  const idx = value.lastIndexOf(':');
  return {
    linkTypeId: value.slice(0, idx),
    direction: value.slice(idx + 1) as 'outbound' | 'inbound',
  };
}

export default function IssueLinksSection({ issueId, readonly = false }: Props) {
  const [links, setLinks] = useState<linksApi.IssueLinksResponse>({ outbound: [], inbound: [] });
  const [directionOptions, setDirectionOptions] = useState<DirectionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [selectedDirection, setSelectedDirection] = useState<string | undefined>();
  const [targetSearch, setTargetSearch] = useState('');
  const [searchResults, setSearchResults] = useState<{ value: string; label: string }[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState<string | undefined>();
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [linksData, typesData] = await Promise.all([
          linksApi.getIssueLinks(issueId),
          linksApi.listActiveLinkTypes(),
        ]);
        setLinks(linksData);
        setDirectionOptions(buildDirectionOptions(typesData));
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Не удалось загрузить данные связей');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [issueId]);

  const handleSearch = async (value: string) => {
    setTargetSearch(value);
    if (!value.trim()) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const issues = await issuesApi.searchIssuesGlobal(value, issueId);
      setSearchResults(
        issues.map((i) => ({
          value: i.id,
          label: `${i.project.key}-${i.number}: ${i.title}`,
        })),
      );
    } finally {
      setSearchLoading(false);
    }
  };

  const reloadLinks = async () => {
    const linksData = await linksApi.getIssueLinks(issueId);
    setLinks(linksData);
  };

  const handleAdd = async () => {
    if (!selectedDirection || !selectedTargetId) {
      void message.warning('Выберите направление связи и задачу');
      return;
    }
    setSaving(true);
    try {
      const { linkTypeId, direction } = parseDirection(selectedDirection);

      if (direction === 'outbound') {
        await linksApi.createIssueLink(issueId, { targetIssueId: selectedTargetId, linkTypeId });
      } else {
        // inbound: текущая задача — цель, выбранная задача — источник
        await linksApi.createIssueLink(selectedTargetId, { targetIssueId: issueId, linkTypeId });
      }

      await reloadLinks();
      setAdding(false);
      setSelectedDirection(undefined);
      setSelectedTargetId(undefined);
      setTargetSearch('');
      setSearchResults([]);
      void message.success('Связь добавлена');
    } catch (err) {
      void message.error(err instanceof Error ? err.message : 'Ошибка при добавлении связи');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (linkId: string, direction: 'outbound' | 'inbound') => {
    try {
      await linksApi.deleteIssueLink(issueId, linkId);
      setLinks((prev) => ({
        ...prev,
        [direction]: prev[direction].filter((l) => l.id !== linkId),
      }));
      void message.success('Связь удалена');
    } catch (err) {
      void message.error(err instanceof Error ? err.message : 'Ошибка при удалении');
    }
  };

  const totalCount = links.outbound.length + links.inbound.length;

  if (loading) return <Spin size="small" />;
  if (loadError) return <Alert type="error" message="Ошибка загрузки связей" description={loadError} showIcon style={{ marginBottom: 8 }} />;

  // Группировка по лейблу направления
  const groupedLinks = (() => {
    const map = new Map<string, { link: IssueLink; direction: 'outbound' | 'inbound' }[]>();
    for (const link of links.outbound) {
      const label = link.linkType.outboundName;
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push({ link, direction: 'outbound' });
    }
    for (const link of links.inbound) {
      const label = link.linkType.inboundName;
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push({ link, direction: 'inbound' });
    }
    return Array.from(map.entries()).map(([label, items]) => ({ label, items }));
  })();

  const renderLinkItem = (link: IssueLink, direction: 'outbound' | 'inbound') => {
    const relatedIssue = direction === 'outbound' ? link.targetIssue : link.sourceIssue;

    return (
      <List.Item
        key={link.id}
        style={{ paddingInline: 0, paddingBlock: 4 }}
        actions={
          readonly
            ? []
            : [
                <Popconfirm
                  key="del"
                  title="Удалить связь?"
                  onConfirm={() => void handleDelete(link.id, direction)}
                >
                  <Button size="small" type="text" icon={<DeleteOutlined />} danger />
                </Popconfirm>,
              ]
        }
      >
        <Space size={6} wrap>
          <IssueTypeBadge typeConfig={relatedIssue.issueTypeConfig} showLabel />
          <IssueStatusTag status={relatedIssue.status} size="small" />
          <Link to={`/issues/${relatedIssue.id}`} style={{ fontSize: 13 }}>
            {relatedIssue.project.key}-{relatedIssue.number}: {relatedIssue.title}
          </Link>
        </Space>
      </List.Item>
    );
  };

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>
          <LinkOutlined style={{ marginRight: 6 }} />
          Связи ({totalCount})
        </h3>
        {!readonly && !adding && (
          <Button size="small" icon={<PlusOutlined />} onClick={() => setAdding(true)}>
            Добавить
          </Button>
        )}
      </div>

      {adding && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            alignItems: 'center',
            marginBottom: 12,
            padding: '8px 12px',
            background: 'var(--tt-bg-secondary, #f5f5f5)',
            borderRadius: 6,
          }}
        >
          <Select
            placeholder="Направление связи"
            style={{ minWidth: 170 }}
            size="small"
            value={selectedDirection}
            onChange={setSelectedDirection}
            options={directionOptions}
          />
          <Select
            showSearch
            placeholder="Поиск задачи..."
            style={{ minWidth: 240 }}
            size="small"
            filterOption={false}
            onSearch={(v) => void handleSearch(v)}
            value={selectedTargetId}
            onChange={setSelectedTargetId}
            options={searchResults}
            loading={searchLoading}
            notFoundContent={targetSearch ? 'Задач не найдено' : 'Начните вводить...'}
          />
          <Button size="small" type="primary" loading={saving} onClick={() => void handleAdd()}>
            Сохранить
          </Button>
          <Button size="small" onClick={() => setAdding(false)}>
            Отмена
          </Button>
        </div>
      )}

      {totalCount === 0 && !adding ? (
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          Связей нет
        </Typography.Text>
      ) : (
        groupedLinks.map(({ label, items }) => (
          <div key={label} style={{ marginBottom: 8 }}>
            <Typography.Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {label}
            </Typography.Text>
            <List
              size="small"
              dataSource={items}
              renderItem={({ link, direction }) => renderLinkItem(link, direction)}
            />
          </div>
        ))
      )}
    </section>
  );
}
