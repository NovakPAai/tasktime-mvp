import { prisma } from '../../prisma/client.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import { computeEffectiveRole } from '../../shared/middleware/rbac.js';

/**
 * Build the payload for a user's «Безопасность» view (spec §5.6):
 *   {
 *     groups: [{ id, name, addedAt, memberCount }],
 *     projectRoles: [{ project, role, source, sourceGroups }],
 *     updatedAt,
 *   }
 *
 * A project appears in `projectRoles` iff the user has ANY role there (direct or via a group
 * bound to the project). `source` and `sourceGroups` come from computeEffectiveRole (§5.2).
 */
export async function getUserSecurity(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true },
  });
  if (!user) throw new AppError(404, 'Пользователь не найден');

  const [groups, directProjects, groupProjects] = await Promise.all([
    prisma.userGroupMember.findMany({
      where: { userId },
      include: {
        group: {
          include: { _count: { select: { members: true } } },
        },
      },
      orderBy: { addedAt: 'desc' },
    }),
    prisma.userProjectRole.findMany({
      where: { userId },
      select: { projectId: true },
    }),
    prisma.projectGroupRole.findMany({
      where: { group: { members: { some: { userId } } } },
      select: { projectId: true },
    }),
  ]);

  const projectIds = new Set<string>([
    ...directProjects.map(r => r.projectId),
    ...groupProjects.map(r => r.projectId),
  ]);

  // Fetch project metadata once.
  const projects = await prisma.project.findMany({
    where: { id: { in: Array.from(projectIds) } },
    select: { id: true, key: true, name: true },
  });
  const projectById = new Map(projects.map(p => [p.id, p]));

  const projectRoles = [];
  for (const projectId of projectIds) {
    const project = projectById.get(projectId);
    if (!project) continue;
    const eff = await computeEffectiveRole(userId, projectId);
    if (!eff) continue;
    projectRoles.push({
      project,
      role: {
        id: eff.roleId,
        name: eff.roleName,
        key: eff.roleKey,
        permissions: eff.permissions,
      },
      source: eff.source,
      sourceGroups: eff.sourceGroups,
    });
  }

  return {
    user: { id: user.id, name: user.name, email: user.email },
    groups: groups.map(m => ({
      id: m.group.id,
      name: m.group.name,
      addedAt: m.addedAt,
      memberCount: m.group._count.members,
    })),
    projectRoles,
    updatedAt: new Date().toISOString(),
  };
}
