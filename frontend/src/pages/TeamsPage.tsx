import { useEffect, useState } from 'react';
import { Form, Input, Modal, Select, Popconfirm, message } from 'antd';
import type { Team, User } from '../types';
import * as teamsApi from '../api/teams';
import * as usersApi from '../api/auth';
import { useAuthStore } from '../store/auth.store';
import { useThemeStore } from '../store/theme.store';
import { hasAnyRequiredRole } from '../lib/roles';

const LOGO_GRAD =
  'linear-gradient(in oklab 135deg, oklab(59.3% -0.002 -0.207) 0%, oklab(54.1% 0.096 -0.227) 100%)';

const DARK_C = {
  bg: '#080B14',
  bgCard: '#0F1320',
  bgCardAlt: '#0D1117',
  border: '#21262D',
  headerBg: '#161B22',
  btnBorder: '#30363D',
  t1: '#E2E8F8',
  t2: '#C9D1D9',
  t3: '#8B949E',
  t4: '#484F58',
};

const LIGHT_C = {
  bg: '#F6F8FA',
  bgCard: '#FFFFFF',
  bgCardAlt: '#F6F8FA',
  border: '#D0D7DE',
  headerBg: '#F6F8FA',
  btnBorder: '#D0D7DE',
  t1: '#1F2328',
  t2: '#424A53',
  t3: '#656D76',
  t4: '#8C959F',
};

const AVATAR_GRADS = [
  LOGO_GRAD,
  'linear-gradient(in oklab 135deg, oklab(69.6% -0.142 0.045) 0%, oklab(59.6% -0.122 0.037) 100%)',
  'linear-gradient(in oklab 135deg, oklab(76.9% 0.056 0.155) 0%, oklab(66.6% 0.083 0.134) 100%)',
  'linear-gradient(in oklab 135deg, oklab(63.7% 0.188 0.089) 0%, oklab(57.7% 0.191 0.099) 100%)',
  'linear-gradient(in oklab 135deg, oklab(58.5% 0.025 -0.202) 0%, oklab(51.1% 0.028 -0.228) 100%)',
];

