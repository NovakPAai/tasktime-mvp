import api from './client';
import type { Comment } from '../types';

export async function listComments(issueId: string): Promise<Comment[]> {
  const { data } = await api.get<Comment[]>(`/issues/${issueId}/comments`);
  return data;
}

export async function createComment(issueId: string, body: string): Promise<Comment> {
  const { data } = await api.post<Comment>(`/issues/${issueId}/comments`, { body });
  return data;
}

export async function updateComment(id: string, body: string): Promise<Comment> {
  const { data } = await api.patch<Comment>(`/comments/${id}`, { body });
  return data;
}

export async function deleteComment(id: string): Promise<void> {
  await api.delete(`/comments/${id}`);
}
