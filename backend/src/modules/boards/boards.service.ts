import { prisma } from '../../prisma/client.js';
import { AppError } from '../../shared/middleware/error-handler.js';

export async function getBoard(projectId: string, sprintId?: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new AppError(404, 'Project not found');

  const where: Record<string, unknown> = { projectId };
  if (sprintId) where.sprintId = sprintId;

  const issues = await prisma.issue.findMany({
    where,
    include: {
      assignee: { select: { id: true, name: true } },
      _count: { select: { children: true, comments: true } },
    },
    orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
  });

  const columns: Record<string, typeof issues> = {
    OPEN: [],
    IN_PROGRESS: [],
    REVIEW: [],
    DONE: [],
    CANCELLED: [],
  };

  for (const issue of issues) {
    columns[issue.status]?.push(issue);
  }

  return { projectId, sprintId: sprintId ?? null, columns };
}

export async function reorderIssues(updates: { id: string; status: string; orderIndex: number }[]) {
  await prisma.$transaction(
    updates.map((u) =>
      prisma.issue.update({
        where: { id: u.id },
        data: { status: u.status as any, orderIndex: u.orderIndex },
      })
    )
  );
}
