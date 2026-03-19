import { prisma } from '../../prisma/client.js';

export async function listIssueTypeConfigs(includeDisabled = false) {
  return prisma.issueTypeConfig.findMany({
    where: includeDisabled ? undefined : { isEnabled: true },
    orderBy: [{ orderIndex: 'asc' }, { name: 'asc' }],
  });
}

export async function createIssueTypeConfig(data: {
  name: string;
  description?: string;
  iconName: string;
  iconColor: string;
  isSubtask: boolean;
  orderIndex: number;
}) {
  return prisma.issueTypeConfig.create({
    data: { ...data, isSystem: false, isEnabled: true },
  });
}

export async function updateIssueTypeConfig(
  id: string,
  data: {
    name?: string;
    description?: string;
    iconName?: string;
    iconColor?: string;
    isSubtask?: boolean;
    orderIndex?: number;
  },
) {
  return prisma.issueTypeConfig.update({ where: { id }, data });
}

export async function toggleIssueTypeConfig(id: string) {
  const config = await prisma.issueTypeConfig.findUniqueOrThrow({ where: { id } });
  return prisma.issueTypeConfig.update({
    where: { id },
    data: { isEnabled: !config.isEnabled },
  });
}

export async function deleteIssueTypeConfig(id: string) {
  const config = await prisma.issueTypeConfig.findUniqueOrThrow({ where: { id } });
  if (config.isSystem) {
    throw Object.assign(new Error('Cannot delete a system issue type'), { status: 400 });
  }
  return prisma.issueTypeConfig.delete({ where: { id } });
}
