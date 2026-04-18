import { useState, useEffect, useCallback } from 'react';
import { Table, Button, Modal, Form, Input, Select, Space, message, Tooltip, Alert } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, EditOutlined, DeleteOutlined, TeamOutlined, SearchOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { userGroupsApi, type UserGroupListItem, type UserGroupImpact } from '../../api/user-groups';
import { listProjects } from '../../api/projects';
import type { Project } from '../../types';

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
  const [projectId, setProjectId] = useState<string | undefined>();
  const [projects, setProjects] = useState<Project[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<UserGroupListItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  // AI review #66 round 10 🟠 — bundle impact with the group id it was loaded for, so render
  // code can only use impact when it genuinely belongs to the currently-open group. Prevents a
  // stale impact from a previous group from enabling delete before the new fetch settles.
  const [impact, setImpact] = useState<{ forGroupId: string; data: UserGroupImpact } | null>(null);
  const [impactFor, setImpactFor] = useState<UserGroupListItem | null>(null);
  const [impactError, setImpactError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Impact is "ready" only when it was loaded for the currently-open group and no error is set.
  const impactReady = !!impact && !!impactFor && impact.forGroupId === impactFor.id && !impactError;

  // Debounce the user-typed search so we don't fire a request per keystroke
  // (AI review #66 🟡). 300ms is the usual sweet spot — feels instant, batches fast typists.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setGroups(await userGroupsApi.list({
        search: debouncedSearch.trim() || undefined,
        projectId,
      }));
    } catch {
      message.error('Не удалось загрузить группы');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, projectId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    listProjects().then(setProjects).catch(() => { /* non-fatal — filter just stays empty */ });
  }, []);

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

  const loadImpact = async (g: UserGroupListItem) => {
    // Race guard (AI review #66 round 3 🟠) — if the admin quickly switches between groups,
    // a slower in-flight response must NOT overwrite the impact for the currently-open group.
    // We re-read `impactFor` inside the settled handlers and apply only when it's still `g`.
    setImpact(null);
    setImpactError(null);
    try {
      const result = await userGroupsApi.getImpact(g.id);
      setImpactFor(current => {
        if (current?.id === g.id) setImpact({ forGroupId: g.id, data: result });
        return current;
      });
    } catch {
      // AI review #66 round 8 🟠 — keep the modal open on error so the user sees what went
      // wrong and can retry; previously we closed it silently, which hid the delete-with-impact
      // UX contract.
      setImpactFor(current => {
        if (current?.id === g.id) setImpactError('Не удалось получить impact группы');
        return current;
      });
    }
  };

  const openDelete = async (g: UserGroupListItem) => {
    setImpactFor(g);
    await loadImpact(g);
  };

  const confirmDelete = async () => {
    if (!impactFor) return;
    setDeleting(true);
    try {
      await userGroupsApi.remove(impactFor.id);
      message.success('Группа удалена');
      // AI review #66 round 9 🔵 — reset full delete-modal state symmetrically.
      setImpactFor(null);
      setImpact(null);
      setImpactError(null);
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
            placeholder="Поиск по имени"
            prefix={<SearchOutlined />}
            value={search}
            onChange={e => setSearch(e.target.value)}
            allowClear
            style={{ width: 240 }}
          />
          <Select
            placeholder="Фильтр по проекту"
            value={projectId}
            onChange={v => setProjectId(v)}
            allowClear
            showSearch
            filterOption={(input, opt) =>
              (opt?.label as string)?.toLowerCase().includes(input.toLowerCase())
            }
            options={projects.map(p => ({ value: p.id, label: `${p.key}: ${p.name}` }))}
            style={{ width: 260 }}
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
        onCancel={() => { setImpactFor(null); setImpact(null); setImpactError(null); }}
        onOk={confirmDelete}
        okText="Удалить"
        okButtonProps={{ danger: true, disabled: !impactReady || deleting }}
        cancelText="Отмена"
        confirmLoading={deleting}
      >
        {impactError ? (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Alert type="error" message={impactError} showIcon />
            <Button onClick={() => impactFor && loadImpact(impactFor)}>Повторить</Button>
          </Space>
        ) : impactReady && impact ? (
          <>
            <p>Будут отозваны следующие доступы:</p>
            <ul>
              <li>
                <b>{impact.data.memberCount}</b> участников потеряют членство
                {impact.data.members.length > 0 && (
                  <ul style={{ maxHeight: 160, overflowY: 'auto', marginTop: 4 }}>
                    {impact.data.members.map(m => (
                      <li key={m.id}>
                        {m.name} <span style={{ color: '#888' }}>· {m.email}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
              <li>
                <b>{impact.data.projectCount}</b> проектных биндингов будут удалены
                {impact.data.projects.length > 0 && (
                  <ul>
                    {impact.data.projects.map(p => (
                      // Composite key: backend currently guarantees one binding per project
                      // in a group (@@unique([groupId, projectId])), but defensive against
                      // contract extension or duplicate rows sneaking in via data migration.
                      <li key={`${p.project.id}-${p.roleDefinition.id}`}>
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
