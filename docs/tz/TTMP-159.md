# ТЗ: TTMP-159 — Настраиваемая матрица прав по проектным ролям (схемы доступа)

**Дата:** 2026-04-16  
**Тип:** STORY | **Приоритет:** HIGH | **Статус:** OPEN  
**Проект:** TaskTime MVP (TTMP)  
**Автор ТЗ:** Claude Code (auto-generated, v3 — детализированные задачи)

---

## Контекст для входа в задачу

### Что есть сейчас

Проектные роли жёстко закодированы в enum Prisma `ProjectRole { ADMIN, MANAGER, USER, VIEWER }`.
Права каждой роли вшиты в код и статический markdown.

Ключевые файлы текущей реализации:
- `backend/src/prisma/schema.prisma` — enum `ProjectRole`, модель `UserProjectRole`
- `backend/src/shared/middleware/rbac.ts` — `requireProjectRole()`, проверяет `role: { in: [...] }`
- `backend/src/modules/admin/admin.dto.ts` — `assignProjectRoleDto` с `z.enum([...])`
- `backend/src/modules/admin/admin.service.ts` — `assignProjectRole`, `getUserProjectRoles`
- `frontend/src/pages/admin/AdminRolesPage.tsx` — UI назначения ролей, матрица — статический markdown

### Референс-реализация (паттерн схем)

Паттерн полностью идентичен `workflow-schemes`. Перед началом работы обязательно прочитать:
- `backend/src/modules/workflow-schemes/workflow-schemes.router.ts`
- `backend/src/modules/workflow-schemes/workflow-schemes.service.ts`
- `backend/src/modules/workflow-schemes/workflow-schemes.dto.ts`
- `frontend/src/api/workflow-schemes.ts`
- `frontend/src/pages/admin/AdminWorkflowSchemesPage.tsx`

### Итоговая архитектура

```
ProjectRoleScheme          — схема (контейнер ролей)
  ├─ isDefault: bool       — fallback для проектов без явной привязки
  ├─ ProjectRoleDefinition[] — роли в схеме (ADMIN, MANAGER, USER, VIEWER, кастомные)
  │    └─ ProjectRolePermission[] — матрица: permission × granted
  └─ ProjectRoleSchemeProject[] — привязка: @@unique(projectId)

UserProjectRole
  └─ roleId → ProjectRoleDefinition  (было: role enum)
```

---

## Задачи

---

### ЗАДАЧА 1 ✅ — Prisma schema: добавить новые модели

**Файл:** `backend/src/prisma/schema.prisma`

Добавить в конец файла (перед закрывающими комментариями, если есть) следующий блок:

```prisma
// ===== PROJECT ROLE SCHEMES =====

enum ProjectPermission {
  ISSUES_VIEW
  ISSUES_CREATE
  ISSUES_EDIT
  ISSUES_DELETE
  ISSUES_ASSIGN
  ISSUES_CHANGE_STATUS
  ISSUES_CHANGE_TYPE
  SPRINTS_VIEW
  SPRINTS_MANAGE
  RELEASES_VIEW
  RELEASES_MANAGE
  MEMBERS_VIEW
  MEMBERS_MANAGE
  TIME_LOGS_VIEW
  TIME_LOGS_CREATE
  TIME_LOGS_MANAGE
  COMMENTS_VIEW
  COMMENTS_CREATE
  COMMENTS_MANAGE
  PROJECT_SETTINGS_VIEW
  PROJECT_SETTINGS_EDIT
  BOARDS_VIEW
  BOARDS_MANAGE
}

model ProjectRoleScheme {
  id          String   @id @default(uuid())
  name        String
  description String?
  isDefault   Boolean  @default(false) @map("is_default")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt      @map("updated_at")

  roles    ProjectRoleDefinition[]
  projects ProjectRoleSchemeProject[]

  @@map("project_role_schemes")
}

model ProjectRoleDefinition {
  id          String   @id @default(uuid())
  schemeId    String   @map("scheme_id")
  name        String
  key         String
  description String?
  color       String?
  isSystem    Boolean  @default(false) @map("is_system")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt      @map("updated_at")

  scheme           ProjectRoleScheme       @relation(fields: [schemeId], references: [id], onDelete: Cascade)
  permissions      ProjectRolePermission[]
  userProjectRoles UserProjectRole[]

  @@unique([schemeId, key])
  @@index([schemeId])
  @@map("project_role_definitions")
}

model ProjectRolePermission {
  id         String            @id @default(uuid())
  roleId     String            @map("role_id")
  permission ProjectPermission
  granted    Boolean           @default(false)

  role ProjectRoleDefinition @relation(fields: [roleId], references: [id], onDelete: Cascade)

  @@unique([roleId, permission])
  @@index([roleId])
  @@map("project_role_permissions")
}

model ProjectRoleSchemeProject {
  id        String   @id @default(uuid())
  schemeId  String   @map("scheme_id")
  projectId String   @unique @map("project_id")
  createdAt DateTime @default(now()) @map("created_at")

  scheme  ProjectRoleScheme @relation(fields: [schemeId], references: [id], onDelete: Cascade)
  project Project           @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([schemeId])
  @@map("project_role_scheme_projects")
}
```

Изменить модель `UserProjectRole`: добавить поле `roleId` (сделать nullable на фазе 1, NOT NULL будет в фазе 2):

```prisma
model UserProjectRole {
  id        String      @id @default(uuid())
  userId    String      @map("user_id")
  projectId String      @map("project_id")
  role      ProjectRole                         // оставить пока — удалим в фазе 2
  roleId    String?     @map("role_id")         // НОВОЕ: nullable на фазе 1
  createdAt DateTime    @default(now()) @map("created_at")

  user             User                   @relation(fields: [userId], references: [id], onDelete: Cascade)
  project          Project                @relation(fields: [projectId], references: [id], onDelete: Cascade)
  roleDefinition   ProjectRoleDefinition? @relation(fields: [roleId], references: [id])  // НОВОЕ

  @@unique([userId, projectId, role])
  @@index([userId])
  @@index([projectId])
  @@map("user_project_roles")
}
```

Добавить в модель `Project` обратную связь:

```prisma
model Project {
  // ... существующие поля ...
  roleScheme ProjectRoleSchemeProject?  // НОВОЕ
}
```

