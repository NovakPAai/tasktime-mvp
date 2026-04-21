import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import { validate } from '../../shared/middleware/validate.js';
import { logAudit } from '../../shared/middleware/audit.js';
import { manualTimeDto } from './time.dto.js';
import * as timeService from './time.service.js';
import { asyncHandler, authHandler } from '../../shared/utils/async-handler.js';

const router = Router();
router.use(authenticate);

// Start timer
router.post('/issues/:issueId/time/start', authHandler(async (req, res) => {
  const log = await timeService.startTimer(req.params.issueId as string, req.user!.userId);
  res.status(201).json(log);
}));

// Stop timer
router.post('/issues/:issueId/time/stop', authHandler(async (req, res) => {
  const log = await timeService.stopTimer(req.params.issueId as string, req.user!.userId);
  res.json(log);
}));

// Manual time log
router.post('/issues/:issueId/time', validate(manualTimeDto), authHandler(async (req, res) => {
  const log = await timeService.logManual(req.params.issueId as string, req.user!.userId, req.body);
  res.status(201).json(log);
}));

// Time logs for issue
router.get('/issues/:issueId/time', asyncHandler(async (req, res) => {
  const logs = await timeService.getIssueLogs(req.params.issueId as string);
  res.json(logs);
}));

// Time logs for user
router.get('/users/:userId/time', asyncHandler(async (req, res) => {
  const logs = await timeService.getUserLogs(req.params.userId as string);
  res.json(logs);
}));

// Time summary for user
router.get('/users/:userId/time/summary', authHandler(async (req, res) => {
  const requester = req.user!;
  const targetUserId = req.params.userId as string;
  const canReadOtherUsers =
    requester.systemRoles.includes('ADMIN') || requester.systemRoles.includes('SUPER_ADMIN');

  if (targetUserId !== requester.userId && !canReadOtherUsers) {
    throw new AppError(403, 'Insufficient permissions');
  }

  const summary = await timeService.getUserTimeSummary(targetUserId);
  res.json(summary);
}));

// Active timer for current user
router.get('/time/active', authHandler(async (req, res) => {
  const timer = await timeService.getActiveTimer(req.user!.userId);
  res.json(timer);
}));

// TTSEC-2: DELETE time log (owner OR TIME_LOGS_DELETE_OTHERS OR TIME_LOGS_MANAGE)
router.delete('/time-logs/:id', authHandler(async (req, res) => {
  await timeService.deleteTimeLog(req.params.id as string, req.user!);
  await logAudit(req, 'time_log.deleted', 'time_log', req.params.id as string);
  res.status(204).send();
}));

export default router;
