import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { buildProdSyncPlan } from '../src/prisma/prod-sync.domain.js';
import { parseProdSyncArgs, resolveProdSyncUrls } from '../src/prisma/prod-sync.js';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(testsDir, '..');
const packageJsonPath = path.resolve(backendDir, 'package.json');
const prodSyncSourcePath = path.resolve(backendDir, 'src/prisma/prod-sync.ts');
const dotEnvStagingPath = path.resolve(backendDir, '../deploy/env/.env.staging.example');
const backendStagingEnvPath = path.resolve(
  backendDir,
  '../deploy/env/backend.staging.env.example',
);

describe('buildProdSyncPlan', () => {
  it('builds a deterministic TTMP-only plan with create, update, skip, and replace actions', () => {
    const plan = buildProdSyncPlan({
      projectKey: 'TTMP',
      source: {
        projects: [
          { key: 'TTMP', name: 'Flow Universe MVP', description: 'Fresh production snapshot' },
          { key: 'DEMO', name: 'Ignore me', description: 'Non-TTMP data must stay untouched' },
        ],
        users: [
          { email: 'manager@tasktime.ru', name: 'Manager', role: 'MANAGER', isActive: true },
          { email: 'dev@tasktime.ru', name: 'Developer', role: 'USER', isActive: true },
          { email: 'new@tasktime.ru', name: 'New User', role: 'USER', isActive: true },
          { email: 'outsider@tasktime.ru', name: 'Outsider', role: 'VIEWER', isActive: true },
        ],
        sprints: [
          {
            projectKey: 'TTMP',
            name: 'Sprint A',
            goal: 'Stable sprint goal',
            state: 'ACTIVE',
            startDate: '2026-03-10T09:00:00.000Z',
            endDate: '2026-03-11T18:00:00.000Z',
          },
          {
            projectKey: 'TTMP',
            name: 'Sprint B',
            goal: 'Brand new sprint',
            state: 'PLANNED',
            startDate: '2026-03-12T09:00:00.000Z',
            endDate: '2026-03-13T18:00:00.000Z',
          },
          {
            projectKey: 'DEMO',
            name: 'Foreign Sprint',
            goal: null,
            state: 'PLANNED',
            startDate: null,
            endDate: null,
          },
        ],
        issues: [
          {
            projectKey: 'TTMP',
            number: 1,
            title: 'Updated title from prod',
            description: 'Fresh production issue',
            type: 'TASK',
            status: 'IN_PROGRESS',
            priority: 'HIGH',
            orderIndex: 10,
            aiEligible: true,
            aiExecutionStatus: 'IN_PROGRESS',
            aiAssigneeType: 'AGENT',
            sprintName: 'Sprint A',
            creatorEmail: 'manager@tasktime.ru',
            assigneeEmail: 'dev@tasktime.ru',
            parentNumber: null,
            estimatedHours: '4.50',
          },
          {
            projectKey: 'TTMP',
            number: 2,
            title: 'Brand new issue',
            description: null,
            type: 'BUG',
            status: 'OPEN',
            priority: 'CRITICAL',
            orderIndex: 20,
            aiEligible: false,
            aiExecutionStatus: 'NOT_STARTED',
            aiAssigneeType: 'HUMAN',
            sprintName: 'Sprint B',
            creatorEmail: 'manager@tasktime.ru',
            assigneeEmail: 'new@tasktime.ru',
            parentNumber: null,
            estimatedHours: null,
          },
          {
            projectKey: 'DEMO',
            number: 99,
            title: 'Ignore this issue',
            description: null,
            type: 'TASK',
            status: 'OPEN',
            priority: 'LOW',
            orderIndex: 1,
            aiEligible: false,
            aiExecutionStatus: 'NOT_STARTED',
            aiAssigneeType: 'HUMAN',
            sprintName: null,
            creatorEmail: 'manager@tasktime.ru',
            assigneeEmail: null,
            parentNumber: null,
            estimatedHours: null,
          },
        ],
        aiSessions: [
          {
            issueNumber: 1,
            userEmail: 'dev@tasktime.ru',
            model: 'gpt-5.4',
            provider: 'openai',
            startedAt: '2026-03-10T10:00:00.000Z',
            finishedAt: '2026-03-10T10:30:00.000Z',
            tokensInput: 1000,
            tokensOutput: 500,
            costMoney: '0.1250',
            notes: 'Fresh AI session',
          },
        ],
        timeLogs: [
          {
            issueNumber: 1,
            userEmail: 'dev@tasktime.ru',
            hours: '1.50',
            note: 'Fresh human work',
            startedAt: '2026-03-10T10:00:00.000Z',
            stoppedAt: '2026-03-10T11:30:00.000Z',
            logDate: '2026-03-10',
            source: 'HUMAN',
            aiSessionCompositeKey: null,
          },
          {
            issueNumber: 2,
            userEmail: 'new@tasktime.ru',
            hours: '0.75',
            note: 'Fresh AI-assisted work',
            startedAt: null,
            stoppedAt: null,
            logDate: '2026-03-11',
            source: 'AGENT',
            aiSessionCompositeKey:
              'TTMP-1|dev@tasktime.ru|gpt-5.4|openai|2026-03-10T10:00:00.000Z',
          },
        ],
      },
      target: {
        projects: [{ key: 'TTMP', name: 'Flow Universe MVP', description: 'Old local copy' }],
        users: [
          { email: 'manager@tasktime.ru', name: 'Manager', role: 'MANAGER', isActive: true },
          { email: 'dev@tasktime.ru', name: 'Developer', role: 'USER', isActive: true },
          { email: 'viewer@tasktime.ru', name: 'Viewer', role: 'VIEWER', isActive: true },
        ],
        sprints: [
          {
            projectKey: 'TTMP',
            name: 'Sprint A',
            goal: 'Stable sprint goal',
            state: 'ACTIVE',
            startDate: '2026-03-10T09:00:00.000Z',
            endDate: '2026-03-11T18:00:00.000Z',
          },
          {
            projectKey: 'DEMO',
            name: 'Foreign Sprint',
            goal: null,
            state: 'PLANNED',
            startDate: null,
            endDate: null,
          },
        ],
        issues: [
          {
            projectKey: 'TTMP',
            number: 1,
            title: 'Old title in dev',
            description: 'Old local copy',
            type: 'TASK',
            status: 'OPEN',
            priority: 'HIGH',
            orderIndex: 10,
            aiEligible: true,
            aiExecutionStatus: 'NOT_STARTED',
            aiAssigneeType: 'AGENT',
            sprintName: 'Sprint A',
            creatorEmail: 'manager@tasktime.ru',
            assigneeEmail: 'dev@tasktime.ru',
            parentNumber: null,
            estimatedHours: '4.50',
          },
          {
            projectKey: 'DEMO',
            number: 99,
            title: 'Keep demo issue',
            description: null,
            type: 'TASK',
            status: 'OPEN',
            priority: 'LOW',
            orderIndex: 1,
            aiEligible: false,
            aiExecutionStatus: 'NOT_STARTED',
            aiAssigneeType: 'HUMAN',
            sprintName: null,
            creatorEmail: 'manager@tasktime.ru',
            assigneeEmail: null,
            parentNumber: null,
            estimatedHours: null,
          },
        ],
        aiSessions: [
          {
            issueNumber: 1,
            userEmail: 'dev@tasktime.ru',
            model: 'gpt-4.1',
            provider: 'openai',
            startedAt: '2026-03-09T10:00:00.000Z',
            finishedAt: '2026-03-09T10:30:00.000Z',
            tokensInput: 800,
            tokensOutput: 300,
            costMoney: '0.1000',
            notes: 'Stale TTMP session',
          },
          {
            issueNumber: 99,
            userEmail: 'viewer@tasktime.ru',
            model: 'ignore',
            provider: 'ignore',
            startedAt: '2026-03-09T10:00:00.000Z',
            finishedAt: '2026-03-09T10:30:00.000Z',
            tokensInput: 1,
            tokensOutput: 1,
            costMoney: '0.0001',
            notes: 'Foreign project session',
          },
        ],
        timeLogs: [
          {
            issueNumber: 1,
            userEmail: 'dev@tasktime.ru',
            hours: '3.00',
            note: 'Stale TTMP log',
            startedAt: '2026-03-09T10:00:00.000Z',
            stoppedAt: '2026-03-09T13:00:00.000Z',
            logDate: '2026-03-09',
            source: 'HUMAN',
            aiSessionCompositeKey: null,
          },
          {
            issueNumber: 99,
            userEmail: 'viewer@tasktime.ru',
            hours: '1.00',
            note: 'Foreign project log',
            startedAt: null,
            stoppedAt: null,
            logDate: '2026-03-09',
            source: 'HUMAN',
            aiSessionCompositeKey: null,
          },
        ],
      },
    });

    expect(plan.projects).toEqual([{ action: 'update', key: 'TTMP' }]);
    expect(plan.users).toEqual([
      { action: 'skip', email: 'dev@tasktime.ru' },
      { action: 'skip', email: 'manager@tasktime.ru' },
      { action: 'create', email: 'new@tasktime.ru' },
    ]);
    expect(plan.sprints).toEqual([
      { action: 'skip', key: 'TTMP::Sprint A' },
      { action: 'create', key: 'TTMP::Sprint B' },
    ]);
    expect(plan.issues).toEqual([
      { action: 'update', key: 'TTMP-1' },
      { action: 'create', key: 'TTMP-2' },
    ]);
    expect(plan.aiSessions).toEqual({
      strategy: 'replace',
      scope: 'TTMP',
      delete: ['TTMP-1|dev@tasktime.ru|gpt-4.1|openai|2026-03-09T10:00:00.000Z'],
      create: ['TTMP-1|dev@tasktime.ru|gpt-5.4|openai|2026-03-10T10:00:00.000Z'],
    });
    expect(plan.timeLogs).toEqual({
      strategy: 'replace',
      scope: 'TTMP',
      delete: ['TTMP-1|dev@tasktime.ru|HUMAN|2026-03-09|3.00|'],
      create: [
        'TTMP-1|dev@tasktime.ru|HUMAN|2026-03-10|1.50|',
        'TTMP-2|new@tasktime.ru|AGENT|2026-03-11|0.75|TTMP-1|dev@tasktime.ru|gpt-5.4|openai|2026-03-10T10:00:00.000Z',
      ],
    });
    expect(plan.summary).toEqual({
      create: 3,
      update: 2,
      skip: 3,
      replaceDelete: 2,
      replaceCreate: 3,
    });
  });
});