После изменений выполнить:
```bash
cd backend && npx prisma migrate dev --name add_project_role_schemes
```

---

### ЗАДАЧА 2 ✅ — Seed: дефолтная схема с системными ролями

**Файл:** `backend/src/prisma/seed.ts`

В функции `main()`, **после** создания пользователей и **до** создания проектов, добавить блок seed дефолтной схемы:

```typescript
// ===== DEFAULT PROJECT ROLE SCHEME =====
// Создаём дефолтную схему с системными ролями и матрицей прав,
// воспроизводящей текущее поведение enum-based RBAC.

const defaultScheme = await client.projectRoleScheme.upsert({
  where: { id: 'default-role-scheme-0000-000000000000' },  // фиксированный ID для idempotency
  update: {},
  create: {
    id: 'default-role-scheme-0000-000000000000',
    name: 'Default',
    description: 'Схема доступа по умолчанию',
    isDefault: true,
  },
});

// Матрица прав: роль -> список разрешённых ProjectPermission
const DEFAULT_ROLE_MATRIX: Record<string, { key: string; name: string; color: string; permissions: string[] }> = {
  ADMIN: {
    key: 'ADMIN', name: 'Администратор', color: '#fa8c16',
    permissions: [
      'ISSUES_VIEW','ISSUES_CREATE','ISSUES_EDIT','ISSUES_DELETE',
      'ISSUES_ASSIGN','ISSUES_CHANGE_STATUS','ISSUES_CHANGE_TYPE',
      'SPRINTS_VIEW','SPRINTS_MANAGE',
      'RELEASES_VIEW','RELEASES_MANAGE',
      'MEMBERS_VIEW','MEMBERS_MANAGE',
      'TIME_LOGS_VIEW','TIME_LOGS_CREATE','TIME_LOGS_MANAGE',
      'COMMENTS_VIEW','COMMENTS_CREATE','COMMENTS_MANAGE',
      'PROJECT_SETTINGS_VIEW','PROJECT_SETTINGS_EDIT',
      'BOARDS_VIEW','BOARDS_MANAGE',
    ],
  },
  MANAGER: {
    key: 'MANAGER', name: 'Менеджер', color: '#1677ff',
    permissions: [
      'ISSUES_VIEW','ISSUES_CREATE','ISSUES_EDIT','ISSUES_DELETE',
      'ISSUES_ASSIGN','ISSUES_CHANGE_STATUS','ISSUES_CHANGE_TYPE',
      'SPRINTS_VIEW','SPRINTS_MANAGE',
      'RELEASES_VIEW','RELEASES_MANAGE',
      'MEMBERS_VIEW','MEMBERS_MANAGE',
      'TIME_LOGS_VIEW','TIME_LOGS_CREATE','TIME_LOGS_MANAGE',
      'COMMENTS_VIEW','COMMENTS_CREATE','COMMENTS_MANAGE',
      'PROJECT_SETTINGS_VIEW',
      'BOARDS_VIEW','BOARDS_MANAGE',
    ],
  },
  USER: {
    key: 'USER', name: 'Участник', color: '#52c41a',
    permissions: [
      'ISSUES_VIEW','ISSUES_CREATE','ISSUES_EDIT',
      'ISSUES_CHANGE_STATUS',
      'SPRINTS_VIEW',
      'RELEASES_VIEW',
      'MEMBERS_VIEW',
      'TIME_LOGS_VIEW','TIME_LOGS_CREATE',
      'COMMENTS_VIEW','COMMENTS_CREATE',
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
  'ISSUES_VIEW','ISSUES_CREATE','ISSUES_EDIT','ISSUES_DELETE',
  'ISSUES_ASSIGN','ISSUES_CHANGE_STATUS','ISSUES_CHANGE_TYPE',
  'SPRINTS_VIEW','SPRINTS_MANAGE',
  'RELEASES_VIEW','RELEASES_MANAGE',
  'MEMBERS_VIEW','MEMBERS_MANAGE',
  'TIME_LOGS_VIEW','TIME_LOGS_CREATE','TIME_LOGS_MANAGE',
  'COMMENTS_VIEW','COMMENTS_CREATE','COMMENTS_MANAGE',
  'PROJECT_SETTINGS_VIEW','PROJECT_SETTINGS_EDIT',
  'BOARDS_VIEW','BOARDS_MANAGE',
] as const;

for (const [, roleDef] of Object.entries(DEFAULT_ROLE_MATRIX)) {
  const role = await client.projectRoleDefinition.upsert({
    where: { schemeId_key: { schemeId: defaultScheme.id, key: roleDef.key } },
    update: { name: roleDef.name, color: roleDef.color },
    create: {
      schemeId: defaultScheme.id,
      name: roleDef.name,
      key: roleDef.key,
      color: roleDef.color,
      isSystem: true,
    },
  });

  // Upsert каждого разрешения
  for (const perm of ALL_PERMISSIONS) {
    await client.projectRolePermission.upsert({
      where: { roleId_permission: { roleId: role.id, permission: perm as any } },
      update: { granted: roleDef.permissions.includes(perm) },
      create: {
        roleId: role.id,
        permission: perm as any,
        granted: roleDef.permissions.includes(perm),
      },
    });
  }
}

console.log('Default project role scheme seeded.');
```

Затем backfill `UserProjectRole.roleId`:

```typescript
// Backfill: проставляем roleId по значению role enum для всех существующих записей
const schemeRoles = await client.projectRoleDefinition.findMany({
  where: { schemeId: defaultScheme.id },
  select: { id: true, key: true },
});
const roleKeyToId = Object.fromEntries(schemeRoles.map(r => [r.key, r.id]));

const userProjectRoles = await client.userProjectRole.findMany({
  where: { roleId: null },
});
for (const upr of userProjectRoles) {
  const roleId = roleKeyToId[upr.role as string];
  if (roleId) {
    await client.userProjectRole.update({
      where: { id: upr.id },
      data: { roleId },
    });
  }
}
console.log(`Backfilled ${userProjectRoles.length} UserProjectRole records.`);
```

---

### ЗАДАЧА 3 ✅ — Backend: новый модуль `project-role-schemes`

