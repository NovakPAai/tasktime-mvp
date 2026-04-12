import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  MarkerType,
  type Node,
  type Edge,
  type NodeTypes,
  type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Button, Drawer, Form, Input, Select, Switch, Space, Tag, Alert,
  Typography, Tooltip, Popconfirm, message, Spin,
} from 'antd';
import {
  ArrowLeftOutlined, PlusOutlined, StarOutlined, DeleteOutlined,
  CheckCircleOutlined, WarningOutlined, ReloadOutlined,
} from '@ant-design/icons';
import * as rwApi from '../../api/release-workflows-admin';
import type {
  ReleaseWorkflow, ReleaseWorkflowStep, ReleaseWorkflowTransition, ReleaseStatus,
  ValidationReport,
} from '../../api/release-workflows-admin';

// ─── Category colours ─────────────────────────────────────────────────────────

const CATEGORY_COLOR: Record<string, string> = {
  PLANNING: '#2196F3',
  IN_PROGRESS: '#FF9800',
  DONE: '#4CAF50',
  CANCELLED: '#9E9E9E',
};

const CATEGORY_LABEL: Record<string, string> = {
  PLANNING: 'Планирование',
  IN_PROGRESS: 'В работе',
  DONE: 'Завершён',
  CANCELLED: 'Отменён',
};

const RELEASE_TYPE_LABEL: Record<string, string> = {
  ATOMIC: 'Атомарные',
  INTEGRATION: 'Интеграционные',
};

// ─── Custom node ──────────────────────────────────────────────────────────────

interface StatusNodeData {
  label: string;
  category: string;
  color: string;
  isInitial: boolean;
  stepId: string;
  statusId: string;
  errorHighlight?: boolean;
  warnHighlight?: boolean;
  onSetInitial: (stepId: string) => void;
  onDeleteStep: (stepId: string) => void;
  [key: string]: unknown;
}

function StatusNode({ data }: { data: StatusNodeData }) {
  const borderColor = data.errorHighlight
    ? '#f5222d'
    : data.warnHighlight
    ? '#faad14'
    : data.color;

  return (
    <div
      style={{
        background: '#fff',
        border: `2px solid ${borderColor}`,
        borderRadius: 8,
        padding: '8px 12px',
        minWidth: 140,
        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: data.color,
            flexShrink: 0,
          }}
        />
        <span style={{ fontWeight: 600, fontSize: 13 }}>{data.label}</span>
        {data.isInitial && (
          <Tooltip title="Начальный статус">
            <StarOutlined style={{ color: '#faad14', fontSize: 12 }} />
          </Tooltip>
        )}
      </div>
      <div style={{ marginTop: 4 }}>
        <Tag
          color={CATEGORY_COLOR[data.category]}
          style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px' }}
        >
          {CATEGORY_LABEL[data.category] ?? data.category}
        </Tag>
      </div>
      <div
        style={{
          position: 'absolute',
          top: 4,
          right: 4,
          display: 'flex',
          gap: 2,
        }}
        // prevent drag on action buttons
        onMouseDown={(e) => e.stopPropagation()}
      >
        {!data.isInitial && (
          <Tooltip title="Сделать начальным">
            <Button
              size="small"
              type="text"
              icon={<StarOutlined />}
              style={{ width: 20, height: 20, minWidth: 0, padding: 0 }}
              onClick={() => data.onSetInitial(data.stepId)}
            />
          </Tooltip>
        )}
        <Popconfirm
          title="Удалить шаг?"
          onConfirm={() => data.onDeleteStep(data.stepId)}
          okText="Удалить"
          okButtonProps={{ danger: true }}
        >
          <Button
            size="small"
            type="text"
            danger
            icon={<DeleteOutlined />}
            style={{ width: 20, height: 20, minWidth: 0, padding: 0 }}
          />
        </Popconfirm>
      </div>
    </div>
  );
}

const nodeTypes: NodeTypes = { statusNode: StatusNode as unknown as NodeTypes['statusNode'] };

// ─── Layout helpers ───────────────────────────────────────────────────────────

function buildLayout(
  steps: ReleaseWorkflowStep[],
  validationHighlights: { errors: Set<string>; warnings: Set<string> },
  onSetInitial: (stepId: string) => void,
  onDeleteStep: (stepId: string) => void,
): Node[] {
  return steps.map((step, i) => ({
    id: step.id,
    type: 'statusNode',
    position: { x: 200 * (i % 4), y: 160 * Math.floor(i / 4) },
    data: {
      label: step.status.name,
      category: step.status.category,
      color: step.status.color ?? CATEGORY_COLOR[step.status.category] ?? '#999',
      isInitial: step.isInitial,
      stepId: step.id,
      statusId: step.statusId,
      errorHighlight: validationHighlights.errors.has(step.statusId),
      warnHighlight: validationHighlights.warnings.has(step.statusId),
      onSetInitial,
      onDeleteStep,
    },
  }));
}

