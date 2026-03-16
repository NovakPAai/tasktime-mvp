export type ProdSyncProjectRecord = {
  key: string;
  name: string;
  description: string | null;
};

export type ProdSyncUserRecord = {
  email: string;
  name: string;
  role: string;
  isActive: boolean;
};

export type ProdSyncSprintRecord = {
  projectKey: string;
  name: string;
  goal: string | null;
  state: string;
  startDate: string | null;
  endDate: string | null;
};

export type ProdSyncIssueRecord = {
  projectKey: string;
  number: number;
  title: string;
  description: string | null;
  type: string;
  status: string;
  priority: string;
  orderIndex: number;
  aiEligible: boolean;
  aiExecutionStatus: string;
  aiAssigneeType: string;
  sprintName: string | null;
  creatorEmail: string;
  assigneeEmail: string | null;
  parentNumber: number | null;
  estimatedHours: string | null;
};

export type ProdSyncAiSessionRecord = {
  issueNumber: number | null;
  userEmail: string | null;
  model: string;
  provider: string;
  startedAt: string;
  finishedAt: string;
  tokensInput: number;
  tokensOutput: number;
  costMoney: string;
  notes: string | null;
};

export type ProdSyncTimeLogRecord = {
  issueNumber: number;
  userEmail: string | null;
  hours: string;
  note: string | null;
  startedAt: string | null;
  stoppedAt: string | null;
  logDate: string;
  source: string;
  aiSessionCompositeKey: string | null;
};

export type ProdSyncDataSnapshot = {
  projects: ProdSyncProjectRecord[];
  users: ProdSyncUserRecord[];
  sprints: ProdSyncSprintRecord[];
  issues: ProdSyncIssueRecord[];
  aiSessions: ProdSyncAiSessionRecord[];
  timeLogs: ProdSyncTimeLogRecord[];
};

export type ProdSyncPlan = {
  projects: Array<{ action: 'create' | 'update' | 'skip'; key: string }>;
  users: Array<{ action: 'create' | 'update' | 'skip'; email: string }>;
  sprints: Array<{ action: 'create' | 'update' | 'skip'; key: string }>;
  issues: Array<{ action: 'create' | 'update' | 'skip'; key: string }>;
  aiSessions: {
    strategy: 'replace';
    scope: string;
    delete: string[];
    create: string[];
  };
  timeLogs: {
    strategy: 'replace';
    scope: string;
    delete: string[];
    create: string[];
  };
  summary: {
    create: number;
    update: number;
    skip: number;
    replaceDelete: number;
    replaceCreate: number;
  };
};

type BuildProdSyncPlanInput = {
  projectKey: string;
  source: ProdSyncDataSnapshot;
  target: ProdSyncDataSnapshot;
};