Создать директорию `backend/src/modules/project-role-schemes/` с тремя файлами.

---

#### 3.1 — `project-role-schemes.dto.ts`

```typescript
import { z } from 'zod';

export const createSchemeDto = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  isDefault: z.boolean().optional(),
});

export const updateSchemeDto = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().nullish(),
  isDefault: z.boolean().optional(),
});

export const createRoleDefinitionDto = z.object({
  name: z.string().min(1).max(64),
  key: z.string().min(1).max(32).regex(/^[A-Z_]+$/, 'Только заглавные буквы и _'),
  description: z.string().max(255).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export const updateRoleDefinitionDto = z.object({
  name: z.string().min(1).max(64).optional(),
  description: z.string().max(255).nullish(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullish(),
});

export const updatePermissionsDto = z.object({
  // ключи — значения enum ProjectPermission, значения — boolean
  permissions: z.record(z.string(), z.boolean()),
});

export const attachProjectDto = z.object({
  projectId: z.string().uuid(),
});

export type CreateSchemeDto = z.infer<typeof createSchemeDto>;
export type UpdateSchemeDto = z.infer<typeof updateSchemeDto>;
export type CreateRoleDefinitionDto = z.infer<typeof createRoleDefinitionDto>;
export type UpdateRoleDefinitionDto = z.infer<typeof updateRoleDefinitionDto>;
export type UpdatePermissionsDto = z.infer<typeof updatePermissionsDto>;
export type AttachProjectDto = z.infer<typeof attachProjectDto>;
```

---

#### 3.2 — `project-role-schemes.service.ts`

```typescript
import { prisma } from '../../prisma/client.js';
import { AppError } from '../../shared/middleware/error-handler.js';
import { getCachedJson, setCachedJson, delCachedJson } from '../../shared/redis.js';
import type {
  CreateSchemeDto, UpdateSchemeDto,
  CreateRoleDefinitionDto, UpdateRoleDefinitionDto,
  UpdatePermissionsDto,
} from './project-role-schemes.dto.js';

// ─── Cache keys ────────────────────────────────────────────────────────────────

const SCHEME_CACHE_KEY = (schemeId: string) => `rbac:scheme:${schemeId}:roles`;
const PROJECT_SCHEME_KEY = (projectId: string) => `rbac:project:${projectId}:scheme`;

async function invalidateSchemeCache(schemeId: string) {
  await delCachedJson(SCHEME_CACHE_KEY(schemeId));
  // Инвалидируем все проекты, привязанные к этой схеме
  const bindings = await prisma.projectRoleSchemeProject.findMany({ where: { schemeId }, select: { projectId: true } });
  await Promise.all(bindings.map(b => delCachedJson(PROJECT_SCHEME_KEY(b.projectId))));
}

// ─── Include ───────────────────────────────────────────────────────────────────

const schemeInclude = {
  roles: {
    include: { permissions: true },
    orderBy: { createdAt: 'asc' as const },
  },
  projects: {
    include: { project: { select: { id: true, name: true, key: true } } },
  },
  _count: { select: { roles: true, projects: true } },
};

// ─── Schemes CRUD ──────────────────────────────────────────────────────────────

export async function listSchemes() {
  return prisma.projectRoleScheme.findMany({
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    include: schemeInclude,
  });
}

export async function getScheme(id: string) {
  const scheme = await prisma.projectRoleScheme.findUnique({ where: { id }, include: schemeInclude });
  if (!scheme) throw new AppError(404, 'Role scheme not found');
  return scheme;
}

export async function createScheme(dto: CreateSchemeDto) {
  return prisma.projectRoleScheme.create({ data: dto, include: schemeInclude });
}

export async function updateScheme(id: string, dto: UpdateSchemeDto) {
  const scheme = await prisma.projectRoleScheme.findUnique({ where: { id } });
  if (!scheme) throw new AppError(404, 'Role scheme not found');
  const updated = await prisma.projectRoleScheme.update({
    where: { id },
    data: {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
    },
    include: schemeInclude,
  });
  await invalidateSchemeCache(id);
  return updated;
}

export async function deleteScheme(id: string) {
  const scheme = await prisma.projectRoleScheme.findUnique({
    where: { id },
    include: { _count: { select: { projects: true } } },
  });
  if (!scheme) throw new AppError(404, 'Role scheme not found');
  if (scheme.isDefault) throw new AppError(400, 'Cannot delete the default scheme');
  if (scheme._count.projects > 0) throw new AppError(400, 'SCHEME_IN_USE');
  await prisma.projectRoleScheme.delete({ where: { id } });
  await invalidateSchemeCache(id);
  return { ok: true };
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export async function attachProject(schemeId: string, projectId: string) {
  const scheme = await prisma.projectRoleScheme.findUnique({ where: { id: schemeId } });
  if (!scheme) throw new AppError(404, 'Role scheme not found');
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new AppError(404, 'Project not found');
  // upsert: один проект — одна схема (@@unique projectId)
  const binding = await prisma.projectRoleSchemeProject.upsert({
    where: { projectId },
    update: { schemeId },
    create: { schemeId, projectId },
  });
  await delCachedJson(PROJECT_SCHEME_KEY(projectId));
  return binding;
}

export async function detachProject(schemeId: string, projectId: string) {
  const binding = await prisma.projectRoleSchemeProject.findFirst({ where: { schemeId, projectId } });
  if (!binding) throw new AppError(404, 'Project not attached to this scheme');
  await prisma.projectRoleSchemeProject.delete({ where: { projectId } });
  await delCachedJson(PROJECT_SCHEME_KEY(projectId));
  return { ok: true };
}

// ─── getSchemeForProject (используется в rbac.ts) ─────────────────────────────

export async function getSchemeForProject(projectId: string) {
  // 1. Кэш
  const cached = await getCachedJson<Awaited<ReturnType<typeof getScheme>>>(PROJECT_SCHEME_KEY(projectId));
  if (cached) return cached;

  // 2. Явная привязка
  const binding = await prisma.projectRoleSchemeProject.findUnique({
    where: { projectId },
    include: { scheme: { include: schemeInclude } },
  });
  if (binding) {
    await setCachedJson(PROJECT_SCHEME_KEY(projectId), binding.scheme, 300);
    return binding.scheme;
  }

  // 3. Fallback: дефолтная схема
  const defaultScheme = await prisma.projectRoleScheme.findFirst({
    where: { isDefault: true },
    include: schemeInclude,
  });
  if (!defaultScheme) throw new AppError(500, 'No default role scheme configured');
  await setCachedJson(PROJECT_SCHEME_KEY(projectId), defaultScheme, 300);
  return defaultScheme;
}

// ─── Roles CRUD ────────────────────────────────────────────────────────────────

export async function listRoles(schemeId: string) {
  const scheme = await prisma.projectRoleScheme.findUnique({ where: { id: schemeId } });
  if (!scheme) throw new AppError(404, 'Role scheme not found');
  return prisma.projectRoleDefinition.findMany({
    where: { schemeId },
    include: { permissions: true, _count: { select: { userProjectRoles: true } } },
    orderBy: { createdAt: 'asc' },
  });
}

export async function createRole(schemeId: string, dto: CreateRoleDefinitionDto) {
  const scheme = await prisma.projectRoleScheme.findUnique({ where: { id: schemeId } });
  if (!scheme) throw new AppError(404, 'Role scheme not found');
  const existing = await prisma.projectRoleDefinition.findUnique({
    where: { schemeId_key: { schemeId, key: dto.key } },
  });
  if (existing) throw new AppError(409, `Role with key "${dto.key}" already exists in this scheme`);
  const role = await prisma.projectRoleDefinition.create({
    data: { ...dto, schemeId, isSystem: false },
    include: { permissions: true },
  });
  await invalidateSchemeCache(schemeId);
  return role;
}

export async function updateRole(schemeId: string, roleId: string, dto: UpdateRoleDefinitionDto) {
  const role = await prisma.projectRoleDefinition.findFirst({ where: { id: roleId, schemeId } });
  if (!role) throw new AppError(404, 'Role not found');
  const updated = await prisma.projectRoleDefinition.update({
    where: { id: roleId },
    data: {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.color !== undefined && { color: dto.color }),
    },
    include: { permissions: true },
  });
  await invalidateSchemeCache(schemeId);
  return updated;
}

export async function deleteRole(schemeId: string, roleId: string) {
  const role = await prisma.projectRoleDefinition.findFirst({ where: { id: roleId, schemeId } });
  if (!role) throw new AppError(404, 'Role not found');
  if (role.isSystem) throw new AppError(400, 'Cannot delete a system role');
  const usageCount = await prisma.userProjectRole.count({ where: { roleId } });
  if (usageCount > 0) throw new AppError(400, `ROLE_IN_USE: ${usageCount} users have this role`);
  await prisma.projectRoleDefinition.delete({ where: { id: roleId } });
  await invalidateSchemeCache(schemeId);
  return { ok: true };
}

// ─── Permissions ──────────────────────────────────────────────────────────────

export async function getPermissions(schemeId: string, roleId: string) {
  const role = await prisma.projectRoleDefinition.findFirst({
    where: { id: roleId, schemeId },
    include: { permissions: true },
  });
  if (!role) throw new AppError(404, 'Role not found');
  return role.permissions;
}

export async function updatePermissions(schemeId: string, roleId: string, dto: UpdatePermissionsDto) {
  const role = await prisma.projectRoleDefinition.findFirst({ where: { id: roleId, schemeId } });
  if (!role) throw new AppError(404, 'Role not found');

  // Upsert каждого разрешения из dto
  const ops = Object.entries(dto.permissions).map(([permission, granted]) =>
    prisma.projectRolePermission.upsert({
      where: { roleId_permission: { roleId, permission: permission as any } },
      update: { granted },
      create: { roleId, permission: permission as any, granted },
    })
  );
  await prisma.$transaction(ops);

  await invalidateSchemeCache(schemeId);

  return prisma.projectRoleDefinition.findUnique({
    where: { id: roleId },
    include: { permissions: true },
  });
}
```

