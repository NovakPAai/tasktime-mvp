import { useEffect, useState } from 'react';
import { List, Button, Select, Tag, Space, Popconfirm, Typography, message, Spin } from 'antd';
import { PlusOutlined, DeleteOutlined, LinkOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import * as linksApi from '../../api/links';
import * as issuesApi from '../../api/issues';
import type { IssueLink, IssueLinkType, IssueStatus, IssueType } from '../../types';

const STATUS_COLORS: Record<IssueStatus, string> = {
  OPEN: 'default',
  IN_PROGRESS: 'processing',
  REVIEW: 'warning',
  DONE: 'success',
  CANCELLED: 'error',
};
const TYPE_COLORS: Record<IssueType, string> = {
  EPIC: '#8b5cf6',
  STORY: '#22c55e',
  TASK: '#3b82f6',
  SUBTASK: '#6b7280',
  BUG: '#ef4444',
};

interface Props {
  issueId: string;
  projectId: string;
  readonly?: boolean;
}

export default function IssueLinksSection({ issueId, projectId, readonly = false }: Props) {
  const [links, setLinks] = useState<linksApi.IssueLinksResponse>({ outbound: [], inbound: [] });
  const [linkTypes, setLinkTypes] = useState<IssueLinkType[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [selectedLinkTypeId, setSelectedLinkTypeId] = useState<string | undefined>();
  const [targetSearch, setTargetSearch] = useState('');
  const [searchResults, setSearchResults] = useState<{ value: string; label: string }[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState<string | undefined>();
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [linksData, typesData] = await Promise.all([
          linksApi.getIssueLinks(issueId),
          linksApi.listLinkTypes(),
        ]);
        setLinks(linksData);
        setLinkTypes(typesData);
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
      const issues = await issuesApi.listIssues(projectId, { search: value });
      setSearchResults(
        issues
          .filter((i) => i.id !== issueId)
          .map((i) => ({
            value: i.id,
            label: `${i.project?.key ?? ''}-${i.number}: ${i.title}`,
          })),
      );
    } finally {
      setSearchLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!selectedLinkTypeId || !selectedTargetId) {
      void message.warning('Выберите тип связи и задачу');
      return;
    }
    setSaving(true);
    try {
      const link = await linksApi.createIssueLink(issueId, {
        targetIssueId: selectedTargetId,
        linkTypeId: selectedLinkTypeId,
      });
      setLinks((prev) => ({ ...prev, outbound: [...prev.outbound, link] }));
      setAdding(false);
      setSelectedLinkTypeId(undefined);
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

  const renderLinkItem = (link: IssueLink, direction: 'outbound' | 'inbound') => {
    const relatedIssue = direction === 'outbound' ? link.targetIssue : link.sourceIssue;
    const relationLabel = direction === 'outbound' ? link.linkType.outboundName : link.linkType.inboundName;

    return (
      <List.Item
        key={link.id}
        style={{ paddingInline: 0, paddingBlock: 6 }}
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
          <Typography.Text type="secondary" style={{ fontSize: 12, minWidth: 90, display: 'inline-block' }}>
            {relationLabel}
          </Typography.Text>
          <Tag color={TYPE_COLORS[relatedIssue.type]} style={{ fontSize: 11 }}>
            {relatedIssue.type}
          </Tag>
          <Tag color={STATUS_COLORS[relatedIssue.status]} style={{ fontSize: 11 }}>
            {relatedIssue.status}
          </Tag>
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
        <h3 className="tt-issue-section-title" style={{ margin: 0 }}>
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
            placeholder="Тип связи"
            style={{ minWidth: 150 }}
            size="small"
            value={selectedLinkTypeId}
            onChange={setSelectedLinkTypeId}
            options={linkTypes.map((t) => ({ value: t.id, label: t.outboundName }))}
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
        <List
          size="small"
          dataSource={[
            ...links.outbound.map((l) => ({ link: l, direction: 'outbound' as const })),
            ...links.inbound.map((l) => ({ link: l, direction: 'inbound' as const })),
          ]}
          renderItem={({ link, direction }) => renderLinkItem(link, direction)}
        />
      )}
    </section>
  );
}
