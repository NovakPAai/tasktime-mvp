import { prisma } from '../prisma/client.js';

export const AGENT_EMAIL = 'agent@flow-universe.internal';

let _agentUserId: string | null = null;

export async function getAgentUserId(): Promise<string> {
  if (_agentUserId) return _agentUserId;
  const user = await prisma.user.findUnique({ where: { email: AGENT_EMAIL } });
  if (!user) throw new Error('Agent user not found. Run: npm run db:seed');
  _agentUserId = user.id;
  return _agentUserId;
}

const ISSUE_KEY_RE = /^([A-Z]{2,10})-(\d+)$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ResolvedIssue = {
  id: string;
  key: string;
  projectKey: string;
  projectId: string;
  title: string;
  status: string;
  number: number;
};

export async function resolveKey(key: string): Promise<ResolvedIssue> {
  const trimmed = key.trim();

  if (UUID_RE.test(trimmed)) {
    const issue = await prisma.issue.findUnique({
      where: { id: trimmed },
      select: { id: true, title: true, status: true, projectId: true, number: true, project: { select: { key: true } } },
    });
    if (!issue) throw new Error(`Issue ${trimmed} not found`);
    const projectKey = issue.project.key;
    return { id: issue.id, key: `${projectKey}-${issue.number}`, projectKey, projectId: issue.projectId, title: issue.title, status: issue.status as string, number: issue.number };
  }

  const m = trimmed.toUpperCase().match(ISSUE_KEY_RE);
  if (!m) throw new Error(`Invalid issue key: ${key}`);
  const projectKey = m[1];
  const number = parseInt(m[2], 10);

  const project = await prisma.project.findUnique({ where: { key: projectKey } });
  if (!project) throw new Error(`Project ${projectKey} not found`);

  const issue = await prisma.issue.findUnique({
    where: { projectId_number: { projectId: project.id, number } },
    select: { id: true, title: true, status: true, projectId: true, number: true },
  });
  if (!issue) throw new Error(`Issue ${key} not found`);

  return { ...issue, key: trimmed.toUpperCase(), projectKey, status: issue.status as string };
}

export function text(content: string) {
  return { content: [{ type: 'text' as const, text: content }] };
}

export function errText(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return { content: [{ type: 'text' as const, text: `Error: ${msg}` }], isError: true };
}

export { prisma };