---

#### 3.3 — `project-role-schemes.router.ts`

```typescript
import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireRole } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import { logAudit } from '../../shared/middleware/audit.js';
import {
  createSchemeDto, updateSchemeDto,
  createRoleDefinitionDto, updateRoleDefinitionDto,
  updatePermissionsDto, attachProjectDto,
} from './project-role-schemes.dto.js';
import * as service from './project-role-schemes.service.js';
import type { AuthRequest } from '../../shared/types/index.js';

const router = Router();
router.use(authenticate);
router.use(requireRole('ADMIN'));

// ─── Schemes ──────────────────────────────────────────────────────────────────

router.get('/', async (_req, res, next) => {
  try { res.json(await service.listSchemes()); } catch (err) { next(err); }
});

router.post('/', validate(createSchemeDto), async (req: AuthRequest, res, next) => {
  try {
    const scheme = await service.createScheme(req.body);
    await logAudit(req, 'role_scheme.created', 'role_scheme', scheme.id, req.body);
    res.status(201).json(scheme);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try { res.json(await service.getScheme(req.params.id as string)); } catch (err) { next(err); }
});

router.patch('/:id', validate(updateSchemeDto), async (req: AuthRequest, res, next) => {
  try {
    const scheme = await service.updateScheme(req.params.id as string, req.body);
    await logAudit(req, 'role_scheme.updated', 'role_scheme', req.params.id as string, req.body);
    res.json(scheme);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    await service.deleteScheme(req.params.id as string);
    await logAudit(req, 'role_scheme.deleted', 'role_scheme', req.params.id as string);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── Project bindings ─────────────────────────────────────────────────────────

router.post('/:id/projects', validate(attachProjectDto), async (req: AuthRequest, res, next) => {
  try {
    const binding = await service.attachProject(req.params.id as string, req.body.projectId);
    await logAudit(req, 'role_scheme.project_attached', 'role_scheme', req.params.id as string, req.body);
    res.status(201).json(binding);
  } catch (err) { next(err); }
});

router.delete('/:id/projects/:projectId', async (req: AuthRequest, res, next) => {
  try {
    await service.detachProject(req.params.id as string, req.params.projectId as string);
    await logAudit(req, 'role_scheme.project_detached', 'role_scheme', req.params.id as string, { projectId: req.params.projectId });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── Roles ────────────────────────────────────────────────────────────────────

router.get('/:id/roles', async (req, res, next) => {
  try { res.json(await service.listRoles(req.params.id as string)); } catch (err) { next(err); }
});

router.post('/:id/roles', validate(createRoleDefinitionDto), async (req: AuthRequest, res, next) => {
  try {
    const role = await service.createRole(req.params.id as string, req.body);
    await logAudit(req, 'role_scheme.role_created', 'role_scheme', req.params.id as string, req.body);
    res.status(201).json(role);
  } catch (err) { next(err); }
});

router.patch('/:id/roles/:roleId', validate(updateRoleDefinitionDto), async (req: AuthRequest, res, next) => {
  try {
    const role = await service.updateRole(req.params.id as string, req.params.roleId as string, req.body);
    await logAudit(req, 'role_scheme.role_updated', 'role_scheme', req.params.id as string, { roleId: req.params.roleId, ...req.body });
    res.json(role);
  } catch (err) { next(err); }
});

router.delete('/:id/roles/:roleId', async (req: AuthRequest, res, next) => {
  try {
    await service.deleteRole(req.params.id as string, req.params.roleId as string);
    await logAudit(req, 'role_scheme.role_deleted', 'role_scheme', req.params.id as string, { roleId: req.params.roleId });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── Permissions ──────────────────────────────────────────────────────────────

router.get('/:id/roles/:roleId/permissions', async (req, res, next) => {
  try {
    res.json(await service.getPermissions(req.params.id as string, req.params.roleId as string));
  } catch (err) { next(err); }
});

router.put('/:id/roles/:roleId/permissions', validate(updatePermissionsDto), async (req: AuthRequest, res, next) => {
  try {
    const role = await service.updatePermissions(req.params.id as string, req.params.roleId as string, req.body);
    await logAudit(req, 'role_scheme.permissions_updated', 'role_scheme', req.params.id as string, { roleId: req.params.roleId, permissions: req.body.permissions });
    res.json(role);
  } catch (err) { next(err); }
});

export default router;
```

