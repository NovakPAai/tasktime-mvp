import { useEffect, useMemo, useState } from 'react';
import { Button, Space, Segmented, Table, Tag, Typography } from 'antd';
import { PlayCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';
import { useUatOnboardingStore } from '../store/uatOnboarding.store';
import * as uatApi from '../api/uat';
import { hasAnyRequiredRole, hasRequiredRole } from '../lib/roles';

type UatRole = uatApi.UatRole;
type UatTest = uatApi.UatTest;
type RoleFilter = UatRole | 'ALL';

export default function UatTestsPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const startTest = useUatOnboardingStore((s) => s.startTest);
  const [loading, setLoading] = useState(false);
  const [tests, setTests] = useState<UatTest[]>([]);
  const initialRoleFilter = hasRequiredRole(user?.role, 'ADMIN')
    ? 'ADMIN'
    : (user?.role as UatRole | undefined) ?? 'ALL';
  const [roleFilter, setRoleFilter] = useState<RoleFilter>(initialRoleFilter);
  const [completedIds, setCompletedIds] = useState<string[]>([]);

  const availableRoles: RoleFilter[] = useMemo(() => {
    const roles = new Set<UatRole>(tests.map((t) => t.role));
    const ordered: UatRole[] = ['ADMIN', 'MANAGER', 'USER', 'VIEWER'];
    const present = ordered.filter((r) => roles.has(r));
    return ['ALL', ...present];
  }, [tests]);

  const filteredTests: UatTest[] = useMemo(() => {
    if (roleFilter === 'ALL') return tests;
    return tests.filter((t) => t.role === roleFilter);
  }, [roleFilter, tests]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const roleParam = hasRequiredRole(user?.role, 'ADMIN')
          ? 'ADMIN'
          : hasAnyRequiredRole(user?.role, ['MANAGER', 'USER', 'VIEWER'])
            ? (user!.role as uatApi.UatRole)
            : undefined;
        const data = await uatApi.listUatTests({ role: roleParam });
        setTests(data);
      } finally {
        setLoading(false);
      }
    };
    void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

  useEffect(() => {
    if (!user?.id || typeof window === 'undefined') {
      setCompletedIds([]);
      return;
    }
    try {
      const storageKey = `tasktime-uat-progress:${user.id}`;
      const raw = window.localStorage.getItem(storageKey);
      const parsed: string[] = raw ? JSON.parse(raw) : [];
      setCompletedIds(parsed);
    } catch {
      setCompletedIds([]);
    }
  }, [user?.id]);

  const handleStart = (test: UatTest) => {
    startTest(test);
    navigate(test.startPath);
  };

  const columns = [
    {
      title: 'Чек-лист',
      dataIndex: 'title',
      key: 'title',
      width: 360,
      render: (_: unknown, test: UatTest) => (
        <div>
          <Typography.Text strong>{test.title}</Typography.Text>
          {test.description && (
            <Typography.Paragraph type="secondary" style={{ margin: 2 }}>
              {test.description}
            </Typography.Paragraph>
          )}
        </div>
      ),
    },
    {
      title: 'Роль',
      dataIndex: 'role',
      key: 'role',
      width: 120,
      render: (role: UatRole) => <Tag color="blue">{role}</Tag>,
    },
    {
      title: 'Шаги',
      dataIndex: ['steps', 'length'],
      key: 'steps',
      width: 80,
      render: (_: unknown, test: UatTest) => test.steps.length,
    },
    {
      title: 'Статус',
      key: 'status',
      width: 120,
      render: (_: unknown, test: UatTest) =>
        completedIds.includes(test.id) ? <Tag color="green">Пройден</Tag> : <Tag>Не начат</Tag>,
    },
    {
      title: 'Действия',
      key: 'actions',
      width: 170,
      render: (_: unknown, test: UatTest) => {
        const isCompleted = completedIds.includes(test.id);
        return (
          <Button type="primary" size="small" icon={<PlayCircleOutlined />} onClick={() => handleStart(test)}>
            {isCompleted ? 'Пройти ещё раз' : 'Начать тест'}
          </Button>
        );
      },
    },
  ];

  return (
    <div className="tt-page">
      <div className="tt-page-header">
        <div>
          <h1 className="tt-page-title">UAT чек-листы</h1>
          <p className="tt-page-subtitle">
            Приёмочные сценарии для Flow Universe в формате онбординга по ролям.
          </p>
        </div>
      </div>

      <div className="tt-panel-grid">
        <div className="tt-panel">
          <div className="tt-panel-header">Сценарии по ролям</div>
          <div className="tt-panel-body">
            <div style={{ padding: 12, paddingBottom: 4 }}>
              <Typography.Paragraph type="secondary" style={{ marginBottom: 8, maxWidth: 720 }}>
                Выбери роль — мы покажем только релевантные UAT-сценарии. Каждый чек-лист открывается на нужной
                странице, а шаги доступны в онбординг-оверлее справа внизу.
              </Typography.Paragraph>

              <div className="tt-uat-role-chips">
                <Space size={8} align="center">
                  <Typography.Text className="tt-uat-role-label">Роль:</Typography.Text>
                  <Segmented<RoleFilter>
                    options={availableRoles.map((role) => ({
                      label: role === 'ALL' ? 'Все' : role,
                      value: role,
                    }))}
                    value={roleFilter}
                    onChange={(value) => setRoleFilter(value as RoleFilter)}
                  />
                </Space>
              </div>
            </div>

            <div style={{ padding: 12, paddingTop: 0 }}>
              <Table<UatTest>
                className="tt-table"
                dataSource={filteredTests}
                columns={columns}
                rowKey="id"
                scroll={{ x: 900 }}
                loading={loading}
                pagination={false}
                size="small"
              />
            </div>
          </div>
        </div>

        <div className="tt-panel">
          <div className="tt-panel-header">Как работать с чек-листами</div>
          <div className="tt-panel-body">
            <div className="tt-panel-row">
              <span>1. Выбери роль и сценарий</span>
              <span />
            </div>
            <div className="tt-panel-row">
              <span>2. Нажми «Начать тест»</span>
              <span />
            </div>
            <div className="tt-panel-row">
              <span>3. Выполняй шаги в оверлее</span>
              <span />
            </div>
            <div className="tt-panel-row">
              <span>4. Вернись к списку для следующего сценария</span>
              <span />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

