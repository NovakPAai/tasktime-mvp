import { prisma } from '../prisma/client.js';
import { isRedisReady } from './redis.js';

type DependencyStatus = 'up' | 'down' | 'disabled';

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
    await prisma.$queryRaw`SELECT 1`;
    return 'up';
  } catch {
    return 'down';
  }
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