---

### ЗАДАЧА 4 — Backend: зарегистрировать роутер в `app.ts`

**Файл:** `backend/src/app.ts`

Добавить импорт рядом с другими схемами:
```typescript
import roleSchemesRouter from './modules/project-role-schemes/project-role-schemes.router.js';
```

Добавить регистрацию маршрута рядом с `workflow-schemes`:
```typescript
app.use('/api/admin/role-schemes', roleSchemesRouter);
```

Добавить публичный эндпоинт для получения схемы проекта (используется при назначении ролей):
```typescript
import { getSchemeForProject } from './modules/project-role-schemes/project-role-schemes.service.js';

// Рядом с /api/projects/:projectId/workflow-scheme:
app.get('/api/projects/:projectId/role-scheme', authenticate, async (req, res, next) => {
  try {
    res.json(await getSchemeForProject(req.params.projectId as string));
  } catch (err) {
    next(err);
  }
});
```

---

### ЗАДАЧА 5 — Backend: обновить `rbac.ts` — добавить `requireProjectPermission`

**Файл:** `backend/src/shared/middleware/rbac.ts`

Добавить импорты:
```typescript
import type { ProjectPermission } from '@prisma/client';
import { getSchemeForProject } from '../../modules/project-role-schemes/project-role-schemes.service.js';
import { getCachedJson, setCachedJson } from '../redis.js';
```

Добавить новую функцию **рядом** с `requireProjectRole` (старую не удалять — она используется пока идёт миграция):

```typescript
/**
 * Проверяет конкретное разрешение из матрицы схемы доступа проекта.
 * Использует трёхуровневый Redis-кэш.
 */
export function requireProjectPermission(
  getProjectId: (req: AuthRequest) => string,
  permission: ProjectPermission,
) {
  return async (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError(401, 'Authentication required'));
    if (isSuperAdmin(req.user.systemRoles)) return next();
    if (hasGlobalProjectReadAccess(req.user.systemRoles)) return next();

    const projectId = getProjectId(req);
    if (!projectId) return next(new AppError(400, 'Project ID required'));

    // Кэш результата проверки
    const cacheKey = `rbac:perm:${projectId}:${req.user.userId}:${permission}`;
    const cachedResult = await getCachedJson<boolean>(cacheKey);
    if (cachedResult !== null) {
      return cachedResult ? next() : next(new AppError(403, 'Insufficient project permissions'));
    }

    try {
      // Получить схему проекта (с кэшом 300s)
      const scheme = await getSchemeForProject(projectId);

      // Найти роль пользователя в этом проекте
      const userRole = await prisma.userProjectRole.findFirst({
        where: { userId: req.user.userId, projectId },
        select: { roleId: true },
      });

      let granted = false;
      if (userRole?.roleId) {
        const roleDef = scheme.roles.find(r => r.id === userRole.roleId);
        granted = roleDef?.permissions.find(p => p.permission === permission)?.granted ?? false;
      }

      await setCachedJson(cacheKey, granted, 60); // TTL 60s
      return granted ? next() : next(new AppError(403, 'Insufficient project permissions'));
    } catch (err) {
      next(err);
    }
  };
}
```

---

### ЗАДАЧА 6 — Backend: обновить `admin.dto.ts`

**Файл:** `backend/src/modules/admin/admin.dto.ts`

Изменить `assignProjectRoleDto` — добавить `roleId` рядом со старым `role` (оба работают на период миграции):

```typescript
export const assignProjectRoleDto = z.object({
  projectId: z.string().uuid(),
  roleId: z.string().uuid(),                              // НОВОЕ: FK на ProjectRoleDefinition
  role: z.enum(['ADMIN', 'MANAGER', 'USER', 'VIEWER']).optional(), // оставить для обратной совместимости
});
```

**Файл:** `backend/src/modules/admin/admin.service.ts`

В функции `assignProjectRole` добавить сохранение `roleId` при создании/обновлении `UserProjectRole`.

---

### ЗАДАЧА 7 — Frontend: создать `src/api/role-schemes.ts`

**Файл:** `frontend/src/api/role-schemes.ts`

