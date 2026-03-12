import api from './client';
import type { Team } from '../types';

export async function listTeams(): Promise<Team[]> {
  const { data } = await api.get<Team[]>('/teams');
  return data;
}

export async function getTeam(id: string): Promise<Team> {
  const { data } = await api.get<Team>(`/teams/${id}`);
  return data;
}

export async function createTeam(payload: { name: string; description?: string }) {
  const { data } = await api.post<Team>('/teams', payload);
  return data;
}

export async function updateTeam(id: string, payload: { name?: string; description?: string | null }) {
  const { data } = await api.patch<Team>(`/teams/${id}`, payload);
  return data;
}

export async function deleteTeam(id: string) {
  await api.delete(`/teams/${id}`);
}

export async function updateTeamMembers(id: string, userIds: string[]) {
  await api.put(`/teams/${id}/members`, { userIds });
}

