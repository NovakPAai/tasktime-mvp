import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import { Prisma, PrismaClient } from '@prisma/client';

import {
  buildProdSyncPlan,
  getAiSessionCompositeKey,
  getIssueKey,
  type ProdSyncAiSessionRecord,
  type ProdSyncDataSnapshot,
  type ProdSyncIssueRecord,
  type ProdSyncTimeLogRecord,
} from './prod-sync.domain.js';
import { hashPassword } from '../shared/utils/password.js';

const PROD_SYNC_PROJECT_KEY = 'TTMP';

type ProdSyncArgs = {
  dryRun: boolean;
};

type ProdSyncEnv = {
  SOURCE_DATABASE_URL?: string;
  DATABASE_URL?: string;
};

type SyncPrismaClient = PrismaClient | Prisma.TransactionClient;

function toOptionalIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function toDateOnlyIso(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toOptionalDecimalString(value: Prisma.Decimal | null | undefined): string | null {
  return value ? value.toFixed() : null;
}

function toDecimal(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function toIssueRecord(issue: Awaited<ReturnType<typeof loadIssues>>[number]): ProdSyncIssueRecord {
  return {
    projectKey: PROD_SYNC_PROJECT_KEY,
    number: issue.number,
    title: issue.title,
    description: issue.description,
    type: issue.type ?? 'TASK',
    status: issue.status,
    priority: issue.priority,
    orderIndex: issue.orderIndex,
    aiEligible: issue.aiEligible,
    aiExecutionStatus: issue.aiExecutionStatus,
    aiAssigneeType: issue.aiAssigneeType,
    sprintName: issue.sprint?.name ?? null,
    creatorEmail: issue.creator.email,
    assigneeEmail: issue.assignee?.email ?? null,
    parentNumber: issue.parent?.number ?? null,
    estimatedHours: toOptionalDecimalString(issue.estimatedHours),
  };
}

function toAiSessionRecord(
  session: Awaited<ReturnType<typeof loadAiSessions>>[number],
): ProdSyncAiSessionRecord {
  return {
    issueNumber: session.issue?.number ?? null,
    userEmail: session.user?.email ?? null,
    model: session.model,
    provider: session.provider,
    startedAt: session.startedAt.toISOString(),
    finishedAt: session.finishedAt.toISOString(),
    tokensInput: session.tokensInput,
    tokensOutput: session.tokensOutput,
    costMoney: session.costMoney.toFixed(),
    notes: session.notes,
  };
}

function toTimeLogRecord(
  timeLog: Awaited<ReturnType<typeof loadTimeLogs>>[number],
): ProdSyncTimeLogRecord {
  return {
    issueNumber: timeLog.issue.number,
    userEmail: timeLog.user?.email ?? null,
    hours: timeLog.hours.toFixed(),
    note: timeLog.note,
    startedAt: toOptionalIso(timeLog.startedAt),
    stoppedAt: toOptionalIso(timeLog.stoppedAt),
    logDate: toDateOnlyIso(timeLog.logDate),
    source: timeLog.source,
    aiSessionCompositeKey: timeLog.agentSession
      ? getAiSessionCompositeKey(PROD_SYNC_PROJECT_KEY, toAiSessionRecord(timeLog.agentSession))
      : null,
  };
}

export function parseProdSyncArgs(args: string[]): ProdSyncArgs {
  let dryRun = false;

  for (const arg of args) {
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }

    throw new Error(`Unknown prod sync argument: ${arg}`);
  }

  return { dryRun };
}

export function resolveProdSyncUrls(env: ProdSyncEnv): {
  sourceDatabaseUrl: string;
  targetDatabaseUrl: string;
} {
  const sourceDatabaseUrl = env.SOURCE_DATABASE_URL?.trim();
  const targetDatabaseUrl = env.DATABASE_URL?.trim();

  if (!sourceDatabaseUrl) {
    throw new Error('SOURCE_DATABASE_URL is required for prod-to-dev sync');
  }

  if (!targetDatabaseUrl) {
    throw new Error('DATABASE_URL is required for prod-to-dev sync');
  }

  if (sourceDatabaseUrl === targetDatabaseUrl) {
    throw new Error('SOURCE_DATABASE_URL must not match DATABASE_URL');
  }

  const sourceUrl = new URL(sourceDatabaseUrl);
  const targetUrl = new URL(targetDatabaseUrl);
  const sourceHost = sourceUrl.hostname.toLowerCase();
  const targetHost = targetUrl.hostname.toLowerCase();

  if (sourceHost === targetHost) {
    throw new Error('SOURCE_DATABASE_URL and DATABASE_URL must not point to the same database host');
  }

  return {
    sourceDatabaseUrl,
    targetDatabaseUrl,
  };
}

async function loadIssues(prisma: SyncPrismaClient, projectId: string) {
  return prisma.issue.findMany({
    where: { projectId },
    orderBy: { number: 'asc' },
    select: {
      number: true,
      title: true,
      description: true,
      type: true,
      status: true,
      priority: true,
      orderIndex: true,
      aiEligible: true,
      aiExecutionStatus: true,
      aiAssigneeType: true,
      estimatedHours: true,
      creator: { select: { email: true } },
      assignee: { select: { email: true } },
      sprint: { select: { name: true } },
      parent: { select: { number: true } },
    },
  });
}

async function loadAiSessions(prisma: SyncPrismaClient, projectId: string) {
  return prisma.aiSession.findMany({
    where: { issue: { projectId } },
    orderBy: [{ startedAt: 'asc' }, { createdAt: 'asc' }],
    select: {
      model: true,
      provider: true,
      startedAt: true,
      finishedAt: true,
      tokensInput: true,
      tokensOutput: true,
      costMoney: true,
      notes: true,
      issue: { select: { number: true } },
      user: { select: { email: true } },
    },
  });
}

async function loadTimeLogs(prisma: SyncPrismaClient, projectId: string) {
  return prisma.timeLog.findMany({
    where: { issue: { projectId } },
    orderBy: [{ logDate: 'asc' }, { createdAt: 'asc' }],
    select: {
      hours: true,
      note: true,
      startedAt: true,
      stoppedAt: true,
      logDate: true,
      source: true,
      issue: { select: { number: true } },
      user: { select: { email: true } },
      agentSession: {
        select: {
          model: true,
          provider: true,
          startedAt: true,
          finishedAt: true,
          tokensInput: true,
          tokensOutput: true,
          costMoney: true,
          notes: true,
          issue: { select: { number: true } },
          user: { select: { email: true } },
        },
      },
    },
  });
}

async function loadSnapshot(prisma: SyncPrismaClient, projectKey: string): Promise<ProdSyncDataSnapshot> {
  const project = await prisma.project.findUnique({
    where: { key: projectKey },
    select: {
      id: true,
      key: true,
      name: true,
      description: true,
    },
  });

  if (!project) {
    return {
      projects: [],
      users: [],
      sprints: [],
      issues: [],
      aiSessions: [],
      timeLogs: [],
    };
  }

  const [sprints, issues, aiSessions, timeLogs] = await Promise.all([
    prisma.sprint.findMany({
      where: { projectId: project.id },
      orderBy: { name: 'asc' },
      select: {
        name: true,
        goal: true,
        state: true,
        startDate: true,
        endDate: true,
      },
    }),
    loadIssues(prisma, project.id),
    loadAiSessions(prisma, project.id),
    loadTimeLogs(prisma, project.id),
  ]);

  const referencedUserEmails = new Set<string>();
  for (const issue of issues) {
    referencedUserEmails.add(issue.creator.email);
    if (issue.assignee?.email) {
      referencedUserEmails.add(issue.assignee.email);
    }
  }
  for (const session of aiSessions) {
    if (session.user?.email) {
      referencedUserEmails.add(session.user.email);
    }
  }
  for (const timeLog of timeLogs) {
    if (timeLog.user?.email) {
      referencedUserEmails.add(timeLog.user.email);
    }
  }

  const users = referencedUserEmails.size === 0
    ? []
    : await prisma.user.findMany({
      where: { email: { in: [...referencedUserEmails] } },
      orderBy: { email: 'asc' },
      select: {
        email: true,
        name: true,
        role: true,
        isActive: true,
      },
    });

  return {
    projects: [
      {
        key: project.key,
        name: project.name,
        description: project.description,
      },
    ],
    users: users.map((user) => ({
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
    })),
    sprints: sprints.map((sprint) => ({
      projectKey,
      name: sprint.name,
      goal: sprint.goal,
      state: sprint.state,
      startDate: toOptionalIso(sprint.startDate),
      endDate: toOptionalIso(sprint.endDate),
    })),
    issues: issues.map(toIssueRecord),
    aiSessions: aiSessions.map(toAiSessionRecord).filter((session) => session.issueNumber !== null),
    timeLogs: timeLogs.map(toTimeLogRecord),
  };
}

function formatPlan(plan: ReturnType<typeof buildProdSyncPlan>): string {
  return JSON.stringify(plan, null, 2);
}

async function upsertProject(targetPrisma: SyncPrismaClient, source: ProdSyncDataSnapshot) {
  const project = source.projects[0];
  if (!project) {
    throw new Error(`Source project ${PROD_SYNC_PROJECT_KEY} was not found`);
  }

  return targetPrisma.project.upsert({
    where: { key: project.key },
    update: {
      name: project.name,
      description: project.description,
    },
    create: {
      key: project.key,
      name: project.name,
      description: project.description,
    },
  });
}

async function upsertUsers(targetPrisma: SyncPrismaClient, users: ProdSyncDataSnapshot['users']) {
  for (const user of users) {
    const existingUser = await targetPrisma.user.findUnique({
      where: { email: user.email },
      select: { id: true },
    });

    const passwordHash = existingUser ? undefined : await hashPassword(randomUUID());

    await targetPrisma.user.upsert({
      where: { email: user.email },
      update: {
        name: user.name,
        role: user.role as never,
        isActive: user.isActive,
      },
      create: {
        email: user.email,
        name: user.name,
        role: user.role as never,
        isActive: user.isActive,
        passwordHash: passwordHash ?? '',
      },
    });
  }
}

async function syncSprints(
  targetPrisma: SyncPrismaClient,
  projectId: string,
  source: ProdSyncDataSnapshot['sprints'],
) {
  for (const sprint of source) {
    await targetPrisma.sprint.upsert({
      where: { projectId_name: { projectId, name: sprint.name } },
      update: {
        goal: sprint.goal,
        state: sprint.state as never,
        startDate: sprint.startDate ? new Date(sprint.startDate) : null,
        endDate: sprint.endDate ? new Date(sprint.endDate) : null,
      },
      create: {
        projectId,
        name: sprint.name,
        goal: sprint.goal,
        state: sprint.state as never,
        startDate: sprint.startDate ? new Date(sprint.startDate) : null,
        endDate: sprint.endDate ? new Date(sprint.endDate) : null,
      },
    });
  }
}

async function buildTargetContext(targetPrisma: SyncPrismaClient, projectId: string) {
  const [users, sprints, issues] = await Promise.all([
    targetPrisma.user.findMany({
      select: { id: true, email: true },
    }),
    targetPrisma.sprint.findMany({
      where: { projectId },
      select: { id: true, name: true },
    }),
    targetPrisma.issue.findMany({
      where: { projectId },
      select: { id: true, number: true },
    }),
  ]);

  return {
    userIdByEmail: new Map(users.map((user) => [user.email, user.id])),
    sprintIdByName: new Map(sprints.map((sprint) => [sprint.name, sprint.id])),
    issueIdByNumber: new Map(issues.map((issue) => [issue.number, issue.id])),
  };
}

async function syncIssues(
  targetPrisma: SyncPrismaClient,
  projectId: string,
  sourceIssues: ProdSyncDataSnapshot['issues'],
) {
  const context = await buildTargetContext(targetPrisma, projectId);

  for (const issue of sourceIssues) {
    const creatorId = context.userIdByEmail.get(issue.creatorEmail);
    if (!creatorId) {
      throw new Error(`Missing target creator ${issue.creatorEmail} for ${getIssueKey(PROD_SYNC_PROJECT_KEY, issue.number)}`);
    }

    const assigneeId = issue.assigneeEmail ? context.userIdByEmail.get(issue.assigneeEmail) ?? null : null;
    const sprintId = issue.sprintName ? context.sprintIdByName.get(issue.sprintName) ?? null : null;

    await targetPrisma.issue.upsert({
      where: { projectId_number: { projectId, number: issue.number } },
      update: {
        title: issue.title,
        description: issue.description,
        type: issue.type as never,
        status: issue.status as never,
        priority: issue.priority as never,
        orderIndex: issue.orderIndex,
        aiEligible: issue.aiEligible,
        aiExecutionStatus: issue.aiExecutionStatus as never,
        aiAssigneeType: issue.aiAssigneeType as never,
        creatorId,
        assigneeId,
        sprintId,
        estimatedHours: issue.estimatedHours ? toDecimal(issue.estimatedHours) : null,
        parentId: null,
      },
      create: {
        projectId,
        number: issue.number,
        title: issue.title,
        description: issue.description,
        type: issue.type as never,
        status: issue.status as never,
        priority: issue.priority as never,
        orderIndex: issue.orderIndex,
        aiEligible: issue.aiEligible,
        aiExecutionStatus: issue.aiExecutionStatus as never,
        aiAssigneeType: issue.aiAssigneeType as never,
        creatorId,
        assigneeId,
        sprintId,
        estimatedHours: issue.estimatedHours ? toDecimal(issue.estimatedHours) : null,
      },
    });
  }

  const { issueIdByNumber } = await buildTargetContext(targetPrisma, projectId);

  for (const issue of sourceIssues) {
    await targetPrisma.issue.update({
      where: { projectId_number: { projectId, number: issue.number } },
      data: {
        parentId: issue.parentNumber ? issueIdByNumber.get(issue.parentNumber) ?? null : null,
      },
    });
  }
}

async function replaceAiSessionsAndTimeLogs(
  targetPrisma: SyncPrismaClient,
  projectId: string,
  aiSessions: ProdSyncDataSnapshot['aiSessions'],
  timeLogs: ProdSyncDataSnapshot['timeLogs'],
) {
  await targetPrisma.timeLog.deleteMany({
    where: { issue: { projectId } },
  });
  await targetPrisma.aiSession.deleteMany({
    where: { issue: { projectId } },
  });

  const context = await buildTargetContext(targetPrisma, projectId);
  const createdAiSessionIdByCompositeKey = new Map<string, string>();

  for (const session of aiSessions) {
    const issueId = session.issueNumber === null ? null : context.issueIdByNumber.get(session.issueNumber) ?? null;
    const userId = session.userEmail ? context.userIdByEmail.get(session.userEmail) ?? null : null;

    const createdSession = await targetPrisma.aiSession.create({
      data: {
        issueId,
        userId,
        model: session.model,
        provider: session.provider,
        startedAt: new Date(session.startedAt),
        finishedAt: new Date(session.finishedAt),
        tokensInput: session.tokensInput,
        tokensOutput: session.tokensOutput,
        costMoney: toDecimal(session.costMoney),
        notes: session.notes,
      },
      select: { id: true },
    });

    createdAiSessionIdByCompositeKey.set(
      getAiSessionCompositeKey(PROD_SYNC_PROJECT_KEY, session),
      createdSession.id,
    );
  }

  for (const timeLog of timeLogs) {
    const issueId = context.issueIdByNumber.get(timeLog.issueNumber);
    if (!issueId) {
      throw new Error(`Missing target issue ${getIssueKey(PROD_SYNC_PROJECT_KEY, timeLog.issueNumber)} for time log sync`);
    }

    const userId = timeLog.userEmail ? context.userIdByEmail.get(timeLog.userEmail) ?? null : null;
    const agentSessionId = timeLog.aiSessionCompositeKey
      ? createdAiSessionIdByCompositeKey.get(timeLog.aiSessionCompositeKey) ?? null
      : null;

    await targetPrisma.timeLog.create({
      data: {
        issueId,
        userId,
        hours: toDecimal(timeLog.hours),
        note: timeLog.note,
        startedAt: timeLog.startedAt ? new Date(timeLog.startedAt) : null,
        stoppedAt: timeLog.stoppedAt ? new Date(timeLog.stoppedAt) : null,
        logDate: new Date(`${timeLog.logDate}T00:00:00.000Z`),
        source: timeLog.source as never,
        agentSessionId,
      },
    });
  }
}

export async function runProdSync(
  options: {
    sourceDatabaseUrl: string;
    targetDatabaseUrl: string;
    dryRun: boolean;
  },
): Promise<ReturnType<typeof buildProdSyncPlan>> {
  const sourcePrisma = new PrismaClient({
    datasources: { db: { url: options.sourceDatabaseUrl } },
  });
  const targetPrisma = new PrismaClient({
    datasources: { db: { url: options.targetDatabaseUrl } },
  });

  try {
    const [source, target] = await Promise.all([
      loadSnapshot(sourcePrisma, PROD_SYNC_PROJECT_KEY),
      loadSnapshot(targetPrisma, PROD_SYNC_PROJECT_KEY),
    ]);
    const plan = buildProdSyncPlan({
      projectKey: PROD_SYNC_PROJECT_KEY,
      source,
      target,
    });

    if (options.dryRun) {
      return plan;
    }

    await targetPrisma.$transaction(async (tx) => {
      const syncedProject = await upsertProject(tx, source);
      await upsertUsers(tx, source.users);
      await syncSprints(tx, syncedProject.id, source.sprints);
      await syncIssues(tx, syncedProject.id, source.issues);
      await replaceAiSessionsAndTimeLogs(tx, syncedProject.id, source.aiSessions, source.timeLogs);
    });

    return plan;
  } finally {
    await Promise.all([sourcePrisma.$disconnect(), targetPrisma.$disconnect()]);
  }
}

async function main() {
  const args = parseProdSyncArgs(process.argv.slice(2));
  const urls = resolveProdSyncUrls(process.env);
  const plan = await runProdSync({
    ...urls,
    dryRun: args.dryRun,
  });

  if (args.dryRun) {
    console.log('Dry run only. No target writes were performed.');
  } else {
    console.log('Sync completed. Target DATABASE_URL updated from SOURCE_DATABASE_URL.');
  }

  console.log(formatPlan(plan));
}

const isExecutedDirectly = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isExecutedDirectly) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