function avatarGrad(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_GRADS[h % AVATAR_GRADS.length]!;
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function teamInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [membersForm] = Form.useForm();
  const { user } = useAuthStore();
  const { mode } = useThemeStore();
  const C = mode === 'light' ? LIGHT_C : DARK_C;
  const canManageTeams = hasAnyRequiredRole(user?.role, ['ADMIN', 'MANAGER']);

  const load = async () => {
    setLoading(true);
    try {
      const [teamsData, usersData] = await Promise.all([
        teamsApi.listTeams(),
        usersApi.listUsers(),
      ]);
      setTeams(teamsData);
      setUsers(usersData);
    } catch {
      message.error('Failed to load teams');
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, []);

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

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: C.bg,
        minHeight: '100vh',
        width: '100%',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          paddingTop: 28,
          paddingBottom: 20,
          paddingInline: 32,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: '"Space Grotesk", system-ui, sans-serif',
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: '-0.03em',
              lineHeight: '28px',
              color: C.t1,
            }}
          >
            Команды
          </div>
          <div
            style={{
              fontFamily: '"Inter", system-ui, sans-serif',
              fontSize: 13,
              lineHeight: '16px',
              color: C.t3,
              marginTop: 4,
            }}
          >
            Управление проектными командами
          </div>
        </div>
        {canManageTeams && (
          <div
            onClick={openCreate}
            style={{
              backgroundImage: LOGO_GRAD,
              borderRadius: 8,
              paddingBlock: 8,
              paddingInline: 16,
              cursor: 'pointer',
            }}
          >
            <span
              style={{
                fontFamily: '"Inter", system-ui, sans-serif',
                fontSize: 13,
                fontWeight: 500,
                lineHeight: '16px',
                color: '#FFFFFF',
              }}
            >
              + Создать команду
            </span>
          </div>
        )}
      </div>

      {/* Table card */}
      <div
        style={{
          flex: 1,
          marginInline: 32,
          marginBottom: 24,
          background: C.bgCard,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Table header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            height: 36,
            paddingInline: 20,
            background: C.headerBg,
            borderBottom: `1px solid ${C.border}`,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              flex: 1,
              fontFamily: '"Inter", system-ui, sans-serif',
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.5px',
              lineHeight: '12px',
              textTransform: 'uppercase',
              color: C.t3,
            }}
          >
            Команда
          </div>
          <div
            style={{
              width: 160,
              flexShrink: 0,
              fontFamily: '"Inter", system-ui, sans-serif',
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.5px',
              lineHeight: '12px',
              textTransform: 'uppercase',
              color: C.t3,
            }}
          >
            Участники
          </div>
          <div
            style={{
              width: 200,
              flexShrink: 0,
              fontFamily: '"Inter", system-ui, sans-serif',
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.5px',
              lineHeight: '12px',
              textTransform: 'uppercase',
              color: C.t3,
            }}
          >
            Описание
          </div>
          <div
            style={{
              width: 120,
              flexShrink: 0,
              fontFamily: '"Inter", system-ui, sans-serif',
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.5px',
              lineHeight: '12px',
              textTransform: 'uppercase',
              textAlign: 'right',
              color: C.t3,
            }}
          >
            Действия
          </div>
        </div>

        {/* Rows */}
        {loading ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: C.t3,
              fontFamily: '"Inter", system-ui, sans-serif',
              fontSize: 13,
            }}
          >
            Загрузка…
          </div>
        ) : (
          teams.map((team, idx) => {
            const members = team.members ?? [];
            const visibleMembers = members.slice(0, 3);
            const extraCount = (team._count?.members ?? members.length) - visibleMembers.length;
            const rowBg = idx % 2 === 1 ? C.bgCardAlt : C.bgCard;
            const avatarBorder = idx % 2 === 1 ? C.bgCardAlt : C.bgCard;

            return (
              <div
                key={team.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  height: 56,
                  paddingInline: 20,
                  background: rowBg,
                  borderBottom: `1px solid ${C.border}`,
                  flexShrink: 0,
                }}
              >
                {/* Team name + icon */}
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      backgroundImage: avatarGrad(team.name),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: '"Space Grotesk", system-ui, sans-serif',
                        fontSize: 12,
                        fontWeight: 700,
                        lineHeight: '16px',
                        color: '#FFFFFF',
                      }}
                    >
                      {teamInitials(team.name)}
                    </span>
                  </div>
                  <div>
                    <div
                      style={{
                        fontFamily: '"Inter", system-ui, sans-serif',
                        fontSize: 13,
                        fontWeight: 500,
                        lineHeight: '16px',
                        color: C.t1,
                      }}
                    >
                      {team.name}
                    </div>
                    {team.description && (
                      <div
                        style={{
                          fontFamily: '"Inter", system-ui, sans-serif',
                          fontSize: 11,
                          lineHeight: '14px',
                          color: C.t3,
                        }}
                      >
                        {team.description}
                      </div>
                    )}
                  </div>
                </div>

                {/* Members avatars */}
                <div
                  style={{
                    width: 160,
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {visibleMembers.map((m, i) => (
                    <div
                      key={m.id}
                      title={m.user.name}
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        backgroundImage: avatarGrad(m.user.name),
                        border: `2px solid ${avatarBorder}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        marginLeft: i === 0 ? 0 : -6,
                        boxSizing: 'border-box',
                      }}
                    >
                      <span
                        style={{
                          fontFamily: '"Space Grotesk", system-ui, sans-serif',
                          fontSize: 9,
                          fontWeight: 700,
                          lineHeight: '12px',
                          color: '#FFFFFF',
                        }}
                      >
                        {initials(m.user.name)}
                      </span>
                    </div>
                  ))}
                  {extraCount > 0 && (
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        background: C.border,
                        border: `2px solid ${avatarBorder}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        marginLeft: -6,
                        boxSizing: 'border-box',
                      }}
                    >
                      <span
                        style={{
                          fontFamily: '"Inter", system-ui, sans-serif',
                          fontSize: 9,
                          lineHeight: '12px',
                          color: C.t3,
                        }}
                      >
                        +{extraCount}
                      </span>
                    </div>
                  )}
                </div>

                {/* Description */}
                <div
                  style={{
                    width: 200,
                    flexShrink: 0,
                    fontFamily: '"Inter", system-ui, sans-serif',
                    fontSize: 12,
                    lineHeight: '16px',
                    color: C.t3,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {team.description ?? '—'}
                </div>

                {/* Actions */}
                <div
                  style={{
                    width: 120,
                    flexShrink: 0,
                    display: 'flex',
                    gap: 8,
                    justifyContent: 'flex-end',
                  }}
                >
                  <button
                    onClick={() => void openMembers(team)}
                    style={{
                      border: `1px solid ${C.btnBorder}`,
                      borderRadius: 6,
                      paddingBlock: 5,
                      paddingInline: 10,
                      background: 'transparent',
                      cursor: 'pointer',
                      fontFamily: '"Inter", system-ui, sans-serif',
                      fontSize: 11,
                      lineHeight: '14px',
                      color: C.t3,
                    }}
                  >
                    Открыть
                  </button>
                  {canManageTeams && (
                    <Popconfirm
                      title="Удалить команду?"
                      onConfirm={() => void handleDelete(team)}
                    >
                      <button
                        style={{
                          border: `1px solid ${C.btnBorder}`,
                          borderRadius: 6,
                          paddingBlock: 5,
                          paddingInline: 10,
                          background: 'transparent',
                          cursor: 'pointer',
                          fontFamily: '"Inter", system-ui, sans-serif',
                          fontSize: 11,
                          lineHeight: '14px',
                          color: C.t3,
                        }}
                      >
                        ···
                      </button>
                    </Popconfirm>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Edit/Create Modal */}
      <Modal
        open={isModalOpen}
        title={editingTeam ? 'Редактировать команду' : 'Новая команда'}
        onCancel={() => setIsModalOpen(false)}
        onOk={() => void handleSave()}
        okText="Сохранить"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="Название"
            rules={[{ required: true, message: 'Введите название команды' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Описание">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Members Modal */}
      <Modal
        open={isMembersModalOpen}
        title={`Участники: ${editingTeam?.name ?? ''}`}
        onCancel={() => setIsMembersModalOpen(false)}
        onOk={() => void handleSaveMembers()}
        okText="Сохранить"
        width={520}
      >
        <Form form={membersForm} layout="vertical">
          <Form.Item
            name="userIds"
            label="Участники"
            rules={[{ required: true, message: 'Выберите хотя бы одного участника' }]}
          >
            <Select
              mode="multiple"
              placeholder="Выберите пользователей"
              optionFilterProp="label"
              options={users.map((u) => ({ value: u.id, label: `${u.name} (${u.email})` }))}
            />
          </Form.Item>
        </Form>
        {canManageTeams && editingTeam && (
          <div style={{ marginTop: 8 }}>
            <button
              onClick={() => {
                setIsMembersModalOpen(false);
                openEdit(editingTeam);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: 12,
                color: '#6366F1',
                padding: 0,
              }}
            >
              Редактировать название / описание
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
