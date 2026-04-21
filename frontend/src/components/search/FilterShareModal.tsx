/**
 * TTSRH-1 PR-13 — FilterShareModal.
 *
 * Модалка для управления visibility + sharing существующего SavedFilter.
 *
 * Публичный API:
 *   • open, onClose, filter (SavedFilter | null).
 *   • onSaved — сигнал родителю (`load()` CLAUDE.md).
 *
 * Инварианты:
 *   • При SHARED — отображаем мульти-селект пользователей + groups.
 *   • При PUBLIC — warning-banner как в SaveFilterModal.
 *   • «Копировать ссылку» — генерирует `/search/saved/:id` и копирует в clipboard.
 *   • `onCancel` / `onClose` / backdrop / Esc — все триггерят `onClose`.
 *   • Модалка ре-инициализирует state при смене `filter` prop.
 */
import { useEffect, useMemo, useState } from 'react';
import { Modal, Form, Select, Alert, message, Button } from 'antd';
import { CopyOutlined } from '@ant-design/icons';

import type {
  FilterPermission,
  FilterVisibility,
  SavedFilter,
} from '../../api/savedFilters';
import { listUsers } from '../../api/auth';
import type { User } from '../../types';
import { useSavedFiltersStore } from '../../store/savedFilters.store';

export interface FilterShareModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  filter: SavedFilter | null;
}

interface FormValues {
  visibility: FilterVisibility;
  users: string[];
  permission: FilterPermission;
}

export default function FilterShareModal({ open, onClose, onSaved, filter }: FilterShareModalProps) {
  const [form] = Form.useForm<FormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [visibility, setVisibility] = useState<FilterVisibility>('PRIVATE');
  const update = useSavedFiltersStore((s) => s.update);
  const share = useSavedFiltersStore((s) => s.share);

  // Fetch user directory on open for the multi-select.
  useEffect(() => {
    if (!open) return;
    setUsersLoading(true);
    listUsers()
      .then(setUsers)
      .catch(() => setUsers([]))
      .finally(() => setUsersLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open || !filter) return;
    const initialUsers = filter.shares.filter((s) => s.userId).map((s) => s.userId!);
    const initialPermission: FilterPermission =
      filter.shares.find((s) => s.permission === 'WRITE') ? 'WRITE' : 'READ';
    form.setFieldsValue({
      visibility: filter.visibility,
      users: initialUsers,
      permission: initialPermission,
    });
    setVisibility(filter.visibility);
  }, [open, filter, form]);

  const shareLink = useMemo(() => {
    if (!filter) return '';
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/search/saved/${filter.id}`;
  }, [filter]);

  const copyLink = async () => {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      message.success('Ссылка скопирована');
    } catch {
      message.error('Не удалось скопировать');
    }
  };

  const handleOk = async () => {
    if (!filter) return;
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      // Always update visibility first (may promote PRIVATE → SHARED → PUBLIC).
      if (values.visibility !== filter.visibility) {
        await update(filter.id, { visibility: values.visibility });
      }
      // Then replace shares (owner-only, replace-semantics on backend).
      if (values.visibility === 'SHARED') {
        await share(filter.id, {
          users: values.users,
          permission: values.permission,
        });
      } else if (filter.shares.length > 0) {
        // Demote to PRIVATE / PUBLIC — clear shares.
        await share(filter.id, { users: [] });
      }
      message.success('Настройки доступа сохранены');
      onSaved();
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      const msg = err instanceof Error ? err.message : 'Ошибка сохранения';
      message.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!filter) return null;

  return (
    <Modal
      open={open}
      title={`Доступ — ${filter.name}`}
      okText="Сохранить"
      cancelText="Отмена"
      confirmLoading={submitting}
      onOk={handleOk}
      onCancel={() => { onClose(); }}
      destroyOnClose
      maskClosable={!submitting}
    >
      <Form form={form} layout="vertical" name="filter-share-form">
        <Form.Item label="Видимость" name="visibility" rules={[{ required: true }]}>
          <Select
            data-testid="share-filter-visibility"
            onChange={(v) => setVisibility(v as FilterVisibility)}
            options={[
              { value: 'PRIVATE', label: 'Private — только я' },
              { value: 'SHARED', label: 'Shared — указанные пользователи' },
              { value: 'PUBLIC', label: 'Public — все аутентифицированные' },
            ]}
          />
        </Form.Item>
        {visibility === 'SHARED' && (
          <>
            <Form.Item label="Поделиться с пользователями" name="users">
              <Select
                mode="multiple"
                placeholder={usersLoading ? 'Загрузка пользователей…' : 'Выберите пользователей'}
                loading={usersLoading}
                data-testid="share-filter-users"
                showSearch
                optionFilterProp="label"
                options={users.map((u) => ({
                  value: u.id,
                  label: `${u.name} <${u.email}>`,
                }))}
              />
            </Form.Item>
            <Form.Item label="Права" name="permission" initialValue="READ">
              <Select
                options={[
                  { value: 'READ', label: 'READ — только чтение' },
                  { value: 'WRITE', label: 'WRITE — чтение и редактирование' },
                ]}
              />
            </Form.Item>
          </>
        )}
        {visibility === 'PUBLIC' && (
          <Alert
            type="warning"
            showIcon
            message="Фильтр станет виден всем аутентифицированным пользователям"
            style={{ marginBottom: 16 }}
          />
        )}
        <Form.Item label="Ссылка на фильтр">
          <Button icon={<CopyOutlined />} onClick={copyLink} data-testid="share-copy-link" block>
            Скопировать {shareLink}
          </Button>
        </Form.Item>
      </Form>
    </Modal>
  );
}
