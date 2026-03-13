import { useEffect, useState } from 'react';
import { Avatar, Button, Form, Input, Modal, Select, Space, Table, message, Popconfirm } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { Team, User } from '../types';
import * as teamsApi from '../api/teams';
import * as usersApi from '../api/auth';
import { useAuthStore } from '../store/auth.store';
import { hasAnyRequiredRole } from '../lib/roles';

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [membersForm] = Form.useForm();
  const { user } = useAuthStore();
  const canManageTeams = hasAnyRequiredRole(user?.role, ['ADMIN', 'MANAGER']);

  const load = async () => {
    setLoading(true);
    try {
      const [teamsData, usersData] = await Promise.all([
        teamsApi.listTeams(),
        usersApi.listUsers(),
      ]);
      setTeams(teamsData);
      if (!selectedTeam && teamsData.length > 0) {
        setSelectedTeam(teamsData[0]);
      } else if (selectedTeam) {
        const updatedSelected = teamsData.find((t) => t.id === selectedTeam.id);
        setSelectedTeam(updatedSelected ?? teamsData[0] ?? null);
      }
      setUsers(usersData);
    } catch {
      message.error('Failed to load teams');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openCreate = () => {
    setEditingTeam(null);
    form.resetFields();
    setIsModalOpen(true);
  };

  const openEdit = (team: Team) => {
    setEditingTeam(team);
    form.setFieldsValue({ name: team.name, description: team.description });
    setIsModalOpen(true);
  };

  const openMembers = async (team: Team) => {
    try {
      const full = await teamsApi.getTeam(team.id);
      setEditingTeam(full);
      membersForm.setFieldsValue({
        userIds: full.members?.map((m) => m.userId) ?? [],
      });
      setIsMembersModalOpen(true);
    } catch {
      message.error('Failed to load team members');
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      if (editingTeam) {
        await teamsApi.updateTeam(editingTeam.id, values);
        message.success('Team updated');
      } else {
        await teamsApi.createTeam(values);
        message.success('Team created');
      }
      setIsModalOpen(false);
      await load();
    } catch (err) {
      if ((err as { errorFields?: unknown }).errorFields) return;
      message.error('Failed to save team');
    }
  };

  const handleDelete = async (team: Team) => {
    try {
      await teamsApi.deleteTeam(team.id);
      message.success('Team deleted');
      await load();
    } catch {
      message.error('Failed to delete team');
    }
  };

  const handleSaveMembers = async () => {
    if (!editingTeam) return;
    try {
      const values = await membersForm.validateFields();
      await teamsApi.updateTeamMembers(editingTeam.id, values.userIds);
      message.success('Members updated');
      setIsMembersModalOpen(false);
      await load();
    } catch (err) {
      if ((err as { errorFields?: unknown }).errorFields) return;
      message.error('Failed to update members');
    }
  };

  const columns = [
    {
      title: 'Team',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: Team) => {
        const members = record.members ?? [];
        const firstMember = members[0]?.user;
        const initials =
          firstMember?.name
            ?.split(' ')
            .map((p) => p[0])
            .join('')
            .slice(0, 2) || name.slice(0, 2).toUpperCase();
        return (
          <Space size="middle">
            <Avatar
              size="small"
              style={{ backgroundColor: 'var(--bg-el)', color: 'var(--t1)', fontSize: 11 }}
            >
              {initials}
            </Avatar>
            <div>
              <div style={{ fontSize: 13, color: 'var(--t1)' }}>{name}</div>
              {record.description && (
                <div style={{ fontSize: 11, color: 'var(--t3)' }}>{record.description}</div>
              )}
            </div>
          </Space>
        );
      },
    },
    {
      title: 'Members',
      key: 'members',
      render: (_: unknown, record: Team) => {
        const members = record.members ?? [];
        const total = record._count?.members ?? members.length;
        return (
          <Space size="small" style={{ alignItems: 'center' }}>
            <Avatar.Group maxCount={4} size="small">
              {members.map((m) => {
                const initials =
                  m.user.name
                    .split(' ')
                    .map((p) => p[0])
                    .join('')
                    .slice(0, 2) || m.user.email[0]?.toUpperCase();
                return (
                  <Avatar
                    key={m.id}
                    style={{ backgroundColor: 'var(--bg-el)', color: 'var(--t1)', fontSize: 10 }}
                  >
                    {initials}
                  </Avatar>
                );
              })}
            </Avatar.Group>
            <span className="tt-mono" style={{ fontSize: 11, color: 'var(--t2)' }}>
              {total ?? 0}
            </span>
          </Space>
        );
      },
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 130,
      render: (v: string) => new Date(v).toLocaleDateString(),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: unknown, record: Team) =>
        canManageTeams ? (
          <Space
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <Button type="link" size="small" onClick={() => openEdit(record)}>
              Edit
            </Button>
            <Button type="link" size="small" onClick={() => openMembers(record)}>
              Members
            </Button>
            <Popconfirm
              title="Delete team"
              description="Are you sure you want to delete this team?"
              onConfirm={() => handleDelete(record)}
            >
              <Button type="link" size="small" danger>
                Delete
              </Button>
            </Popconfirm>
          </Space>
        ) : null,
    },
  ];

  return (
    <div className="tt-page">
      <div className="tt-page-header">
        <div>
          <h1 className="tt-page-title">Teams</h1>
          <p className="tt-page-subtitle">
            Overview of all teams with members and basic stats
          </p>
        </div>
        <div className="tt-page-actions">
          {canManageTeams && (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              New Team
            </Button>
          )}
        </div>
      </div>

      <div className="tt-two-column">
        <div className="tt-two-column-main">
          <div className="tt-panel">
            <div className="tt-panel-header">Teams</div>
            <div className="tt-panel-body">
              <Table<Team>
                className="tt-table"
                rowKey="id"
                loading={loading}
                dataSource={teams}
                pagination={false}
                columns={columns}
                onRow={(record) => ({
                  onClick: () => setSelectedTeam(record),
                  style: {
                    cursor: 'pointer',
                    backgroundColor:
                      selectedTeam && selectedTeam.id === record.id ? 'var(--bg-hover)' : undefined,
                  },
                })}
              />
            </div>
          </div>
        </div>

        <aside className="tt-two-column-aside">
          <div className="tt-panel">
            <div className="tt-panel-header">Team details</div>
            {selectedTeam ? (
              <>
                <div className="tt-panel-row">
                  <span>Name</span>
                  <span>{selectedTeam.name}</span>
                </div>
                <div className="tt-panel-row">
                  <span>Members</span>
                  <span>{selectedTeam._count?.members ?? selectedTeam.members?.length ?? 0}</span>
                </div>
                <div className="tt-panel-row">
                  <span>Created</span>
                  <span>{new Date(selectedTeam.createdAt).toLocaleDateString()}</span>
                </div>
                {selectedTeam.description && (
                  <div className="tt-panel-row">
                    <span>Description</span>
                    <span style={{ maxWidth: 140, textAlign: 'right' }}>
                      {selectedTeam.description}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div className="tt-panel-empty">Select a team to see details.</div>
            )}
          </div>
        </aside>
      </div>

      <Modal
        open={isModalOpen}
        title={editingTeam ? 'Edit Team' : 'New Team'}
        onCancel={() => setIsModalOpen(false)}
        onOk={handleSave}
        okText="Save"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Please enter team name' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={isMembersModalOpen}
        title="Team Members"
        onCancel={() => setIsMembersModalOpen(false)}
        onOk={handleSaveMembers}
        okText="Save"
      >
        <Form form={membersForm} layout="vertical">
          <Form.Item
            name="userIds"
            label="Members"
            rules={[{ required: true, message: 'Select at least one member' }]}
          >
            <Select
              mode="multiple"
              placeholder="Select users"
              optionFilterProp="label"
              options={users.map((u) => ({ value: u.id, label: `${u.name} (${u.email})` }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

