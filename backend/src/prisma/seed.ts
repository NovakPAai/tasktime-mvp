import { pathToFileURL } from 'node:url';

import { PrismaClient, Prisma, ProjectRole, type User } from '@prisma/client';

import { bootstrapDefaultUsers, getBootstrapUsers } from './bootstrap.js';
import { hashPassword } from '../shared/utils/password.js';

const prisma = new PrismaClient();

export function resolveSeedActors(users: Pick<User, 'id' | 'email' | 'name'>[], ownerAdminEmail?: string) {
  const usersByEmail = new Map(users.map((user) => [user.email.toLowerCase(), user]));

  const admin = usersByEmail.get('admin@tasktime.ru');
  const manager = usersByEmail.get('manager@tasktime.ru');
  const dev = usersByEmail.get('dev@tasktime.ru');
  const viewer = usersByEmail.get('viewer@tasktime.ru');

  if (!admin || !manager || !dev || !viewer) {
    const missing = [
      !admin && 'admin@tasktime.ru',
      !manager && 'manager@tasktime.ru',
      !dev && 'dev@tasktime.ru',
      !viewer && 'viewer@tasktime.ru',
    ].filter(Boolean).join(', ');
    throw new Error(
      `Seed requires built-in bootstrap users to exist in the DB, but these are missing: ${missing}. ` +
      'Run bootstrap first (set BOOTSTRAP_ENABLED=true in your env and run npm run db:bootstrap), ' +
      'or run the full seed without TTMP_ONLY scope.',
    );
  }

  const normalizedOwnerAdminEmail = ownerAdminEmail?.trim().toLowerCase();
  const owner = (normalizedOwnerAdminEmail && usersByEmail.get(normalizedOwnerAdminEmail)) || admin;

  return {
    admin,
    owner,
    manager,
    dev,
    viewer,
  };
}

export type SeedOptions = { scope?: string };

