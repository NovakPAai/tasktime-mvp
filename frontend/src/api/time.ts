import api from './client';
import type { TimeLog } from '../types';

export async function startTimer(issueId: string): Promise<TimeLog> {
  const { data } = await api.post<TimeLog>(`/issues/${issueId}/time/start`);
  return data;
}

export async function stopTimer(issueId: string): Promise<TimeLog> {
  const { data } = await api.post<TimeLog>(`/issues/${issueId}/time/stop`);
  return data;
}

export async function logManual(issueId: string, body: { hours: number; note?: string; logDate?: string }): Promise<TimeLog> {
  const { data } = await api.post<TimeLog>(`/issues/${issueId}/time`, body);
  return data;
}

export async function getIssueLogs(issueId: string): Promise<TimeLog[]> {
  const { data } = await api.get<TimeLog[]>(`/issues/${issueId}/time`);
  return data;
}

export async function getUserLogs(userId: string): Promise<TimeLog[]> {
  const { data } = await api.get<TimeLog[]>(`/users/${userId}/time`);
  return data;
}

export async function getActiveTimer(): Promise<TimeLog | null> {
  const { data } = await api.get<TimeLog | null>(`/time/active`);
  return data;
}
