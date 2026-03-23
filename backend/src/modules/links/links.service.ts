import { prisma } from '../../prisma/client.js';
import { AppError } from '../../shared/middleware/error-handler.js';

const LINK_SELECT = {
  id: true,
  createdAt: true,
  linkType: {
    select: { id: true, name: true, outboundName: true, inboundName: true },
  },
  sourceIssue: {
    select: { id: true, number: true, title: true, type: true, status: true, issueTypeConfig: true, project: { select: { key: true } } },
  },
  targetIssue: {
    select: { id: true, number: true, title: true, type: true, status: true, issueTypeConfig: true, project: { select: { key: true } } },
  },
  createdBy: { select: { id: true, name: true } },
};

/** Все связи задачи (исходящие + входящие). */
export async function getIssueLinks(issueId: string) {
  const [outbound, inbound] = await Promise.all([
    prisma.issueLink.findMany({
      where: { sourceIssueId: issueId },
      select: LINK_SELECT,
      orderBy: { createdAt: 'asc' },
    }),
    prisma.issueLink.findMany({
      where: { targetIssueId: issueId },
      select: LINK_SELECT,
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  return { outbound, inbound };
}

/** Создать связь. */
export async function createLink(
  sourceIssueId: string,
  targetIssueId: string,
  linkTypeId: string,
  createdById: string,
) {
  if (sourceIssueId === targetIssueId) {
    throw Object.assign(new Error('Нельзя создать связь задачи с самой собой'), { status: 400 });
  }

  // Проверяем что обе задачи существуют
  const [source, target] = await Promise.all([
    prisma.issue.findUnique({ where: { id: sourceIssueId }, select: { id: true } }),
    prisma.issue.findUnique({ where: { id: targetIssueId }, select: { id: true } }),
  ]);
  if (!source) throw new AppError(404, 'Исходная задача не найдена');
  if (!target) throw new AppError(404, 'Целевая задача не найдена');

  // Проверяем что тип связи активен
  const linkType = await prisma.issueLinkType.findUnique({ where: { id: linkTypeId } });
  if (!linkType) throw new AppError(404, 'Тип связи не найден');
  if (!linkType.isActive) throw new AppError(400, 'Тип связи неактивен');

  try {
    const link = await prisma.issueLink.create({
      data: { sourceIssueId, targetIssueId, linkTypeId, createdById },
      select: LINK_SELECT,
    });
    return link;
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'P2002') {
      throw Object.assign(new Error('Такая связь уже существует'), { status: 409 });
    }
    throw err;
  }
}

/** Удалить связь. */
export async function deleteLink(linkId: string, requesterId: string, requesterRole: string) {
  const link = await prisma.issueLink.findUnique({ where: { id: linkId }, select: { id: true, createdById: true } });
  if (!link) throw Object.assign(new Error('Связь не найдена'), { status: 404 });

  const canDelete = link.createdById === requesterId || ['ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(requesterRole);
  if (!canDelete) throw Object.assign(new Error('Недостаточно прав'), { status: 403 });

  await prisma.issueLink.delete({ where: { id: linkId } });
}

// ===== Link Types (Admin) =====

export async function listLinkTypes(includeInactive = false) {
  return prisma.issueLinkType.findMany({
    where: includeInactive ? undefined : { isActive: true },
    orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
  });
}

export async function createLinkType(data: { name: string; outboundName: string; inboundName: string }) {
  try {
    return await prisma.issueLinkType.create({ data });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'P2002') {
      throw Object.assign(new Error('Тип связи с таким именем уже существует'), { status: 409 });
    }
    throw err;
  }
}

export async function updateLinkType(
  id: string,
  data: { name?: string; outboundName?: string; inboundName?: string; isActive?: boolean },
) {
  const type = await prisma.issueLinkType.findUnique({ where: { id } });
  if (!type) throw new AppError(404, 'Тип связи не найден');

  // Системные типы нельзя переименовывать, только активировать/деактивировать
  if (type.isSystem && (data.name || data.outboundName || data.inboundName)) {
    throw new AppError(400, 'Системный тип связи нельзя переименовывать');
  }

  return prisma.issueLinkType.update({ where: { id }, data });
}