async function main(prismaClient?: PrismaClient, scope?: string) {
  const client = prismaClient ?? prisma;
  const ttmpOnly = scope === 'TTMP_ONLY';
  console.log(`Seeding database${ttmpOnly ? ' (TTMP_ONLY)' : ''}...`);

  const defaultPassword = 'Password123';
  const bootstrapUsers = getBootstrapUsers();
  if (!ttmpOnly) {
    await bootstrapDefaultUsers(client, defaultPassword, bootstrapUsers);
  }

  // MCP system agent user — upsert so it's always present.
  // Password is set from AGENT_MCP_PASSWORD env var (required for API write ops).
  // Falls back to a random string so login is impossible if the var is not set.
  const agentRawPassword = process.env.AGENT_MCP_PASSWORD ?? Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const agentPasswordHash = await hashPassword(agentRawPassword);
  await client.$transaction(async (tx) => {
    const agentUser = await tx.user.upsert({
      where: { email: 'agent@flow-universe.internal' },
      create: {
        email: 'agent@flow-universe.internal',
        name: 'Flow Universe Agent',
        passwordHash: agentPasswordHash,
        isActive: true,
      },
      update: { passwordHash: agentPasswordHash, isActive: true },
    });
    await tx.userSystemRole.upsert({
      where: { userId_role: { userId: agentUser.id, role: 'USER' } },
      update: {},
      create: { userId: agentUser.id, role: 'USER' },
    });
    // Agent needs ADMIN role to create AI sessions (POST /api/ai-sessions requires ADMIN)
    await tx.userSystemRole.upsert({
      where: { userId_role: { userId: agentUser.id, role: 'ADMIN' } },
      update: {},
      create: { userId: agentUser.id, role: 'ADMIN' },
    });
  });

  const seededUsers = await Promise.all(
    bootstrapUsers.map((user) =>
      client.user.findUniqueOrThrow({
        where: { email: user.email },
      }),
    ),
  );
  const { admin, owner, manager, dev, viewer } = resolveSeedActors(
    seededUsers,
    process.env.BOOTSTRAP_OWNER_ADMIN_EMAIL,
  );

  // ===== DEFAULT PROJECT ROLE SCHEME =====
  // Re-assert isDefault=true on update: getSchemeForProject/detachProject 500 without a default,
  // so seed must actively restore the flag if it was ever flipped off in this DB.
  const defaultRoleScheme = await client.projectRoleScheme.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: { isDefault: true },
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Default',
      description: 'Схема доступа по умолчанию',
      isDefault: true,
    },
  });

  const DEFAULT_ROLE_MATRIX: Record<string, { key: string; name: string; color: string; permissions: string[] }> = {
    ADMIN: {
      key: 'ADMIN', name: 'Администратор', color: '#fa8c16',
      permissions: [
        'ISSUES_VIEW', 'ISSUES_CREATE', 'ISSUES_EDIT', 'ISSUES_DELETE',
        'ISSUES_ASSIGN', 'ISSUES_CHANGE_STATUS', 'ISSUES_CHANGE_TYPE',
        'SPRINTS_VIEW', 'SPRINTS_MANAGE',
        'RELEASES_VIEW', 'RELEASES_MANAGE',
        'MEMBERS_VIEW', 'MEMBERS_MANAGE',
        'TIME_LOGS_VIEW', 'TIME_LOGS_CREATE', 'TIME_LOGS_MANAGE',
        'COMMENTS_VIEW', 'COMMENTS_CREATE', 'COMMENTS_MANAGE',
        'PROJECT_SETTINGS_VIEW', 'PROJECT_SETTINGS_EDIT',
        'BOARDS_VIEW', 'BOARDS_MANAGE',
      ],
    },
    MANAGER: {
      key: 'MANAGER', name: 'Менеджер', color: '#1677ff',
      permissions: [
        'ISSUES_VIEW', 'ISSUES_CREATE', 'ISSUES_EDIT', 'ISSUES_DELETE',
        'ISSUES_ASSIGN', 'ISSUES_CHANGE_STATUS', 'ISSUES_CHANGE_TYPE',
        'SPRINTS_VIEW', 'SPRINTS_MANAGE',
        'RELEASES_VIEW', 'RELEASES_MANAGE',
        'MEMBERS_VIEW', 'MEMBERS_MANAGE',
        'TIME_LOGS_VIEW', 'TIME_LOGS_CREATE', 'TIME_LOGS_MANAGE',
        'COMMENTS_VIEW', 'COMMENTS_CREATE', 'COMMENTS_MANAGE',
        'PROJECT_SETTINGS_VIEW',
        'BOARDS_VIEW', 'BOARDS_MANAGE',
      ],
    },
    USER: {
      key: 'USER', name: 'Участник', color: '#52c41a',
      permissions: [
        'ISSUES_VIEW', 'ISSUES_CREATE', 'ISSUES_EDIT',
        'ISSUES_CHANGE_STATUS',
        'SPRINTS_VIEW',
        'RELEASES_VIEW',
        'MEMBERS_VIEW',
        'TIME_LOGS_VIEW', 'TIME_LOGS_CREATE',
        'COMMENTS_VIEW', 'COMMENTS_CREATE',
        'PROJECT_SETTINGS_VIEW',
        'BOARDS_VIEW',
      ],
    },
    VIEWER: {
      key: 'VIEWER', name: 'Наблюдатель', color: '#d9d9d9',
      permissions: [
        'ISSUES_VIEW',
        'SPRINTS_VIEW',
        'RELEASES_VIEW',
        'MEMBERS_VIEW',
        'TIME_LOGS_VIEW',
        'COMMENTS_VIEW',
        'PROJECT_SETTINGS_VIEW',
        'BOARDS_VIEW',
      ],
    },
  };

  const ALL_PERMISSIONS = [
    'ISSUES_VIEW', 'ISSUES_CREATE', 'ISSUES_EDIT', 'ISSUES_DELETE',
    'ISSUES_ASSIGN', 'ISSUES_CHANGE_STATUS', 'ISSUES_CHANGE_TYPE',
    'SPRINTS_VIEW', 'SPRINTS_MANAGE',
    'RELEASES_VIEW', 'RELEASES_MANAGE',
    'MEMBERS_VIEW', 'MEMBERS_MANAGE',
    'TIME_LOGS_VIEW', 'TIME_LOGS_CREATE', 'TIME_LOGS_MANAGE',
    'COMMENTS_VIEW', 'COMMENTS_CREATE', 'COMMENTS_MANAGE',
    'PROJECT_SETTINGS_VIEW', 'PROJECT_SETTINGS_EDIT',
    'BOARDS_VIEW', 'BOARDS_MANAGE',
  ] as const;

  for (const [, roleDef] of Object.entries(DEFAULT_ROLE_MATRIX)) {
    const role = await client.projectRoleDefinition.upsert({
      where: { schemeId_key: { schemeId: defaultRoleScheme.id, key: roleDef.key } },
      update: { name: roleDef.name, color: roleDef.color },
      create: {
        schemeId: defaultRoleScheme.id,
        name: roleDef.name,
        key: roleDef.key,
        color: roleDef.color,
        isSystem: true,
      },
    });
    // Store only granted=true rows (absence of a row means "not granted"). Matches the service
    // model in updatePermissions — keeps the permissions table compact and consistent.
    const grantedPerms = ALL_PERMISSIONS.filter(p => roleDef.permissions.includes(p));
    const revokedPerms = ALL_PERMISSIONS.filter(p => !roleDef.permissions.includes(p));
    if (revokedPerms.length > 0) {
      await client.projectRolePermission.deleteMany({
        where: { roleId: role.id, permission: { in: revokedPerms as any } },
      });
    }
    for (const perm of grantedPerms) {
      await client.projectRolePermission.upsert({
        where: { roleId_permission: { roleId: role.id, permission: perm as any } },
        update: { granted: true },
        create: { roleId: role.id, permission: perm as any, granted: true },
      });
    }
  }
  console.log('Default project role scheme seeded.');

  // Backfill UserProjectRole.roleId / schemeId — one updateMany per legacy ProjectRole value
  // (4 queries total, independent of row count). Unmapped legacy values are reported but not
  // updated so we don't silently paper over unknown keys.
  const schemeRoles = await client.projectRoleDefinition.findMany({
    where: { schemeId: defaultRoleScheme.id },
    select: { id: true, key: true },
  });
  const roleKeyToId = new Map(schemeRoles.map(r => [r.key, r.id]));
  let backfilled = 0;
  const unmappedKeys: string[] = [];
  for (const key of Object.values(ProjectRole)) {
    const roleId = roleKeyToId.get(key);
    if (!roleId) {
      const leftover = await client.userProjectRole.count({ where: { role: key, roleId: null } });
      if (leftover > 0) unmappedKeys.push(`${key}(${leftover})`);
      continue;
    }
    const { count } = await client.userProjectRole.updateMany({
      where: { role: key, roleId: null },
      data: { roleId, schemeId: defaultRoleScheme.id },
    });
    backfilled += count;
  }
  console.log(`Backfilled ${backfilled} UserProjectRole records.`);
  if (unmappedKeys.length > 0) {
    console.warn(`Unmapped legacy role values (no matching key in default scheme): ${unmappedKeys.join(', ')}`);
  }
  // ===== END DEFAULT PROJECT ROLE SCHEME =====

  // Create projects (DEMO/BACK/LIVE only when not TTMP_ONLY)
  let project: { id: string; key: string } | null = null;
  let backendProject: { id: string; key: string } | null = null;
  if (!ttmpOnly) {
    project = await client.project.upsert({
      where: { key: 'DEMO' },
      update: {},
      create: { name: 'Demo Project', key: 'DEMO', description: 'Demo project for testing', ownerId: admin.id },
    });
    backendProject = await client.project.upsert({
      where: { key: 'BACK' },
      update: {},
      create: { name: 'Backend Services', key: 'BACK', description: 'Backend microservices', ownerId: admin.id },
    });
  }

  const mvpProject = await client.project.upsert({
    where: { key: 'TTMP' },
    update: {},
    create: {
      name: 'Flow Universe MVP (vibe-code)',
      key: 'TTMP',
      description: 'MVP системы управления проектами и задачами на vibe-code',
      ownerId: admin.id,
    },
  });

  let liveCodeProject: { id: string; key: string } | null = null;
  if (!ttmpOnly) {
    liveCodeProject = await client.project.upsert({
      where: { key: 'LIVE' },
      update: {},
      create: {
        name: 'Flow Universe MVP LiveCode',
        key: 'LIVE',
        description: 'Живой проект: задачи для разработки Flow Universe MVP (vibe-code) самим Flow Universe и агентами',
        ownerId: admin.id,
      },
    });
  }

  // TTMP-132: set admin as owner for any projects still missing an owner
  await client.project.updateMany({ where: { ownerId: null }, data: { ownerId: admin.id } });

  // Historical sprints for Flow Universe MVP (TTMP)
  const sprint0 = await client.sprint.upsert({
    where: { projectId_name: { projectId: mvpProject.id, name: 'Sprint 0 — Развертывание стенда' } },
    update: {},
    create: {
      projectId: mvpProject.id,
      name: 'Sprint 0 — Развертывание стенда',
      goal: 'Подготовка стенда, анализ и планирование MVP',
      startDate: new Date('2026-03-08T09:00:00Z'),
      endDate: new Date('2026-03-08T18:00:00Z'),
      state: 'CLOSED',
    },
  });

  const sprint1 = await client.sprint.upsert({
    where: { projectId_name: { projectId: mvpProject.id, name: 'Sprint 1 — Фундамент системы' } },
    update: {},
    create: {
      projectId: mvpProject.id,
      name: 'Sprint 1 — Фундамент системы',
      goal: 'Backend/Frontend фундамент, Auth, Users, Projects, Issues',
      startDate: new Date('2026-03-09T09:00:00Z'),
      endDate: new Date('2026-03-10T18:00:00Z'),
      state: 'CLOSED',
    },
  });

  const sprint2 = await client.sprint.upsert({
    where: { projectId_name: { projectId: mvpProject.id, name: 'Sprint 2 — Доски, спринты, время, комментарии' } },
    update: {},
    create: {
      projectId: mvpProject.id,
      name: 'Sprint 2 — Доски, спринты, время, комментарии',
      goal: 'Kanban Board, Sprints, Time tracking, Comments, Issue history',
      startDate: new Date('2026-03-10T09:00:00Z'),
      endDate: new Date('2026-03-10T18:00:00Z'),
      state: 'CLOSED',
    },
  });

  const sprint3 = await client.sprint.upsert({
    where: { projectId_name: { projectId: mvpProject.id, name: 'Sprint 3 — Teams, Admin, Reports, Redis' } },
    update: {},
    create: {
      projectId: mvpProject.id,
      name: 'Sprint 3 — Teams, Admin, Reports, Redis',
      goal: 'Teams, Admin, отчёты и доработка Redis по плану Sprint 3',
      startDate: new Date('2026-03-11T09:00:00Z'),
      endDate: new Date('2026-03-11T18:00:00Z'),
      state: 'CLOSED',
    },
  });

  const sprint35 = await client.sprint.upsert({
    where: { projectId_name: { projectId: mvpProject.id, name: 'Sprint 3.5 — UX/UI адаптация и багфиксинг' } },
    update: { state: 'ACTIVE' },
    create: {
      projectId: mvpProject.id,
      name: 'Sprint 3.5 — UX/UI адаптация и багфиксинг',
      goal: 'Полиш UX/UI, UAT и стабилизация после Sprint 3',
      startDate: new Date('2026-03-12T09:00:00Z'),
      endDate: new Date('2026-03-12T18:00:00Z'),
      state: 'ACTIVE',
    },
  });

  const sprint4 = await client.sprint.upsert({
    where: { projectId_name: { projectId: mvpProject.id, name: 'Sprint 4 — AI + Интеграции + Polish' } },
    update: { state: 'PLANNED' },
    create: {
      projectId: mvpProject.id,
      name: 'Sprint 4 — AI + Интеграции + Polish',
      goal: 'AI-оценка трудоёмкости, декомпозиция задач, GitLab webhook, Telegram-бот, финальный polish',
      startDate: new Date('2026-03-17T09:00:00Z'),
      endDate: new Date('2026-03-31T18:00:00Z'),
      state: 'PLANNED',
    },
  });

  // ===== ISSUE TYPE CONFIGS & SCHEMES =====
  const systemTypes = [
    { systemKey: 'EPIC',    name: 'Epic',    iconName: 'ThunderboltOutlined', iconColor: '#722ED1', isSubtask: false, orderIndex: 0 },
    { systemKey: 'STORY',   name: 'Story',   iconName: 'BookOutlined',        iconColor: '#1677FF', isSubtask: false, orderIndex: 1 },
    { systemKey: 'TASK',    name: 'Task',    iconName: 'CheckSquareOutlined', iconColor: '#52C41A', isSubtask: false, orderIndex: 2 },
    { systemKey: 'BUG',     name: 'Bug',     iconName: 'BugOutlined',         iconColor: '#F5222D', isSubtask: false, orderIndex: 3 },
    { systemKey: 'SUBTASK', name: 'Subtask', iconName: 'MinusSquareOutlined', iconColor: '#8C8C8C', isSubtask: true,  orderIndex: 4 },
  ];

  const typeConfigIds: Record<string, string> = {};
  for (const t of systemTypes) {
    const config = await client.issueTypeConfig.upsert({
      where: { systemKey: t.systemKey },
      update: {},
      create: { ...t, isSystem: true, isEnabled: true },
    });
    typeConfigIds[t.systemKey] = config.id;
  }

  // Create issues with hierarchy (DEMO/LIVE only when not TTMP_ONLY)
  if (!ttmpOnly && project && liveCodeProject) {
  const epic = await client.issue.upsert({
    where: { projectId_number: { projectId: project.id, number: 1 } },
    update: {},
    create: {
      projectId: project.id, number: 1, title: 'User Authentication System',
      issueTypeConfigId: typeConfigIds['EPIC'], priority: 'HIGH', creatorId: manager.id, assigneeId: dev.id,
    },
  });

  const story = await client.issue.upsert({
    where: { projectId_number: { projectId: project.id, number: 2 } },
    update: {},
    create: {
      projectId: project.id, number: 2, title: 'Login & Registration Flow',
      issueTypeConfigId: typeConfigIds['STORY'], priority: 'HIGH', creatorId: manager.id, assigneeId: dev.id,
      parentId: epic.id, status: 'IN_PROGRESS',
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: project.id, number: 3 } },
    update: {},
    create: {
      projectId: project.id, number: 3, title: 'Implement JWT token generation',
      issueTypeConfigId: typeConfigIds['TASK'], priority: 'HIGH', creatorId: manager.id, assigneeId: dev.id,
      parentId: story.id, status: 'DONE',
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: project.id, number: 4 } },
    update: {},
    create: {
      projectId: project.id, number: 4, title: 'Create login form UI',
      issueTypeConfigId: typeConfigIds['TASK'], priority: 'MEDIUM', creatorId: manager.id, assigneeId: dev.id,
      parentId: story.id, status: 'IN_PROGRESS',
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: project.id, number: 5 } },
    update: {},
    create: {
      projectId: project.id,
      number: 5,
      title: 'Fix password validation bug',
      issueTypeConfigId: typeConfigIds['BUG'],
      priority: 'CRITICAL',
      creatorId: dev.id,
      parentId: epic.id,
    },
  });

  // MVP LiveCode meta issues (agent vs human work)
  await client.issue.upsert({
    where: { projectId_number: { projectId: liveCodeProject.id, number: 1 } },
    update: {},
    create: {
      projectId: liveCodeProject.id,
      number: 1,
      title: 'Настроить MVP LiveCode как мета-проект',
      issueTypeConfigId: typeConfigIds['EPIC'],
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      aiEligible: false,
      aiExecutionStatus: 'NOT_STARTED',
      aiAssigneeType: 'HUMAN',
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: liveCodeProject.id, number: 2 } },
    update: {},
    create: {
      projectId: liveCodeProject.id,
      number: 2,
      title: 'Добавить флаг "делает агент" к задачам',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      aiEligible: true,
      aiExecutionStatus: 'NOT_STARTED',
      aiAssigneeType: 'AGENT',
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: liveCodeProject.id, number: 3 } },
    update: {},
    create: {
      projectId: liveCodeProject.id,
      number: 3,
      title: 'Показать активные задачи MVP LiveCode через API',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      aiEligible: true,
      aiExecutionStatus: 'NOT_STARTED',
      aiAssigneeType: 'AGENT',
    },
  });
  }

  // Backlog (MVP project): EPIC — Исследование и планирование MVP
  const epicResearch = await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 1 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint0.id,
      number: 1,
      title: 'Исследование и планирование MVP',
      issueTypeConfigId: typeConfigIds['EPIC'],
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
    },
  });

  const storyInterview = await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 2 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint0.id,
      number: 2,
      title: 'Интервью по 8 блокам и сбор требований Jira Cut',
      issueTypeConfigId: typeConfigIds['STORY'],
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: epicResearch.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 3 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint0.id,
      number: 3,
      title: 'Сформировать требования по продукту, пользователям и сценариям',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyInterview.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 4 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint0.id,
      number: 4,
      title: 'Описать интеграции (GitLab, Confluence, Telegram-бот)',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyInterview.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 5 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint0.id,
      number: 5,
      title: 'Зафиксировать требования по безопасности (RBAC, audit log, ФЗ-152)',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyInterview.id,
    },
  });

  const storyStack = await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 6 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint0.id,
      number: 6,
      title: 'Выбор и фиксация технологического стека',
      issueTypeConfigId: typeConfigIds['STORY'],
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: epicResearch.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 7 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint0.id,
      number: 7,
      title: 'Выбрать стек backend (Node 20, Express, TS, Prisma, PostgreSQL, Redis)',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyStack.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 8 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint0.id,
      number: 8,
      title: 'Выбрать стек frontend (React 18, Vite, Zustand, Ant Design)',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyStack.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 9 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint0.id,
      number: 9,
      title: 'Зафиксировать архитектуру модульного монолита и доменную модель',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyStack.id,
    },
  });

  const storyRebuildPlan = await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 10 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint0.id,
      number: 10,
      title: 'План пересборки v2',
      issueTypeConfigId: typeConfigIds['STORY'],
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: epicResearch.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 11 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint0.id,
      number: 11,
      title: 'Написать документ REBUILD_PLAN_V2 с архитектурой, API, RBAC, спринтами и NFR',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyRebuildPlan.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 12 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint0.id,
      number: 12,
      title: 'Зафиксировать требования к ОС, браузерам и стратегии деплоя',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyRebuildPlan.id,
    },
  });

  // Backlog (MVP project): EPIC — Спринт 1 — Фундамент системы
  const epicSprint1 = await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 13 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint1.id,
      number: 13,
      title: 'Спринт 1 — Фундамент системы',
      issueTypeConfigId: typeConfigIds['EPIC'],
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
    },
  });

  const storyBackendInfra = await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 14 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint1.id,
      number: 14,
      title: 'Базовый backend и инфраструктура',
      issueTypeConfigId: typeConfigIds['STORY'],
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: epicSprint1.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 15 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint1.id,
      number: 15,
      title: 'Инициализировать backend-проект (Express + TypeScript + ESLint/Prettier)',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyBackendInfra.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 16 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint1.id,
      number: 16,
      title: 'Настроить Prisma 6 c PostgreSQL 16',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyBackendInfra.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 17 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 17,
      title: 'Описать Prisma-схему (User, Project, Issue, Comment, AuditLog)',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyBackendInfra.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 18 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 18,
      title: 'Реализовать middleware для ошибок и логирования',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyBackendInfra.id,
    },
  });

  const storyAuthModule = await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 19 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint1.id,
      number: 19,
      title: 'Модуль аутентификации (Auth)',
      issueTypeConfigId: typeConfigIds['STORY'],
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: epicSprint1.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 20 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint1.id,
      number: 20,
      title: 'Реализовать API регистрации, логина, refresh, logout и me на JWT + refresh-токенах',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyAuthModule.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 21 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint1.id,
      number: 21,
      title: 'Настроить хранение и проверку токенов, bcrypt-хэширование паролей',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyAuthModule.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 22 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 22,
      title: 'Интегрировать RBAC-проверку в middleware',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyAuthModule.id,
    },
  });

  const storyUsersRbac = await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 23 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint1.id,
      number: 23,
      title: 'Пользователи и роли (Users + RBAC)',
      issueTypeConfigId: typeConfigIds['STORY'],
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: epicSprint1.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 24 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint1.id,
      number: 24,
      title: 'Реализовать CRUD пользователей и смену ролей (Admin, Manager, User, Viewer)',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyUsersRbac.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 25 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint1.id,
      number: 25,
      title: 'Реализовать RBAC по ролям на уровне middleware',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyUsersRbac.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 26 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 26,
      title: 'Привязать аудит действий к пользователю и сущности',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyUsersRbac.id,
    },
  });

  const storyProjects = await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 27 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint1.id,
      number: 27,
      title: 'Проекты (Projects)',
      issueTypeConfigId: typeConfigIds['STORY'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: epicSprint1.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 28 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 28,
      title: 'Реализовать CRUD проектов с ключами (DEMO, BACK и т.п.)',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyProjects.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 29 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 29,
      title: 'Сделать API фильтрации и получения проектов по пользователю',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyProjects.id,
    },
  });

  const storyIssues = await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 30 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint1.id,
      number: 30,
      title: 'Задачи и иерархия (Issues)',
      issueTypeConfigId: typeConfigIds['STORY'],
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: epicSprint1.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 31 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint1.id,
      number: 31,
      title: 'Описать модель задач с типами EPIC/STORY/TASK/SUBTASK/BUG',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyIssues.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 32 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint1.id,
      number: 32,
      title: 'Реализовать статусы задач (OPEN, IN_PROGRESS, REVIEW, DONE, CANCELLED)',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyIssues.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 33 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint1.id,
      number: 33,
      title: 'Описать связи родитель–потомок и генерацию ключа PROJECT_KEY-NUMBER',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyIssues.id,
    },
  });

  const storyAudit = await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 34 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint1.id,
      number: 34,
      title: 'Аудит и безопасность (AuditLog)',
      issueTypeConfigId: typeConfigIds['STORY'],
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: epicSprint1.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 35 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint1.id,
      number: 35,
      title: 'Реализовать middleware аудита всех мутаций',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyAudit.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 36 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 36,
      title: 'Привязать записи аудита к пользователю, ресурсу и действию',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyAudit.id,
    },
  });

  const storyFrontendShell = await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 37 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint1.id,
      number: 37,
      title: 'Frontend — базовая оболочка',
      issueTypeConfigId: typeConfigIds['STORY'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: epicSprint1.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 38 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint1.id,
      number: 38,
      title: 'Инициализировать frontend (Vite + React + Ant Design + Zustand)',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyFrontendShell.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 39 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 39,
      title: 'Настроить роутинг и базовый AppLayout',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyFrontendShell.id,
    },
  });

  const storyFrontendAuthNav = await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 40 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint1.id,
      number: 40,
      title: 'Frontend — аутентификация и навигация',
      issueTypeConfigId: typeConfigIds['STORY'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: epicSprint1.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 41 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint1.id,
      number: 41,
      title: 'Реализовать LoginPage с интеграцией Auth API',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyFrontendAuthNav.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 42 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 42,
      title: 'Настроить хранение auth-состояния и защиту маршрутов',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyFrontendAuthNav.id,
    },
  });

  const storyFrontendProjectsIssues = await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 43 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint1.id,
      number: 43,
      title: 'Frontend — проекты и задачи',
      issueTypeConfigId: typeConfigIds['STORY'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: epicSprint1.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 44 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint1.id,
      number: 44,
      title: 'Реализовать ProjectsPage (список проектов)',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyFrontendProjectsIssues.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 45 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint1.id,
      number: 45,
      title: 'Реализовать ProjectDetailPage со списком задач',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyFrontendProjectsIssues.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 46 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 46,
      title: 'Реализовать форму создания/редактирования задач',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyFrontendProjectsIssues.id,
    },
  });

  const storySeedLocal = await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 47 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint1.id,
      number: 47,
      title: 'Seed-данные и локальный запуск',
      issueTypeConfigId: typeConfigIds['STORY'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: epicSprint1.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 48 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint1.id,
      number: 48,
      title: 'Написать seed-скрипт (4 пользователя, 2 проекта, 5 задач)',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storySeedLocal.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 49 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint1.id,
      number: 49,
      title: 'Настроить Docker Compose (PostgreSQL 16 + Redis 7)',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storySeedLocal.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 50 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 50,
      title: 'Настроить Makefile с целями setup, dev, backend, frontend',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storySeedLocal.id,
    },
  });

  // Backlog (MVP project): EPIC — Спринт 2 — Доски, спринты, время, комментарии
  const epicSprint2 = await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 51 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint2.id,
      number: 51,
      title: 'Спринт 2 — Доски, спринты, время, комментарии',
      issueTypeConfigId: typeConfigIds['EPIC'],
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
    },
  });

  const storyBoard = await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 52 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint2.id,
      number: 52,
      title: 'Kanban Board (backend + UI)',
      issueTypeConfigId: typeConfigIds['STORY'],
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: epicSprint2.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 53 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint2.id,
      number: 53,
      title: 'Реализовать API канбан-доски (колонки по статусам, порядок задач)',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyBoard.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 54 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint2.id,
      number: 54,
      title: 'Добавить drag-n-drop перемещение задач с сохранением порядка и статуса',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyBoard.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 55 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 55,
      title: 'Реализовать UI доски проекта (BoardPage)',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyBoard.id,
    },
  });

  const storySprints = await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 56 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint2.id,
      number: 56,
      title: 'Спринты (Sprints)',
      issueTypeConfigId: typeConfigIds['STORY'],
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: epicSprint2.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 57 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint2.id,
      number: 57,
      title: 'Реализовать модель и API спринтов (создание, старт, закрытие)',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storySprints.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 58 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint2.id,
      number: 58,
      title: 'Реализовать перенос задач между бэклогом и активным спринтом',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storySprints.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 59 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint2.id,
      number: 59,
      title: 'Обеспечить один ACTIVE-спринт на проект',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storySprints.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 60 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 60,
      title: 'Реализовать UI спринтов (SprintsPage)',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storySprints.id,
    },
  });

  const storyTime = await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 61 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint2.id,
      number: 61,
      title: 'Учёт времени (Time tracking)',
      issueTypeConfigId: typeConfigIds['STORY'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: epicSprint2.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 62 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint2.id,
      number: 62,
      title: 'Реализовать API таймера (старт/стоп) и ручного ввода времени',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyTime.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 63 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint2.id,
      number: 63,
      title: 'Логировать время по пользователю и задаче',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyTime.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 64 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 64,
      title: 'Реализовать страницу My Time (TimePage) с агрегированными данными',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyTime.id,
    },
  });

  const storyComments = await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 65 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint2.id,
      number: 65,
      title: 'Комментарии к задачам (Comments)',
      issueTypeConfigId: typeConfigIds['STORY'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: epicSprint2.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 66 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint2.id,
      number: 66,
      title: 'Реализовать API CRUD комментариев с проверкой прав',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyComments.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 67 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 67,
      title: 'Добавить блок комментариев на IssueDetailPage',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyComments.id,
    },
  });

  const storyIssueCardHistory = await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 68 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint2.id,
      number: 68,
      title: 'Карточка задачи и история изменений',
      issueTypeConfigId: typeConfigIds['STORY'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: epicSprint2.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 69 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint2.id,
      number: 69,
      title: 'Собрать полную карточку задачи (поля, иерархия, связи, время, комментарии)',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyIssueCardHistory.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 70 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 70,
      title: 'Показать историю изменений задачи из audit_log на UI',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyIssueCardHistory.id,
    },
  });

  // Backlog (MVP project): EPIC — Admin, UAT и инженерные улучшения
  const epicAdminUat = await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 71 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint3.id,
      number: 71,
      title: 'Admin, UAT и инженерные улучшения',
      issueTypeConfigId: typeConfigIds['EPIC'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
    },
  });

  const storyAdminModule = await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 72 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint3.id,
      number: 72,
      title: 'Admin-модуль',
      issueTypeConfigId: typeConfigIds['STORY'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: epicAdminUat.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 73 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint3.id,
      number: 73,
      title: 'Реализовать admin.service и admin.router с доступом только для ADMIN',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyAdminModule.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 74 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 74,
      title: 'Реализовать страницу AdminPage с основными административными секциями',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyAdminModule.id,
    },
  });

  const storyUatOnboarding = await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 75 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint35.id,
      number: 75,
      title: 'UAT-тесты и онбординг',
      issueTypeConfigId: typeConfigIds['STORY'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: epicAdminUat.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 76 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint35.id,
      number: 76,
      title: 'Добавить данные UAT-тестов на backend и API для их получения',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyUatOnboarding.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 77 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 77,
      title: 'Реализовать страницу UatTestsPage и оверлей UatOnboardingOverlay',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyUatOnboarding.id,
    },
  });

  const storyE2eUx = await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 78 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint35.id,
      number: 78,
      title: 'E2E и UX-полиш',
      issueTypeConfigId: typeConfigIds['STORY'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: epicAdminUat.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 79 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      sprintId: sprint35.id,
      number: 79,
      title: 'Настроить Playwright (playwright.config.ts, main-flows.spec.ts) для основных флоу',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyE2eUx.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 80 } },
    update: {},
    create: {
      projectId: mvpProject.id,
      number: 80,
      title: 'Расширить styles.css под современный Linear-like UI',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyE2eUx.id,
    },
  });

  // Sprint 4 — AI + Интеграции + Polish (TTMP-81..96)
  const epicSprint4 = await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 81 } },
    update: { sprintId: sprint4.id },
    create: {
      projectId: mvpProject.id,
      sprintId: sprint4.id,
      number: 81,
      title: 'Sprint 4 — AI + Интеграции + Polish',
      issueTypeConfigId: typeConfigIds['EPIC'],
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
    },
  });

  const storyS4Ai = await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 82 } },
    update: { sprintId: sprint4.id },
    create: {
      projectId: mvpProject.id,
      sprintId: sprint4.id,
      number: 82,
      title: 'AI-модуль: оценка и декомпозиция задач',
      issueTypeConfigId: typeConfigIds['STORY'],
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: epicSprint4.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 83 } },
    update: { sprintId: sprint4.id },
    create: {
      projectId: mvpProject.id,
      sprintId: sprint4.id,
      number: 83,
      title: 'Реализовать AI-оценку трудоёмкости задач (POST /ai/estimate)',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyS4Ai.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 84 } },
    update: { sprintId: sprint4.id },
    create: {
      projectId: mvpProject.id,
      sprintId: sprint4.id,
      number: 84,
      title: 'Реализовать AI-декомпозицию задач на подзадачи (POST /ai/decompose)',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyS4Ai.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 85 } },
    update: { sprintId: sprint4.id },
    create: {
      projectId: mvpProject.id,
      sprintId: sprint4.id,
      number: 85,
      title: 'Добавить UI AI-ассистента в карточку задачи (оценка + декомпозиция)',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyS4Ai.id,
    },
  });

  const storyS4GitLab = await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 86 } },
    update: { sprintId: sprint4.id },
    create: {
      projectId: mvpProject.id,
      sprintId: sprint4.id,
      number: 86,
      title: 'GitLab-интеграция (webhook)',
      issueTypeConfigId: typeConfigIds['STORY'],
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: epicSprint4.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 87 } },
    update: { sprintId: sprint4.id },
    create: {
      projectId: mvpProject.id,
      sprintId: sprint4.id,
      number: 87,
      title: 'Настроить приём GitLab webhook-событий (push, MR, pipeline)',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyS4GitLab.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 88 } },
    update: { sprintId: sprint4.id },
    create: {
      projectId: mvpProject.id,
      sprintId: sprint4.id,
      number: 88,
      title: 'Реализовать автообновление статуса задачи по GitLab MR/pipeline-событиям',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyS4GitLab.id,
    },
  });

  const storyS4Telegram = await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 89 } },
    update: { sprintId: sprint4.id },
    create: {
      projectId: mvpProject.id,
      sprintId: sprint4.id,
      number: 89,
      title: 'Telegram-бот (нотификации)',
      issueTypeConfigId: typeConfigIds['STORY'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: epicSprint4.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 90 } },
    update: { sprintId: sprint4.id },
    create: {
      projectId: mvpProject.id,
      sprintId: sprint4.id,
      number: 90,
      title: 'Реализовать Telegram-бот с нотификациями о назначении и смене статуса задач',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyS4Telegram.id,
    },
  });

  const storyS4Export = await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 91 } },
    update: { sprintId: sprint4.id },
    create: {
      projectId: mvpProject.id,
      sprintId: sprint4.id,
      number: 91,
      title: 'Экспорт отчётов',
      issueTypeConfigId: typeConfigIds['STORY'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: epicSprint4.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 92 } },
    update: { sprintId: sprint4.id },
    create: {
      projectId: mvpProject.id,
      sprintId: sprint4.id,
      number: 92,
      title: 'Добавить экспорт отчётов по задачам в CSV',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyS4Export.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 93 } },
    update: { sprintId: sprint4.id },
    create: {
      projectId: mvpProject.id,
      sprintId: sprint4.id,
      number: 93,
      title: 'Добавить экспорт отчётов по задачам в PDF',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyS4Export.id,
    },
  });

  const storyS4Docs = await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 94 } },
    update: { sprintId: sprint4.id },
    create: {
      projectId: mvpProject.id,
      sprintId: sprint4.id,
      number: 94,
      title: 'Документация и security audit',
      issueTypeConfigId: typeConfigIds['STORY'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: epicSprint4.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 95 } },
    update: { sprintId: sprint4.id },
    create: {
      projectId: mvpProject.id,
      sprintId: sprint4.id,
      number: 95,
      title: 'Настроить Swagger/OpenAPI документацию по всем модулям',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'MEDIUM',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyS4Docs.id,
    },
  });

  await client.issue.upsert({
    where: { projectId_number: { projectId: mvpProject.id, number: 96 } },
    update: { sprintId: sprint4.id },
    create: {
      projectId: mvpProject.id,
      sprintId: sprint4.id,
      number: 96,
      title: 'Провести security audit: rate-limiting, input sanitization, OWASP Top 10',
      issueTypeConfigId: typeConfigIds['TASK'],
      priority: 'HIGH',
      status: 'OPEN',
      creatorId: manager.id,
      assigneeId: dev.id,
      parentId: storyS4Docs.id,
    },
  });

  // Idempotent sync: sprint states and issue statuses by sprint
  await client.issue.updateMany({ where: { sprintId: sprint0.id }, data: { status: 'DONE' } });
  await client.issue.updateMany({ where: { sprintId: sprint1.id }, data: { status: 'DONE' } });
  await client.issue.updateMany({ where: { sprintId: sprint2.id }, data: { status: 'DONE' } });
  await client.issue.updateMany({ where: { sprintId: sprint3.id }, data: { status: 'DONE' } });
  await client.issue.updateMany({ where: { sprintId: sprint35.id }, data: { status: 'IN_PROGRESS' } });
  await client.issue.updateMany({ where: { sprintId: sprint4.id }, data: { status: 'OPEN' } });

  // Demo time tracking data for My Time (Pavel + AI) — only in full seed
  if (!ttmpOnly) {
  const existingAiSessions = await client.aiSession.count();
  if (existingAiSessions === 0) {
    const demoIssueMyTime = await client.issue.findUnique({
      where: { projectId_number: { projectId: mvpProject.id, number: 64 } },
    });
    const demoIssueBoard = await client.issue.findUnique({
      where: { projectId_number: { projectId: mvpProject.id, number: 55 } },
    });

    if (demoIssueMyTime && demoIssueBoard) {
      // Human time logs for Pavel
      await client.timeLog.createMany({
        data: [
          {
            issueId: demoIssueMyTime.id,
            userId: owner.id,
            hours: new Prisma.Decimal(1.5),
            note: 'Обсуждение требований к отчётам My Time',
            logDate: new Date(),
            source: 'HUMAN',
          },
          {
            issueId: demoIssueBoard.id,
            userId: owner.id,
            hours: new Prisma.Decimal(0.75),
            note: 'Ручное тестирование доски и спринтов',
            logDate: new Date(),
            source: 'HUMAN',
          },
        ],
      });

      // One AI session split between two tasks
      const aiSession = await client.aiSession.create({
        data: {
          issueId: demoIssueMyTime.id,
          userId: owner.id,
          model: 'gpt-5.1',
          provider: 'openai',
          startedAt: new Date(Date.now() - 45 * 60 * 1000),
          finishedAt: new Date(),
          tokensInput: 12000,
          tokensOutput: 8000,
          costMoney: new Prisma.Decimal(0.8),
          notes: 'Проектирование учёта времени HUMAN vs AGENT и UI My Time',
        },
      });

      const startedAt = aiSession.startedAt;
      const finishedAt = aiSession.finishedAt;
      const totalMs = finishedAt.getTime() - startedAt.getTime();
      const totalHours = totalMs / 3_600_000;

      const splits = [
        { issue: demoIssueMyTime, ratio: 0.6 },
        { issue: demoIssueBoard, ratio: 0.4 },
      ];

      await client.timeLog.createMany({
        data: splits.map((split) => {
          const hours = totalHours * split.ratio;
          const cost = 0.8 * split.ratio;
          return {
            issueId: split.issue.id,
            userId: owner.id,
            hours: new Prisma.Decimal(Math.round(hours * 100) / 100),
            note: 'AI: помощь в проектировании и UI',
            logDate: finishedAt,
            source: 'AGENT' as const,
            agentSessionId: aiSession.id,
            startedAt,
            stoppedAt: finishedAt,
            costMoney: new Prisma.Decimal(Math.round(cost * 10_000) / 10_000),
          };
        }),
      });
    }
  }
  }

  // Default scheme
  const defaultScheme = await client.issueTypeScheme.upsert({
    where: { id: 'default-issue-type-scheme' },
    update: {},
    create: { id: 'default-issue-type-scheme', name: 'Default Scheme', description: 'Стандартная схема типов задач', isDefault: true },
  });

  // Link all types to default scheme
  for (const t of systemTypes) {
    await client.issueTypeSchemeItem.upsert({
      where: { schemeId_typeConfigId: { schemeId: defaultScheme.id, typeConfigId: typeConfigIds[t.systemKey] } },
      update: {},
      create: { schemeId: defaultScheme.id, typeConfigId: typeConfigIds[t.systemKey], orderIndex: t.orderIndex },
    });
  }

  // Link all projects to default scheme
  const allProjects = await client.project.findMany({ select: { id: true } });
  for (const p of allProjects) {
    await client.issueTypeSchemeProject.upsert({
      where: { projectId: p.id },
      update: {},
      create: { schemeId: defaultScheme.id, projectId: p.id },
    });
  }


  console.log('Seed complete.');
  console.log(`Users: ${admin.email}, ${manager.email}, ${dev.email}, ${viewer.email}, ${owner.email}`);
  console.log(`Password for all: ${defaultPassword}`);
  if (project && backendProject) console.log(`Projects: ${project.key}, ${backendProject.key}`);
}

export async function seedDatabase(prismaClient: PrismaClient, options?: SeedOptions): Promise<void> {
  await main(prismaClient, options?.scope);
}

const isExecutedDirectly = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isExecutedDirectly) {
  main(prisma, process.env.SEED_SCOPE)
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
}