function buildEdges(transitions: ReleaseWorkflowTransition[], steps: ReleaseWorkflowStep[]): Edge[] {
  const stepById = new Map(steps.map((s) => [s.id, s]));
  const stepByStatusId = new Map(steps.map((s) => [s.statusId, s]));

  return transitions.map((t) => {
    const fromStep = stepByStatusId.get(t.fromStatusId);
    const toStep = stepByStatusId.get(t.toStatusId);
    if (!fromStep || !toStep) return null;
    void stepById;
    return {
      id: t.id,
      source: fromStep.id,
      target: toStep.id,
      label: t.name,
      type: 'smoothstep',
      animated: t.isGlobal,
      style: { strokeWidth: t.isGlobal ? 2 : 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed },
      data: { transition: t },
    };
  }).filter(Boolean) as Edge[];
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdminReleaseWorkflowEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [workflow, setWorkflow] = useState<ReleaseWorkflow | null>(null);
  const [allStatuses, setAllStatuses] = useState<ReleaseStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [validation, setValidation] = useState<ValidationReport | null>(null);
  const [validating, setValidating] = useState(false);

  // React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Drawers
  const [stepDrawerOpen, setStepDrawerOpen] = useState(false);
  const [stepForm] = Form.useForm();

  const [transitionDrawerOpen, setTransitionDrawerOpen] = useState(false);
  const [editingTransition, setEditingTransition] = useState<ReleaseWorkflowTransition | null>(null);
  const [transitionForm] = Form.useForm();

  // Header edit
  const [headerDrawerOpen, setHeaderDrawerOpen] = useState(false);
  const [headerForm] = Form.useForm();

  // Keep stable refs for node callbacks
  const workflowRef = useRef<ReleaseWorkflow | null>(null);
  workflowRef.current = workflow;

  const validationHighlights = useCallback((): { errors: Set<string>; warnings: Set<string> } => {
    if (!validation) return { errors: new Set(), warnings: new Set() };
    return {
      errors: new Set(
        validation.errors
          .filter((e) => e.type === 'NO_INITIAL_STATUS' || e.type === 'NO_DONE_STATUS')
          .flatMap(() => (workflowRef.current?.steps ?? []).map((s) => s.statusId)),
      ),
      warnings: new Set(
        validation.warnings.filter((w) => w.statusId).map((w) => w.statusId!),
      ),
    };
  }, [validation]);

  const rebuildGraph = useCallback(
    (wf: ReleaseWorkflow, hl: { errors: Set<string>; warnings: Set<string> }) => {
      const newNodes = buildLayout(wf.steps, hl, handleSetInitial, handleDeleteStep);
      const newEdges = buildEdges(wf.transitions, wf.steps);
      setNodes(newNodes);
      setEdges(newEdges);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleSetInitial = useCallback(async (stepId: string) => {
    const wf = workflowRef.current;
    if (!wf) return;
    try {
      await rwApi.updateReleaseWorkflowStep(wf.id, stepId, { isInitial: true });
      message.success('Начальный статус обновлён');
      load();
    } catch {
      message.error('Не удалось обновить');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDeleteStep = useCallback(async (stepId: string) => {
    const wf = workflowRef.current;
    if (!wf) return;
    try {
      await rwApi.deleteReleaseWorkflowStep(wf.id, stepId);
      message.success('Шаг удалён');
      load();
    } catch {
      message.error('Нельзя удалить: есть переходы от/до этого статуса');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runValidation = useCallback(async (wfId: string) => {
    setValidating(true);
    try {
      const report = await rwApi.validateReleaseWorkflow(wfId);
      setValidation(report);
      return report;
    } finally {
      setValidating(false);
    }
  }, []);

  // Defined after helpers are available
  // eslint-disable-next-line prefer-const
  let load: () => Promise<void>;
  load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [wf, statuses, report] = await Promise.all([
        rwApi.getReleaseWorkflow(id),
        rwApi.listReleaseStatuses(),
        rwApi.validateReleaseWorkflow(id),
      ]);
      setWorkflow(wf);
      setAllStatuses(statuses);
      setValidation(report);
      const hl = {
        errors: new Set(
          report.errors
            .filter((e) => e.type === 'NO_INITIAL_STATUS' || e.type === 'NO_DONE_STATUS')
            .flatMap(() => wf.steps.map((s) => s.statusId)),
        ),
        warnings: new Set(
          report.warnings.filter((w) => w.statusId).map((w) => w.statusId!),
        ),
      };
      rebuildGraph(wf, hl);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, rebuildGraph]);

  useEffect(() => { load(); }, [load]);

  // Rebuild graph when validation changes (without re-fetching workflow)
  useEffect(() => {
    if (workflow && validation) {
      rebuildGraph(workflow, validationHighlights());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validation]);

  // ─── Add step ─────────────────────────────────────────────────────────────

  const handleAddStep = async (vals: { statusId: string; isInitial?: boolean }) => {
    if (!id) return;
    try {
      await rwApi.addReleaseWorkflowStep(id, {
        statusId: vals.statusId,
        isInitial: vals.isInitial ?? false,
      });
      message.success('Статус добавлен');
      setStepDrawerOpen(false);
      stepForm.resetFields();
      await load();
      runValidation(id);
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      message.error(msg === 'Status already in workflow' ? 'Статус уже добавлен' : 'Ошибка добавления');
    }
  };

  // ─── Transition drawer ────────────────────────────────────────────────────

  const openAddTransition = () => {
    setEditingTransition(null);
    transitionForm.resetFields();
    setTransitionDrawerOpen(true);
  };

  const openEditTransition = (t: ReleaseWorkflowTransition) => {
    setEditingTransition(t);
    transitionForm.setFieldsValue({
      name: t.name,
      fromStatusId: t.fromStatusId,
      toStatusId: t.toStatusId,
      isGlobal: t.isGlobal,
      conditions: t.conditions ? JSON.stringify(t.conditions, null, 2) : '',
    });
    setTransitionDrawerOpen(true);
  };

  // Click on edge → open edit drawer
  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      const t = (edge.data as { transition: ReleaseWorkflowTransition })?.transition;
      if (t) openEditTransition(t);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Drag connection from handle → create transition
  const onConnect = useCallback(
    (connection: Connection) => {
      // Find steps by node id
      const fromStep = workflow?.steps.find((s) => s.id === connection.source);
      const toStep = workflow?.steps.find((s) => s.id === connection.target);
      if (!fromStep || !toStep) return;
      setTransitionDrawerOpen(true);
      setEditingTransition(null);
      transitionForm.setFieldsValue({
        fromStatusId: fromStep.statusId,
        toStatusId: toStep.statusId,
      });
      setEdges((eds) => addEdge(connection, eds));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workflow],
  );

  const handleSaveTransition = async (vals: {
    name: string;
    fromStatusId?: string;
    toStatusId: string;
    isGlobal?: boolean;
    conditions?: string;
  }) => {
    if (!id) return;
    let conditions: unknown[] | null = null;
    if (vals.conditions?.trim()) {
      try {
        conditions = JSON.parse(vals.conditions) as unknown[];
      } catch {
        message.error('Условия: невалидный JSON');
        return;
      }
    }
    const body = {
      name: vals.name,
      fromStatusId: vals.fromStatusId!,
      toStatusId: vals.toStatusId,
      isGlobal: vals.isGlobal ?? false,
      conditions,
    };
    try {
      if (editingTransition) {
        await rwApi.updateReleaseWorkflowTransition(id, editingTransition.id, body);
        message.success('Переход обновлён');
      } else {
        await rwApi.createReleaseWorkflowTransition(id, body);
        message.success('Переход создан');
      }
      setTransitionDrawerOpen(false);
      await load();
      runValidation(id);
    } catch (err) {
      const code = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      if (code === 'TRANSITION_ALREADY_EXISTS') {
        message.error('Такой переход уже существует');
      } else {
        message.error('Не удалось сохранить');
      }
    }
  };

  const handleDeleteTransition = async (transitionId: string) => {
    if (!id) return;
    try {
      await rwApi.deleteReleaseWorkflowTransition(id, transitionId);
      message.success('Переход удалён');
      setTransitionDrawerOpen(false);
      await load();
      runValidation(id);
    } catch {
      message.error('Не удалось удалить');
    }
  };

  // ─── Header edit ──────────────────────────────────────────────────────────

  const openHeader = () => {
    if (!workflow) return;
    headerForm.setFieldsValue({
      name: workflow.name,
      description: workflow.description ?? '',
      releaseType: workflow.releaseType ?? 'universal',
      isDefault: workflow.isDefault,
      isActive: workflow.isActive,
    });
    setHeaderDrawerOpen(true);
  };

  const handleSaveHeader = async (vals: {
    name: string;
    description?: string;
    releaseType?: string;
    isDefault: boolean;
    isActive: boolean;
  }) => {
    if (!id) return;
    const releaseType = vals.releaseType === 'universal'
      ? null
      : (vals.releaseType as 'ATOMIC' | 'INTEGRATION' | null);
    try {
      await rwApi.updateReleaseWorkflow(id, {
        name: vals.name,
        description: vals.description || null,
        releaseType,
        isDefault: vals.isDefault,
        isActive: vals.isActive,
      });
      message.success('Workflow обновлён');
      setHeaderDrawerOpen(false);
      load();
    } catch {
      message.error('Не удалось сохранить');
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading || !workflow) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
        <Spin size="large" />
      </div>
    );
  }

  const stepStatusIds = new Set(workflow.steps.map((s) => s.statusId));
  const availableStatuses = allStatuses.filter((s) => !stepStatusIds.has(s.id));
  const stepByStatusId = new Map(workflow.steps.map((s) => [s.statusId, s]));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 20px',
          borderBottom: '1px solid #f0f0f0',
          background: '#fff',
          flexShrink: 0,
        }}
      >
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/admin/release-workflows')}
        >
          Назад
        </Button>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {workflow.name}
        </Typography.Title>
        {workflow.isDefault && <Tag color="blue">По умолчанию</Tag>}
        {workflow.releaseType ? (
          <Tag color="purple">{RELEASE_TYPE_LABEL[workflow.releaseType]}</Tag>
        ) : (
          <Tag>Универсальный</Tag>
        )}
        {!workflow.isActive && <Tag color="red">Неактивен</Tag>}

        {/* Validation badge */}
        {validating ? (
          <Spin size="small" />
        ) : validation ? (
          validation.isValid ? (
            <Tag icon={<CheckCircleOutlined />} color="success">
              Граф валидный
            </Tag>
          ) : (
            <Tag icon={<WarningOutlined />} color="error">
              {validation.errors.length} ошибок
            </Tag>
          )
        ) : null}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Tooltip title="Перепроверить граф">
            <Button
              icon={<ReloadOutlined />}
              size="small"
              onClick={() => runValidation(id!)}
              loading={validating}
            />
          </Tooltip>
          <Button size="small" onClick={openHeader}>Настройки</Button>
          <Button
            size="small"
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => { stepForm.resetFields(); setStepDrawerOpen(true); }}
            disabled={availableStatuses.length === 0}
          >
            Добавить статус
          </Button>
          <Button size="small" icon={<PlusOutlined />} onClick={openAddTransition}>
            Добавить переход
          </Button>
        </div>
      </div>

      {/* Validation panel */}
      {validation && (!validation.isValid || validation.warnings.length > 0) && (
        <div style={{ padding: '8px 20px', background: '#fff', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
          {validation.errors.map((e, i) => (
            <Alert key={i} type="error" message={e.message} style={{ marginBottom: 4 }} showIcon />
          ))}
          {validation.warnings.map((w, i) => (
            <Alert key={i} type="warning" message={w.message} style={{ marginBottom: 4 }} showIcon />
          ))}
        </div>
      )}

      {/* React Flow canvas */}
      <div style={{ flex: 1, background: '#fafafa' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgeClick={onEdgeClick}
          fitView
          fitViewOptions={{ padding: 0.3 }}
        >
          <Background />
          <Controls />
          <MiniMap
            nodeColor={(n) => {
              const data = n.data as StatusNodeData;
              return data?.color ?? '#999';
            }}
          />
        </ReactFlow>
      </div>

      {/* Add step drawer */}
      <Drawer
        title="Добавить статус"
        open={stepDrawerOpen}
        onClose={() => setStepDrawerOpen(false)}
        width={360}
      >
        <Form form={stepForm} layout="vertical" onFinish={handleAddStep}>
          <Form.Item name="statusId" label="Статус" rules={[{ required: true, message: 'Выберите статус' }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={availableStatuses.map((s) => ({
                value: s.id,
                label: (
                  <Space>
                    <span
                      style={{ width: 10, height: 10, borderRadius: '50%', background: s.color, display: 'inline-block' }}
                    />
                    {s.name}
                    <Tag style={{ fontSize: 10 }}>{CATEGORY_LABEL[s.category] ?? s.category}</Tag>
                  </Space>
                ),
              }))}
            />
          </Form.Item>
          <Form.Item name="isInitial" label="Начальный статус" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Space>
            <Button type="primary" htmlType="submit">Добавить</Button>
            <Button onClick={() => setStepDrawerOpen(false)}>Отмена</Button>
          </Space>
        </Form>
      </Drawer>

      {/* Transition drawer */}
      <Drawer
        title={editingTransition ? 'Редактировать переход' : 'Добавить переход'}
        open={transitionDrawerOpen}
        onClose={() => setTransitionDrawerOpen(false)}
        width={420}
        extra={
          editingTransition && (
            <Popconfirm
              title="Удалить переход?"
              onConfirm={() => handleDeleteTransition(editingTransition.id)}
              okText="Удалить"
              okButtonProps={{ danger: true }}
            >
              <Button danger icon={<DeleteOutlined />} size="small">
                Удалить
              </Button>
            </Popconfirm>
          )
        }
      >
        <Form
          form={transitionForm}
          layout="vertical"
          onFinish={handleSaveTransition}
          initialValues={{ isGlobal: false }}
        >
          <Form.Item name="name" label="Название" rules={[{ required: true, message: 'Введите название' }]}>
            <Input placeholder="Начать тестирование" />
          </Form.Item>
          <Form.Item name="isGlobal" label="Глобальный (из любого статуса)" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, curr) => prev.isGlobal !== curr.isGlobal}>
            {({ getFieldValue }) =>
              !getFieldValue('isGlobal') ? (
                <Form.Item
                  name="fromStatusId"
                  label="Из статуса"
                  rules={[{ required: true, message: 'Выберите исходный статус' }]}
                >
                  <Select
                    options={workflow.steps.map((s) => ({
                      value: s.statusId,
                      label: s.status.name,
                    }))}
                  />
                </Form.Item>
              ) : null
            }
          </Form.Item>
          <Form.Item name="toStatusId" label="В статус" rules={[{ required: true, message: 'Выберите целевой статус' }]}>
            <Select
              options={workflow.steps.map((s) => ({
                value: s.statusId,
                label: s.status.name,
              }))}
            />
          </Form.Item>
          <Form.Item name="conditions" label="Условия (JSON)">
            <Input.TextArea
              rows={4}
              placeholder='[{"type": "user-in-role", "value": "MANAGER"}]'
              style={{ fontFamily: 'monospace', fontSize: 12 }}
            />
          </Form.Item>
          <Space>
            <Button type="primary" htmlType="submit">Сохранить</Button>
            <Button onClick={() => setTransitionDrawerOpen(false)}>Отмена</Button>
          </Space>
        </Form>
      </Drawer>

      {/* Header/settings drawer */}
      <Drawer
        title="Настройки workflow"
        open={headerDrawerOpen}
        onClose={() => setHeaderDrawerOpen(false)}
        width={380}
      >
        <Form
          form={headerForm}
          layout="vertical"
          onFinish={handleSaveHeader}
          initialValues={{ isDefault: false, isActive: true, releaseType: 'universal' }}
        >
          <Form.Item name="name" label="Название" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Описание">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="releaseType" label="Тип релиза">
            <Select
              options={[
                { value: 'universal', label: 'Универсальный (все типы)' },
                { value: 'ATOMIC', label: 'Атомарные релизы' },
                { value: 'INTEGRATION', label: 'Интеграционные релизы' },
              ]}
            />
          </Form.Item>
          <Form.Item name="isDefault" label="По умолчанию" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="isActive" label="Активен" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Space>
            <Button type="primary" htmlType="submit">Сохранить</Button>
            <Button onClick={() => setHeaderDrawerOpen(false)}>Отмена</Button>
          </Space>
        </Form>
      </Drawer>

      {/* Legend */}
      <div
        style={{
          position: 'absolute',
          bottom: 80,
          left: 24,
          background: 'rgba(255,255,255,0.95)',
          border: '1px solid #e8e8e8',
          borderRadius: 6,
          padding: '8px 12px',
          fontSize: 12,
          zIndex: 10,
          pointerEvents: 'none',
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Категории:</div>
        {Object.entries(CATEGORY_LABEL).map(([key, label]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span
              style={{ width: 10, height: 10, borderRadius: '50%', background: CATEGORY_COLOR[key], display: 'inline-block' }}
            />
            {label}
          </div>
        ))}
        <div style={{ marginTop: 6, color: '#999' }}>
          <span style={{ color: '#f5222d' }}>■</span> Ошибка&nbsp;&nbsp;
          <span style={{ color: '#faad14' }}>■</span> Предупреждение
        </div>
      </div>

      {/* Переходы ниже — для screenreader / доступности */}
      <div style={{ display: 'none' }}>
        {/* Transitions list used internally */}
        {workflow.transitions.map((t) => {
          void stepByStatusId;
          return <span key={t.id}>{t.name}</span>;
        })}
      </div>
    </div>
  );
}
