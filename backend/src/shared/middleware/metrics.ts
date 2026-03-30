import { Request, Response, NextFunction } from 'express';
import { monitoringService } from '../../modules/monitoring/monitoring.service.js';

// Endpoints to skip metrics recording
const SKIP_PATHS = [
  '/api/health',
  '/api/ready',
  '/api/monitoring',
];

export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  // Skip if metrics are disabled
  if (process.env.METRICS_ENABLED === 'false') {
    return next();
  }

  // Skip certain paths
  if (SKIP_PATHS.some((path) => req.path.startsWith(path))) {
    return next();
  }

  const startTime = Date.now();

  // Intercept response.send to capture end time
  const originalSend = res.send.bind(res);
  res.send = function (data: any) {
    const duration = Date.now() - startTime;
    const endpoint = req.path;
    const method = req.method;
    const statusCode = res.statusCode;

    // Record metric
    monitoringService.recordMetric(endpoint, method, statusCode, duration);

    // Call original send
    return originalSend(data);
  };

  next();
}
