import { prisma } from '../../prisma/client.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import type { AuthUser } from '../../shared/types/index.js';
import { assertProjectPermission } from '../../shared/middleware/rbac.js';
import type { CreateCommentDto, UpdateCommentDto } from './comments.dto.js';

export async function listComments(issueId: string) {
  return prisma.comment.findMany({
    where: { issueId },
    include: { author: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: 'asc' },
  });
}

export async function createComment(issueId: string, authorId: string, dto: CreateCommentDto) {
  const issue = await prisma.issue.findUnique({ where: { id: issueId } });
  if (!issue) throw new AppError(404, 'Issue not found');

  return prisma.comment.create({
    data: { issueId, authorId, body: dto.body },
    include: { author: { select: { id: true, name: true, email: true } } },
  });
}

/**
 * TTSEC-2 Phase 2 authorisation:
 *   - Author always may edit/delete their own comment (spec §2 — owner control).
 *   - Otherwise require `COMMENTS_MANAGE` (edit + full admin) for edit.
 *   - For delete of someone else's: `COMMENTS_DELETE_OTHERS` OR `COMMENTS_MANAGE`.
 *
 * SUPER_ADMIN bypass and global project-read bypass are handled inside assertProjectPermission.
 */
export async function updateComment(id: string, user: AuthUser, dto: UpdateCommentDto) {
  const comment = await prisma.comment.findUnique({
    where: { id },
    select: {
      id: true,
      authorId: true,
      issue: { select: { projectId: true } },
    },
  });
  if (!comment) throw new AppError(404, 'Comment not found');

  if (comment.authorId !== user.userId) {
    await assertProjectPermission(user, comment.issue.projectId, ['COMMENTS_MANAGE']);
  }

  return prisma.comment.update({
    where: { id },
    data: { body: dto.body },
    include: { author: { select: { id: true, name: true, email: true } } },
  });
}

export async function deleteComment(id: string, user: AuthUser) {
  const comment = await prisma.comment.findUnique({
    where: { id },
    select: {
      id: true,
      authorId: true,
      issue: { select: { projectId: true } },
    },
  });
  if (!comment) throw new AppError(404, 'Comment not found');

  if (comment.authorId !== user.userId) {
    await assertProjectPermission(user, comment.issue.projectId, [
      'COMMENTS_DELETE_OTHERS',
      'COMMENTS_MANAGE',
    ]);
  }

  await prisma.comment.delete({ where: { id } });
}
