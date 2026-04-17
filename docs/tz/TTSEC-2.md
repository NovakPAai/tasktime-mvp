# ТЗ: TTSEC-2 — Группы пользователей, раздел «Безопасность» в профиле и гранулярность permission-матрицы

**Дата:** 2026-04-17
**Тип:** EPIC | **Приоритет:** HIGH | **Статус:** OPEN
**Проект:** TaskTime MVP / RBAC (TTSEC + TTMP)
**Родительская задача:** [TTMP-159](./TTMP-159.md) — Схемы доступа
**Автор ТЗ:** Claude Code

---

## 1. Постановка задачи

Одно сводное ТЗ объединяет две смежные доработки RBAC, чтобы избежать двух миграций подряд и рассинхрона permission-matrix:

**Направление A — «Группы пользователей»:** ввести `UserGroup` как уровень абстракции между юзером и проектной ролью. Эффективная роль = объединение прямых + групповых. Вкладка «Безопасность» в профиле. Миграция существующих `UserProjectRole` в Legacy-группы.

**Направление B — «Гранулярность permission-матрицы»:** разбить `SPRINTS_MANAGE` / `RELEASES_MANAGE` на `CREATE / EDIT / DELETE`; добавить `COMMENTS_DELETE_OTHERS` и `TIME_LOGS_DELETE_OTHERS` для модерации чужих записей.

Направления объединены потому, что:
1. Обе задачи правят Prisma schema и миграционный путь вокруг RBAC — одна координированная миграция избавляет от конфликтов.
2. Backfill permissions (B) должен отработать **до** создания Legacy-групп (A), иначе Legacy-группы получат старые `*_MANAGE`, и потом придётся раздавать гранулярные двум раз — сначала ролям, потом группам.
3. `AuditLog` / `ProjectRoleDefinition` задеваются обоими направлениями.

### Пользовательские сценарии

**HR-менеджер** создаёт группу `Frontend Team`, добавляет 12 пользователей, выдаёт группе роль `Developer` в 5 проектах — все 12 разом получают права. При увольнении — убирает из группы, доступы снимаются в одном месте.

**Администратор** в `PermissionMatrixDrawer` ставит роли `USER` флажок `SPRINTS_CREATE` без `SPRINTS_DELETE` — пользователь может создавать, но не удалять спринты. Для комментариев даёт `MANAGER`-у `COMMENTS_DELETE_OTHERS` без `COMMENTS_MANAGE` — может удалять чужие, но не менять настройки модуля.

**Пользователь** в своём профиле в разделе «Безопасность» видит: список групп и таблицу `Проект → Роль → Источник (группа / прямое)`.

---

## 2. Зафиксированные решения (approved by owner, 2026-04-17)

### Гранулярность (направление B)

| # | Сущность | Подход | Основание |
|---|----------|--------|-----------|
| 1 | **Спринты** | Разделить `SPRINTS_MANAGE` на `SPRINTS_CREATE` + `SPRINTS_EDIT` + `SPRINTS_DELETE`. `*_MANAGE` удаляется из матрицы UI, но остаётся в enum как deprecated (PostgreSQL не поддерживает `DROP VALUE`). | Симметрия с `ISSUES_*` CRUD |
| 2 | **Релизы** | Аналогично спринтам | По аналогии |
| 3 | **Комментарии** | Оставить `COMMENTS_MANAGE` + добавить `COMMENTS_DELETE_OTHERS`. Автор всегда может удалить/редактировать свой комментарий без отдельного permission | Модель: запись пользователя, owner имеет полный контроль; модерация чужих — отдельное право |
| 4 | **Время** | Та же схема, что для комментариев: `TIME_LOGS_MANAGE` + `TIME_LOGS_DELETE_OTHERS` | Symmetry с comments |

**Новых permissions (8):** `SPRINTS_CREATE`, `SPRINTS_EDIT`, `SPRINTS_DELETE`, `RELEASES_CREATE`, `RELEASES_EDIT`, `RELEASES_DELETE`, `COMMENTS_DELETE_OTHERS`, `TIME_LOGS_DELETE_OTHERS`.

**Backfill:** если у роли был granted `SPRINTS_MANAGE` — раздать `SPRINTS_CREATE + EDIT + DELETE`; для `RELEASES_MANAGE` — аналогично; `COMMENTS_MANAGE` → `+ COMMENTS_DELETE_OTHERS`; `TIME_LOGS_MANAGE` → `+ TIME_LOGS_DELETE_OTHERS`. Эффективный уровень доступа сохраняется.

### Группы (направление A)

- Группы — плоские (без вложенности).
- Права юзера в проекте = direct `UserProjectRole` ∪ roles-from-groups. При конфликте — роль с максимальным числом permissions (детерминированный tiebreaker по `roleId`).
- Миграция: для каждой уникальной `(projectId, roleId)` в `UserProjectRole` создаётся `UserGroup` с именем `Legacy: {project.key} — {role.name}`; юзеры переносятся в соответствующие Legacy-группы.
- Поле `UserProjectRole.source: RoleAssignmentSource { DIRECT, GROUP }`. Feature-flag `DIRECT_ROLES_DISABLED=true` после миграции блокирует создание `DIRECT`-assignments через API.

---

## 3. Текущее состояние

