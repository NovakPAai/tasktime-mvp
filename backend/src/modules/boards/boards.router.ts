import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { validate } from '../../shared/middleware/validate.js';
import * as boardsService from './boards.service.js';
import { reorderBoardDto } from './boards.dto.js';
import { asyncHandler, authHandler } from '../../shared/utils/async-handler.js';

const router = Router();
router.use(authenticate);

// GET /api/projects/:projectId/board?sprintId=...
router.get('/projects/:projectId/board', asyncHandler(async (req, res) => {
  const board = await boardsService.getBoard(
    req.params.projectId as string,
    req.query.sprintId as string | undefined
  );
  res.json(board);
}));

// PATCH /api/projects/:projectId/board/reorder
router.patch('/projects/:projectId/board/reorder', validate(reorderBoardDto), authHandler(async (req, res) => {
  await boardsService.reorderIssues(req.body.updates);
  res.json({ ok: true });
}));

export default router;
