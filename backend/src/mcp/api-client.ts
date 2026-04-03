/**
 * Internal HTTP client for MCP → Backend API calls.
 *
 * Write operations (status transitions, comments) go through the API so that
 * the workflow engine, RBAC middleware, and post-functions execute normally.
 * Read operations and agent-metadata fields (aiExecutionStatus, aiAssigneeType)
 * still use Prisma directly since they carry no workflow logic.
 *
 * Required env vars:
 *   BACKEND_INTERNAL_URL — URL of the running backend, e.g. http://localhost:3000
 *                          or http://backend:3000 inside Docker. Defaults to
 *                          http://localhost:3000 when not set.
 *   MCP_AGENT_EMAIL      — login email for the agent service account
 *                          (default: agent@flow-universe.internal)
 *   MCP_AGENT_PASSWORD   — password for the agent service account (required)
 */

const BACKEND_URL = (process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const AGENT_EMAIL = process.env.MCP_AGENT_EMAIL ?? 'agent@flow-universe.internal';
const AGENT_PASSWORD = process.env.MCP_AGENT_PASSWORD ?? '';

let _accessToken: string | null = null;

async function login(): Promise<void> {
  if (!AGENT_PASSWORD) {
    throw new Error(
      'MCP_AGENT_PASSWORD is not configured. ' +
        'Set it in your environment to allow MCP write operations via the backend API.',
    );
  }

  const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: AGENT_EMAIL, password: AGENT_PASSWORD }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Agent login failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { accessToken: string };
  _accessToken = data.accessToken;
}

async function token(): Promise<string> {
  if (!_accessToken) await login();
  return _accessToken!;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const send = async (tok: string): Promise<Response> =>
    fetch(`${BACKEND_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tok}`,
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });

  let res = await send(await token());

  // Token expired — re-login once and retry
  if (res.status === 401) {
    _accessToken = null;
    res = await send(await token());
  }

  if (!res.ok) {
    const text = await res.text();
    let message: string;
    try {
      const json = JSON.parse(text) as { message?: string; error?: string };
      message = json.message ?? json.error ?? text;
    } catch {
      message = text;
    }
    throw new Error(`${method} ${path} → HTTP ${res.status}: ${message}`);
  }

  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

export const api = {
  post: <T = unknown>(path: string, body: unknown) => request<T>('POST', path, body),
  patch: <T = unknown>(path: string, body: unknown) => request<T>('PATCH', path, body),
};
