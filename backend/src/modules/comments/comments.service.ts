import { prisma } from '../../prisma/client.js';
import { AppError } from '../../shared/middleware/error-handler.js';
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

export async function updateComment(id: string, userId: string, userRole: string, dto: UpdateCommentDto) {
  const comment = await prisma.comment.findUnique({ where: { id } });
  if (!comment) throw new AppError(404, 'Comment not found');
  if (comment.authorId !== userId && userRole !== 'ADMIN') {
    throw new AppError(403, 'Not allowed');
  }

  return prisma.comment.update({
    where: { id },
    data: { body: dto.body },
    include: { author: { select: { id: true, name: true, email: true } } },
  });
}

export async function deleteComment(id: string, userId: string, userRole: string) {
  const comment = await prisma.comment.findUnique({ where: { id } });
  if (!comment) throw new AppError(404, 'Comment not found');
  if (comment.authorId !== userId && userRole !== 'ADMIN') {
    throw new AppError(403, 'Not allowed');
  }

  await prisma.comment.delete({ where: { id } });
}
