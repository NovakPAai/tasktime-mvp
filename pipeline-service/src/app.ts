import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { errorHandler } from './shared/middleware/error-handler.js';
import healthRouter from './modules/health/health.router.js';
import { pipelinesRouter } from './modules/pipelines/pipelines.router.js';
import { batchesRouter } from './modules/batches/batches.router.js';
import { githubRouter } from './modules/github/github.router.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  // Health (no auth required)
  app.use(healthRouter);

  // Pipeline API (API key required)
  app.use('/api/pipelines', pipelinesRouter);
  app.use('/api/batches', batchesRouter);
  app.use('/api/github', githubRouter);

  app.use(errorHandler);

  return app;
}
