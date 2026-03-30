import { prisma } from '../../prisma/client.js';

const SCHEME_SELECT = {
  id: true,
  name: true,
  description: true,
  isDefault: true,
  createdAt: true,
  updatedAt: true,
  items: {
    orderBy: { orderIndex: 'asc' as const },
    select: {
      id: true,
      orderIndex: true,
      typeConfig: true,
    },
  },
  projects: {
    select: {
      id: true,
      projectId: true,
      project: { select: { id: true, name: true, key: true } },
    },
  },
};

export async function listSchemes() {
  return prisma.issueTypeScheme.findMany({
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    select: SCHEME_SELECT,
  });
}

export async function getScheme(id: string) {
  return prisma.issueTypeScheme.findUniqueOrThrow({ where: { id }, select: SCHEME_SELECT });
}

export async function createScheme(data: { name: string; description?: string }) {
  return prisma.issueTypeScheme.create({ data, select: SCHEME_SELECT });
}

export async function updateScheme(id: string, data: { name?: string; description?: string }) {
  return prisma.issueTypeScheme.update({ where: { id }, data, select: SCHEME_SELECT });
}

export async function deleteScheme(id: string) {
  const scheme = await prisma.issueTypeScheme.findUniqueOrThrow({ where: { id } });
  if (scheme.isDefault) {
    throw Object.assign(new Error('Cannot delete the default scheme'), { status: 400 });
  }
  return prisma.issueTypeScheme.delete({ where: { id } });
}

export async function updateSchemeItems(
  schemeId: string,
  items: { typeConfigId: string; orderIndex: number }[],
) {
  await prisma.issueTypeSchemeItem.deleteMany({ where: { schemeId } });
  await prisma.issueTypeSchemeItem.createMany({
    data: items.map((item) => ({ schemeId, ...item })),
  });
  return getScheme(schemeId);
}

export async function assignProjectToScheme(schemeId: string, projectId: string) {
  // Ensure scheme exists
  await prisma.issueTypeScheme.findUniqueOrThrow({ where: { id: schemeId } });
  return prisma.issueTypeSchemeProject.upsert({
    where: { projectId },
    update: { schemeId },
    create: { schemeId, projectId },
    select: { id: true, schemeId: true, projectId: true, project: { select: { id: true, name: true, key: true } } },
  });
}

export async function removeProjectFromScheme(schemeId: string, projectId: string) {
  return prisma.issueTypeSchemeProject.delete({
    where: { projectId },
  });
}

export async function getProjectIssueTypes(projectId: string) {
  const binding = await prisma.issueTypeSchemeProject.findUnique({
    where: { projectId },
    include: {
      scheme: {
        include: {
          items: {
            orderBy: { orderIndex: 'asc' },
            include: { typeConfig: true },
          },
        },
      },
    },
  });

  if (binding) {
    return binding.scheme.items
      .filter((item) => item.typeConfig.isEnabled)
      .map((item) => item.typeConfig);
  }

  // Fallback: all enabled types
  return prisma.issueTypeConfig.findMany({
    where: { isEnabled: true },
    orderBy: [{ orderIndex: 'asc' }, { name: 'asc' }],
  });
}
