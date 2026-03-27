import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Select, Modal, Form, Input, message, Divider, Typography } from 'antd';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import * as boardApi from '../api/board';
import * as sprintsApi from '../api/sprints';
import * as projectsApi from '../api/projects';
import * as issuesApi from '../api/issues';
import { listIssuesWithKanbanFields } from '../api/issues';
import { workflowEngineApi } from '../api/workflow-engine';
import TransitionModal from '../components/issues/TransitionModal';
import type { TransitionOption } from '../api/workflow-engine';
import { getProjectIssueTypes } from '../api/issue-type-configs';
import { fieldSchemasApi } from '../api/field-schemas';
import { issueCustomFieldsApi, type IssueCustomFieldValue } from '../api/issue-custom-fields';
import type { Issue, IssueStatus, Sprint, Project, IssuePriority, IssueTypeConfig } from '../types';
import { useAuthStore } from '../store/auth.store';
import { useThemeStore } from '../store/theme.store';
import LoadingSpinner from '../components/common/LoadingSpinner';
import KanbanCardCustomFields from '../components/issues/KanbanCardCustomFields';
import CustomFieldInput from '../components/issues/CustomFieldInput';

const LOGO_GRAD = 'linear-gradient(in oklab 135deg, oklab(59.3% -0.002 -0.207) 0%, oklab(54.1% 0.096 -0.227) 100%)';

const DARK_C = {
  bg:           '#080B14',
  bgCard:       '#0F1320',
  bgCardCancel: '#0D1117',
  border:       '#21262D',
  borderDone:   '#1A2E1A',
  borderInner:  '#1E2640',
  headerBorder: '#161B22',
  t1:           '#E2E8F8',
  t2:           '#C9D1D9',
  t3:           '#8B949E',
  t4:           '#484F58',
  t5:           '#3D4D6B',
  key:          '#6366F1',
  selBg:        '#161B22',
};

const LIGHT_C = {
  bg:           '#F0F2FA',
  bgCard:       '#FFFFFF',
  bgCardCancel: '#F0F2FA',
  border:       '#D0D7DE',
  borderDone:   '#C8E6C9',
  borderInner:  '#E4E7EF',
  headerBorder: '#E4E7EF',
  t1:           '#1F2328',
  t2:           '#424A53',
  t3:           '#6E7781',
  t4:           '#AFB8C1',
  t5:           '#8896A4',
  key:          '#6366F1',
  selBg:        '#FFFFFF',
};

const STATUS_ORDER: IssueStatus[] = ['OPEN', 'IN_PROGRESS', 'REVIEW', 'DONE', 'CANCELLED'];

const COLUMN_LABELS: Record<IssueStatus, string> = {
  OPEN: 'Open', IN_PROGRESS: 'In Progress', REVIEW: 'Review', DONE: 'Done', CANCELLED: 'Cancelled',
};

type StatusCfg = { dot: string; label: string; badgeBg: string; badgeText: string; accentBorder: string | null };

function makeStatusCfg(C: typeof DARK_C): Record<IssueStatus, StatusCfg> {
  return {
    OPEN:        { dot: '#8B949E', label: '#8B949E', badgeBg: C.borderInner,   badgeText: '#8B949E', accentBorder: null },
    IN_PROGRESS: { dot: '#F59E0B', label: '#F59E0B', badgeBg: '#F59E0B1F',     badgeText: '#F59E0B', accentBorder: '#F59E0B' },
    REVIEW:      { dot: '#A78BFA', label: '#A78BFA', badgeBg: '#A78BFA1F',     badgeText: '#A78BFA', accentBorder: '#A78BFA' },
    DONE:        { dot: '#4ADE80', label: '#4ADE80', badgeBg: '#4ADE801F',     badgeText: '#4ADE80', accentBorder: null },
    CANCELLED:   { dot: '#484F58', label: '#484F58', badgeBg: C.headerBorder,  badgeText: '#484F58', accentBorder: null },
  };
}