describe('prod sync cli helpers', () => {
  it('supports dry-run and protects the required connection variables', () => {
    expect(parseProdSyncArgs(['--dry-run'])).toEqual({ dryRun: true });
    expect(parseProdSyncArgs([])).toEqual({ dryRun: false });
    expect(() => parseProdSyncArgs(['--nope'])).toThrow('Unknown prod sync argument: --nope');

    expect(
      resolveProdSyncUrls({
        SOURCE_DATABASE_URL: 'postgresql://readonly-user@prod-host:5432/tasktime?schema=public',
        DATABASE_URL: 'postgresql://tasktime@localhost:5432/tasktime_dev?schema=public',
      }),
    ).toEqual({
      sourceDatabaseUrl: 'postgresql://readonly-user@prod-host:5432/tasktime?schema=public',
      targetDatabaseUrl: 'postgresql://tasktime@localhost:5432/tasktime_dev?schema=public',
    });

    expect(() =>
      resolveProdSyncUrls({
        DATABASE_URL: 'postgresql://tasktime@localhost:5432/tasktime_dev?schema=public',
      }),
    ).toThrow('SOURCE_DATABASE_URL is required for prod-to-dev sync');

    expect(() =>
      resolveProdSyncUrls({
        SOURCE_DATABASE_URL: 'postgresql://same-host:5432/tasktime?schema=public',
        DATABASE_URL: 'postgresql://same-host:5432/tasktime?schema=public',
      }),
    ).toThrow('SOURCE_DATABASE_URL must not match DATABASE_URL');

    expect(() =>
      resolveProdSyncUrls({
        SOURCE_DATABASE_URL: 'postgresql://readonly-user@prod-db.internal:5432/tasktime?schema=public',
        DATABASE_URL: 'postgresql://tasktime@prod-db.internal:5432/tasktime_dev?schema=public',
      }),
    ).toThrow('SOURCE_DATABASE_URL and DATABASE_URL must not point to the same database host');

    expect(() =>
      resolveProdSyncUrls({
        SOURCE_DATABASE_URL: 'postgresql://readonly-user@prod-db.internal:5432/tasktime?schema=public',
        DATABASE_URL: 'postgresql://tasktime@prod-db.internal:5433/tasktime_dev?schema=public',
      }),
    ).toThrow('SOURCE_DATABASE_URL and DATABASE_URL must not point to the same database host');
  });
});

