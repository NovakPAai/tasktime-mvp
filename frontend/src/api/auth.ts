import api from './client';
import type { AuthResponse, User } from '../types';

export async function login(email: string, password: string): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/auth/login', { email, password });
  return data;
}

export async function register(email: string, password: string, name: string): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/auth/register', { email, password, name });
  return data;
}

export async function getMe(): Promise<User> {
  const { data } = await api.get<User>('/auth/me');
  return data;
}

export async function logout(refreshToken: string): Promise<void> {
  await api.post('/auth/logout', { refreshToken });
}

export async function listUsers(): Promise<User[]> {
  const { data } = await api.get<User[]>('/users');
  return data;
}