const ISSUE_TYPE_CFG: Record<string, { bg: string; text: string }> = {
  TASK:    { bg: '#10B98126', text: '#10B981' },
  BUG:     { bg: '#EF444426', text: '#EF4444' },
  STORY:   { bg: '#3B82F626', text: '#3B82F6' },
  EPIC:    { bg: '#A855F726', text: '#A855F7' },
  SUBTASK: { bg: '#8B949E26', text: '#8B949E' },
};

const PRIORITY_COLORS: Record<IssuePriority, string> = {
  CRITICAL: '#EF4444',
  HIGH:     '#F59E0B',
  MEDIUM:   '#8B949E',
  LOW:      '#8B949E',
};

const AVATAR_GRADS = [
  LOGO_GRAD,
  'linear-gradient(in oklab 135deg, oklab(80% -0.160 0.086) 0%, oklab(59.6% -0.122 0.037) 100%)',
  'linear-gradient(in oklab 135deg, oklab(76.9% 0.056 0.155) 0%, oklab(66.6% 0.083 0.134) 100%)',
  'linear-gradient(in oklab 135deg, oklab(62.7% 0.130 -0.193) 0%, oklab(54.1% 0.096 -0.227) 100%)',
  'linear-gradient(in oklab 135deg, oklab(70% 0.180 0.050) 0%, oklab(55% 0.160 0.060) 100%)',
];

function avatarGrad(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_GRADS[h % AVATAR_GRADS.length]!;
}

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase();
}