describe('prod sync implementation safeguards', () => {
  it('keeps target writes transactional and avoids importing production password hashes', async () => {
    const prodSyncSource = await readFile(prodSyncSourcePath, 'utf8');

    expect(prodSyncSource).toContain('await targetPrisma.$transaction(async (tx) =>');
    expect(prodSyncSource).not.toContain('passwordHash: user.passwordHash');
    expect(prodSyncSource).not.toContain('passwordHash: user.passwordHash ??');
    expect(prodSyncSource).toContain('hashPassword(');
  });

  it('does not rebuild target issue context inside the issue upsert loop', async () => {
    const prodSyncSource = await readFile(prodSyncSourcePath, 'utf8');

    expect(prodSyncSource).not.toContain(
      "for (const issue of sourceIssues) {\n    const context = await buildTargetContext(targetPrisma, projectId);",
    );
  });
});

describe('prod sync public wiring', () => {
  it('exposes a real sync command and documents the source database URL in staging examples', async () => {
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const dotEnvStaging = await readFile(dotEnvStagingPath, 'utf8');
    const backendStagingEnv = await readFile(backendStagingEnvPath, 'utf8');

    expect(packageJson.scripts?.['db:sync:prod-to-dev']).toBe('tsx src/prisma/prod-sync.ts');
    expect(dotEnvStaging).toContain('SOURCE_DATABASE_URL=');
    expect(dotEnvStaging).toContain('read-only production/staging source');
    expect(backendStagingEnv).toContain('SOURCE_DATABASE_URL=');
    expect(backendStagingEnv).toContain('required by db:sync:prod-to-dev');
  });
});
