import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { validate } from '../../shared/middleware/validate.js';
import { createCommentDto, updateCommentDto } from './comments.dto.js';
import * as commentsService from './comments.service.js';
import { logAudit } from '../../shared/middleware/audit.js';
import { asyncHandler, authHandler } from '../../shared/utils/async-handler.js';

const router = Router();
router.use(authenticate);

router.get('/issues/:issueId/comments', asyncHandler(async (req, res) => {
  const comments = await commentsService.listComments(req.params.issueId as string);
  res.json(comments);
}));

router.post('/issues/:issueId/comments', validate(createCommentDto), authHandler(async (req, res) => {
  const comment = await commentsService.createComment(req.params.issueId as string, req.user!.userId, req.body);
  await logAudit(req, 'comment.created', 'comment', comment.id, { issueId: req.params.issueId });
  res.status(201).json(comment);
}));

router.patch('/comments/:id', validate(updateCommentDto), authHandler(async (req, res) => {
  const comment = await commentsService.updateComment(req.params.id as string, req.user!, req.body);
  await logAudit(req, 'comment.updated', 'comment', comment.id);
  res.json(comment);
}));

router.delete('/comments/:id', authHandler(async (req, res) => {
  await commentsService.deleteComment(req.params.id as string, req.user!);
  await logAudit(req, 'comment.deleted', 'comment', req.params.id as string);
  res.status(204).send();
}));

export default router;
