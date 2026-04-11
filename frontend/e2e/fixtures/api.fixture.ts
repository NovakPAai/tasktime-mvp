/**
 * API helpers for E2E tests — direct REST calls to backend.
 * All helpers accept an accessToken and a request context.
 */
import type { APIRequestContext } from '@playwright/test';

const API_BASE = process.env.E2E_API_BASE_URL || 'http://localhost:3002/api';

function apiUrl(path: string) {
  return `${API_BASE}${path}`;
}

function headers(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthSession {
  accessToken: string;
  userId: string;
  userEmail: string;
}

export async function login(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<AuthSession> {
  const res = await request.post(apiUrl('/auth/login'), {
    data: { email, password },
  });
  if (!res.ok()) {
    throw new Error(`Login failed: ${res.status()} — ${await res.text()}`);
  }
  const data = await res.json() as { accessToken: string; user: { id: string; email: string } };
  return { accessToken: data.accessToken, userId: data.user.id, userEmail: data.user.email };
}

export async function getAdminSession(request: APIRequestContext): Promise<AuthSession> {
  const email = process.env.E2E_ADMIN_EMAIL || 'e2e-bot@tasktime.ru';
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!password) throw new Error('E2E_ADMIN_PASSWORD env var is required');
  return login(request, email, password);
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export interface E2EProject {
  id: string;
  name: string;
  key: string;
}

export async function createProject(
  request: APIRequestContext,
  token: string,
  name: string,
  key: string,
): Promise<E2EProject> {
  const res = await request.post(apiUrl('/projects'), {
    headers: headers(token),
    data: { name, key },
  });
  if (!res.ok()) throw new Error(`createProject failed: ${res.status()} — ${await res.text()}`);
  return res.json() as Promise<E2EProject>;
}

export async function deleteProject(
  request: APIRequestContext,
  token: string,
  id: string,
): Promise<void> {
  const res = await request.delete(apiUrl(`/projects/${id}`), {
    headers: headers(token),
  });
  // 404 is fine — already deleted
  if (!res.ok() && res.status() !== 404) {
    console.warn(`deleteProject ${id}: ${res.status()}`);
  }
}

export async function listProjects(
  request: APIRequestContext,
  token: string,
): Promise<E2EProject[]> {
  const res = await request.get(apiUrl('/projects'), { headers: headers(token) });
  if (!res.ok()) throw new Error(`listProjects failed: ${res.status()}`);
  const data = await res.json() as { projects?: E2EProject[] } | E2EProject[];
  return Array.isArray(data) ? data : (data.projects ?? []);
}

// ─── Issues ───────────────────────────────────────────────────────────────────

export interface E2EIssue {
  id: string;
  title: string;
  status: string;
  type: string;
  number: number;
}

export async function createIssue(
  request: APIRequestContext,
  token: string,
  projectId: string,
  opts: { title: string; type?: string; status?: string; description?: string; parentId?: string },
): Promise<E2EIssue> {
  const res = await request.post(apiUrl(`/projects/${projectId}/issues`), {
    headers: headers(token),
    data: {
      title: opts.title,
      type: opts.type ?? 'TASK',
      status: opts.status,
      description: opts.description,
      parentId: opts.parentId,
    },
  });
  if (!res.ok()) throw new Error(`createIssue failed: ${res.status()} — ${await res.text()}`);
  return res.json() as Promise<E2EIssue>;
}

export async function updateIssue(
  request: APIRequestContext,
  token: string,
  id: string,
  patch: Record<string, unknown>,
): Promise<E2EIssue> {
  const res = await request.patch(apiUrl(`/issues/${id}`), {
    headers: headers(token),
    data: patch,
  });
  if (!res.ok()) throw new Error(`updateIssue failed: ${res.status()} — ${await res.text()}`);
  return res.json() as Promise<E2EIssue>;
}

export async function updateBoardStatus(
  request: APIRequestContext,
  token: string,
  projectId: string,
  issueId: string,
  status: string,
): Promise<void> {
  const res = await request.patch(apiUrl(`/projects/${projectId}/board/reorder`), {
    headers: headers(token),
    data: { updates: [{ id: issueId, status, orderIndex: 0 }] },
  });
  if (!res.ok()) throw new Error(`updateBoardStatus failed: ${res.status()}`);
}

// ─── Sprints ──────────────────────────────────────────────────────────────────

export interface E2ESprint {
  id: string;
  name: string;
  /** Backend field name is 'state', not 'status' */
  state: string;
  status?: string;
}

export async function createSprint(
  request: APIRequestContext,
  token: string,
  projectId: string,
  name: string,
): Promise<E2ESprint> {
  const res = await request.post(apiUrl(`/projects/${projectId}/sprints`), {
    headers: headers(token),
    data: { name, goal: 'E2E test sprint' },
  });
  if (!res.ok()) throw new Error(`createSprint failed: ${res.status()} — ${await res.text()}`);
  return res.json() as Promise<E2ESprint>;
}

export async function startSprint(
  request: APIRequestContext,
  token: string,
  sprintId: string,
): Promise<E2ESprint> {
  const res = await request.post(apiUrl(`/sprints/${sprintId}/start`), {
    headers: headers(token),
    data: {},
  });
  if (!res.ok()) throw new Error(`startSprint failed: ${res.status()} — ${await res.text()}`);
  return res.json() as Promise<E2ESprint>;
}

export async function closeSprint(
  request: APIRequestContext,
  token: string,
  sprintId: string,
): Promise<E2ESprint> {
  const res = await request.post(apiUrl(`/sprints/${sprintId}/close`), {
    headers: headers(token),
    data: {},
  });
  if (!res.ok()) throw new Error(`closeSprint failed: ${res.status()} — ${await res.text()}`);
  return res.json() as Promise<E2ESprint>;
}

export async function addIssuesToSprint(
  request: APIRequestContext,
  token: string,
  sprintId: string,
  issueIds: string[],
): Promise<void> {
  const res = await request.post(apiUrl(`/sprints/${sprintId}/issues`), {
    headers: headers(token),
    data: { issueIds },
  });
  if (!res.ok()) throw new Error(`addIssuesToSprint failed: ${res.status()} — ${await res.text()}`);
}

// ─── Time ─────────────────────────────────────────────────────────────────────

export async function logTime(
  request: APIRequestContext,
  token: string,
  issueId: string,
  hours: number,
  note?: string,
): Promise<void> {
  const res = await request.post(apiUrl(`/issues/${issueId}/time`), {
    headers: headers(token),
    data: { hours, note: note ?? 'E2E time log' },
  });
  if (!res.ok()) throw new Error(`logTime failed: ${res.status()} — ${await res.text()}`);
}

// ─── Teams ────────────────────────────────────────────────────────────────────

export interface E2ETeam {
  id: string;
  name: string;
}

export async function createTeam(
  request: APIRequestContext,
  token: string,
  name: string,
): Promise<E2ETeam> {
  const res = await request.post(apiUrl('/teams'), {
    headers: headers(token),
    data: { name, description: 'E2E test team' },
  });
  if (!res.ok()) throw new Error(`createTeam failed: ${res.status()} — ${await res.text()}`);
  return res.json() as Promise<E2ETeam>;
}

export async function deleteTeam(
  request: APIRequestContext,
  token: string,
  id: string,
): Promise<void> {
  const res = await request.delete(apiUrl(`/teams/${id}`), {
    headers: headers(token),
  });
  if (!res.ok() && res.status() !== 404) {
    console.warn(`deleteTeam ${id}: ${res.status()}`);
  }
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

/**
 * Delete all projects created with the given name prefix.
 * Safe to call in afterAll — 404s are ignored.
 */
export async function cleanupProjects(
  request: APIRequestContext,
  token: string,
  prefix: string,
): Promise<void> {
  try {
    const projects = await listProjects(request, token);
    const toDelete = projects.filter((p) => p.name.startsWith(prefix));
    await Promise.all(toDelete.map((p) => deleteProject(request, token, p.id)));
  } catch (err) {
    console.warn('[cleanup] cleanupProjects error:', err);
  }
}

/**
 * Delete teams with the given name prefix.
 */
export async function cleanupTeams(
  request: APIRequestContext,
  token: string,
  prefix: string,
): Promise<void> {
  try {
    const res = await request.get(apiUrl('/teams'), { headers: headers(token) });
    if (!res.ok()) return;
    const data = await res.json() as E2ETeam[] | { teams: E2ETeam[] };
    const teams = Array.isArray(data) ? data : (data.teams ?? []);
    const toDelete = teams.filter((t) => t.name.startsWith(prefix));
    await Promise.all(toDelete.map((t) => deleteTeam(request, token, t.id)));
  } catch (err) {
    console.warn('[cleanup] cleanupTeams error:', err);
  }
}
