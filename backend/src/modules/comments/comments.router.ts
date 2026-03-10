import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { validate } from '../../shared/middleware/validate.js';
import { createCommentDto, updateCommentDto } from './comments.dto.js';
import * as commentsService from './comments.service.js';
import { logAudit } from '../../shared/middleware/audit.js';
import type { AuthRequest } from '../../shared/types/index.js';

const router = Router();
router.use(authenticate);

router.get('/issues/:issueId/comments', async (req, res, next) => {
  try {
    const comments = await commentsService.listComments(req.params.issueId as string);
    res.json(comments);
  } catch (err) { next(err); }
});

router.post('/issues/:issueId/comments', validate(createCommentDto), async (req: AuthRequest, res, next) => {
  try {
    const comment = await commentsService.createComment(req.params.issueId as string, req.user!.userId, req.body);
    await logAudit(req, 'comment.created', 'comment', comment.id, { issueId: req.params.issueId });
    res.status(201).json(comment);
  } catch (err) { next(err); }
});

router.patch('/comments/:id', validate(updateCommentDto), async (req: AuthRequest, res, next) => {
  try {
    const comment = await commentsService.updateComment(req.params.id as string, req.user!.userId, req.user!.role, req.body);
    res.json(comment);
  } catch (err) { next(err); }
});

router.delete('/comments/:id', async (req: AuthRequest, res, next) => {
  try {
    await commentsService.deleteComment(req.params.id as string, req.user!.userId, req.user!.role);
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
