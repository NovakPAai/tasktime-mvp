import type { ProjectPermission } from '@prisma/client';
import { prisma } from '../../prisma/client.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import { computeEffectiveRolesForProjects } from '../../shared/middleware/rbac.js';

/**
 * TTSEC-2 Phase 2 security payload (spec §5.6). Exported so Phase 3 UI and tests can import
 * the exact shape instead of inferring it.
 */
export interface SecurityProjectRole {
  project: { id: string; key: string; name: string };
  role: { id: string; name: string; key: string; permissions: ProjectPermission[] };
  /**
   * The PRIMARY grant path. DIRECT wins when the user has the role directly assigned.
   * When both DIRECT and at least one group grant the same role, source='DIRECT' and
   * sourceGroups lists every group that additionally grants it ("also via Team A").
   */
  source: 'DIRECT' | 'GROUP';
  /** Every group that grants this role, independent of `source`. Empty iff the role is not granted via any group. */
  sourceGroups: { id: string; name: string }[];
}

export interface SecurityGroupMembership {
  id: string;
  name: string;
  addedAt: Date;
  memberCount: number;
}

export interface UserSecurityPayload {
  user: { id: string; name: string; email: string };
  groups: SecurityGroupMembership[];
  projectRoles: SecurityProjectRole[];
  updatedAt: string;
}

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
export async function getUserSecurity(userId: string): Promise<UserSecurityPayload> {
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

  // Batched resolution: 2 DB queries total (direct + group) + N Redis-cached scheme reads,
  // instead of 2N queries. See computeEffectiveRolesForProjects.
  const effectiveByProject = await computeEffectiveRolesForProjects(userId, Array.from(projectIds));

  const projectRoles: SecurityProjectRole[] = [];
  for (const [projectId, eff] of effectiveByProject) {
    if (!eff) continue;
    const project = projectById.get(projectId);
    if (!project) continue;
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
