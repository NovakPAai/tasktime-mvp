import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma/client.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import { invalidateWorkflowCache, invalidateWorkflowCacheByWorkflowId } from '../workflow-engine/workflow-engine.service.js';
import { validateWorkflow } from '../workflows/workflows.service.js';
import type {
  CreateWorkflowSchemeDto,
  UpdateWorkflowSchemeDto,
  SchemeItemsDto,
} from './workflow-schemes.dto.js';

const schemeInclude = {
  items: {
    include: { workflow: true, issueTypeConfig: true },
  },
  projects: { include: { project: true } },
};

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function listWorkflowSchemes() {
  return prisma.workflowScheme.findMany({
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    include: schemeInclude,
  });
}

export async function getWorkflowScheme(id: string) {
  const scheme = await prisma.workflowScheme.findUnique({ where: { id }, include: schemeInclude });
  if (!scheme) throw new AppError(404, 'Workflow scheme not found');
  return scheme;
}

export async function createWorkflowScheme(dto: CreateWorkflowSchemeDto) {
  return prisma.workflowScheme.create({
    data: {
      name: dto.name,
      description: dto.description,
      isDefault: dto.isDefault ?? false,
    },
    include: schemeInclude,
  });
}

export async function updateWorkflowScheme(id: string, dto: UpdateWorkflowSchemeDto) {
  const scheme = await prisma.workflowScheme.findUnique({ where: { id } });
  if (!scheme) throw new AppError(404, 'Workflow scheme not found');

  return prisma.workflowScheme.update({
    where: { id },
    data: {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
    },
    include: schemeInclude,
  });
}

export async function deleteWorkflowScheme(id: string) {
  const scheme = await prisma.workflowScheme.findUnique({
    where: { id },
    include: { _count: { select: { projects: true } } },
  });
  if (!scheme) throw new AppError(404, 'Workflow scheme not found');
  if (scheme._count.projects > 0) throw new AppError(400, 'SCHEME_IN_USE');

  await prisma.workflowScheme.delete({ where: { id } });
  return { ok: true };
}

// ─── Items ────────────────────────────────────────────────────────────────────

export async function replaceItems(id: string, dto: SchemeItemsDto) {
  const scheme = await prisma.workflowScheme.findUnique({ where: { id } });
  if (!scheme) throw new AppError(404, 'Workflow scheme not found');

  // Must have at least a default item (issueTypeConfigId = null)
  const hasDefault = dto.items.some((i) => !i.issueTypeConfigId);
  if (!hasDefault) throw new AppError(400, 'Scheme must include a default item (issueTypeConfigId = null)');

  // Validate all workflowIds exist
  const wfIds = [...new Set(dto.items.map((i) => i.workflowId))];
  const wfs = await prisma.workflow.findMany({ where: { id: { in: wfIds } }, select: { id: true } });
  if (wfs.length !== wfIds.length) throw new AppError(404, 'One or more workflows not found');

  // Validate graph integrity for each workflow
  for (const wfId of wfIds) {
    const report = await validateWorkflow(wfId);
    if (!report.isValid) {
      throw new AppError(422, 'WORKFLOW_INVALID', { workflowId: wfId, errors: report.errors });
    }
  }

  // Collect affected projectIds before delete (for cache invalidation)
  const affectedProjects = await prisma.workflowSchemeProject.findMany({
    where: { schemeId: id },
    select: { projectId: true },
  });

  try {
    await prisma.$transaction(async (tx) => {
      await tx.workflowSchemeItem.deleteMany({ where: { schemeId: id } });
      await tx.workflowSchemeItem.createMany({
        data: dto.items.map((item) => ({
          schemeId: id,
          workflowId: item.workflowId,
          issueTypeConfigId: item.issueTypeConfigId ?? null,
        })),
      });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') {
        throw new AppError(409, 'DUPLICATE_ISSUE_TYPE_MAPPING', {
          detail: 'Два элемента маппинга ссылаются на один и тот же тип задачи. Удалите дублирующую строку.',
        });
      }
      if (err.code === 'P2003') {
        throw new AppError(422, 'INVALID_REFERENCE', {
          detail: 'Один из типов задачи или workflow не найден в базе данных. Обновите страницу и попробуйте снова.',
        });
      }
    }
    throw err;
  }

  // Invalidate cache for all affected projects
  await Promise.all(affectedProjects.map((p) => invalidateWorkflowCache(p.projectId)));
  // Also invalidate by workflow in case newly added workflows are used elsewhere
  await Promise.all(wfIds.map((wfId) => invalidateWorkflowCacheByWorkflowId(wfId)));

  return getWorkflowScheme(id);
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export async function attachProject(schemeId: string, projectId: string) {
  const scheme = await prisma.workflowScheme.findUnique({ where: { id: schemeId } });
  if (!scheme) throw new AppError(404, 'Workflow scheme not found');

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new AppError(404, 'Project not found');

  const binding = await prisma.workflowSchemeProject.upsert({
    where: { projectId },
    update: { schemeId },
    create: { schemeId, projectId },
  });
  await invalidateWorkflowCache(projectId);
  return binding;
}

export async function detachProject(schemeId: string, projectId: string) {
  const binding = await prisma.workflowSchemeProject.findFirst({ where: { schemeId, projectId } });
  if (!binding) throw new AppError(404, 'Project not attached to this scheme');

  await prisma.workflowSchemeProject.delete({ where: { projectId } });
  await invalidateWorkflowCache(projectId);
  return { ok: true };
}

export async function getSchemeForProject(projectId: string) {
  const binding = await prisma.workflowSchemeProject.findUnique({
    where: { projectId },
    include: {
      scheme: {
        include: {
          items: { include: { workflow: { include: { steps: { include: { status: true } }, transitions: true } }, issueTypeConfig: true } },
        },
      },
    },
  });
  if (!binding) throw new AppError(404, 'No workflow scheme assigned to this project');
  return binding.scheme;
}
