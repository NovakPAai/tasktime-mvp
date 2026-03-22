import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Select, Space, Button, Modal, Form, Input, message, Divider, Typography } from 'antd';
import { AppstoreOutlined, ThunderboltOutlined, PlusOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import * as boardApi from '../api/board';
import * as sprintsApi from '../api/sprints';
import * as projectsApi from '../api/projects';
import * as issuesApi from '../api/issues';
import { listIssuesWithKanbanFields } from '../api/issues';
import { getProjectIssueTypes } from '../api/issue-type-configs';
import { fieldSchemasApi } from '../api/field-schemas';
import { issueCustomFieldsApi, type IssueCustomFieldValue } from '../api/issue-custom-fields';
import type { Issue, IssueStatus, Sprint, Project, IssuePriority, IssueTypeConfig } from '../types';
import { useAuthStore } from '../store/auth.store';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { IssueTypeBadge } from '../lib/issue-kit';
import KanbanCardCustomFields from '../components/issues/KanbanCardCustomFields';
import CustomFieldInput from '../components/issues/CustomFieldInput';

const STATUS_ORDER: IssueStatus[] = ['OPEN', 'IN_PROGRESS', 'REVIEW', 'DONE', 'CANCELLED'];
const COLUMN_LABELS: Record<IssueStatus, string> = {
  OPEN: 'Open', IN_PROGRESS: 'In Progress', REVIEW: 'Review', DONE: 'Done', CANCELLED: 'Cancelled',
};
const COLUMN_COLORS: Record<IssueStatus, string> = {
  OPEN: 'rgba(139, 148, 158, 0.10)',
  IN_PROGRESS: 'rgba(240, 185, 11, 0.08)',
  REVIEW: 'rgba(58, 115, 249, 0.08)',
  DONE: 'rgba(79, 110, 247, 0.10)',
  CANCELLED: 'rgba(85, 85, 102, 0.08)',
};

export default function BoardPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [columns, setColumns] = useState<Record<IssueStatus, Issue[]>>({} as Record<IssueStatus, Issue[]>);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [selectedSprint, setSelectedSprint] = useState<string | undefined>();
  const [project, setProject] = useState<Project | null>(null);
  const [issueTypeConfigs, setIssueTypeConfigs] = useState<IssueTypeConfig[]>([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [form] = Form.useForm<issuesApi.CreateIssueBody>();
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [kanbanFieldsMap, setKanbanFieldsMap] = useState<Map<string, Issue['kanbanFields']>>(new Map());
  const [createCustomFields, setCreateCustomFields] = useState<IssueCustomFieldValue[]>([]);
  const [createCustomFieldValues, setCreateCustomFieldValues] = useState<Record<string, unknown>>({});
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

  // Load custom fields for create form when issue type changes
  useEffect(() => {
    if (!projectId || !watchIssueTypeConfigId) {
      setCreateCustomFields([]);
      return;
    }
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
        setCreateCustomFields(
          Array.from(fieldMap.values()).sort((a, b) => a.orderIndex - b.orderIndex)
        );
        setCreateCustomFieldValues({});
      })
      .catch(() => setCreateCustomFields([]));
  }, [projectId, watchIssueTypeConfigId]);

  const onDragEnd = async (result: DropResult) => {
    const { source, destination } = result;
    if (!destination || !projectId) return;

    const srcStatus = source.droppableId as IssueStatus;
    const dstStatus = destination.droppableId as IssueStatus;

    const newCols = { ...columns };
    const srcItems = [...(newCols[srcStatus] || [])];
    const [moved] = srcItems.splice(source.index, 1);
    if (!moved) return;

    if (srcStatus === dstStatus) {
      srcItems.splice(destination.index, 0, moved);
      newCols[srcStatus] = srcItems;
    } else {
      const dstItems = [...(newCols[dstStatus] || [])];
      moved.status = dstStatus;
      dstItems.splice(destination.index, 0, moved);
      newCols[srcStatus] = srcItems;
      newCols[dstStatus] = dstItems;
    }
    setColumns(newCols);

    const updates = (Object.entries(newCols) as [IssueStatus, Issue[]][]).flatMap(([status, items]) =>
      items.map((item, idx) => ({ id: item.id, status, orderIndex: idx }))
    );
    await boardApi.reorderBoard(projectId, updates);
  };

  const handleCreateIssue = async (values: issuesApi.CreateIssueBody) => {
    if (!projectId) return;
    try {
      setCreateLoading(true);
      const issue = await issuesApi.createIssue(projectId, values);
      const valuesToSave = Object.entries(createCustomFieldValues)
        .filter(([, v]) => v !== null && v !== undefined)
        .map(([customFieldId, value]) => ({ customFieldId, value }));
      if (valuesToSave.length > 0) {
        await issueCustomFieldsApi.updateFields(issue.id, valuesToSave);
      }
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

  if (loading || !project) {
    return <LoadingSpinner />;
  }

  const allBoardIssues = STATUS_ORDER.flatMap((status) => columns[status] || []);

  return (
    <div className="tt-page tt-board-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(`/projects/${projectId}`)}
          style={{ padding: '4px 8px', color: 'var(--t2)' }}
        >
          Back to project
        </Button>
      </div>

      <div className="tt-board-header">
        <div className="tt-board-header-main">
          <h1 className="tt-page-title tt-board-title">
            {project.name}
            <span className="tt-board-key">{project.key}</span>
          </h1>
          <p className="tt-page-subtitle tt-board-subtitle">Kanban board</p>
        </div>
        <div className="tt-board-header-actions">
          <Space.Compact>
            <Button
              icon={<AppstoreOutlined />}
              type="primary"
              size="small"
            >
              Board
            </Button>
            <Button
              icon={<ThunderboltOutlined />}
              size="small"
              onClick={() => navigate(`/projects/${projectId}/sprints`)}
            >
              Sprints
            </Button>
          </Space.Compact>
          {canCreate && (
            <Button
              type="primary"
              size="small"
              icon={<PlusOutlined />}
              className="tt-board-new-issue-btn"
              onClick={() => setCreateOpen(true)}
            >
              New Issue
            </Button>
          )}
        </div>
      </div>

      <div className="tt-board-toolbar">
        <Space size="middle" wrap>
          <Select
            allowClear
            placeholder="All sprints"
            value={selectedSprint}
            onChange={setSelectedSprint}
            style={{ minWidth: 220 }}
            options={sprints.map((s) => ({
              value: s.id,
              label: s.name,
            }))}
          />
        </Space>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="tt-board-columns">
          {STATUS_ORDER.map(status => (
            <Droppable droppableId={status} key={status}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`tt-board-column ${snapshot.isDraggingOver ? 'tt-board-column--active' : ''}`}
                  style={{ backgroundColor: COLUMN_COLORS[status] }}
                >
                  <div className="tt-board-column-header">
                    <span className={`tt-board-column-chip tt-board-column-chip--${status.toLowerCase()}`}>
                      {COLUMN_LABELS[status]}
                    </span>
                    <span className="tt-board-column-count">
                      {columns[status]?.length || 0}
                    </span>
                  </div>
                  {(columns[status] || []).map((issue, idx) => (
                    <Draggable key={issue.id} draggableId={issue.id} index={idx}>
                      {(prov) => (
                        <div
                          ref={prov.innerRef}
                          {...prov.draggableProps}
                          {...prov.dragHandleProps}
                          className={`tt-board-card ${selectedIssueId === issue.id ? 'tt-board-card--selected' : ''}`}
                          style={prov.draggableProps.style as React.CSSProperties}
                          onClick={() => setSelectedIssueId(issue.id)}
                        >
                          <div className="tt-board-card-top-row">
                            <span className="tt-board-card-id">
                              {project.key}-{issue.number}
                            </span>
                            <IssueTypeBadge type={issue.type} typeConfig={issue.issueTypeConfig} />
                          </div>
                          <Link to={`/issues/${issue.id}`} className="tt-board-card-title">
                            {issue.title}
                          </Link>
                          {(kanbanFieldsMap.get(issue.id)?.length ?? 0) > 0 && (
                            <KanbanCardCustomFields kanbanFields={kanbanFieldsMap.get(issue.id)!} />
                          )}
                          <div className="tt-board-card-meta">
                            <span className={`tt-board-status-pill tt-board-status-pill--${issue.status.toLowerCase()}`}>
                              {COLUMN_LABELS[issue.status]}
                            </span>
                            {issue.assignee && (
                              <span className="tt-board-card-assignee">
                                {issue.assignee.name}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          ))}
        </div>
      </DragDropContext>

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
          initialValues={{ issueTypeConfigId: issueTypeConfigs.find((c) => c.systemKey === 'TASK')?.id ?? issueTypeConfigs[0]?.id, priority: 'MEDIUM' }}
        >
          <Form.Item
            name="title"
            label="Title"
            rules={[{ required: true, message: 'Please enter a title' }]}
          >
            <Input />
          </Form.Item>
          <Space size="middle" style={{ width: '100%' }}>
            <Form.Item
              name="issueTypeConfigId"
              label="Type"
              style={{ flex: 1 }}
            >
              <Select
                options={issueTypeConfigs.map((c) => ({
                  value: c.id,
                  label: c.name,
                }))}
              />
            </Form.Item>
            <Form.Item<IssuePriority>
              name="priority"
              label="Priority"
              style={{ flex: 1 }}
            >
              <Select<IssuePriority>
                options={(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as IssuePriority[]).map((v) => ({
                  value: v,
                  label: v,
                }))}
              />
            </Form.Item>
          </Space>
          <Form.Item name="parentId" label="Parent Issue">
            <Select
              allowClear
              placeholder="None (top level)"
              style={{ width: '100%' }}
              options={allBoardIssues
                .filter((i) => !i.issueTypeConfig?.isSubtask)
                .map((i) => ({
                  value: i.id,
                  label: `${project.key}-${i.number} ${i.title}`,
                }))}
            />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} />
          </Form.Item>
          {createCustomFields.length > 0 && (
            <>
              <Divider orientation="left" orientationMargin={0} style={{ margin: '12px 0 8px' }}>
                <Typography.Text style={{ fontSize: 12, color: 'inherit' }}>Дополнительные поля</Typography.Text>
              </Divider>
              {createCustomFields.map(field => (
                <Form.Item
                  key={field.customFieldId}
                  label={
                    <span>
                      {field.isRequired && <span style={{ color: '#e5534b' }}>* </span>}
                      {field.name}
                    </span>
                  }
                  style={{ marginBottom: 8 }}
                >
                  <CustomFieldInput
                    field={{ ...field, currentValue: createCustomFieldValues[field.customFieldId] ?? null }}
                    inlineEdit={false}
                    onSave={async (val) => {
                      setCreateCustomFieldValues(prev => ({ ...prev, [field.customFieldId]: val }));
                    }}
                  />
                </Form.Item>
              ))}
            </>
          )}
        </Form>
      </Modal>
    </div>
  );
}
