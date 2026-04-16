import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Button, Table, Tag, Space, Form, Input, Select, Switch, Drawer, message,
  Popconfirm, Tooltip, Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ArrowLeftOutlined, PlusOutlined, DeleteOutlined, StarOutlined, LockOutlined } from '@ant-design/icons';
import { workflowsApi, type Workflow, type WorkflowStep, type WorkflowTransition } from '../../api/workflows';
import { workflowStatusesApi, type WorkflowStatus } from '../../api/workflow-statuses';
import { transitionScreensApi, type TransitionScreen } from '../../api/transition-screens';

// TTADM-67 / TTADM-68: карта кодов ошибок → читаемые сообщения
const STEP_ERRORS: Record<string, string> = {
  SYSTEM_WORKFLOW_IMMUTABLE: 'Системный воркфлоу нельзя изменять',
  'Status already in workflow': 'Статус уже добавлен в воркфлоу',
  'Workflow status not found': 'Статус не найден',
  'Workflow not found': 'Воркфлоу не найден',
};

const TRANSITION_ERRORS: Record<string, string> = {
  SYSTEM_WORKFLOW_IMMUTABLE: 'Системный воркфлоу нельзя изменять',
  TRANSITION_ALREADY_EXISTS: 'Такой переход уже существует',
  'fromStatus must be a step in the workflow': 'Исходный статус не является шагом воркфлоу',
  'toStatus must be a step in the workflow': 'Целевой статус не является шагом воркфлоу',
  'Workflow not found': 'Воркфлоу не найден',
};

function apiErrorMessage(err: unknown, map: Record<string, string>, fallback: string): string {
  const code = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? '';
  return map[code] ?? fallback;
}

// TTADM-68: parseJson возвращает undefined (не null) для пустых полей
function parseJson(s?: string): unknown[] | undefined {
  if (!s) return undefined;
  try { return JSON.parse(s) as unknown[]; } catch { return undefined; }
}