export default function BoardPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { mode } = useThemeStore();
  const C = mode === 'light' ? LIGHT_C : DARK_C;
  const SC = makeStatusCfg(C);

  const [columns, setColumns] = useState<Record<IssueStatus, Issue[]>>({} as Record<IssueStatus, Issue[]>);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [selectedSprint, setSelectedSprint] = useState<string | undefined>();
  const [project, setProject] = useState<Project | null>(null);
  const [issueTypeConfigs, setIssueTypeConfigs] = useState<IssueTypeConfig[]>([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [form] = Form.useForm<issuesApi.CreateIssueBody>();
  const [kanbanFieldsMap, setKanbanFieldsMap] = useState<Map<string, Issue['kanbanFields']>>(new Map());
  const [createCustomFields, setCreateCustomFields] = useState<IssueCustomFieldValue[]>([]);
  const [createCustomFieldValues, setCreateCustomFieldValues] = useState<Record<string, unknown>>({});
  const [pendingTransition, setPendingTransition] = useState<{ issueId: string; transition: TransitionOption } | null>(null);
  const watchIssueTypeConfigId = Form.useWatch('issueTypeConfigId', form);

  const canCreate = user?.role !== 'VIEWER';

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [board, proj, issuesWithFields] = await Promise.all([
        boardApi.getBoard(projectId, selectedSprint),
        projectsApi.getProject(projectId),
        listIssuesWithKanbanFields(projectId, selectedSprint),
      ]);
      setColumns(board.columns);
      setProject(proj);
      const kMap = new Map<string, Issue['kanbanFields']>();
      for (const issue of issuesWithFields) {
        if (issue.kanbanFields) kMap.set(issue.id, issue.kanbanFields);
      }
      setKanbanFieldsMap(kMap);
    } finally {
      setLoading(false);
    }
  }, [projectId, selectedSprint]);

  useEffect(() => {
    if (!projectId) return;
    sprintsApi.listSprints(projectId).then(setSprints);
    getProjectIssueTypes(projectId).then(setIssueTypeConfigs).catch(() => {});
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!projectId || !watchIssueTypeConfigId) { setCreateCustomFields([]); return; }
    fieldSchemasApi.listProjectSchemas(projectId, watchIssueTypeConfigId)
      .then(schemas => {
        const fieldMap = new Map<string, IssueCustomFieldValue>();
        for (const schema of schemas) {
          for (const item of schema.items) {
            if (!fieldMap.has(item.customFieldId)) {
              fieldMap.set(item.customFieldId, {
                customFieldId: item.customFieldId,
                name: item.customField.name,
                description: item.customField.description ?? null,
                fieldType: item.customField.fieldType as IssueCustomFieldValue['fieldType'],
                options: item.customField.options as IssueCustomFieldValue['options'],
                isRequired: item.isRequired,
                showOnKanban: item.showOnKanban,
                orderIndex: item.orderIndex,
                currentValue: null,
                updatedAt: null,
              });
            }
          }
        }
        setCreateCustomFields(Array.from(fieldMap.values()).sort((a, b) => a.orderIndex - b.orderIndex));
        setCreateCustomFieldValues({});
      })
      .catch(() => setCreateCustomFields([]));
  }, [projectId, watchIssueTypeConfigId]);

  const onDragEnd = async (result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination || !projectId) return;

    const srcStatus = source.droppableId as IssueStatus;
    const dstStatus = destination.droppableId as IssueStatus;

    if (srcStatus === dstStatus) {
      const newCols = { ...columns };
      const srcItems = [...(newCols[srcStatus] || [])];
      const [moved] = srcItems.splice(source.index, 1);
      if (!moved) return;
      srcItems.splice(destination.index, 0, moved);
      newCols[srcStatus] = srcItems;
      setColumns(newCols);
      const updates = (Object.entries(newCols) as [IssueStatus, Issue[]][]).flatMap(([status, items]) =>
        items.map((item, idx) => ({ id: item.id, status, orderIndex: idx }))
      );
      await boardApi.reorderBoard(projectId, updates);
      return;
    }

    try {
      const transitionsData = await workflowEngineApi.getTransitions(draggableId);
      const transition = transitionsData.transitions.find(
        t => t.toStatus.category === dstStatus || (t.toStatus as unknown as Record<string, string>).systemKey === dstStatus
      );
      if (!transition) { message.error('Переход недоступен'); return; }
      if (transition.requiresScreen) { setPendingTransition({ issueId: draggableId, transition }); return; }

      await workflowEngineApi.executeTransition(draggableId, { transitionId: transition.id });

      const newCols = { ...columns };
      const srcItems = [...(newCols[srcStatus] || [])];
      const [moved] = srcItems.splice(source.index, 1);
      if (!moved) return;
      moved.status = dstStatus;
      const dstItems = [...(newCols[dstStatus] || [])];
      dstItems.splice(destination.index, 0, moved);
      newCols[srcStatus] = srcItems;
      newCols[dstStatus] = dstItems;
      setColumns(newCols);

      const updates = (Object.entries(newCols) as [IssueStatus, Issue[]][]).flatMap(([status, items]) =>
        items.map((item, idx) => ({ id: item.id, status, orderIndex: idx }))
      );
      await boardApi.reorderBoard(projectId, updates);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      const code = e?.response?.data?.error;
      if (code === 'NO_VALID_TRANSITION' || code === 'INVALID_TRANSITION') message.error('Переход недоступен');
      else if (code === 'CONDITION_NOT_MET') message.error('У вас нет прав для этого перехода');
      else message.error('Не удалось изменить статус');
    }
  };

  const handleCreateIssue = async (values: issuesApi.CreateIssueBody) => {
    if (!projectId) return;
    try {
      setCreateLoading(true);
      const issue = await issuesApi.createIssue(projectId, values);
      const valuesToSave = Object.entries(createCustomFieldValues)
        .filter(([, v]) => v !== null && v !== undefined)
        .map(([customFieldId, value]) => ({ customFieldId, value }));
      if (valuesToSave.length > 0) await issueCustomFieldsApi.updateFields(issue.id, valuesToSave);
      message.success('Issue created');
      setCreateOpen(false);
      form.resetFields();
      setCreateCustomFields([]);
      setCreateCustomFieldValues({});
      load();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      message.error(error.response?.data?.error || 'Failed to create issue');
    } finally {
      setCreateLoading(false);
    }
  };

  if (loading || !project) return <LoadingSpinner />;

  const allBoardIssues = STATUS_ORDER.flatMap(status => columns[status] || []);
  const activeSprint = sprints.find(s => (s as Sprint & { status?: string }).status === 'ACTIVE');

  return (
    <div style={{ width: '100%', minHeight: '100vh', background: C.bg, display: 'flex', flexDirection: 'column' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px 24px 16px',
        borderBottom: `1px solid ${C.headerBorder}`,
        flexShrink: 0,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span
              onClick={() => navigate(`/projects/${projectId}`)}
              style={{ color: C.t4, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 12, cursor: 'pointer' }}
            >
              {project.name}
            </span>
            <span style={{ color: C.t4, fontSize: 12 }}>/</span>
            <span style={{ color: C.t3, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 12 }}>Board</span>
          </div>
          <div style={{
            fontFamily: '"Space Grotesk", system-ui, sans-serif',
            fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: '24px', color: C.t1,
          }}>
            Kanban Board
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Sprint selector */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: C.selBg, border: `1px solid ${C.border}`,
            borderRadius: 8, padding: '5px 8px 5px 12px',
          }}>
            {activeSprint && (
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ADE80', flexShrink: 0 }} />
            )}
            <Select
              allowClear
              placeholder="Все спринты"
              value={selectedSprint}
              onChange={setSelectedSprint}
              variant="borderless"
              size="small"
              style={{ minWidth: 130, color: C.t2 }}
              options={sprints.map(s => ({
                value: s.id,
                label: `${s.name}${(s as Sprint & { status?: string }).status === 'ACTIVE' ? ' · Active' : ''}`,
              }))}
            />
          </div>

          {/* + Задача */}
          {canCreate && (
            <div
              onClick={() => setCreateOpen(true)}
              style={{
                backgroundImage: LOGO_GRAD, borderRadius: 8,
                padding: '6px 14px', cursor: 'pointer',
                fontFamily: '"Inter", system-ui, sans-serif',
                fontSize: 13, fontWeight: 600, color: '#fff',
                userSelect: 'none',
              }}
            >
              + Задача
            </div>
          )}
        </div>
      </div>

      {/* ── Board ──────────────────────────────────────────────────────────── */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div style={{
          display: 'flex', flex: 1, gap: 12,
          padding: '16px 24px', overflow: 'auto',
          alignItems: 'flex-start',
        }}>
          {STATUS_ORDER.map(status => {
            const cfg = SC[status];
            const items = columns[status] || [];
            const showPlus = status !== 'DONE' && status !== 'CANCELLED';

            return (
              <div key={status} style={{ display: 'flex', flexDirection: 'column', flex: '1 1 0', minWidth: 160, gap: 8 }}>

                {/* Column header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px 8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
                    <span style={{
                      fontFamily: '"Inter", system-ui, sans-serif', fontSize: 11,
                      fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', color: cfg.label,
                    }}>
                      {COLUMN_LABELS[status]}
                    </span>
                    <div style={{ background: cfg.badgeBg, borderRadius: 20, padding: '1px 7px' }}>
                      <span style={{ fontFamily: '"Space Grotesk", system-ui, sans-serif', fontSize: 10, fontWeight: 600, color: cfg.badgeText }}>
                        {items.length}
                      </span>
                    </div>
                  </div>
                  {showPlus && canCreate && (
                    <span
                      onClick={() => setCreateOpen(true)}
                      style={{ color: C.t4, fontSize: 16, cursor: 'pointer', lineHeight: 1, userSelect: 'none' }}
                    >
                      +
                    </span>
                  )}
                </div>

                {/* Droppable */}
                <Droppable droppableId={status}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      style={{
                        display: 'flex', flexDirection: 'column', gap: 8, minHeight: 80,
                        borderRadius: 10,
                        background: snapshot.isDraggingOver
                          ? (mode === 'light' ? 'rgba(79,110,247,0.04)' : 'rgba(79,110,247,0.06)')
                          : 'transparent',
                        transition: 'background 0.15s',
                      }}
                    >
                      {items.map((issue, idx) => {
                        const isDone = status === 'DONE';
                        const isCancelled = status === 'CANCELLED';
                        const typeKey = issue.issueTypeConfig?.systemKey ?? 'TASK';
                        const typeCfg = ISSUE_TYPE_CFG[typeKey] ?? ISSUE_TYPE_CFG['TASK']!;

                        const cardBorderStyle: React.CSSProperties = isCancelled
                          ? { border: `1px solid ${C.borderInner}` }
                          : isDone
                            ? { border: `1px solid ${C.borderDone}` }
                            : cfg.accentBorder
                              ? { borderTop: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, borderLeft: `3px solid ${cfg.accentBorder}` }
                              : { border: `1px solid ${C.border}` };

                        return (
                          <Draggable key={issue.id} draggableId={issue.id} index={idx}>
                            {(prov) => (
                              <div
                                ref={prov.innerRef}
                                {...prov.draggableProps}
                                {...prov.dragHandleProps}
                                onClick={() => {}}
                                style={{
                                  background: isCancelled ? C.bgCardCancel : C.bgCard,
                                  borderRadius: 10,
                                  padding: 12,
                                  display: 'flex', flexDirection: 'column', gap: 8,
                                  opacity: isDone ? 0.7 : isCancelled ? 0.5 : 1,
                                  cursor: 'grab',
                                  ...cardBorderStyle,
                                  ...(prov.draggableProps.style as React.CSSProperties),
                                }}
                              >
                                {/* Type + key */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <div style={{
                                    background: isCancelled ? '#484F584D' : typeCfg.bg,
                                    borderRadius: 3, padding: '2px 5px', flexShrink: 0,
                                  }}>
                                    <span style={{
                                      fontFamily: '"Space Grotesk", system-ui, sans-serif',
                                      fontSize: 9, fontWeight: 700, letterSpacing: '0.3px', lineHeight: '12px',
                                      color: isCancelled ? C.t4 : typeCfg.text,
                                    }}>
                                      {typeKey}
                                    </span>
                                  </div>
                                  <span style={{
                                    fontFamily: '"Space Grotesk", system-ui, sans-serif',
                                    fontSize: 10, fontWeight: 600, lineHeight: '12px',
                                    color: isCancelled ? C.t4 : C.key, flexShrink: 0,
                                  }}>
                                    {project.key}-{issue.number}
                                  </span>
                                </div>

                                {/* Title */}
                                <Link
                                  to={`/issues/${issue.id}`}
                                  onClick={e => e.stopPropagation()}
                                  style={{
                                    fontFamily: '"Inter", system-ui, sans-serif',
                                    fontSize: 12, lineHeight: '140%',
                                    color: isDone || isCancelled ? C.t3 : C.t2,
                                    textDecoration: isDone || isCancelled ? 'line-through' : 'none',
                                    textDecorationThickness: '1px',
                                  }}
                                >
                                  {issue.title}
                                </Link>

                                {/* Custom fields */}
                                {(kanbanFieldsMap.get(issue.id)?.length ?? 0) > 0 && (
                                  <KanbanCardCustomFields kanbanFields={kanbanFieldsMap.get(issue.id)!} />
                                )}

                                {/* Footer */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    {isDone ? (
                                      <>
                                        <svg width="12" height="12" fill="none" viewBox="0 0 12 12">
                                          <circle cx="6" cy="6" r="5" fill="#4ADE8033" />
                                          <path d="M3.5 6l2 2 3-3" stroke="#4ADE80" strokeWidth="1.2" strokeLinecap="round" />
                                        </svg>
                                        <span style={{ color: '#4ADE80', fontFamily: '"Inter", system-ui, sans-serif', fontSize: 10 }}>
                                          Закрыто
                                        </span>
                                      </>
                                    ) : (
                                      <span style={{
                                        fontFamily: '"Inter", system-ui, sans-serif', fontSize: 10, lineHeight: '12px',
                                        color: isCancelled ? C.t4 : PRIORITY_COLORS[issue.priority],
                                      }}>
                                        {issue.priority}
                                      </span>
                                    )}
                                  </div>

                                  {issue.assignee && (
                                    <div style={{
                                      width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                                      background: isCancelled
                                        ? (mode === 'light' ? '#D0D7DE' : '#21262D')
                                        : avatarGrad(issue.assignee.name),
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                      <span style={{
                                        fontFamily: '"Space Grotesk", system-ui, sans-serif',
                                        fontSize: 8, fontWeight: 700, lineHeight: '10px',
                                        color: isCancelled ? C.t4 : '#fff',
                                      }}>
                                        {getInitials(issue.assignee.name)}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </Draggable>
                        );
                      })}
                      {provided.placeholder}

                      {/* Add issue */}
                      {showPlus && (
                        <div
                          onClick={() => setCreateOpen(true)}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            border: `1px dashed ${C.borderInner}`, borderRadius: 10,
                            padding: '10px', cursor: 'pointer',
                          }}
                        >
                          <span style={{ fontFamily: '"Inter", system-ui, sans-serif', fontSize: 11, color: C.t5 }}>
                            + Добавить задачу
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>

      {/* ── Create modal ───────────────────────────────────────────────────── */}
      <Modal
        title="New Issue"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => form.submit()}
        okText="Create"
        confirmLoading={createLoading}
        width={520}
      >
        <Form<issuesApi.CreateIssueBody>
          form={form}
          layout="vertical"
          onFinish={handleCreateIssue}
          initialValues={{
            issueTypeConfigId: issueTypeConfigs.find(c => c.systemKey === 'TASK')?.id ?? issueTypeConfigs[0]?.id,
            priority: 'MEDIUM',
          }}
        >
          <Form.Item name="title" label="Title" rules={[{ required: true, message: 'Please enter a title' }]}>
            <Input />
          </Form.Item>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="issueTypeConfigId" label="Type" style={{ flex: 1, marginBottom: 16 }}>
              <Select options={issueTypeConfigs.map(c => ({ value: c.id, label: c.name }))} />
            </Form.Item>
            <Form.Item name="priority" label="Priority" style={{ flex: 1, marginBottom: 16 }}>
              <Select<IssuePriority>
                options={(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as IssuePriority[]).map(v => ({ value: v, label: v }))}
              />
            </Form.Item>
          </div>
          <Form.Item name="parentId" label="Parent Issue">
            <Select
              allowClear
              placeholder="None (top level)"
              options={allBoardIssues
                .filter(i => !i.issueTypeConfig?.isSubtask)
                .map(i => ({ value: i.id, label: `${project.key}-${i.number} ${i.title}` }))}
            />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} />
          </Form.Item>
          {createCustomFields.length > 0 && (
            <>
              <Divider orientation="left" orientationMargin={0} style={{ margin: '20px 0 16px' }}>
                <Typography.Text style={{ fontSize: 12 }}>Дополнительные поля</Typography.Text>
              </Divider>
              {createCustomFields.map(field => (
                <Form.Item
                  key={field.customFieldId}
                  label={
                    <span>
                      {field.isRequired && <span style={{ color: '#EF4444' }}>* </span>}
                      {field.name}
                    </span>
                  }
                  style={{ marginBottom: 16 }}
                >
                  <CustomFieldInput
                    field={{ ...field, currentValue: createCustomFieldValues[field.customFieldId] ?? null }}
                    inlineEdit={false}
                    onSave={async val => {
                      setCreateCustomFieldValues(prev => ({ ...prev, [field.customFieldId]: val }));
                    }}
                  />
                </Form.Item>
              ))}
            </>
          )}
        </Form>
      </Modal>

      {pendingTransition && (
        <TransitionModal
          open
          issueId={pendingTransition.issueId}
          transitionId={pendingTransition.transition.id}
          transitionName={pendingTransition.transition.name}
          screenFields={pendingTransition.transition.screenFields}
          onSuccess={() => { setPendingTransition(null); load(); }}
          onCancel={() => setPendingTransition(null)}
        />
      )}
    </div>
  );
}
