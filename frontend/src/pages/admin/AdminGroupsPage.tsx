import { useState, useEffect, useCallback } from 'react';
import { Table, Button, Modal, Form, Input, Space, message, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, EditOutlined, DeleteOutlined, TeamOutlined, SearchOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { userGroupsApi, type UserGroupListItem, type UserGroupImpact } from '../../api/user-groups';

/**
 * TTSEC-2 Phase 3: list of user groups with CRUD.
 * DELETE requires a confirmation modal that shows impact (members + project bindings) —
 * matches spec §5.7 / FR-A9. Backend responds 412 without `?confirm=true`, but the API
 * client already sets the flag; the UX here still surfaces the impact before firing.
 */
export default function AdminGroupsPage() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<UserGroupListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<UserGroupListItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const [impact, setImpact] = useState<UserGroupImpact | null>(null);
  const [impactFor, setImpactFor] = useState<UserGroupListItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Debounce the user-typed search so we don't fire a request per keystroke
  // (AI review #66 🟡). 300ms is the usual sweet spot — feels instant, batches fast typists.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setGroups(await userGroupsApi.list(debouncedSearch.trim() || undefined));
    } catch {
      message.error('Не удалось загрузить группы');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (g: UserGroupListItem) => {
    setEditing(g);
    form.setFieldsValue({ name: g.name, description: g.description ?? '' });
    setModalOpen(true);
  };

  const handleSave = async (vals: { name: string; description?: string }) => {
    setSaving(true);
    try {
      const dto = { name: vals.name, description: vals.description || null };
      if (editing) {
        await userGroupsApi.update(editing.id, dto);
        message.success('Группа обновлена');
      } else {
        await userGroupsApi.create(dto);
        message.success('Группа создана');
      }
      setModalOpen(false);
      load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      message.error(err?.response?.data?.error || 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  const openDelete = async (g: UserGroupListItem) => {
    setImpactFor(g);
    try {
      setImpact(await userGroupsApi.getImpact(g.id));
    } catch {
      message.error('Не удалось получить impact группы');
      setImpactFor(null);
    }
  };

  const confirmDelete = async () => {
    if (!impactFor) return;
    setDeleting(true);
    try {
      await userGroupsApi.remove(impactFor.id);
      message.success('Группа удалена');
      setImpactFor(null);
      setImpact(null);
      load();
    } catch {
      message.error('Не удалось удалить группу');
    } finally {
      setDeleting(false);
    }
  };

  const columns: ColumnsType<UserGroupListItem> = [
    {
      title: 'Название',
      dataIndex: 'name',
      render: (name: string, g) => (
        <Button type="link" style={{ padding: 0 }} onClick={() => navigate(`/admin/user-groups/${g.id}`)}>
          {name}
        </Button>
      ),
    },
    { title: 'Описание', dataIndex: 'description', render: (v: string | null) => v || '—' },
    { title: 'Участников', dataIndex: ['_count', 'members'], render: (v: number) => v ?? 0 },
    { title: 'Проектов', dataIndex: ['_count', 'projectRoles'], render: (v: number) => v ?? 0 },
    {
      title: '',
      width: 140,
      render: (_, g) => (
        <Space>
          <Tooltip title="Настроить">
            <Button size="small" icon={<TeamOutlined />} onClick={() => navigate(`/admin/user-groups/${g.id}`)} />
          </Tooltip>
          <Tooltip title="Переименовать">
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(g)} />
          </Tooltip>
          <Tooltip title="Удалить">
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => openDelete(g)} />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div className="tt-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 className="tt-page-title">Группы пользователей</h2>
        <Space>
          <Input
            placeholder="Поиск"
            prefix={<SearchOutlined />}
            value={search}
            onChange={e => setSearch(e.target.value)}
            allowClear
            style={{ width: 240 }}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Создать</Button>
        </Space>
      </div>

      <Table rowKey="id" dataSource={groups} columns={columns} loading={loading} pagination={false} />

      <Modal
        title={editing ? 'Редактировать группу' : 'Новая группа'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); void load(); }}
        onOk={() => form.submit()}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={saving}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="name" label="Название" rules={[{ required: true, message: 'Введите название' }]}>
            <Input autoFocus />
          </Form.Item>
          <Form.Item name="description" label="Описание">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Delete-with-impact modal. OK is disabled until the impact payload loads so the admin
          cannot confirm blindly before seeing consequences (AI review #66 round 2 🟠). */}
      <Modal
        title={`Удалить группу «${impactFor?.name ?? ''}»?`}
        open={!!impactFor}
        onCancel={() => { setImpactFor(null); setImpact(null); }}
        onOk={confirmDelete}
        okText="Удалить"
        okButtonProps={{ danger: true, disabled: !impact }}
        cancelText="Отмена"
        confirmLoading={deleting}
      >
        {impact ? (
          <>
            <p>Будут отозваны следующие доступы:</p>
            <ul>
              <li>
                <b>{impact.memberCount}</b> участников потеряют членство
                {impact.members.length > 0 && (
                  <ul style={{ maxHeight: 160, overflowY: 'auto', marginTop: 4 }}>
                    {impact.members.map(m => (
                      <li key={m.id}>
                        {m.name} <span style={{ color: '#888' }}>· {m.email}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
              <li>
                <b>{impact.projectCount}</b> проектных биндингов будут удалены
                {impact.projects.length > 0 && (
                  <ul>
                    {impact.projects.map(p => (
                      <li key={p.project.id}>
                        <code>{p.project.key}</code> · роль <b>{p.roleDefinition.name}</b>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            </ul>
            <p style={{ color: '#d46b08', marginBottom: 0 }}>
              Операция необратима. Убедитесь, что участникам предоставлен альтернативный доступ.
            </p>
          </>
        ) : (
          <p>Загрузка…</p>
        )}
      </Modal>
    </div>
  );
}