```typescript
import api from './client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProjectRolePermission {
  id: string;
  roleId: string;
  permission: string;
  granted: boolean;
}

export interface ProjectRoleDefinition {
  id: string;
  schemeId: string;
  name: string;
  key: string;
  description: string | null;
  color: string | null;
  isSystem: boolean;
  permissions: ProjectRolePermission[];
  _count?: { userProjectRoles: number };
}

export interface ProjectRoleSchemeProject {
  projectId: string;
  project: { id: string; name: string; key: string };
}

export interface ProjectRoleScheme {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  roles: ProjectRoleDefinition[];
  projects: ProjectRoleSchemeProject[];
  _count?: { roles: number; projects: number };
}

// ─── API ──────────────────────────────────────────────────────────────────────

export const roleSchemesApi = {
  // Схемы
  list: () =>
    api.get<ProjectRoleScheme[]>('/admin/role-schemes').then(r => r.data),
  get: (id: string) =>
    api.get<ProjectRoleScheme>(`/admin/role-schemes/${id}`).then(r => r.data),
  create: (data: { name: string; description?: string; isDefault?: boolean }) =>
    api.post<ProjectRoleScheme>('/admin/role-schemes', data).then(r => r.data),
  update: (id: string, data: { name?: string; description?: string | null; isDefault?: boolean }) =>
    api.patch<ProjectRoleScheme>(`/admin/role-schemes/${id}`, data).then(r => r.data),
  delete: (id: string) =>
    api.delete(`/admin/role-schemes/${id}`).then(r => r.data),

  // Привязка проектов
  attachProject: (id: string, projectId: string) =>
    api.post(`/admin/role-schemes/${id}/projects`, { projectId }).then(r => r.data),
  detachProject: (id: string, projectId: string) =>
    api.delete(`/admin/role-schemes/${id}/projects/${projectId}`).then(r => r.data),

  // Роли
  listRoles: (id: string) =>
    api.get<ProjectRoleDefinition[]>(`/admin/role-schemes/${id}/roles`).then(r => r.data),
  createRole: (id: string, data: { name: string; key: string; description?: string; color?: string }) =>
    api.post<ProjectRoleDefinition>(`/admin/role-schemes/${id}/roles`, data).then(r => r.data),
  updateRole: (id: string, roleId: string, data: { name?: string; description?: string | null; color?: string | null }) =>
    api.patch<ProjectRoleDefinition>(`/admin/role-schemes/${id}/roles/${roleId}`, data).then(r => r.data),
  deleteRole: (id: string, roleId: string) =>
    api.delete(`/admin/role-schemes/${id}/roles/${roleId}`).then(r => r.data),

  // Матрица разрешений
  getPermissions: (id: string, roleId: string) =>
    api.get<ProjectRolePermission[]>(`/admin/role-schemes/${id}/roles/${roleId}/permissions`).then(r => r.data),
  updatePermissions: (id: string, roleId: string, permissions: Record<string, boolean>) =>
    api.put<ProjectRoleDefinition>(`/admin/role-schemes/${id}/roles/${roleId}/permissions`, { permissions }).then(r => r.data),

  // Получить схему проекта (с fallback на дефолтную)
  getForProject: (projectId: string) =>
    api.get<ProjectRoleScheme>(`/projects/${projectId}/role-scheme`).then(r => r.data),
};
```

---

### ЗАДАЧА 8 — Frontend: создать `PermissionMatrixDrawer.tsx`

**Файл:** `frontend/src/components/admin/PermissionMatrixDrawer.tsx`

Компонент получает props: `schemeId`, `role` (`ProjectRoleDefinition | null`), `open`, `onClose`, `onSaved`.

