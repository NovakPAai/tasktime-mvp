import api from './client';

export type UatRole = 'ADMIN' | 'MANAGER' | 'USER' | 'VIEWER';

export interface UatStep {
  id: string;
  title: string;
  description: string;
  expectedResult?: string | null;
}

export interface UatTest {
  id: string;
  title: string;
  description: string;
  role: UatRole;
  startPath: string;
  steps: UatStep[];
}

export async function listUatTests(params?: { role?: UatRole }) {
  const { data } = await api.get<UatTest[]>('/admin/uat-tests', {
    params,
  });
  return data;
}

