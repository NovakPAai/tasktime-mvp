import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';

import { errorHandler } from './shared/middleware/error-handler.js';
import { getReadinessStatus } from './shared/health.js';
import authRouter from './modules/auth/auth.router.js';
import usersRouter from './modules/users/users.router.js';
import projectsRouter from './modules/projects/projects.router.js';
import issuesRouter from './modules/issues/issues.router.js';
import boardsRouter from './modules/boards/boards.router.js';
import sprintsRouter from './modules/sprints/sprints.router.js';
import releasesRouter from './modules/releases/releases.router.js';
import commentsRouter from './modules/comments/comments.router.js';
import timeRouter from './modules/time/time.router.js';
import teamsRouter from './modules/teams/teams.router.js';
import adminRouter from './modules/admin/admin.router.js';
import aiSessionsRouter from './modules/ai/ai-sessions.router.js';
import aiRouter from './modules/ai/ai.router.js';
import webhooksRouter from './modules/webhooks/webhooks.router.js';
import linksRouter from './modules/links/links.router.js';

export function createApp() {
  const app = express();

  // Global middleware
  app.use(helmet());
  app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173', credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/api/ready', async (_req, res) => {
    const readiness = await getReadinessStatus();
    res.status(readiness.status === 'ok' ? 200 : 503).json(readiness);
  });

  // Routes
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/projects', projectsRouter);
  // Issues router has mixed paths: /api/projects/:projectId/issues and /api/issues/:id
  app.use('/api', issuesRouter);
  app.use('/api', boardsRouter);
  app.use('/api', sprintsRouter);
  app.use('/api', releasesRouter);
  app.use('/api', commentsRouter);
  app.use('/api', timeRouter);
  app.use('/api', teamsRouter);
  app.use('/api', adminRouter);
  app.use('/api', aiSessionsRouter);
  app.use('/api', aiRouter);
  app.use('/api', webhooksRouter);
  app.use('/api', linksRouter);

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}
