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
import issueTypeConfigsRouter from './modules/issue-type-configs/issue-type-configs.router.js';
import issueTypeSchemesRouter from './modules/issue-type-schemes/issue-type-schemes.router.js';
import customFieldsRouter from './modules/custom-fields/custom-fields.router.js';
import { adminRouter as fieldSchemasAdminRouter, projectFieldSchemasRouter } from './modules/field-schemas/field-schemas.router.js';
import issueCustomFieldsRouter from './modules/issue-custom-fields/issue-custom-fields.router.js';
import workflowStatusesRouter from './modules/workflows/workflow-statuses.router.js';
import workflowsRouter from './modules/workflows/workflows.router.js';
import workflowSchemesRouter from './modules/workflow-schemes/workflow-schemes.router.js';
import transitionScreensRouter from './modules/transition-screens/transition-screens.router.js';
import workflowEngineRouter from './modules/workflow-engine/workflow-engine.router.js';
import releaseStatusesRouter from './modules/releases/release-statuses.router.js';
import releaseWorkflowsAdminRouter from './modules/releases/release-workflows-admin.router.js';
import checkpointTypesRouter from './modules/releases/checkpoints/checkpoint-types.router.js';
import checkpointTemplatesRouter from './modules/releases/checkpoints/checkpoint-templates.router.js';
import releaseCheckpointsRouter, {
  syncRouter as checkpointTypesSyncRouter,
} from './modules/releases/checkpoints/release-checkpoints.router.js';
import checkpointAuditRouter from './modules/releases/checkpoints/audit.router.js';
import burndownRouter from './modules/releases/checkpoints/burndown.router.js';
import searchRouter from './modules/search/search.router.js';
import savedFiltersRouter from './modules/saved-filters/saved-filters.router.js';
import bulkOperationsRouter from './modules/bulk-operations/bulk-operations.router.js';
import roleSchemesRouter from './modules/project-role-schemes/project-role-schemes.router.js';
import userGroupsRouter from './modules/user-groups/user-groups.router.js';
import userSecurityRouter from './modules/user-security/user-security.router.js';
import { getSchemeForProject } from './modules/workflow-schemes/workflow-schemes.service.js';
import { getSchemeForProject as getRoleSchemeForProject } from './modules/project-role-schemes/project-role-schemes.service.js';
import { authenticate } from './shared/middleware/auth.js';
import { requireRole, requireProjectPermission } from './shared/middleware/rbac.js';
import { checkpointContextMiddleware } from './shared/middleware/request-context.js';
// Side-effect import: registers the checkpoint flush callback with request-context.
import './modules/releases/checkpoints/checkpoint-triggers.service.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);

  // Global middleware
  app.use(helmet());
  // CVE-15: explicit CORS origin (no wildcard)
  const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
  app.use(cors({ origin: corsOrigin.split(',').map((o) => o.trim()), credentials: true }));
  // TTMP-160 PR-4: AsyncLocalStorage context for checkpoint recompute coalescing.
  // Must wrap all route handlers — and any middleware that forks the async context — so
  // event hooks deep in services see the per-request set. Placed ahead of metrics /
  // express.json / cookieParser to be defensive against any future middleware that awaits.
  app.use(checkpointContextMiddleware);
  app.use(metricsMiddleware);
  app.use(express.json());
  // CVE-14: signed cookies
  app.use(cookieParser(process.env.COOKIE_SECRET || undefined));

  // Health check — includes version for deploy verification
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.GIT_SHA || 'dev',
      buildTime: process.env.BUILD_TIME || 'unknown',
    });
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
  // CVE-09: In production, require ADMIN role to access Swagger
  if (process.env.NODE_ENV === 'production') {
    app.get('/api/docs/json', authenticate, requireRole('ADMIN'), (_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.json(swaggerSpec);
    });
    app.use('/api/docs', authenticate, requireRole('ADMIN'), swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  } else {
    app.get('/api/docs/json', (_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.json(swaggerSpec);
    });
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  }

  // GitLab webhook — must be first among /api routes to bypass JWT auth
  // (uses its own X-Gitlab-Token secret mechanism, not JWT)
  if (features.gitlab) {
    app.use('/api', webhooksRouter);
  }

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

  app.use('/api', linksRouter);
  app.use('/api', issueTypeConfigsRouter);
  app.use('/api', issueTypeSchemesRouter);
  app.use('/api/admin/custom-fields', customFieldsRouter);
  app.use('/api/admin/field-schemas', fieldSchemasAdminRouter);
  app.use('/api', issueCustomFieldsRouter);
  app.use('/api/projects/:projectId/field-schemas', projectFieldSchemasRouter);
  app.use('/api/monitoring', monitoringRouter);

  // Workflow Engine
  app.use('/api/admin/workflow-statuses', workflowStatusesRouter);
  app.use('/api/admin/workflows', workflowsRouter);
  app.use('/api/admin/workflow-schemes', workflowSchemesRouter);
  app.use('/api/admin/transition-screens', transitionScreensRouter);
  app.use('/api/admin/release-statuses', releaseStatusesRouter);
  app.use('/api/admin/release-workflows', releaseWorkflowsAdminRouter);
  app.use('/api/admin/checkpoint-types', checkpointTypesRouter);
  app.use('/api/admin/checkpoint-templates', checkpointTemplatesRouter);
  // release-scoped and issue-scoped checkpoint routes share /api prefix (paths include the
  // resource id). The sync-instances subrouter stays under /api/admin/checkpoint-types so
  // the system-role gate is isolated from the RELEASES_EDIT project-permission gate.
  app.use('/api', releaseCheckpointsRouter);
  app.use('/api', burndownRouter);
  app.use('/api/admin/checkpoint-types', checkpointTypesSyncRouter);
  app.use('/api/admin/checkpoint-audit', checkpointAuditRouter);
  app.use('/api/admin/role-schemes', roleSchemesRouter);
  app.use('/api/admin/user-groups', userGroupsRouter);
  app.use('/api', userSecurityRouter);
  app.use('/api', workflowEngineRouter);

  // TTSRH-1 PR-1: TTS-QL search + saved filters — mounted only under feature flag.
  // When disabled, requests to /api/search/* and /api/saved-filters/* fall through to the
  // 404 handler (Express default), which is what we want for not-yet-cutover features.
  // See docs/tz/TTSRH-1.md §13.1.
  if (features.advancedSearch) {
    app.use('/api', searchRouter);
    app.use('/api', savedFiltersRouter);
  }

  // TTBULK-1 PR-1: массовые операции над issue'ами. Роутер монтируется только
  // под feature-флагом до PR-12 (UAT cutover). При выключенном флаге /api/bulk-operations/*
  // проваливается на дефолтный 404 Express'а. См. docs/tz/TTBULK-1.md §13.1.
  if (features.bulkOps) {
    app.use('/api', bulkOperationsRouter);
  }

  // Public: project workflow scheme
  app.get('/api/projects/:projectId/workflow-scheme', authenticate, async (req, res, next) => {
    try {
      res.json(await getSchemeForProject(req.params.projectId as string));
    } catch (err) {
      next(err);
    }
  });

  // Project role scheme — strictly scoped to project members. Global project-read system roles
  // (ADMIN/RELEASE_MANAGER/AUDITOR) do NOT bypass this check — role/permission matrices are
  // considered per-project configuration. SUPER_ADMIN still passes through unconditionally.
  app.get(
    '/api/projects/:projectId/role-scheme',
    authenticate,
    requireProjectPermission((req) => req.params.projectId as string, 'MEMBERS_VIEW', { allowGlobalRead: false }),
    async (req, res, next) => {
      try {
        res.json(await getRoleSchemeForProject(req.params.projectId as string));
      } catch (err) {
        next(err);
      }
    },
  );

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}