```typescript
import { useState, useEffect } from 'react';
import { Drawer, Table, Checkbox, Button, Space, message, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { roleSchemesApi, type ProjectRoleDefinition } from '../../api/role-schemes';

// Все 23 разрешения, сгруппированные по категориям
const PERMISSION_CATEGORIES = [
  {
    category: 'Задачи',
    permissions: [
      { key: 'ISSUES_VIEW',          label: 'Просмотр' },
      { key: 'ISSUES_CREATE',        label: 'Создание' },
      { key: 'ISSUES_EDIT',          label: 'Редактирование' },
      { key: 'ISSUES_DELETE',        label: 'Удаление' },
      { key: 'ISSUES_ASSIGN',        label: 'Назначение' },
      { key: 'ISSUES_CHANGE_STATUS', label: 'Смена статуса' },
      { key: 'ISSUES_CHANGE_TYPE',   label: 'Смена типа' },
    ],
  },
  {
    category: 'Спринты',
    permissions: [
      { key: 'SPRINTS_VIEW',   label: 'Просмотр' },
      { key: 'SPRINTS_MANAGE', label: 'Управление' },
    ],
  },
  {
    category: 'Релизы',
    permissions: [
      { key: 'RELEASES_VIEW',   label: 'Просмотр' },
      { key: 'RELEASES_MANAGE', label: 'Управление' },
    ],
  },
  {
    category: 'Участники',
    permissions: [
      { key: 'MEMBERS_VIEW',   label: 'Просмотр' },
      { key: 'MEMBERS_MANAGE', label: 'Управление' },
    ],
  },
  {
    category: 'Время',
    permissions: [
      { key: 'TIME_LOGS_VIEW',   label: 'Просмотр' },
      { key: 'TIME_LOGS_CREATE', label: 'Создание' },
      { key: 'TIME_LOGS_MANAGE', label: 'Управление' },
    ],
  },
  {
    category: 'Комментарии',
    permissions: [
      { key: 'COMMENTS_VIEW',   label: 'Просмотр' },
      { key: 'COMMENTS_CREATE', label: 'Создание' },
      { key: 'COMMENTS_MANAGE', label: 'Управление' },
    ],
  },
  {
    category: 'Настройки проекта',
    permissions: [
      { key: 'PROJECT_SETTINGS_VIEW', label: 'Просмотр' },
      { key: 'PROJECT_SETTINGS_EDIT', label: 'Редактирование' },
    ],
  },
  {
    category: 'Доски',
    permissions: [
      { key: 'BOARDS_VIEW',   label: 'Просмотр' },
      { key: 'BOARDS_MANAGE', label: 'Управление' },
    ],
  },
] as const;

interface Props {
  schemeId: string;
  role: ProjectRoleDefinition | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

type PermissionMap = Record<string, boolean>;

// Строки таблицы: одна строка = одна категория
type MatrixRow = { category: string; permissions: { key: string; label: string }[] };

export default function PermissionMatrixDrawer({ schemeId, role, open, onClose, onSaved }: Props) {
  const [permMap, setPermMap] = useState<PermissionMap>({});
  const [saving, setSaving] = useState(false);

  // Инициализация при открытии
  useEffect(() => {
    if (!role || !open) return;
    const map: PermissionMap = {};
    for (const p of role.permissions) {
      map[p.permission] = p.granted;
    }
    setPermMap(map);
  }, [role, open]);

  const handleSave = async () => {
    if (!role) return;
    setSaving(true);
    try {
      await roleSchemesApi.updatePermissions(schemeId, role.id, permMap);
      message.success('Права сохранены');
      onSaved();
      onClose();
    } catch {
      message.error('Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!role) return;
    const map: PermissionMap = {};
    for (const p of role.permissions) map[p.permission] = p.granted;
    setPermMap(map);
  };

  // Колонки: "Категория" + по одному столбцу на уникальные метки действий
  // Находим все уникальные метки
  const allLabels = Array.from(
    new Set(PERMISSION_CATEGORIES.flatMap(c => c.permissions.map(p => p.label)))
  );

  const columns: ColumnsType<MatrixRow> = [
    {
      title: 'Категория',
      dataIndex: 'category',
      width: 160,
      render: (v: string) => <strong>{v}</strong>,
    },
    ...allLabels.map(label => ({
      title: label,
      width: 110,
      render: (_: unknown, row: MatrixRow) => {
        const perm = row.permissions.find(p => p.label === label);
        if (!perm) return null;
        return (
          <Checkbox
            checked={permMap[perm.key] ?? false}
            onChange={e => setPermMap(prev => ({ ...prev, [perm.key]: e.target.checked }))}
          />
        );
      },
    })),
  ];

  const dataSource: MatrixRow[] = PERMISSION_CATEGORIES.map(c => ({
    category: c.category,
    permissions: c.permissions as unknown as { key: string; label: string }[],
  }));

  return (
    <Drawer
      title={
        <Space>
          <span>Права:</span>
          <Tag color={role?.color ?? 'default'}>{role?.name}</Tag>
        </Space>
      }
      open={open}
      onClose={onClose}
      width={760}
      extra={
        <Space>
          <Button onClick={handleReset}>Сбросить</Button>
          <Button type="primary" loading={saving} onClick={handleSave}>Сохранить</Button>
        </Space>
      }
    >
      <Table
        rowKey="category"
        dataSource={dataSource}
        columns={columns}
        pagination={false}
        size="small"
        scroll={{ x: 'max-content' }}
      />
    </Drawer>
  );
}
```

---

### ЗАДАЧА 9 — Frontend: создать `AdminRoleSchemesPage.tsx`

**Файл:** `frontend/src/pages/admin/AdminRoleSchemesPage.tsx`

Страница-список схем. Паттерн: точная копия `AdminWorkflowSchemesPage.tsx`, но для схем доступа.

Функциональность:
- Таблица: название + тег «По умолчанию» (blue), описание, кол-во ролей, кол-во проектов, кнопки действий
- Кнопка «Настроить» — `navigate('/admin/role-schemes/:id')`
- Кнопка «Переименовать» — открывает модалку с формой (name, description)
- Кнопка «Удалить» — `Popconfirm`, disabled если `isDefault === true`
- Кнопка «Создать» вверху справа
- При ошибке удаления `SCHEME_IN_USE` — показывать `message.error('Нельзя удалить: схема используется проектами')`

Структура компонента:
```typescript
import { roleSchemesApi, type ProjectRoleScheme } from '../../api/role-schemes';
// ... (по аналогии с AdminWorkflowSchemesPage, заменить workflowSchemesApi → roleSchemesApi,
//      WorkflowScheme → ProjectRoleScheme, маршруты /admin/workflow-schemes → /admin/role-schemes)
```

---

### ЗАДАЧА 10 — Frontend: создать `AdminRoleSchemeDetailPage.tsx`

**Файл:** `frontend/src/pages/admin/AdminRoleSchemeDetailPage.tsx`

Страница детали схемы. Две вкладки AntD `Tabs`.

**Вкладка «Роли»:**
- Кнопка «← Назад» — `navigate('/admin/role-schemes')`
- Заголовок: название схемы + тег «По умолчанию»
- Таблица ролей: цвет-тег, название, ключ, тег «Системная» (если isSystem), кол-во участников
- Кнопки для каждой роли:
  - «Права» → открывает `PermissionMatrixDrawer`
  - «Редактировать» → модалка (name, description, color picker или color input)
  - «Удалить» → `Popconfirm`, disabled если `isSystem === true`
- Кнопка «Добавить роль» вверху → модалка с полями: name, key (uppercase validation), description, color

**Вкладка «Проекты»:**
- Таблица привязанных проектов: ключ, название, кнопка «Отвязать» (Popconfirm)
- Внизу или вверху: Select с поиском для добавления проекта (загружать из `/api/projects`) + кнопка «Привязать»
- Если схема `isDefault` — показать информационный Alert: «Эта схема применяется ко всем проектам без явной привязки»

```typescript
import { useParams, useNavigate } from 'react-router-dom';
import { Tabs } from 'antd';
import PermissionMatrixDrawer from '../../components/admin/PermissionMatrixDrawer';
import { roleSchemesApi, type ProjectRoleScheme, type ProjectRoleDefinition } from '../../api/role-schemes';
import { listProjects } from '../../api/projects';
```

Состояние компонента:
```typescript
const [scheme, setScheme] = useState<ProjectRoleScheme | null>(null);
const [allProjects, setAllProjects] = useState<Project[]>([]);
const [matrixRole, setMatrixRole] = useState<ProjectRoleDefinition | null>(null);
const [matrixOpen, setMatrixOpen] = useState(false);
const [roleModalOpen, setRoleModalOpen] = useState(false);
const [editingRole, setEditingRole] = useState<ProjectRoleDefinition | null>(null);
```

---

