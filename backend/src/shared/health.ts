import { Prisma } from '@prisma/client';

import { prisma } from '../prisma/client.js';
import { isRedisReady } from './redis.js';

type DependencyStatus = 'up' | 'down' | 'disabled';

export const REQUIRED_TABLES = ['users', 'refresh_tokens', 'projects', 'issues'] as const;

export type ReadinessStatus = {
  status: 'ok' | 'error';
  timestamp: string;
  checks: {
    database: DependencyStatus;
    redis: DependencyStatus;
  };
};

async function checkDatabase(): Promise<DependencyStatus> {
  try {
    const rows = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (${Prisma.join(REQUIRED_TABLES)})
    `;

    return getDatabaseStatusFromTableNames(rows.map((row) => row.table_name));
  } catch {
    return 'down';
  }
}

export function getDatabaseStatusFromTableNames(tableNames: readonly string[]): DependencyStatus {
  const availableTables = new Set(tableNames);
  const hasAllRequiredTables = REQUIRED_TABLES.every((tableName) => availableTables.has(tableName));
  return hasAllRequiredTables ? 'up' : 'down';
}

async function checkRedis(): Promise<DependencyStatus> {
  if (!process.env.REDIS_URL) {
    return 'disabled';
  }

  const redisReady = await isRedisReady();
  return redisReady ? 'up' : 'down';
}

export async function getReadinessStatus(): Promise<ReadinessStatus> {
  const [database, redis] = await Promise.all([checkDatabase(), checkRedis()]);
  const status = database === 'up' && redis !== 'down' ? 'ok' : 'error';

  return {
    status,
    timestamp: new Date().toISOString(),
    checks: {
      database,
      redis,
    },
  };
}
