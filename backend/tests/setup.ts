import { execSync } from 'node:child_process';
import { beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

import { assertSafeTestDatabaseUrl } from './test-database.js';

const prisma = new PrismaClient();

function getDatabaseName(databaseUrl: string): string {
  return new URL(databaseUrl).pathname.split('/').filter(Boolean).at(-1) ?? '';
}

function buildAdminDatabaseUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  url.pathname = '/postgres';
  url.searchParams.set('schema', 'public');
  return url.toString();
}

async function ensureTestDatabaseExists(databaseUrl: string): Promise<void> {
  const adminPrisma = new PrismaClient({
    datasources: {
      db: {
        url: buildAdminDatabaseUrl(databaseUrl),
      },
    },
  });

  const databaseName = getDatabaseName(databaseUrl);
  const existing = await adminPrisma.$queryRaw<Array<{ datname: string }>>`
    SELECT datname
    FROM pg_database
    WHERE datname = ${databaseName}
  `;

  if (existing.length === 0) {
    const escapedDatabaseName = databaseName.replace(/"/g, '""');
    await adminPrisma.$executeRawUnsafe(`CREATE DATABASE "${escapedDatabaseName}"`);
  }

  await adminPrisma.$disconnect();
}

beforeAll(async () => {
  if (process.env.SKIP_DB_SETUP === '1') {
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for tests');
  }

  assertSafeTestDatabaseUrl(databaseUrl);
  await ensureTestDatabaseExists(databaseUrl);

  execSync('npx prisma migrate deploy', {
    env: process.env,
    stdio: 'pipe',
  });

  // Clean test database (respect foreign keys)
  await prisma.auditLog.deleteMany();
  await prisma.timeLog.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.issue.deleteMany();
  await prisma.sprint.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.team.deleteMany();
  await prisma.project.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});
