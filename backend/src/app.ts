import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';

import { errorHandler } from './shared/middleware/error-handler.js';
import { metricsMiddleware } from './shared/middleware/metrics.js';
import { getReadinessStatus } from './shared/health.js';
import { features } from './shared/features.js';
import { swaggerSpec } from './shared/openapi.js';
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
import projectCategoriesRouter from './modules/project-categories/project-categories.router.js';
import monitoringRouter from './modules/monitoring/monitoring.router.js';

export function createApp() {
  const app = express();

  // Global middleware
  app.use(helmet());
  app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173', credentials: true }));
  app.use(metricsMiddleware);
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

  // Feature flags endpoint — фронт и агенты читают что включено
  app.get('/api/features', (_req, res) => {
    res.json(features);
  });

  // OpenAPI JSON must be registered before the swagger UI middleware
  app.get('/api/docs/json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.json(swaggerSpec);
  });
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  // Core routes (always enabled)
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api/project-categories', projectCategoriesRouter);
  // Issues router has mixed paths: /api/projects/:projectId/issues and /api/issues/:id
  app.use('/api', issuesRouter);
  app.use('/api', boardsRouter);
  app.use('/api', sprintsRouter);
  app.use('/api', releasesRouter);
  app.use('/api', commentsRouter);
  app.use('/api', timeRouter);
  app.use('/api', teamsRouter);
  app.use('/api', adminRouter);

  // AI routes (feature-gated)
  if (features.ai) {
    app.use('/api', aiSessionsRouter);
    app.use('/api', aiRouter);
  }

  // GitLab webhook (feature-gated)
  if (features.gitlab) {
    app.use('/api', webhooksRouter);
  }

  app.use('/api', linksRouter);
  app.use('/api/monitoring', monitoringRouter);

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}
