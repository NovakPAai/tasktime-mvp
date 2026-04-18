import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Table, Button, Modal, Form, Input, Space, Tag, message,
  Popconfirm, Alert, Tabs, Select, Tooltip, ColorPicker,
} from 'antd';
import type { Color } from 'antd/es/color-picker';
import type { ColumnsType } from 'antd/es/table';
import { ArrowLeftOutlined, PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { roleSchemesApi, type ProjectRoleScheme, type ProjectRoleDefinition } from '../../api/role-schemes';
import { listProjects } from '../../api/projects';
import type { Project } from '../../types';
import PermissionMatrixDrawer from '../../components/admin/PermissionMatrixDrawer';

const ROLE_PALETTE = [
  '#F44336', '#E91E63', '#FF5722', '#FF9800',
  '#FFC107', '#FFEB3B', '#8BC34A', '#4CAF50',
  '#00BCD4', '#2196F3', '#3F51B5', '#9C27B0',
  '#607D8B', '#9E9E9E', '#795548', '#000000',
];

function RoleColorPickerField({ value, onChange }: { value?: string; onChange?: (v: string) => void }) {
  return (
    <ColorPicker
      format="hex"
      value={value || null}
      presets={[{ label: 'Палитра', colors: ROLE_PALETTE }]}
      onChange={(color: Color) => onChange?.(color.toHexString())}
      allowClear
      onClear={() => onChange?.('')}
      showText
    />
  );
}

export default function AdminRoleSchemeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [scheme, setScheme] = useState<ProjectRoleScheme | null>(null);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const [matrixRole, setMatrixRole] = useState<ProjectRoleDefinition | null>(null);
  const [matrixOpen, setMatrixOpen] = useState(false);

  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<ProjectRoleDefinition | null>(null);
  const [savingRole, setSavingRole] = useState(false);
  const [roleForm] = Form.useForm();

  const [attachProjectId, setAttachProjectId] = useState<string | undefined>();
  const [attaching, setAttaching] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [s, projects] = await Promise.all([
        roleSchemesApi.get(id),
        listProjects(),
      ]);
      setScheme(s);
      setAllProjects(projects);
    } catch {
      message.error('Не удалось загрузить схему');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const openCreateRole = () => {
    setEditingRole(null);
    roleForm.resetFields();
    setRoleModalOpen(true);
  };

  const openEditRole = (role: ProjectRoleDefinition) => {
    setEditingRole(role);
    roleForm.setFieldsValue({ name: role.name, description: role.description ?? '', color: role.color ?? '' });
    setRoleModalOpen(true);
  };

  const handleSaveRole = async (vals: { name: string; key?: string; description?: string; color?: string }) => {
    if (!id) return;
    setSavingRole(true);
    try {
      if (editingRole) {
        await roleSchemesApi.updateRole(id, editingRole.id, {
          name: vals.name,
          description: vals.description || null,
          color: vals.color || null,
        });
        message.success('Роль обновлена');
      } else {
        await roleSchemesApi.createRole(id, {
          name: vals.name,
          key: vals.key!,
          description: vals.description,
          color: vals.color,
        });
        message.success('Роль создана');
      }
      setRoleModalOpen(false);
      load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      message.error(err?.response?.data?.error || 'Не удалось сохранить');
    } finally {
      setSavingRole(false);
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    if (!id) return;
    try {
      await roleSchemesApi.deleteRole(id, roleId);
      message.success('Роль удалена');
      load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      const msg = err?.response?.data?.error ?? '';
      if (msg.startsWith('ROLE_IN_USE')) {
        message.error('Нельзя удалить: у роли есть участники');
      } else {
        message.error('Не удалось удалить роль');
      }
    }
  };

  const handleAttachProject = async () => {
    if (!id || !attachProjectId) return;
    setAttaching(true);
    try {
      await roleSchemesApi.attachProject(id, attachProjectId);
      message.success('Проект привязан');
      setAttachProjectId(undefined);
      load();
    } catch {
      message.error('Не удалось привязать проект');
    } finally {
      setAttaching(false);
    }
  };

  const handleDetachProject = async (projectId: string) => {
    if (!id) return;
    try {
      await roleSchemesApi.detachProject(id, projectId);
      message.success('Проект отвязан');
      load();
    } catch {
      message.error('Не удалось отвязать проект');
    }
  };

  const roleColumns: ColumnsType<ProjectRoleDefinition> = [
    {
      title: 'Роль',
      render: (_, r) => (
        <Space>
          <Tag color={r.color ?? 'default'}>{r.name}</Tag>
          {r.isSystem && <Tag>Системная</Tag>}
        </Space>
      ),
    },
    { title: 'Ключ', dataIndex: 'key', render: (v: string) => <code>{v}</code> },
    { title: 'Описание', dataIndex: 'description', render: (v: string | null) => v || '—' },
    { title: 'Участников', dataIndex: ['_count', 'userProjectRoles'], render: (v: number) => v ?? 0 },
    {
      title: '',
      width: 150,
      render: (_, r) => (
        <Space>
          <Button size="small" onClick={() => { setMatrixRole(r); setMatrixOpen(true); }}>Права</Button>
          <Tooltip title="Редактировать">
            <Button size="small" icon={<EditOutlined />} onClick={() => openEditRole(r)} />
          </Tooltip>
          {!r.isSystem && (
            <Popconfirm
              title="Удалить роль?"
              onConfirm={() => handleDeleteRole(r.id)}
              okText="Удалить"
              okButtonProps={{ danger: true }}
            >
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const attachedIds = new Set(scheme?.projects.map(p => p.projectId) ?? []);
  const availableProjects = allProjects.filter(p => !attachedIds.has(p.id));

  const projectColumns: ColumnsType<{ projectId: string; project: { id: string; name: string; key: string } }> = [
    { title: 'Ключ', dataIndex: ['project', 'key'] },
    { title: 'Название', dataIndex: ['project', 'name'] },
    {
      title: '',
      width: 100,
      render: (_, p) => (
        <Popconfirm title="Отвязать проект?" onConfirm={() => handleDetachProject(p.projectId)} okText="Отвязать" okButtonProps={{ danger: true }}>
          <Button size="small" danger>Отвязать</Button>
        </Popconfirm>
      ),
    },
  ];

  if (loading || !scheme) {
    return <div className="tt-page"><div>Загрузка...</div></div>;
  }

  return (
    <div className="tt-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/admin/role-schemes')}>Назад</Button>
        <h2 className="tt-page-title" style={{ margin: 0 }}>
          {scheme.name}
          {scheme.isDefault && <Tag color="blue" style={{ marginLeft: 8 }}>По умолчанию</Tag>}
        </h2>
      </div>

      {scheme.isDefault && (
        <Alert
          type="info"
          message="Эта схема применяется ко всем проектам без явной привязки"
          style={{ marginBottom: 16 }}
          showIcon
        />
      )}

      <Tabs
        items={[
          {
            key: 'roles',
            label: 'Роли',
            children: (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                  <Button type="primary" icon={<PlusOutlined />} onClick={openCreateRole}>Добавить роль</Button>
                </div>
                <Table
                  rowKey="id"
                  dataSource={scheme.roles}
                  columns={roleColumns}
                  pagination={false}
                  size="small"
                />
              </>
            ),
          },
          {
            key: 'projects',
            label: 'Проекты',
            children: (
              <>
                <Table
                  rowKey="projectId"
                  dataSource={scheme.projects}
                  columns={projectColumns}
                  pagination={false}
                  size="small"
                  style={{ marginBottom: 16 }}
                />
                <Space>
                  <Select
                    placeholder="Выберите проект для привязки"
                    style={{ width: 300 }}
                    value={attachProjectId}
                    onChange={setAttachProjectId}
                    showSearch
                    filterOption={(input, opt) =>
                      (opt?.label as string)?.toLowerCase().includes(input.toLowerCase())
                    }
                    options={availableProjects.map(p => ({ value: p.id, label: `${p.key}: ${p.name}` }))}
                  />
                  <Button
                    type="primary"
                    loading={attaching}
                    disabled={!attachProjectId}
                    onClick={handleAttachProject}
                  >
                    Привязать
                  </Button>
                </Space>
              </>
            ),
          },
        ]}
      />

      {/* Role create/edit modal */}
      <Modal
        title={editingRole ? 'Редактировать роль' : 'Новая роль'}
        open={roleModalOpen}
        onCancel={() => { setRoleModalOpen(false); void load(); }}
        onOk={() => roleForm.submit()}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={savingRole}
        destroyOnClose
      >
        <Form form={roleForm} layout="vertical" onFinish={handleSaveRole}>
          <Form.Item name="name" label="Название" rules={[{ required: true, message: 'Введите название' }]}>
            <Input />
          </Form.Item>
          {!editingRole && (
            <Form.Item
              name="key"
              label="Ключ (только заглавные буквы и _)"
              rules={[
                { required: true, message: 'Введите ключ' },
                { pattern: /^[A-Z_]+$/, message: 'Только заглавные буквы и _' },
              ]}
            >
              <Input placeholder="CUSTOM_ROLE" />
            </Form.Item>
          )}
          <Form.Item name="description" label="Описание">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="color" label="Цвет">
            <RoleColorPickerField />
          </Form.Item>
        </Form>
      </Modal>

      <PermissionMatrixDrawer
        schemeId={scheme.id}
        role={matrixRole}
        open={matrixOpen}
        onClose={() => { setMatrixOpen(false); void load(); }}
        onSaved={load}
      />
    </div>
  );
}
