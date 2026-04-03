import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { validate } from '../../shared/middleware/validate.js';
import { ExecuteTransitionDto } from './workflow-engine.dto.js';
import { getAvailableTransitions, executeTransition } from './workflow-engine.service.js';
import type { AuthRequest } from '../../shared/types/index.js';

const router = Router();

router.use(authenticate);

// GET /api/issues/:id/transitions
router.get('/issues/:id/transitions', async (req: AuthRequest, res, next) => {
  try {
    const result = await getAvailableTransitions(
      req.params['id'] as string,
      req.user!.userId,
      req.user!.role,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/issues/:id/transitions
router.post('/issues/:id/transitions', validate(ExecuteTransitionDto), async (req: AuthRequest, res, next) => {
  try {
    const dto = req.body as ExecuteTransitionDto;
    const issue = await executeTransition(
      req.params['id'] as string,
      dto.transitionId,
      req.user!.userId,
      req.user!.role,
      dto.screenFieldValues,
    );
    res.json(issue);
  } catch (err) {
    next(err);
  }
});

export default router;