### Модель
| Модель | Состояние | Проблема |
|--------|-----------|----------|
| `UserProjectRole` | [schema.prisma:84](../../backend/src/prisma/schema.prisma#L84) | Прямая связь user ↔ project ↔ role; unique `(userId, projectId)`; нет `source` |
| `ProjectRoleDefinition` | Создана в TTMP-159 | — |
| `ProjectRoleScheme` | Создана в TTMP-159 | — |
| `ProjectPermission` enum | Содержит `SPRINTS_MANAGE`, `RELEASES_MANAGE`, `COMMENTS_MANAGE`, `TIME_LOGS_MANAGE` | Слишком крупно-гранулярно |
| **Нет** `UserGroup` / `UserGroupMember` / `ProjectGroupRole` | — | Ключевой gap |

### Backend
| Файл | Проблема |
|------|----------|
| [backend/src/shared/auth/rbac.ts](../../backend/src/shared/auth/) | Считает права только через `UserProjectRole` direct; `requireProjectPermission` — по одному permission, не по OR-списку |
| `modules/user-groups/` | Не существует |
| [sprints.router.ts](../../backend/src/modules/sprints/sprints.router.ts) / [releases.router.ts](../../backend/src/modules/releases/releases.router.ts) | `requireProjectPermission(..., 'SPRINTS_MANAGE')` / `'RELEASES_MANAGE'` на всех мутациях (CRUD-middleware не гранулярно) |
| [comments.router.ts](../../backend/src/modules/comments/comments.router.ts) / [time.router.ts](../../backend/src/modules/time/time.router.ts) | `DELETE` разрешает только автору или `*_MANAGE`, нет промежуточного `DELETE_OTHERS` |

### Frontend
| Страница | Состояние |
|----------|-----------|
| [AdminRolesPage](../../frontend/src/pages/admin/AdminRolesPage.tsx) | Прямое назначение roleId на (user, project) |
| [PermissionMatrixDrawer](../../frontend/src/components/admin/PermissionMatrixDrawer.tsx) | Неодинаковая гранулярность: задачи — 7 operations, спринты/релизы — 2, комментарии/время — 3 |
| [ProfilePage](../../frontend/src/pages/ProfilePage.tsx) | Нет раздела «Безопасность» |
| `AdminGroupsPage` / `AdminGroupDetailPage` | Не существуют |
| [Sidebar](../../frontend/src/components/layout/Sidebar.tsx) | Нет пункта «Группы» |

---

## 4. Зависимости

### Prisma (единая миграция)
- [x] Модели `UserGroup`, `UserGroupMember`, `ProjectGroupRole`
- [x] `UserProjectRole.source: RoleAssignmentSource` enum
- [x] Расширение `ProjectPermission` enum: 8 новых значений (направление B)
- [x] Миграция данных: backfill permissions → создание Legacy-групп (порядок важен, §5.4)

### Backend
- [x] Новый модуль `modules/user-groups/`: `service.ts`, `router.ts`, `dto.ts`
- [x] `shared/auth/rbac.ts` — эффективные права с учётом групп + кэш
- [x] `shared/auth/rbac.ts` — helper `assertProjectPermission(user, projectId, permissions: ProjectPermission[])` (OR-список)
- [x] `users.service.ts` — `getUserSecurity(userId)`
- [x] `sprints.router.ts`, `releases.router.ts` — заменить `*_MANAGE` на гранулярные permissions
- [x] `comments.router.ts`, `time.router.ts` — `DELETE` с проверкой author OR `*_DELETE_OTHERS` OR `*_MANAGE`
- [x] Инвалидация кэша прав при изменениях членства групп / bindings
- [x] Новые audit-события (§5.11)

### Frontend
- [x] `pages/admin/AdminGroupsPage.tsx` — CRUD списка групп
- [x] `pages/admin/AdminGroupDetailPage.tsx` — tabs `Members` / `Project Roles`
- [x] `components/admin/GroupMembersTable.tsx` — новый
- [x] `components/admin/GroupProjectRolesTable.tsx` — новый
- [x] `pages/ProfilePage.tsx` — `Tabs` + вкладка «Безопасность»
- [x] `components/profile/SecurityTab.tsx` — новый
- [x] `components/admin/PermissionMatrixDrawer.tsx` — новые колонки для сущностей B
- [x] `components/layout/Sidebar.tsx` — пункт «Группы»
- [x] `api/user-groups.ts`, `api/user-security.ts` — новые

### Внешние зависимости
- Нет новых

### Блокеры
- **TTMP-159** (project role schemes) должен быть замержен — группы выдают `roleId` в рамках схем; гранулярные permissions живут в `ProjectRoleDefinition.permissions`

---

## 5. Подробное описание правок

### 5.1. Prisma schema

#### 5.1.1. Расширение `ProjectPermission` enum (направление B)

```prisma
enum ProjectPermission {
  // ... existing ...

  SPRINTS_VIEW
  SPRINTS_CREATE            // NEW
  SPRINTS_EDIT              // NEW
  SPRINTS_DELETE            // NEW
  SPRINTS_MANAGE            // deprecated, остаётся в enum (PG не поддерживает DROP VALUE)

  RELEASES_VIEW
  RELEASES_CREATE           // NEW
  RELEASES_EDIT             // NEW
  RELEASES_DELETE           // NEW
  RELEASES_MANAGE           // deprecated

  COMMENTS_VIEW
  COMMENTS_CREATE
  COMMENTS_DELETE_OTHERS    // NEW
  COMMENTS_MANAGE           // kept (включает DELETE_OTHERS + настройки модуля)

  TIME_LOGS_VIEW
  TIME_LOGS_CREATE
  TIME_LOGS_DELETE_OTHERS   // NEW
  TIME_LOGS_MANAGE          // kept

  USER_GROUP_VIEW           // NEW — system-level permission
  USER_GROUP_MANAGE         // NEW — system-level permission
}
```

#### 5.1.2. Группы (направление A)

```prisma
model UserGroup {
  id          String   @id @default(uuid())
  name        String   @unique
  description String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  members      UserGroupMember[]
  projectRoles ProjectGroupRole[]

  @@map("user_groups")
  @@index([name])
}

model UserGroupMember {
  groupId   String
  userId    String
  addedAt   DateTime @default(now())
  addedById String?

  group   UserGroup @relation(fields: [groupId], references: [id], onDelete: Cascade)
  user    User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  addedBy User?     @relation("GroupMemberAddedBy", fields: [addedById], references: [id])

  @@id([groupId, userId])
  @@index([userId])
  @@map("user_group_members")
}

model ProjectGroupRole {
  id        String   @id @default(uuid())
  groupId   String
  projectId String
  roleId    String
  schemeId  String
  createdAt DateTime @default(now())

  group          UserGroup             @relation(fields: [groupId], references: [id], onDelete: Cascade)
  project        Project               @relation(fields: [projectId], references: [id], onDelete: Cascade)
  roleDefinition ProjectRoleDefinition @relation(
    fields: [roleId, schemeId], references: [id, schemeId], onDelete: Restrict
  )

  @@unique([groupId, projectId])
  @@index([projectId])
  @@index([groupId])
  @@map("project_group_roles")
}

enum RoleAssignmentSource { DIRECT  GROUP }

model UserProjectRole {
  // ... existing fields ...
  source RoleAssignmentSource @default(DIRECT)
}
```

### 5.2. Эффективные права — алгоритм

```ts
// backend/src/shared/auth/rbac.ts

async function computeEffectiveRole(userId: string, projectId: string) {
  const direct = await getDirectRole(userId, projectId);   // source=DIRECT
  const groupRoles = await prisma.projectGroupRole.findMany({
    where: { projectId, group: { members: { some: { userId } } } },
    include: { roleDefinition: { include: { permissions: true } } },
  });
  const candidates = [direct, ...groupRoles.map(r => r.roleDefinition)].filter(Boolean);
  if (candidates.length === 0) return null;

  // Priority: max permissions count; tiebreaker — roleId asc (детерминизм)
  return candidates.sort((a, b) => {
    const d = b.permissions.length - a.permissions.length;
    return d !== 0 ? d : a.id.localeCompare(b.id);
  })[0];
}

// Новый helper для OR-списка permissions (нужен для author OR *_DELETE_OTHERS OR *_MANAGE)
async function assertProjectPermission(
  user: AuthUser,
  projectId: string,
  permissions: ProjectPermission[],
): Promise<void> {
  const role = await computeEffectiveRole(user.userId, projectId);
  if (!role) throw new AppError(403, 'No role in project');
  const granted = new Set(role.permissions.map(p => p.permission));
  if (!permissions.some(p => granted.has(p))) {
    throw new AppError(403, `Requires one of: ${permissions.join(', ')}`);
  }
}
```

**Материализованный кэш** `effective_project_roles(userId, projectId, roleId, source)` — пересчитывается триггером на изменения `UserProjectRole`, `UserGroupMember`, `ProjectGroupRole`. Redis-кэш `rbac:perms:{userId}:{projectId}` сбрасывается через `invalidateProjectPermissionCache()`.

### 5.3. Миграция — единый план

Скрипт `backend/src/prisma/migrations/20260421000000_unified_groups_and_granular_perms/migration.sql` — два файла в правильном порядке:

**Файл 1: `migration.sql` (no transaction, ALTER TYPE)**
```sql
-- no transaction
ALTER TYPE "ProjectPermission" ADD VALUE IF NOT EXISTS 'SPRINTS_CREATE';
ALTER TYPE "ProjectPermission" ADD VALUE IF NOT EXISTS 'SPRINTS_EDIT';
ALTER TYPE "ProjectPermission" ADD VALUE IF NOT EXISTS 'SPRINTS_DELETE';
ALTER TYPE "ProjectPermission" ADD VALUE IF NOT EXISTS 'RELEASES_CREATE';
ALTER TYPE "ProjectPermission" ADD VALUE IF NOT EXISTS 'RELEASES_EDIT';
ALTER TYPE "ProjectPermission" ADD VALUE IF NOT EXISTS 'RELEASES_DELETE';
ALTER TYPE "ProjectPermission" ADD VALUE IF NOT EXISTS 'COMMENTS_DELETE_OTHERS';
ALTER TYPE "ProjectPermission" ADD VALUE IF NOT EXISTS 'TIME_LOGS_DELETE_OTHERS';
ALTER TYPE "ProjectPermission" ADD VALUE IF NOT EXISTS 'USER_GROUP_VIEW';
ALTER TYPE "ProjectPermission" ADD VALUE IF NOT EXISTS 'USER_GROUP_MANAGE';
```

**Файл 2: `20260421000001_backfill_and_legacy_groups/migration.sql` (транзакция)**
```sql
BEGIN;

-- ШАГ 1: backfill гранулярных permissions (направление B)
INSERT INTO "project_role_permissions" ("id", "role_id", "permission", "granted")
SELECT gen_random_uuid(), role_id, new_perm, true
FROM (
  SELECT DISTINCT role_id FROM "project_role_permissions"
  WHERE permission = 'SPRINTS_MANAGE' AND granted = true
) src
CROSS JOIN (VALUES
  ('SPRINTS_CREATE'::"ProjectPermission"),
  ('SPRINTS_EDIT'::"ProjectPermission"),
  ('SPRINTS_DELETE'::"ProjectPermission")
) AS new_permissions(new_perm)
ON CONFLICT ("role_id", "permission") DO NOTHING;

-- RELEASES — аналогично
INSERT INTO "project_role_permissions" ("id", "role_id", "permission", "granted")
SELECT gen_random_uuid(), role_id, new_perm, true
FROM (
  SELECT DISTINCT role_id FROM "project_role_permissions"
  WHERE permission = 'RELEASES_MANAGE' AND granted = true
) src
CROSS JOIN (VALUES
  ('RELEASES_CREATE'::"ProjectPermission"),
  ('RELEASES_EDIT'::"ProjectPermission"),
  ('RELEASES_DELETE'::"ProjectPermission")
) AS new_permissions(new_perm)
ON CONFLICT ("role_id", "permission") DO NOTHING;

-- COMMENTS: MANAGE → + DELETE_OTHERS
INSERT INTO "project_role_permissions" ("id", "role_id", "permission", "granted")
SELECT gen_random_uuid(), role_id, 'COMMENTS_DELETE_OTHERS'::"ProjectPermission", true
FROM "project_role_permissions"
WHERE permission = 'COMMENTS_MANAGE' AND granted = true
ON CONFLICT ("role_id", "permission") DO NOTHING;

-- TIME_LOGS: MANAGE → + DELETE_OTHERS
INSERT INTO "project_role_permissions" ("id", "role_id", "permission", "granted")
SELECT gen_random_uuid(), role_id, 'TIME_LOGS_DELETE_OTHERS'::"ProjectPermission", true
FROM "project_role_permissions"
WHERE permission = 'TIME_LOGS_MANAGE' AND granted = true
ON CONFLICT ("role_id", "permission") DO NOTHING;

-- ШАГ 2: добавить поле source в UserProjectRole
ALTER TABLE "user_project_roles"
  ADD COLUMN "source" "RoleAssignmentSource" NOT NULL DEFAULT 'DIRECT';

-- ШАГ 3: создать таблицы групп (DDL уже сгенерирован Prisma)
-- CREATE TABLE "user_groups" ...
-- CREATE TABLE "user_group_members" ...
-- CREATE TABLE "project_group_roles" ...

-- ШАГ 4: Legacy-группы из существующих UserProjectRole (направление A)
-- 4.1: для каждой уникальной (projectId, roleId) создать UserGroup
INSERT INTO "user_groups" (id, name, description)
SELECT
  gen_random_uuid(),
  'Legacy: ' || p.key || ' — ' || rd.name,
  'Auto-created from direct UserProjectRole migration'
FROM (
  SELECT DISTINCT upr.project_id, upr.role_id, upr.scheme_id
  FROM "user_project_roles" upr
  WHERE upr.role_id IS NOT NULL
) distinct_roles
JOIN "projects" p ON p.id = distinct_roles.project_id
JOIN "project_role_definitions" rd ON rd.id = distinct_roles.role_id;

-- 4.2: ProjectGroupRole — связать каждую Legacy-группу с (project, role)
INSERT INTO "project_group_roles" (id, group_id, project_id, role_id, scheme_id)
SELECT
  gen_random_uuid(),
  ug.id,
  distinct_roles.project_id,
  distinct_roles.role_id,
  distinct_roles.scheme_id
FROM (
  SELECT DISTINCT upr.project_id, upr.role_id, upr.scheme_id
  FROM "user_project_roles" upr
  WHERE upr.role_id IS NOT NULL
) distinct_roles
JOIN "projects" p ON p.id = distinct_roles.project_id
JOIN "project_role_definitions" rd ON rd.id = distinct_roles.role_id
JOIN "user_groups" ug ON ug.name = 'Legacy: ' || p.key || ' — ' || rd.name;

-- 4.3: UserGroupMember — перенести членство
INSERT INTO "user_group_members" (group_id, user_id)
SELECT ug.id, upr.user_id
FROM "user_project_roles" upr
JOIN "projects" p ON p.id = upr.project_id
JOIN "project_role_definitions" rd ON rd.id = upr.role_id
JOIN "user_groups" ug ON ug.name = 'Legacy: ' || p.key || ' — ' || rd.name
ON CONFLICT (group_id, user_id) DO NOTHING;

-- ШАГ 5: пересчитать effective_project_roles для всех юзеров (триггер или материализация)
-- (выполняется отдельным job-ом после миграции либо через pg_notify)

COMMIT;
```

**Dry-run режим** (`--dry-run` в TS-обвязке): выводит отчёт без записи.

**Rollback-SQL** (`rollback.sql`, отдельный файл):
- `DROP TABLE` user_groups / user_group_members / project_group_roles
- `ALTER TABLE user_project_roles DROP COLUMN source`
- `DELETE FROM project_role_permissions WHERE permission IN ('SPRINTS_CREATE', ...)`
- (Новые enum values остаются — PG не поддерживает DROP VALUE; безопасно игнорируются.)

### 5.4. Seed и дефолтная матрица

**Файл:** `backend/src/prisma/seed.ts` — `DEFAULT_ROLE_MATRIX`:

| Permission | ADMIN | MANAGER | USER | VIEWER |
|------------|-------|---------|------|--------|
| SPRINTS_CREATE | ✓ | ✓ | — | — |
| SPRINTS_EDIT | ✓ | ✓ | — | — |
| SPRINTS_DELETE | ✓ | ✓ | — | — |
| RELEASES_CREATE | ✓ | ✓ | — | — |
| RELEASES_EDIT | ✓ | ✓ | — | — |
| RELEASES_DELETE | ✓ | ✓ | — | — |
| COMMENTS_DELETE_OTHERS | ✓ | ✓ | — | — |
| TIME_LOGS_DELETE_OTHERS | ✓ | ✓ | — | — |
| USER_GROUP_VIEW | ✓ | — | — | — |
| USER_GROUP_MANAGE | ✓ | — | — | — |

Удалить из матрицы `SPRINTS_MANAGE` и `RELEASES_MANAGE` (заменены гранулярными).

### 5.5. Middleware — замена проверок

**`sprints.router.ts`:**
```ts
router.post('/',        requireProjectPermission(getProjectId, 'SPRINTS_CREATE'), ...);
router.patch('/:id',    requireProjectPermission(getProjectId, 'SPRINTS_EDIT'),   ...);
router.delete('/:id',   requireProjectPermission(getProjectId, 'SPRINTS_DELETE'), ...);
```

**`releases.router.ts`** — аналогично.

**`comments.router.ts` — `DELETE /api/comments/:id`:**
```ts
router.delete('/:id', authenticate, async (req, res, next) => {
  const comment = await prisma.comment.findUnique({
    where: { id: req.params.id },
    select: { authorId: true, issue: { select: { projectId: true } } },
  });
  if (!comment) return next(new AppError(404, 'Comment not found'));

  const isAuthor = comment.authorId === req.user.userId;
  if (!isAuthor) {
    await assertProjectPermission(req.user, comment.issue.projectId,
      ['COMMENTS_DELETE_OTHERS', 'COMMENTS_MANAGE']);
  }
  // ... delete
});
```

**`time.router.ts` — `DELETE /api/time-logs/:id`** — аналогично с `['TIME_LOGS_DELETE_OTHERS', 'TIME_LOGS_MANAGE']`.

### 5.6. Backend API — группы

| Метод | Путь | Permission | Назначение |
|-------|------|-----------|-----------|
| `GET` | `/admin/user-groups` | `USER_GROUP_VIEW` | Список + `memberCount`, `projectCount` |
| `POST` | `/admin/user-groups` | `USER_GROUP_MANAGE` | `{ name, description? }` |
| `GET` | `/admin/user-groups/:id` | `USER_GROUP_VIEW` | Детали (members + projectRoles) |
| `PATCH` | `/admin/user-groups/:id` | `USER_GROUP_MANAGE` | Rename / description |
| `DELETE` | `/admin/user-groups/:id?confirm=true` | `USER_GROUP_MANAGE` | Удалить; возвращает список отозванных прав |
| `POST` | `/admin/user-groups/:id/members` | `USER_GROUP_MANAGE` | `{ userIds: string[] }` batch |
| `DELETE` | `/admin/user-groups/:id/members/:userId` | `USER_GROUP_MANAGE` | — |
| `POST` | `/admin/user-groups/:id/project-roles` | `USER_GROUP_MANAGE` | `{ projectId, roleId }` |
| `DELETE` | `/admin/user-groups/:id/project-roles/:projectId` | `USER_GROUP_MANAGE` | — |
| `GET` | `/users/me/security` | (auth) | Мои группы + эффективные роли |
| `GET` | `/admin/users/:id/security` | `USER_GROUP_VIEW` | Аналогично для любого user |

Формат `GET /users/me/security`:
```ts
{
  groups: [{ id, name, addedAt, memberCount }],
  projectRoles: [{
    project: { id, key, name },
    role: { id, name, permissions: [...] },
    source: 'GROUP' | 'DIRECT',
    sourceGroups: [{ id, name }],  // если GROUP
  }],
  updatedAt: '2026-04-17T...',
}
```

### 5.7. Frontend — админ-страницы

**`AdminGroupsPage`** — таблица `Name / Description / Members / Projects / Created`; `+ New Group` модалка; поиск; клик → `/admin/groups/:id`.

**`AdminGroupDetailPage`** — `Tabs: Members | Project Roles`:
- Members: user-таблица + `Add users` мульти-select; `✕` на строке.
- Project Roles: `Project → Role`; `+ Grant role` модалка (роль выбирается в рамках схемы проекта).
- Header: inline-edit `Name`, `Description`, `Delete group` (confirm со списком затронутых).

**`PermissionMatrixDrawer`** (направление B):

```ts
// Спринты
{
  category: 'Спринты',
  permissions: [
    { key: 'SPRINTS_VIEW',   label: 'Просмотр' },
    { key: 'SPRINTS_CREATE', label: 'Создание' },
    { key: 'SPRINTS_EDIT',   label: 'Редактирование' },
    { key: 'SPRINTS_DELETE', label: 'Удаление' },
  ],
},
// Релизы — аналогично
// Комментарии
{
  category: 'Комментарии',
  permissions: [
    { key: 'COMMENTS_VIEW',          label: 'Просмотр' },
    { key: 'COMMENTS_CREATE',        label: 'Создание' },
    { key: 'COMMENTS_DELETE_OTHERS', label: 'Удаление чужих' },
    { key: 'COMMENTS_MANAGE',        label: 'Управление' },
  ],
},
// Время — добавить TIME_LOGS_DELETE_OTHERS
```

Удалить из UI: `SPRINTS_MANAGE`, `RELEASES_MANAGE` (из enum не удаляем, но скрыть из матрицы).

### 5.8. Frontend — профиль «Безопасность»

`ProfilePage` оборачивается в `Tabs: Основное | Безопасность`.

`SecurityTab.tsx`:
```
┌─────────────────────────────────────────────┐
│ Мои группы                                  │
│ • Frontend Team (42 участника)              │
│ • On-call rotation (8 участников)           │
│                                             │
│ Мои роли в проектах                         │
│ ┌──────────┬──────────┬──────────────────┐  │
│ │ Проект   │ Роль     │ Источник         │  │
│ ├──────────┼──────────┼──────────────────┤  │
│ │ TTMP     │ Developer│ Frontend Team    │  │
│ │ TTUI     │ Lead     │ Прямое назначение│  │
│ └──────────┴──────────┴──────────────────┘  │
│ [Экспорт в CSV]  Обновлено 2 мин назад      │
└─────────────────────────────────────────────┘
```

- Read-only. Клик на роль → tooltip со списком permissions. Клик на группу → popover.
- Кнопка `Экспорт в CSV`.

### 5.9. Sidebar

В [Sidebar.tsx](../../frontend/src/components/layout/Sidebar.tsx) добавить пункт `Группы` в секцию «Админ» (видимость по `USER_GROUP_VIEW`).

### 5.10. Документация

`docs/user-manual/features/access-schemes.md`:
- Обновить таблицу permissions (новые гранулярные + `DELETE_OTHERS`).
- Описать семантику групп, эффективных прав, миграцию Legacy-групп.
- Пример: как создать группу, выдать ей роль в проекте.

### 5.11. Audit-события

Новые:
- Groups: `user_group.created`, `user_group.renamed`, `user_group.deleted`, `user_group.members_changed` (diff `{added[], removed[]}`), `project_group_role.granted`, `project_group_role.revoked`
- Migration: `migration.legacy_groups_created`, `migration.granular_perms_backfilled`, `migration.direct_roles_disabled`
- Security trail: `user_project_role.effective_changed` (авто-лог при пересчёте кэша)

---

## 6. Требования

### Функциональные — направление A (группы)
- **FR-A1**: CRUD групп через `/admin/user-groups`.
- **FR-A2**: Batch add/remove участников.
- **FR-A3**: Выдача / отзыв проектной роли группе.
- **FR-A4**: Эффективная роль = max permissions(direct + group); детерминированный tiebreaker.
- **FR-A5**: Кэш эффективных ролей инвалидируется при изменениях членства / bindings.
- **FR-A6**: Вкладка «Безопасность» в профиле — группы + эффективные роли с указанием источника.
- **FR-A7**: Миграция `UserProjectRole` → Legacy-группы без потери прав.
- **FR-A8**: Feature-flag `DIRECT_ROLES_DISABLED` блокирует прямые assign-ы через API.
- **FR-A9**: `DELETE` группы требует `confirm=true` + список затронутых.

### Функциональные — направление B (гранулярность)
- **FR-B1**: Матрица показывает `SPRINTS_CREATE/EDIT/DELETE` вместо `SPRINTS_MANAGE`.
- **FR-B2**: Матрица показывает `RELEASES_CREATE/EDIT/DELETE` вместо `RELEASES_MANAGE`.
- **FR-B3**: Матрица показывает `COMMENTS_DELETE_OTHERS` рядом с `COMMENTS_MANAGE`.
- **FR-B4**: Матрица показывает `TIME_LOGS_DELETE_OTHERS` рядом с `TIME_LOGS_MANAGE`.
- **FR-B5**: Endpoints `sprints/releases` используют гранулярные permissions на CRUD.
- **FR-B6**: `DELETE` comment / time log — проверка `author OR *_DELETE_OTHERS OR *_MANAGE`.
- **FR-B7**: Backfill: роли с `SPRINTS_MANAGE`/`RELEASES_MANAGE` получают `CREATE+EDIT+DELETE`; с `COMMENTS_MANAGE`/`TIME_LOGS_MANAGE` — добавляется `DELETE_OTHERS`.

### Общее
- **FR-C1**: Эффективный уровень доступа у всех юзеров staging/prod сохраняется после миграции (diff-тест).
- **FR-C2**: `USER_GROUP_VIEW` / `USER_GROUP_MANAGE` добавлены в permission-матрицу как system-level.
- **FR-C3**: Audit пишется по всем изменениям групп / bindings / миграции.

### Нефункциональные
- **NFR-1**: `GET /issues` p95 регресс ≤ 10% после включения групп.
- **NFR-2**: Миграция 100 юзеров × 20 проектов × 5 ролей ≤ 60 сек.
- **NFR-3**: `GET /users/me/security` ≤ 300ms p95.
- **NFR-4**: UI списка групп виртуализирован на 500+ групп.

### Безопасность
- **SEC-1**: Только `USER_GROUP_MANAGE` — CRUD групп и bindings.
- **SEC-2**: Юзер без `USER_GROUP_VIEW` видит только свои группы в `/users/me/security`.
- **SEC-3**: Миграция идемпотентна (повторный запуск не создаёт дубликаты).
- **SEC-4**: Каскад: delete user → `UserGroupMember`. Delete project → `ProjectGroupRole`. Delete `ProjectRoleDefinition` — `Restrict` при наличии bindings.
- **SEC-5**: Все мутации в `AuditLog` с `actorId`.
- **SEC-6**: `/admin/users/:id/security` — только с `USER_GROUP_VIEW`.
- **SEC-7**: `COMMENTS_MANAGE` overlap с `DELETE_OTHERS` — middleware проверяет OR-список, не ломает ранее работавшие права.

---

## 7. Критерии приёмки

### Направление A (группы)
- [ ] Миграция на staging: отчёт = реальности.
- [ ] Diff-тест effective permissions до / после миграции — идентичен для всех юзеров.
- [ ] Админ создаёт группу + 3 юзера + выдаёт `Developer` в проект → все 3 имеют permissions.
- [ ] Удаление юзера из группы → permissions пропадают ≤ 5 сек.
- [ ] Удаление группы (`confirm=true`) → права снимаются, audit записан.
- [ ] Профиль «Безопасность» показывает группы + эффективные роли + source.
- [ ] Конфликт ролей (2 группы с разными ролями на один проект) → выбирается роль с max permissions, детерминированно.
- [ ] `DIRECT_ROLES_DISABLED=true` → `POST /admin/user-project-roles` возвращает 403.

### Направление B (гранулярность)
- [ ] `SELECT * FROM project_role_permissions WHERE permission LIKE 'SPRINTS_%'` на staging — новые значения присутствуют.
- [ ] USER с `SPRINTS_CREATE` + без `SPRINTS_DELETE` может создать, но не удалить спринт (manual QA).
- [ ] MANAGER с `COMMENTS_DELETE_OTHERS` без `COMMENTS_MANAGE` — может удалить чужой комментарий, но не открывает настройки модуля.
- [ ] `DELETE /api/comments/:id` автором своего — 200; не автором без permissions — 403; с `COMMENTS_DELETE_OTHERS` — 200.
- [ ] `PermissionMatrixDrawer` показывает новые колонки; сохранение работает.
- [ ] `docs/user-manual/features/access-schemes.md` обновлён.

### Общее
- [ ] Performance: `GET /issues` p95 регресс ≤ 10%.
- [ ] E2E: полный сценарий (создать группу → выдать роль с гранулярными permissions → зайти юзером → проверить CRUD sprint → проверить DELETE чужого comment-а → проверить профиль «Безопасность») зелёный.
- [ ] Lint / typecheck / unit / integration — зелёные.
- [ ] Rollback-SQL проверен на staging.

---

## 8. Оценка трудоёмкости

| Этап | Часы |
|------|------|
| Analysis / согласование permission-matrix + merge-priority | 3 |
| **Prisma (единая миграция)** | |
| — Schema: UserGroup/Member/ProjectGroupRole + source enum + расширение ProjectPermission | 4 |
| — Migration SQL: ALTER TYPE + backfill granular + Legacy-группы + rollback.sql | 7 |
| — Seed + `DEFAULT_ROLE_MATRIX` | 1 |
| **Backend** | |
| — Модуль `user-groups` (CRUD + members + bindings) | 8 |
| — Эффективные роли + материализованный кэш + Redis invalidation | 8 |
| — `assertProjectPermission` helper (OR-список) | 1 |
| — `/users/me/security` + `/admin/users/:id/security` | 3 |
| — Middleware: sprints CRUD | 1 |
| — Middleware: releases CRUD | 1 |
| — Middleware + service: comments DELETE (author OR delete_others OR manage) | 1 |
| — Middleware + service: time logs DELETE | 1 |
| — Audit-события | 2 |
| **Frontend** | |
| — AdminGroupsPage + AdminGroupDetailPage + api client | 10 |
| — PermissionMatrixDrawer (новые колонки + убрать *_MANAGE) | 1 |
| — ProfilePage «Безопасность» + SecurityTab | 5 |
| — Sidebar «Группы» | 1 |
| **Тесты** | |
| — Unit: merge-priority, миграция, backfill | 3 |
| — Integration: API groups / granular perms / OR-helper | 4 |
| — E2E: полный сценарий | 3 |
| **Performance benchmark + фиксы** | 3 |
| **Docs + QA на staging** | 2 |
| **Code review + исправления** | 3 |
| **Итого** | **75** |

Экономия vs сумма отдельных ТЗ (64 + 8.75 = 72.75ч): фактически добавили +2ч на координацию, но сэкономили бы 2× миграционный риск и одну общую QA-сессию, если делать раздельно.

---

## 8.1. Фазы реализации и чек-листы

Эпик разбит на 4 фазы; каждая — отдельный PR. Переход к следующей только после мерджа предыдущей.

### Фаза 1 — Foundations (Prisma + миграция + seed) — **done (2026-04-17)**
- [x] TTSEC-3: `schema.prisma` — `UserGroup`, `UserGroupMember`, `ProjectGroupRole`, `RoleAssignmentSource` enum, расширение `ProjectPermission` (8 project-level + 2 system-level).
- [x] TTSEC-4: SQL-миграции — две директории:
  - `20260421000000_ttsec2_enum_values/migration.sql` — `ALTER TYPE ADD VALUE IF NOT EXISTS` × 10 (без соседних DDL/DML, чтобы Prisma не обернул в транзакцию — риск #6).
  - `20260421000001_ttsec2_groups_and_backfill/migration.sql` — `RoleAssignmentSource` enum + `source` колонка + три таблицы + FK + backfill гранулярных прав (`SPRINTS_MANAGE` → CREATE/EDIT/DELETE, `RELEASES_MANAGE` → аналогично, `COMMENTS_MANAGE`/`TIME_LOGS_MANAGE` → `+_DELETE_OTHERS`, ADMIN → `USER_GROUP_*`) + создание Legacy-групп по формуле `Legacy: {project.key} — {role.name}`. Порядок: backfill прав **до** Legacy-групп (риск #11).
  - `20260421000001_ttsec2_groups_and_backfill/rollback.sql` — manual rollback (DROP таблиц, DROP колонки source, DROP enum).
- [x] TTSEC-5: `seed.ts` → `DEFAULT_ROLE_MATRIX` обновлена. ADMIN: гранулярные + `*_DELETE_OTHERS` + `USER_GROUP_*`; MANAGER: гранулярные + `*_DELETE_OTHERS`; `COMMENTS_MANAGE` / `TIME_LOGS_MANAGE` сохранены для модерации и настроек модуля; `SPRINTS_MANAGE` / `RELEASES_MANAGE` удалены из default-матрицы (enum сохраняет их как deprecated).
- **DoD:** `npx prisma validate` зелёный ✅, `npx prisma generate` ✅, `npx tsc --noEmit` (backend) ✅. `prisma migrate deploy` на локальной БД не прогнан — Docker/PG локально недоступны; обязательно прогнать на staging CI перед мерджем (см. risk #1).

### Фаза 2 — Backend — **done (2026-04-17)**
- [x] TTSEC-6: модуль `modules/user-groups/` (CRUD + members + project-roles bindings). 4 audit-события. DELETE требует `?confirm=true` + impact (FR-A9).
- [x] TTSEC-7: `shared/middleware/rbac.ts` — `computeEffectiveRole` с учётом групп (max permissions, roleId tiebreaker), fallback на legacy-key если roleId stale/NULL, Redis-кэш `rbac:effective:{userId}:{projectId}` TTL 60s, `assertProjectPermission(user, projectId, permissions[])` OR-helper, `invalidateUserEffectivePermissions` / `invalidateProjectEffectivePermissions`.
- [x] TTSEC-8: `modules/user-security/` — `GET /users/me/security` + `GET /admin/users/:id/security` (роли с источником, группы, обновлено).
- [x] TTSEC-9: гранулярные permissions на всех CRUD/edit спринтов (SPRINTS_CREATE/EDIT) и релизов (RELEASES_CREATE/EDIT/DELETE, INTEGRATION-релизы — requireRole fallback); `DELETE /comments/:id` = author OR `COMMENTS_DELETE_OTHERS` OR `COMMENTS_MANAGE`; новый `DELETE /time-logs/:id` с той же схемой для time logs.
- [x] TTSEC-10: audit — `user_group.{created,renamed,updated,deleted,members_changed}`, `project_group_role.{granted,revoked}`, `comment.{updated,deleted}`, `time_log.deleted`.
- **DoD:** `npx tsc --noEmit` зелёный ✅. 24 unit-теста (rbac-effective + user-groups) ✅. Integration-тесты + perf-benchmark — в Phase 4 (требуют живой БД/Redis на CI).

### Фаза 3 — Frontend — **done (2026-04-17)**
- [x] TTSEC-11: `api/user-groups.ts` + `AdminGroupsPage` (список + CRUD + delete-with-impact модалка) + `AdminGroupDetailPage` (табы Участники / Проектные роли, добавление/удаление, grant/revoke с фильтрацией ролей по активной схеме проекта).
- [x] TTSEC-12: `PermissionMatrixDrawer` — гранулярные колонки для спринтов и релизов (CREATE/EDIT/DELETE), `*_DELETE_OTHERS` для комментариев и времени, новая категория «Группы пользователей» (`USER_GROUP_VIEW`/`USER_GROUP_MANAGE`); старые `SPRINTS_MANAGE`/`RELEASES_MANAGE` убраны из UI.
- [x] TTSEC-13: `api/user-security.ts` + `components/profile/SecurityTab.tsx` (группы, таблица проект/роль/источник с tooltip на permissions, CSV-экспорт); встроено в `SettingsPage` как карточку «Безопасность».
- [x] TTSEC-14: `Sidebar` — пункт «Группы» в секции «Пользователи» (под тем же admin-guard, что и остальные); `/admin/user-groups` + `/admin/user-groups/:id` в `App.tsx`.
- **DoD:** `npx tsc --noEmit` ✅, `npx eslint` ✅ для новых и изменённых файлов. Storybook не трогал — новые компоненты без stories (не требуется по спецификации; Phase 4 добавит при необходимости).

### Фаза 4 — QA + rollout — pending
- [ ] TTSEC-15: unit + integration + e2e.
- [ ] TTSEC-16: performance benchmark + фиксы.
- [ ] TTSEC-17: `docs/user-manual/features/access-schemes.md` + manual QA на staging.
- [ ] TTSEC-18: feature-flag `DIRECT_ROLES_DISABLED` + prod cutover.
- **DoD:** все критерии приёмки §7 закрыты; rollback-SQL проверен на staging.

---

## 9. План разбиения на подзадачи

| Ключ | Название | Оценка | Зависит |
|------|----------|--------|---------|
| **Фаза 1 — foundations (sequential)** | | | |
| TTSEC-3 | Prisma schema: UserGroup/Member/ProjectGroupRole + enum source + расширение ProjectPermission | 4ч | TTMP-159 |
| TTSEC-4 | Prisma migration SQL: ALTER TYPE + backfill granular + Legacy-группы | 7ч | TTSEC-3 |
| TTSEC-5 | Seed + `DEFAULT_ROLE_MATRIX` с новыми permissions | 1ч | TTSEC-3 |
| **Фаза 2 — backend (параллельно)** | | | |
| TTSEC-6 | Backend: модуль `user-groups` (CRUD + members + bindings) | 8ч | TTSEC-3 |
| TTSEC-7 | Backend: эффективные роли + кэш + инвалидация + `assertProjectPermission` helper | 9ч | TTSEC-3 |
| TTSEC-8 | Backend: `/users/me/security` + `/admin/users/:id/security` | 3ч | TTSEC-7 |
| TTSEC-9 | Backend middleware: sprints/releases гранулярные + comments/time DELETE_OTHERS | 4ч | TTSEC-4, TTSEC-7 |
| TTSEC-10 | Backend audit-события (все новые) | 2ч | TTSEC-6, TTSEC-9 |
| **Фаза 3 — frontend (параллельно)** | | | |
| TTSEC-11 | FE: AdminGroupsPage + AdminGroupDetailPage + api | 10ч | TTSEC-6 |
| TTSEC-12 | FE: PermissionMatrixDrawer (новые колонки) | 1ч | TTSEC-5 |
| TTSEC-13 | FE: ProfilePage «Безопасность» + SecurityTab | 5ч | TTSEC-8 |
| TTSEC-14 | FE: Sidebar «Группы» | 1ч | TTSEC-11 |
| **Фаза 4 — QA + rollout** | | | |
| TTSEC-15 | Тесты: unit + integration + e2e | 10ч | TTSEC-11..14 |
| TTSEC-16 | Performance benchmark + фиксы | 3ч | TTSEC-7 |
| TTSEC-17 | Docs: access-schemes.md + manual QA на staging | 2ч | TTSEC-12 |
| TTSEC-18 | Feature-flag `DIRECT_ROLES_DISABLED` + enforcement + prod cutover | 1ч | TTSEC-4, TTSEC-15 |

**Критический путь:** TTSEC-3 → TTSEC-4 → TTSEC-7 → TTSEC-8 → TTSEC-13 → TTSEC-15 → TTSEC-18 ≈ 34ч (≈4 рабочих дня).

---

## 10. Риски

| # | Риск | Вер. | Влияние | Митигация |
|---|------|------|---------|-----------|
| 1 | Миграция `UserProjectRole` → Legacy-группы теряет права у 100+ юзеров | Средняя | Потеря доступов | Dry-run с diff-отчётом; rollback SQL; обязательный прогон на staging; pre/post snapshot |
| 2 | Эффективные роли через группы → регресс latency горячих путей | Высокая | Медленный UI | Материализованная таблица `effective_project_roles` + Redis cache; бенчмарк p95 |
| 3 | Конфликт ролей (2+ групп разные роли на один проект) | Высокая | Неожиданные права | Priority: max permissions count; tiebreaker — `roleId` asc |
| 4 | Удаление большой группы каскадит права без уведомления | Средняя | Массовая потеря доступа | `confirm=true` + список затронутых |
| 5 | `DIRECT UserProjectRole` остаются — shadow permissions | Средняя | Security issue | Feature-flag `DIRECT_ROLES_DISABLED` после миграции |
| 6 | `ALTER TYPE ADD VALUE` внутри транзакции (PostgreSQL) | Высокая | Миграция не накатится | Миграция помечена `-- no transaction` как первой строкой; проверить на staging |
| 7 | Legacy `SPRINTS_MANAGE`/`RELEASES_MANAGE` остаются в БД как мёртвый код | Средняя | Тех-долг | Плановая очистка в отдельном релизе (drop enum через пересоздание типа) |
| 8 | Custom-схемы клиентов: backfill раздаст новые права | Средняя | Ожидаемое расширение | Проверить список custom-схем после миграции |
| 9 | `COMMENTS_MANAGE` overlap с `DELETE_OTHERS` | Низкая | Регрессия | OR-helper `assertProjectPermission(..., [A, B])`; integration-тест |
| 10 | Массовые audit-записи при изменении членства группы | Низкая | Шум в логах | Batch-событие `user_group.members_changed` с diff |
| 11 | Порядок миграции: Legacy-группы созданы до backfill → получают старые `*_MANAGE` | Высокая | Двойная работа после | SQL-файлы в строгом порядке: backfill permissions **сначала**, группы **потом** (§5.3) |

---

## 11. Открытые вопросы

1. **Оставить ли прямые `UserProjectRole` после миграции?** Рекомендация: оставить через feature-flag `DIRECT_ROLES_DISABLED`, по умолчанию выключить. Позволяет экстренно дать роль в обход группы.
2. **Merge-priority** — count permissions vs явное `weight`. Рекомендация: count, weight добавить при реальных жалобах.
3. **Вложенные группы** — не в MVP.
4. **Уведомление юзеру** при получении/потере доступа — не в MVP.
5. **Наименование Legacy-групп:** префикс `Legacy:` — легко фильтровать/удалить после cleanup.
6. **`SPRINTS_MANAGE` / `RELEASES_MANAGE` deprecation cleanup** — отдельный релиз; drop enum через пересоздание типа (если потребуется).