export default function AdminWorkflowEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [allStatuses, setAllStatuses] = useState<WorkflowStatus[]>([]);
  const [allScreens, setAllScreens] = useState<TransitionScreen[]>([]);
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);

  const [stepDrawerOpen, setStepDrawerOpen] = useState(false);
  const [stepForm] = Form.useForm();

  const [transitionDrawerOpen, setTransitionDrawerOpen] = useState(false);
  const [editingTransition, setEditingTransition] = useState<WorkflowTransition | null>(null);
  const [transitionForm] = Form.useForm();

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [wf, statuses, screens] = await Promise.all([
        workflowsApi.get(id),
        workflowStatusesApi.list(),
        transitionScreensApi.list(),
      ]);
      setWorkflow(wf);
      setAllStatuses(statuses);
      setAllScreens(screens);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleAddStep = async (vals: { statusId: string; isInitial?: boolean }) => {
    if (!id) return;
    try {
      await workflowsApi.addStep(id, { statusId: vals.statusId, isInitial: vals.isInitial ?? false });
      message.success('Шаг добавлен');
      setStepDrawerOpen(false);
      stepForm.resetFields();
      load();
    } catch (err) {
      // TTADM-67: показываем конкретную причину вместо generic-сообщения
      message.error(apiErrorMessage(err, STEP_ERRORS, 'Не удалось добавить шаг'));
    }
  };

  const handleDeleteStep = async (stepId: string) => {
    if (!id) return;
    try {
      await workflowsApi.deleteStep(id, stepId);
      message.success('Шаг удалён');
      load();
    } catch {
      message.error('Нельзя удалить: есть переходы от/до этого статуса');
    }
  };

  const handleSetInitial = async (step: WorkflowStep) => {
    if (!id) return;
    try {
      await workflowsApi.updateStep(id, step.id, { isInitial: true });
      message.success('Начальный статус обновлён');
      load();
    } catch {
      message.error('Не удалось обновить');
    }
  };

  const openAddTransition = () => {
    setEditingTransition(null);
    transitionForm.resetFields();
    setTransitionDrawerOpen(true);
  };

  const openEditTransition = (t: WorkflowTransition) => {
    setEditingTransition(t);
    transitionForm.setFieldsValue({
      name: t.name,
      fromStatusId: t.fromStatusId ?? undefined,
      toStatusId: t.toStatusId,
      isGlobal: t.isGlobal,
      screenId: t.screenId ?? undefined,
      conditions: t.conditions ? JSON.stringify(t.conditions, null, 2) : '',
      validators: t.validators ? JSON.stringify(t.validators, null, 2) : '',
      postFunctions: t.postFunctions ? JSON.stringify(t.postFunctions, null, 2) : '',
    });
    setTransitionDrawerOpen(true);
  };

  const handleSaveTransition = async (vals: {
    name: string;
    fromStatusId?: string;
    toStatusId: string;
    isGlobal: boolean;
    screenId?: string;
    conditions?: string;
    validators?: string;
    postFunctions?: string;
  }) => {
    if (!id) return;
    const data = {
      name: vals.name,
      // TTADM-68: fromStatusId=null только при isGlobal, иначе передаём UUID или undefined
      fromStatusId: vals.isGlobal ? null : (vals.fromStatusId ?? null),
      toStatusId: vals.toStatusId,
      isGlobal: vals.isGlobal ?? false,
      screenId: vals.screenId || null,
      // TTADM-68: parseJson возвращает undefined для пустых полей — Zod принимает undefined, но не null
      conditions: parseJson(vals.conditions),
      validators: parseJson(vals.validators),
      postFunctions: parseJson(vals.postFunctions),
    };
    try {
      if (editingTransition) {
        await workflowsApi.updateTransition(id, editingTransition.id, data);
        message.success('Переход обновлён');
      } else {
        await workflowsApi.addTransition(id, data);
        message.success('Переход добавлен');
      }
      setTransitionDrawerOpen(false);
      load();
    } catch (err) {
      // TTADM-67 / TTADM-68: показываем конкретную причину
      message.error(apiErrorMessage(err, TRANSITION_ERRORS, 'Не удалось сохранить переход'));
    }
  };

  const handleValidate = async () => {
    if (!id) return;
    setValidating(true);
    try {
      const report = await workflowsApi.validate(id);
      if (report.isValid) {
        message.success(`Воркфлоу валиден${report.warnings?.length ? ` (${report.warnings.length} предупреждений)` : ''}`);
      } else {
        message.error(`Ошибки: ${report.errors?.join(', ') ?? 'неизвестная ошибка'}`);
      }
    } catch {
      message.error('Не удалось выполнить валидацию');
    } finally {
      setValidating(false);
    }
  };

  const handleDeleteTransition = async (transitionId: string) => {
    if (!id) return;
    try {
      await workflowsApi.deleteTransition(id, transitionId);
      message.success('Переход удалён');
      load();
    } catch {
      message.error('Не удалось удалить');
    }
  };

  const stepColumns: ColumnsType<WorkflowStep> = [
    { title: '#', dataIndex: 'orderIndex', width: 40 },
    {
      title: 'Статус',
      render: (_, s) => (
        <Space>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: s.status.color, display: 'inline-block' }} />
          {s.status.name}
          <Tag>{s.status.category}</Tag>
          {s.isInitial && <Tag color="gold" icon={<StarOutlined />}>Начальный</Tag>}
        </Space>
      ),
    },
    // TTADM-67: action-колонка скрыта для системных воркфлоу
    ...(!workflow?.isSystem ? [{
      title: '',
      width: 100,
      render: (_: unknown, s: WorkflowStep) => (
        <Space>
          {!s.isInitial && (
            <Tooltip title="Сделать начальным">
              <Button size="small" icon={<StarOutlined />} onClick={() => handleSetInitial(s)} />
            </Tooltip>
          )}
          <Popconfirm title="Удалить шаг?" onConfirm={() => handleDeleteStep(s.id)} okText="Удалить" okButtonProps={{ danger: true }}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    }] as ColumnsType<WorkflowStep> : []),
  ];

  const transitionColumns: ColumnsType<WorkflowTransition> = [
    { title: 'Название', dataIndex: 'name' },
    {
      title: 'Из статуса',
      render: (_, t) => t.isGlobal ? <Tag color="purple">Глобальный</Tag> : (t.fromStatus?.name ?? '—'),
    },
    {
      title: 'В статус',
      render: (_, t) => (
        <Space>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: t.toStatus.color, display: 'inline-block' }} />
          {t.toStatus.name}
        </Space>
      ),
    },
    {
      title: 'Экран',
      render: (_, t) => t.screen ? <Tag>{t.screen.name}</Tag> : '—',
    },
    // TTADM-67: action-колонка скрыта для системных воркфлоу
    ...(!workflow?.isSystem ? [{
      title: '',
      width: 80,
      render: (_: unknown, t: WorkflowTransition) => (
        <Space>
          <Button size="small" onClick={() => openEditTransition(t)}>Изменить</Button>
          <Popconfirm title="Удалить переход?" onConfirm={() => handleDeleteTransition(t.id)} okText="Удалить" okButtonProps={{ danger: true }}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    }] as ColumnsType<WorkflowTransition> : []),
  ];

  if (loading || !workflow) return <div style={{ padding: 24 }}>Загрузка...</div>;

  const stepStatusIds = new Set((workflow.steps ?? []).map(s => s.statusId));

  return (
    <div className="tt-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/admin/workflows')}>
          Назад
        </Button>
        <Typography.Title level={4} style={{ margin: 0 }}>{workflow.name}</Typography.Title>
        {workflow.isDefault && <Tag color="blue">По умолчанию</Tag>}
        {/* TTADM-67: визуальный индикатор системного воркфлоу */}
        {workflow.isSystem && <Tag color="red" icon={<LockOutlined />}>Системный (только чтение)</Tag>}
        <div style={{ marginLeft: 'auto' }}>
          <Button
            data-testid="workflow-validate"
            size="small"
            loading={validating}
            onClick={handleValidate}
          >
            Валидировать
          </Button>
        </div>
      </div>

      {/* Steps */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Typography.Text strong>Шаги (Статусы)</Typography.Text>
          {/* TTADM-67: кнопка скрыта для системных воркфлоу */}
          {!workflow.isSystem && (
            <Button size="small" icon={<PlusOutlined />} onClick={() => { stepForm.resetFields(); setStepDrawerOpen(true); }}>
              Добавить статус
            </Button>
          )}
        </div>
        <Table
          rowKey="id"
          dataSource={workflow.steps ?? []}
          columns={stepColumns}
          pagination={false}
          size="small"
        />
      </div>

      {/* Transitions */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Typography.Text strong>Переходы</Typography.Text>
          {/* TTADM-67: кнопка скрыта для системных воркфлоу */}
          {!workflow.isSystem && (
            <Button size="small" icon={<PlusOutlined />} onClick={openAddTransition}>
              Добавить переход
            </Button>
          )}
        </div>
        <Table
          rowKey="id"
          dataSource={workflow.transitions ?? []}
          columns={transitionColumns}
          pagination={false}
          size="small"
        />
      </div>

      {/* Step drawer */}
      <Drawer title="Добавить шаг" open={stepDrawerOpen} onClose={() => setStepDrawerOpen(false)} width={400}>
        <Form form={stepForm} layout="vertical" onFinish={handleAddStep}>
          <Form.Item name="statusId" label="Статус" rules={[{ required: true }]}>
            <Select
              options={allStatuses
                .filter(s => !stepStatusIds.has(s.id))
                .map(s => ({ value: s.id, label: s.name }))}
            />
          </Form.Item>
          <Form.Item name="isInitial" label="Начальный" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Button type="primary" htmlType="submit">Добавить</Button>
        </Form>
      </Drawer>

      {/* Transition drawer */}
      <Drawer
        title={editingTransition ? 'Редактировать переход' : 'Добавить переход'}
        open={transitionDrawerOpen}
        onClose={() => setTransitionDrawerOpen(false)}
        width={480}
      >
        <Form form={transitionForm} layout="vertical" onFinish={handleSaveTransition}>
          <Form.Item name="name" label="Название" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="isGlobal" label="Глобальный (из любого статуса)" valuePropName="checked">
            <Switch />
          </Form.Item>
          {/* TTADM-68: поле «Из статуса» скрывается при isGlobal=true; убрана опция __global__ */}
          <Form.Item noStyle shouldUpdate={(prev, curr) => prev.isGlobal !== curr.isGlobal}>
            {({ getFieldValue }) =>
              !getFieldValue('isGlobal') && (
                <Form.Item
                  name="fromStatusId"
                  label="Из статуса"
                  rules={[{ required: true, message: 'Выберите исходный статус' }]}
                >
                  <Select
                    options={(workflow.steps ?? []).map(s => ({ value: s.statusId, label: s.status.name }))}
                  />
                </Form.Item>
              )
            }
          </Form.Item>
          <Form.Item name="toStatusId" label="В статус" rules={[{ required: true }]}>
            <Select
              options={(workflow.steps ?? []).map(s => ({ value: s.statusId, label: s.status.name }))}
            />
          </Form.Item>
          <Form.Item label="Экран перехода" shouldUpdate={(prev, curr) => prev.screenId !== curr.screenId}>
            {({ getFieldValue, setFieldValue }) => {
              const screenId: string | undefined = getFieldValue('screenId');
              const screen = allScreens.find(s => s.id === screenId);
              return (
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Form.Item name="screenId" noStyle>
                    <Select
                      allowClear
                      placeholder="Без экрана"
                      options={allScreens.map(s => ({ value: s.id, label: s.name }))}
                      style={{ width: '100%' }}
                    />
                  </Form.Item>
                  {screen && (
                    <Button
                      size="small"
                      danger
                      onClick={() => setFieldValue('screenId', undefined)}
                    >
                      Убрать экран «{screen.name}»
                    </Button>
                  )}
                </Space>
              );
            }}
          </Form.Item>
          <Form.Item name="conditions" label="Условия (JSON)">
            <Input.TextArea rows={3} placeholder='[{"type":"user-in-group","value":"managers"}]' />
          </Form.Item>
          <Form.Item name="validators" label="Валидаторы (JSON)">
            <Input.TextArea rows={3} placeholder='[{"type":"required-fields"}]' />
          </Form.Item>
          <Form.Item name="postFunctions" label="Постфункции (JSON)">
            <Input.TextArea rows={3} placeholder='[{"type":"assign","value":"reporter"}]' />
          </Form.Item>
          <Button type="primary" htmlType="submit">Сохранить</Button>
        </Form>
      </Drawer>
    </div>
  );
}
