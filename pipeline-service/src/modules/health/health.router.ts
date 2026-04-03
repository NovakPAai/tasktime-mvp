import { Router } from 'express';
import { prisma } from '../../prisma/client.js';
import { isRedisReady } from '../../shared/redis.js';

const router = Router();

router.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'pipeline',
    timestamp: new Date().toISOString(),
    version: process.env.GIT_SHA || 'dev',
    buildTime: process.env.BUILD_TIME || 'unknown',
  });
});

router.get('/api/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const redisOk = await isRedisReady();

    res.json({
      status: 'ok',
      db: true,
      redis: redisOk,
    });
  } catch (err) {
    res.status(503).json({
      status: 'error',
      db: false,
      redis: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
});

export default router;