### ЗАДАЧА 11 — Frontend: добавить маршруты в `App.tsx`

**Файл:** `frontend/src/App.tsx`

Добавить импорты рядом с `AdminWorkflowSchemesPage`:
```typescript
import AdminRoleSchemesPage from './pages/admin/AdminRoleSchemesPage';
import AdminRoleSchemeDetailPage from './pages/admin/AdminRoleSchemeDetailPage';
```

Добавить маршруты рядом с `/admin/workflow-schemes`:
```typescript
<Route path="admin/role-schemes" element={<AdminRoleSchemesPage />} />
<Route path="admin/role-schemes/:id" element={<AdminRoleSchemeDetailPage />} />
```

---

### ЗАДАЧА 12 — Frontend: добавить пункт в Sidebar

**Файл:** `frontend/src/components/layout/Sidebar.tsx`

Добавить пункт в секцию «Пользователи» рядом с «Назначение ролей»:
```typescript
{ type: 'link', path: '/admin/roles',        label: 'Назначение ролей' },
{ type: 'link', path: '/admin/role-schemes', label: 'Схемы доступа' },  // НОВОЕ
```

---

### ЗАДАЧА 13 — Frontend: обновить `AdminRolesPage.tsx` — динамические роли

**Файл:** `frontend/src/pages/admin/AdminRolesPage.tsx`

Проблема: при назначении роли участнику используется хардкодный массив `['ADMIN','MANAGER','USER','VIEWER']`.

Что изменить:

1. Добавить состояние `schemeRoles` и при смене выбранного проекта загружать роли через `roleSchemesApi.getForProject(projectId)`.

2. Заменить хардкодный Select ролей на динамический:
```typescript
// Было (хардкод):
<Select>
  <Select.Option value="ADMIN">ADMIN</Select.Option>
  ...
</Select>

// Станет (динамика):
<Select loading={rolesLoading}>
  {schemeRoles.map(role => (
    <Select.Option key={role.id} value={role.id}>
      <Tag color={role.color ?? 'default'}>{role.name}</Tag>
    </Select.Option>
  ))}
</Select>
```

3. В теле `assignProjectRoleDto` передавать `roleId` вместо `role`:
```typescript
// Было:
await adminApi.assignProjectRole(userId, { projectId, role });
// Станет:
await adminApi.assignProjectRole(userId, { projectId, roleId });
```

4. В колонке «Роль» таблицы — отображать `Tag` с цветом из `ProjectRoleDefinition`.

5. Убрать константу `ROLE_COLORS` (цвет теперь приходит из `role.color`).

6. Убрать блок `ACCESS_RIGHTS_MD` и статический `<ReactMarkdown>` — заменить кнопкой «Настроить схемы доступа» → `navigate('/admin/role-schemes')`.

---

### ЗАДАЧА 14 — Тесты

**Файл:** `backend/src/modules/project-role-schemes/__tests__/project-role-schemes.service.test.ts`

Покрыть unit-тестами (Vitest + Prisma mock):

```typescript
describe('getSchemeForProject', () => {
  it('возвращает явно привязанную схему');
  it('fallback на isDefault=true если нет привязки');
  it('бросает AppError 500 если нет ни привязки, ни дефолта');
});

describe('deleteScheme', () => {
  it('удаляет схему без привязанных проектов');
  it('бросает 400 SCHEME_IN_USE если есть привязанные проекты');
  it('бросает 400 при попытке удалить isDefault схему');
});

describe('deleteRole', () => {
  it('удаляет кастомную роль без участников');
  it('бросает 400 при попытке удалить isSystem роль');
  it('бросает 400 ROLE_IN_USE если у роли есть участники');
});

describe('updatePermissions', () => {
  it('upsert всех переданных разрешений');
  it('инвалидирует кэш схемы');
});
```

**Файл:** `backend/src/modules/project-role-schemes/__tests__/project-role-schemes.router.test.ts`

Integration-тесты (Supertest):
- `GET /api/admin/role-schemes` — 200 для ADMIN, 403 для USER, 401 без токена
- `POST /api/admin/role-schemes` — 201 для ADMIN, валидация name (required)
- `DELETE /api/admin/role-schemes/:id` — 400 SCHEME_IN_USE для схемы с проектами
- `POST /api/admin/role-schemes/:id/projects` — привязка, проверка upsert (смена схемы)
- `PUT /api/admin/role-schemes/:id/roles/:roleId/permissions` — сохраняет матрицу, возвращает роль с permissions
- `DELETE /api/admin/role-schemes/:id/roles/:roleId` — 400 для isSystem роли

---

## Порядок выполнения задач

```
1  → Prisma schema (новые модели)
2  → Seed (дефолтная схема + backfill)
3  → Backend: модуль project-role-schemes (dto + service + router)
4  → Backend: app.ts (регистрация роутера)
5  → Backend: rbac.ts (requireProjectPermission)
6  → Backend: admin.dto.ts + admin.service.ts
7  → Frontend: api/role-schemes.ts
8  → Frontend: PermissionMatrixDrawer.tsx
9  → Frontend: AdminRoleSchemesPage.tsx
10 → Frontend: AdminRoleSchemeDetailPage.tsx
11 → Frontend: App.tsx (маршруты)
12 → Frontend: Sidebar.tsx (навигация)
13 → Frontend: AdminRolesPage.tsx (динамические роли)
14 → Тесты
```

---

## Оценка трудоёмкости

| Задача | Часы |
|--------|------|
| 1 — Prisma schema | 1 |
| 2 — Seed + backfill | 2 |
| 3 — Backend модуль (dto + service + router) | 6 |
| 4 — app.ts | 0.5 |
| 5 — rbac.ts | 2 |
| 6 — admin.dto.ts + service | 1 |
| 7 — api/role-schemes.ts | 1 |
| 8 — PermissionMatrixDrawer | 3 |
| 9 — AdminRoleSchemesPage | 2 |
| 10 — AdminRoleSchemeDetailPage | 5 |
| 11 — App.tsx | 0.5 |
| 12 — Sidebar.tsx | 0.5 |
| 13 — AdminRolesPage обновление | 2 |
| 14 — Тесты | 6 |
| Code review + fixes | 2 |
| **Итого** | **34.5** |
