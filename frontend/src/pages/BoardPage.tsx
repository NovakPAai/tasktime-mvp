import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Typography, Tag, Select, Space } from 'antd';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import * as boardApi from '../api/board';
import * as sprintsApi from '../api/sprints';
import type { Issue, IssueStatus, Sprint } from '../types';

const STATUS_ORDER: IssueStatus[] = ['OPEN', 'IN_PROGRESS', 'REVIEW', 'DONE', 'CANCELLED'];
const COLUMN_LABELS: Record<IssueStatus, string> = {
  OPEN: 'Open', IN_PROGRESS: 'In Progress', REVIEW: 'Review', DONE: 'Done', CANCELLED: 'Cancelled',
};
const COLUMN_COLORS: Record<IssueStatus, string> = {
  OPEN: '#e6f7ff', IN_PROGRESS: '#fff7e6', REVIEW: '#f6ffed', DONE: '#f9f0ff', CANCELLED: '#fff1f0',
};
const TYPE_COLORS: Record<string, string> = { EPIC: 'purple', STORY: 'green', TASK: 'blue', SUBTASK: 'cyan', BUG: 'red' };

export default function BoardPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const [columns, setColumns] = useState<Record<IssueStatus, Issue[]>>({} as any);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [selectedSprint, setSelectedSprint] = useState<string | undefined>();

  const load = useCallback(async () => {
    if (!projectId) return;
    const board = await boardApi.getBoard(projectId, selectedSprint);
    setColumns(board.columns);
  }, [projectId, selectedSprint]);

  useEffect(() => {
    if (projectId) sprintsApi.listSprints(projectId).then(setSprints);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

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

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Board</Typography.Title>
        <Select allowClear placeholder="All issues" value={selectedSprint} onChange={setSelectedSprint}
          style={{ width: 200 }} options={sprints.map(s => ({ value: s.id, label: s.name }))} />
      </Space>

      <DragDropContext onDragEnd={onDragEnd}>
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 12 }}>
          {STATUS_ORDER.map(status => (
            <Droppable droppableId={status} key={status}>
              {(provided, snapshot) => (
                <div ref={provided.innerRef} {...provided.droppableProps}
                  style={{
                    minWidth: 240, width: 240, background: snapshot.isDraggingOver ? '#f0f5ff' : COLUMN_COLORS[status],
                    borderRadius: 8, padding: 8, minHeight: 400,
                  }}>
                  <Typography.Text strong style={{ display: 'block', marginBottom: 8, textAlign: 'center' }}>
                    {COLUMN_LABELS[status]} ({columns[status]?.length || 0})
                  </Typography.Text>
                  {(columns[status] || []).map((issue, idx) => (
                    <Draggable key={issue.id} draggableId={issue.id} index={idx}>
                      {(prov) => (
                        <div ref={prov.innerRef} {...prov.draggableProps} {...prov.dragHandleProps}
                          style={{ ...prov.draggableProps.style, background: '#fff', borderRadius: 6, padding: 8, marginBottom: 6, boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
                          <Link to={`/issues/${issue.id}`} style={{ fontWeight: 500 }}>
                            {issue.title}
                          </Link>
                          <div style={{ marginTop: 4 }}>
                            <Tag color={TYPE_COLORS[issue.type]} style={{ fontSize: 10 }}>{issue.type}</Tag>
                            {issue.assignee && <Tag style={{ fontSize: 10 }}>{issue.assignee.name}</Tag>}
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
    </div>
  );
}
