/**
 * TTBULK-1 PR-13 — Prometheus metrics endpoint для массовых операций.
 *
 * Mount'ится отдельно от основного `bulk-operations.router` потому что
 * тот requires `BULK_OPERATOR` role для всех путей; /metrics должен быть
 * доступен ADMIN/SUPER_ADMIN (monitoring/scrapers).
 *
 * Endpoint: `GET /api/bulk-operations/metrics`.
 * Response: Prometheus text-format (content-type с `version=0.0.4`).
 *
 * RBAC: requireRole('ADMIN', 'SUPER_ADMIN'). Scrapers должны ходить с
 * service-account JWT (ADMIN); unauthenticated доступ — 401.
 *
 * См. docs/tz/TTBULK-1.md §12, §13.8 PR-13.
 */

import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireRole } from '../../shared/middleware/rbac.js';
import { asyncHandler } from '../../shared/utils/async-handler.js';
import { renderMetrics, METRICS_CONTENT_TYPE } from './bulk-metrics.js';

const router = Router();

router.use(authenticate);

router.get(
  '/bulk-operations/metrics',
  requireRole('ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (_req, res) => {
    const text = await renderMetrics();
    res.setHeader('Content-Type', METRICS_CONTENT_TYPE);
    res.send(text);
  }),
);

export default router;
