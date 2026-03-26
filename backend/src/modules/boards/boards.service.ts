import type { StatusCategory } from '@prisma/client';
import { prisma } from '../../prisma/client.js';
import { AppError } from '../../shared/middleware/error-handler.js';

interface WorkflowColumn {
  statusId: string;
  statusName: string;
  category: StatusCategory;
  color: string;
  issues: unknown[];
}

export async function getBoard(projectId: string, sprintId?: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new AppError(404, 'Project not found');

  const where: Record<string, unknown> = { projectId };
  if (sprintId) where.sprintId = sprintId;

  // Check if project has a workflow scheme
  const schemeProject = await prisma.workflowSchemeProject.findUnique({
    where: { projectId },
    include: {
      scheme: {
        include: {
          items: {
            where: { issueTypeConfigId: null }, // default item
            include: {
              workflow: {
                include: {
                  steps: { include: { status: true }, orderBy: { orderIndex: 'asc' } },
                },
              },
            },
          },
        },
      },
    },
  });

  const issues = await prisma.issue.findMany({
    where,
    include: {
      assignee: { select: { id: true, name: true } },
      workflowStatus: { select: { id: true, name: true, category: true, color: true } },
      _count: { select: { children: true, comments: true } },
    },
    orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
  });

  if (schemeProject) {
    const defaultItem = schemeProject.scheme.items[0];
    if (defaultItem) {
      const steps = defaultItem.workflow.steps;
      const columns: WorkflowColumn[] = steps.map((step) => ({
        statusId: step.statusId,
        statusName: step.status.name,
        category: step.status.category,
        color: step.status.color,
        issues: [],
      }));

      for (const issue of issues) {
        const col = columns.find((c) => c.statusId === issue.workflowStatusId);
        if (col) {
          col.issues.push(issue);
        }
      }

      return { mode: 'workflow' as const, projectId, sprintId: sprintId ?? null, columns };
    }
  }

  // Legacy mode
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

  return { mode: 'legacy' as const, projectId, sprintId: sprintId ?? null, columns };
}

type ReorderUpdate = { id: string; status: string; orderIndex: number };

export async function reorderIssues(updates: ReorderUpdate[]) {
  await prisma.$transaction(
    updates.map((u) =>
      prisma.issue.update({
        where: { id: u.id },
        data: { status: u.status as never, orderIndex: u.orderIndex },
      })
    )
  );
}
