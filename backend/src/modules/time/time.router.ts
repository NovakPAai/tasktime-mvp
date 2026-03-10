import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { validate } from '../../shared/middleware/validate.js';
import { manualTimeDto } from './time.dto.js';
import * as timeService from './time.service.js';
import type { AuthRequest } from '../../shared/types/index.js';

const router = Router();
router.use(authenticate);

// Start timer
router.post('/issues/:issueId/time/start', async (req: AuthRequest, res, next) => {
  try {
    const log = await timeService.startTimer(req.params.issueId as string, req.user!.userId);
    res.status(201).json(log);
  } catch (err) { next(err); }
});

// Stop timer
router.post('/issues/:issueId/time/stop', async (req: AuthRequest, res, next) => {
  try {
    const log = await timeService.stopTimer(req.params.issueId as string, req.user!.userId);
    res.json(log);
  } catch (err) { next(err); }
});

// Manual time log
router.post('/issues/:issueId/time', validate(manualTimeDto), async (req: AuthRequest, res, next) => {
  try {
    const log = await timeService.logManual(req.params.issueId as string, req.user!.userId, req.body);
    res.status(201).json(log);
  } catch (err) { next(err); }
});

// Time logs for issue
router.get('/issues/:issueId/time', async (req, res, next) => {
  try {
    const logs = await timeService.getIssueLogs(req.params.issueId as string);
    res.json(logs);
  } catch (err) { next(err); }
});

// Time logs for user
router.get('/users/:userId/time', async (req, res, next) => {
  try {
    const logs = await timeService.getUserLogs(req.params.userId as string);
    res.json(logs);
  } catch (err) { next(err); }
});

// Active timer for current user
router.get('/time/active', async (req: AuthRequest, res, next) => {
  try {
    const timer = await timeService.getActiveTimer(req.user!.userId);
    res.json(timer);
  } catch (err) { next(err); }
});

export default router;
