import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import * as boardsService from './boards.service.js';
import type { AuthRequest } from '../../shared/types/index.js';

const router = Router();
router.use(authenticate);

// GET /api/projects/:projectId/board?sprintId=...
router.get('/projects/:projectId/board', async (req, res, next) => {
  try {
    const board = await boardsService.getBoard(
      req.params.projectId as string,
      req.query.sprintId as string | undefined
    );
    res.json(board);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/projects/:projectId/board/reorder
router.patch('/projects/:projectId/board/reorder', async (req: AuthRequest, res, next) => {
  try {
    await boardsService.reorderIssues(req.body.updates);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
