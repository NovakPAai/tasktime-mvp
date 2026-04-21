import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { validate } from '../../shared/middleware/validate.js';
import { ExecuteTransitionDto } from './workflow-engine.dto.js';
import { getAvailableTransitions, executeTransition, getBatchTransitions } from './workflow-engine.service.js';
import { authHandler } from '../../shared/utils/async-handler.js';

const router = Router();

router.use(authenticate);

// GET /api/issues/:id/transitions
router.get('/issues/:id/transitions', authHandler(async (req, res) => {
  const result = await getAvailableTransitions(
    req.params['id'] as string,
    req.user!.userId,
    req.user!.systemRoles,
  );
  res.json(result);
}));

// POST /api/issues/:id/transitions
router.post('/issues/:id/transitions', validate(ExecuteTransitionDto), authHandler(async (req, res) => {
  const dto = req.body as ExecuteTransitionDto;
  const issue = await executeTransition(
    req.params['id'] as string,
    dto.transitionId,
    req.user!.userId,
    req.user!.systemRoles,
    dto.screenFieldValues,
  );
  res.json(issue);
}));

// POST /api/issues/batch-transitions — get transitions for multiple issues at once
router.post('/issues/batch-transitions', authHandler(async (req, res) => {
  const { issueIds } = req.body as { issueIds: string[] };
  if (!Array.isArray(issueIds) || issueIds.length === 0) {
    res.status(400).json({ error: 'issueIds must be a non-empty array' });
    return;
  }
  const result = await getBatchTransitions(issueIds, req.user!.userId, req.user!.systemRoles);
  res.json(result);
}));

export default router;
