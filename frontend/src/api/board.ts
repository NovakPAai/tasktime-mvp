import api from './client';
import type { BoardData } from '../types';

export async function getBoard(projectId: string, sprintId?: string): Promise<BoardData> {
  const params = sprintId ? { sprintId } : {};
  const { data } = await api.get<BoardData>(`/projects/${projectId}/board`, { params });
  return data;
}

export async function reorderBoard(projectId: string, updates: { id: string; status: string; orderIndex: number }[]) {
  await api.patch(`/projects/${projectId}/board/reorder`, { updates });
}