function sortBy<T>(items: T[], getKey: (item: T) => string): T[] {
  return [...items].sort((left, right) => getKey(left).localeCompare(getKey(right)));
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

function isEqualComparable(left: unknown, right: unknown): boolean {
  return stableStringify(left) === stableStringify(right);
}

function getSprintKey(projectKey: string, sprintName: string): string {
  return `${projectKey}::${sprintName}`;
}

export function getIssueKey(projectKey: string, issueNumber: number): string {
  return `${projectKey}-${issueNumber}`;
}

export function getAiSessionCompositeKey(
  projectKey: string,
  session: ProdSyncAiSessionRecord,
): string {
  return [
    session.issueNumber === null ? `${projectKey}-unknown` : getIssueKey(projectKey, session.issueNumber),
    session.userEmail ?? '',
    session.model,
    session.provider,
    session.startedAt,
  ].join('|');
}

export function getTimeLogCompositeKey(
  projectKey: string,
  timeLog: ProdSyncTimeLogRecord,
): string {
  return [
    getIssueKey(projectKey, timeLog.issueNumber),
    timeLog.userEmail ?? '',
    timeLog.source,
    timeLog.logDate,
    timeLog.hours,
    timeLog.aiSessionCompositeKey ?? '',
  ].join('|');
}

function collectReferencedUserEmails(
  issues: ProdSyncIssueRecord[],
  aiSessions: ProdSyncAiSessionRecord[],
  timeLogs: ProdSyncTimeLogRecord[],
): Set<string> {
  const emails = new Set<string>();

  for (const issue of issues) {
    emails.add(issue.creatorEmail);
    if (issue.assigneeEmail) {
      emails.add(issue.assigneeEmail);
    }
  }

  for (const session of aiSessions) {
    if (session.userEmail) {
      emails.add(session.userEmail);
    }
  }

  for (const timeLog of timeLogs) {
    if (timeLog.userEmail) {
      emails.add(timeLog.userEmail);
    }
  }

  return emails;
}

function normalizeUser(user: ProdSyncUserRecord) {
  return {
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
  };
}

function filterSnapshotToProject(
  snapshot: ProdSyncDataSnapshot,
  projectKey: string,
): ProdSyncDataSnapshot {
  const projects = snapshot.projects.filter((project) => project.key === projectKey);
  const sprints = snapshot.sprints.filter((sprint) => sprint.projectKey === projectKey);
  const issues = snapshot.issues.filter((issue) => issue.projectKey === projectKey);
  const issueNumbers = new Set(issues.map((issue) => issue.number));
  const aiSessions = snapshot.aiSessions.filter(
    (session) => session.issueNumber !== null && issueNumbers.has(session.issueNumber),
  );
  const timeLogs = snapshot.timeLogs.filter((timeLog) => issueNumbers.has(timeLog.issueNumber));
  const referencedUserEmails = collectReferencedUserEmails(issues, aiSessions, timeLogs);
  const users = snapshot.users.filter((user) => referencedUserEmails.has(user.email));

  return {
    projects,
    users,
    sprints,
    issues,
    aiSessions,
    timeLogs,
  };
}

function buildActionList<T>(
  sourceItems: T[],
  targetItems: T[],
  getKey: (item: T) => string,
  normalize: (item: T) => unknown,
): Array<{ action: 'create' | 'update' | 'skip'; key: string }> {
  const targetByKey = new Map(targetItems.map((item) => [getKey(item), item]));

  return sortBy(sourceItems, getKey).map((sourceItem) => {
    const key = getKey(sourceItem);
    const targetItem = targetByKey.get(key);

    if (!targetItem) {
      return { action: 'create' as const, key };
    }

    if (isEqualComparable(normalize(sourceItem), normalize(targetItem))) {
      return { action: 'skip' as const, key };
    }

    return { action: 'update' as const, key };
  });
}

export function buildProdSyncPlan(input: BuildProdSyncPlanInput): ProdSyncPlan {
  const source = filterSnapshotToProject(input.source, input.projectKey);
  const target = filterSnapshotToProject(input.target, input.projectKey);

  const projectPlan = buildActionList(
    source.projects,
    target.projects,
    (project) => project.key,
    (project) => project,
  );
  const userPlan = buildActionList(
    source.users,
    target.users,
    (user) => user.email,
    normalizeUser,
  ).map((entry) => ({ action: entry.action, email: entry.key }));
  const sprintPlan = buildActionList(
    source.sprints,
    target.sprints,
    (sprint) => getSprintKey(sprint.projectKey, sprint.name),
    (sprint) => sprint,
  );
  const issuePlan = buildActionList(
    source.issues,
    target.issues,
    (issue) => getIssueKey(issue.projectKey, issue.number),
    (issue) => issue,
  );

  const aiSessionDelete = sortBy(target.aiSessions, (session) =>
    getAiSessionCompositeKey(input.projectKey, session),
  ).map((session) => getAiSessionCompositeKey(input.projectKey, session));
  const aiSessionCreate = sortBy(source.aiSessions, (session) =>
    getAiSessionCompositeKey(input.projectKey, session),
  ).map((session) => getAiSessionCompositeKey(input.projectKey, session));
  const timeLogDelete = sortBy(target.timeLogs, (timeLog) =>
    getTimeLogCompositeKey(input.projectKey, timeLog),
  ).map((timeLog) => getTimeLogCompositeKey(input.projectKey, timeLog));
  const timeLogCreate = sortBy(source.timeLogs, (timeLog) =>
    getTimeLogCompositeKey(input.projectKey, timeLog),
  ).map((timeLog) => getTimeLogCompositeKey(input.projectKey, timeLog));

  const summary = {
    create:
      projectPlan.filter((entry) => entry.action === 'create').length
      + userPlan.filter((entry) => entry.action === 'create').length
      + sprintPlan.filter((entry) => entry.action === 'create').length
      + issuePlan.filter((entry) => entry.action === 'create').length,
    update:
      projectPlan.filter((entry) => entry.action === 'update').length
      + userPlan.filter((entry) => entry.action === 'update').length
      + sprintPlan.filter((entry) => entry.action === 'update').length
      + issuePlan.filter((entry) => entry.action === 'update').length,
    skip:
      projectPlan.filter((entry) => entry.action === 'skip').length
      + userPlan.filter((entry) => entry.action === 'skip').length
      + sprintPlan.filter((entry) => entry.action === 'skip').length
      + issuePlan.filter((entry) => entry.action === 'skip').length,
    replaceDelete: aiSessionDelete.length + timeLogDelete.length,
    replaceCreate: aiSessionCreate.length + timeLogCreate.length,
  };

  return {
    projects: projectPlan,
    users: userPlan,
    sprints: sprintPlan,
    issues: issuePlan,
    aiSessions: {
      strategy: 'replace',
      scope: input.projectKey,
      delete: aiSessionDelete,
      create: aiSessionCreate,
    },
    timeLogs: {
      strategy: 'replace',
      scope: input.projectKey,
      delete: timeLogDelete,
      create: timeLogCreate,
    },
    summary,
  };
}
