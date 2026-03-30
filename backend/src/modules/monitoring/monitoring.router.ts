import express from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import type { AuthRequest } from '../../shared/types/index.js';
import { requireRole } from '../../shared/middleware/rbac.js';
import { monitoringService } from './monitoring.service.js';

const router = express.Router();

// GET /api/monitoring/metrics - System overview (p95, error rate, slow endpoints)
router.get('/metrics', authenticate, requireRole('ADMIN', 'MANAGER'), (_req, res) => {
  const status = monitoringService.getSystemStatus();
  res.json(status);
});

// GET /api/monitoring/endpoints - Detailed metrics by endpoint
router.get('/endpoints', authenticate, requireRole('ADMIN', 'MANAGER'), (req, res) => {
  const minutes = req.query.minutes ? parseInt(req.query.minutes as string) : 10;
  const metrics = monitoringService.getMetrics(minutes);
  res.json({
    minutes,
    count: metrics.length,
    endpoints: metrics,
  });
});

// DELETE /api/monitoring/metrics - Clear metrics (admin only)
router.delete('/metrics', authenticate, requireRole('ADMIN'), (_req, res) => {
  monitoringService.clearMetrics();
  res.json({ success: true, message: 'Metrics cleared' });
});

// POST /api/monitoring/page-metrics - Frontend Web Vitals upload
router.post('/page-metrics', authenticate, (req, res) => {
  // Just accept for now, can store in Redis later if needed
  const { url, metrics } = req.body as { url: string; metrics: unknown };
  const authReq = req as AuthRequest;
  // eslint-disable-next-line no-console
  console.log(`[Web Vitals] ${authReq.user?.email ?? 'unknown'} - ${url}`, metrics);
  res.json({ success: true });
});

export default router;
