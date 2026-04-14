# ТЗ: RBAC Multi-Role — Переработка системы ролей

**Статус:** AGREED  
**Дата:** 2026-04-13  
**Автор:** St1tcher86  

---

## 1. Контекст и мотивация

### Текущее состояние (проблема)

Пользователь имеет **одну системную роль** (`user.role: UserRole`). Это не позволяет:
- Назначить пользователю одновременно роль `RELEASE_MANAGER` и роль `ADMIN`
- Выдать роль `RELEASE_MANAGER` без потери текущей роли
- Реализовать комбинацию прав (например, аудитор + менеджер релизов)

### Текущие роли (до переработки)

```
SUPER_ADMIN | ADMIN | MANAGER | RELEASE_MANAGER | USER | VIEWER
```

Все — глобальные, одна на пользователя. `MANAGER` — глобальная роль без чёткой семантики проектного уровня.

### Цель

Перейти на модель **множественных системных ролей** (many-to-many) с чёткими границами:
- Системные роли — глобальные привилегии
- Проектные роли — права в рамках конкретного проекта (уже реализованы через `UserProjectRole`, не меняются)

### Принятые решения

| Вопрос | Решение |
|--------|---------|
| Пользователи с глобальной ролью `MANAGER` при миграции | Получают системную роль `USER` + проектную роль `MANAGER` во **всех** проектах, где они являются участниками |
| Роль `USER` — обязательная? | Да. `USER` — несъёмная базовая роль. Снять можно только деактивацией (`isActive=false`). API должен возвращать 400 при попытке удалить `USER`, если это единственная роль |
| Переходный период | Нет. Переключение одномоментное. Fallback на старое поле не нужен |

---

## 2. Новая модель системных ролей

### 2.1 Системные роли (глобальные)

| Роль | Описание | Права |
|------|----------|-------|
| `SUPER_ADMIN` | Суперадминистратор системы | Всё. Без исключений. Единственный, кто может назначать/снимать роль `ADMIN` и `SUPER_ADMIN`. |
| `ADMIN` | Администратор системы | Управление пользователями, проектами, workflow, схемами. Видит все проекты. Не может менять SUPER_ADMIN. |
| `RELEASE_MANAGER` | Глобальный менеджер релизов | Полное управление релизами (create/edit/delete/transition). Чтение всех проектов (задачи, спринты, доски). Не управляет пользователями. |
| `USER` | Пользователь системы | Базовый доступ: вход в систему, личный профиль, учёт своего времени. Без доступа к проектам, если нет проектной роли. **Несъёмная.** |
| `AUDITOR` | Аудитор | Вход в систему + чтение всех проектов (задачи, спринты, доски, релизы). Без права на запись. |

> `MANAGER` как глобальная роль упраздняется. Права менеджера — только на проектном уровне через `UserProjectRole`.

### 2.2 Проектные роли (без изменений)

Реализованы через `UserProjectRole`. Дают права в рамках конкретного проекта:

| Роль | Права в проекте |
|------|----------------|
| `ADMIN` (проектный) | Полное управление проектом, включая настройки и участников |
| `MANAGER` (проектный) | Управление задачами, спринтами, досками |
| `USER` (проектный) | Работа с задачами (создание, редактирование своих) |
| `VIEWER` (проектный) | Только чтение |

### 2.3 Матрица доступа

| Ресурс / Действие | SUPER_ADMIN | ADMIN | RELEASE_MANAGER | AUDITOR | USER | Проектная роль |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Управление пользователями | ✅ | ✅ | ❌ | ❌ | ❌ | — |
| Управление ролями пользователей | ✅ | ✅* | ❌ | ❌ | ❌ | — |
| Назначение SUPER_ADMIN / ADMIN | ✅ | ❌ | ❌ | ❌ | ❌ | — |
| Управление проектами (CRUD) | ✅ | ✅ | ❌ | ❌ | ❌ | ADMIN (проект.) |
| Просмотр всех проектов | ✅ | ✅ | ✅ | ✅ | ❌ | по роли |
| Задачи: чтение | ✅ | ✅ | ✅ | ✅ | ❌ | USER+ |
| Задачи: запись | ✅ | ✅ | ❌ | ❌ | ❌ | USER+ |
| Релизы: полное управление | ✅ | ✅ | ✅ | ❌ | ❌ | — |
| Релизы: чтение | ✅ | ✅ | ✅ | ✅ | ❌ | USER+ |
| Workflow / схемы | ✅ | ✅ | ❌ | ❌ | ❌ | — |
| Личный профиль | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Учёт времени (своё) | ✅ | ✅ | ✅ | ❌ | ✅ | USER+ |
| Admin-панель | ✅ | ✅ | ❌ | ❌ | ❌ | — |

\* ADMIN не может менять роли пользователей со статусом SUPER_ADMIN и не может назначать роль SUPER_ADMIN.

---

## 3. Изменения в базе данных

### 3.1 Новая таблица `UserSystemRole`

```prisma
model UserSystemRole {
  id        String         @id @default(cuid())
  userId    String
  role      SystemRoleType
  createdAt DateTime       @default(now())
  createdBy String?        // userId того, кто назначил

  user      User           @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, role])
  @@map("user_system_roles")
}

enum SystemRoleType {
  SUPER_ADMIN
  ADMIN
  RELEASE_MANAGER
  USER
  AUDITOR
}
```

### 3.2 Изменение модели `User`

```prisma
model User {
  // ... существующие поля ...
  // role UserRole @default(USER)  <- УДАЛЯЕТСЯ
  systemRoles UserSystemRole[]     // <- ДОБАВЛЯЕТСЯ
}
```

Старое поле `role` и enum `UserRole` удаляются **в той же миграции** (нет переходного периода).

### 3.3 Миграция данных: `user.role` → `user_system_roles`

Выполняется внутри Prisma migration-файла как SQL-скрипт:

```sql
-- 1. Перенести SUPER_ADMIN
INSERT INTO user_system_roles (id, user_id, role, created_at)
SELECT gen_random_uuid(), id, 'SUPER_ADMIN', NOW()
FROM users WHERE role = 'SUPER_ADMIN';

-- 2. Перенести ADMIN
INSERT INTO user_system_roles (id, user_id, role, created_at)
SELECT gen_random_uuid(), id, 'ADMIN', NOW()
FROM users WHERE role = 'ADMIN';

-- 3. Перенести RELEASE_MANAGER
INSERT INTO user_system_roles (id, user_id, role, created_at)
SELECT gen_random_uuid(), id, 'RELEASE_MANAGER', NOW()
FROM users WHERE role = 'RELEASE_MANAGER';

-- 4. Перенести VIEWER → AUDITOR
INSERT INTO user_system_roles (id, user_id, role, created_at)
SELECT gen_random_uuid(), id, 'AUDITOR', NOW()
FROM users WHERE role = 'VIEWER';

-- 5. Перенести глобальных MANAGER → проектная роль во всех проектах
--    (UserProjectRole уже существует — добавить MANAGER там, где ещё нет)
INSERT INTO user_project_roles (id, user_id, project_id, role, created_at)
SELECT gen_random_uuid(), u.id, p.id, 'MANAGER', NOW()
FROM users u
CROSS JOIN projects p
WHERE u.role = 'MANAGER'
ON CONFLICT (user_id, project_id, role) DO NOTHING;

-- 6. Все пользователи получают базовую роль USER
INSERT INTO user_system_roles (id, user_id, role, created_at)
SELECT gen_random_uuid(), id, 'USER', NOW()
FROM users
ON CONFLICT (user_id, role) DO NOTHING;

-- 7. Удалить старое поле role из users (выполняется через Prisma migrate)
```

> **Примечание по п.5:** Глобальный MANAGER получает проектную роль MANAGER во ВСЕХ проектах системы (CROSS JOIN). Если список проектов нужно ограничить — потребуется ручная корректировка после деплоя.

---

## 4. Backend — полный список изменений по файлам

### 4.1 Prisma / Database

| Файл | Что менять |
|------|-----------|
| `backend/src/prisma/schema.prisma` | Удалить `role UserRole` у User. Добавить `systemRoles UserSystemRole[]`. Добавить модель `UserSystemRole`. Добавить enum `SystemRoleType`. Удалить enum `UserRole`. |

### 4.2 Auth Core

| Файл | Строки | Что менять |
|------|--------|-----------|
| `backend/src/shared/utils/jwt.ts` | 6, 9, 12 | `role: UserRole` → `systemRoles: SystemRoleType[]` в типе payload. Обновить sign/verify. |
| `backend/src/shared/types/index.ts` | 2, 8 | Тип `AuthRequest.user`: `role: UserRole` → `systemRoles: SystemRoleType[]` |
| `backend/src/shared/middleware/auth.ts` | 2, 49 | При декодировании JWT: `role: payload.role` → `systemRoles: payload.systemRoles` |
| `backend/src/shared/middleware/rbac.ts` | 2, 8, 13, 25, 37 | Все функции переписать под массив. `requireRole` → `requireSystemRole`. Обновить `isSuperAdmin`, `requireProjectRole`. |
| `backend/src/shared/auth/roles.ts` | 1–12 | Полностью переписать: `hasRequiredRole(role, req)` → `hasSystemRole(roles[], role)`, `isSuperAdmin(roles[])`, добавить `hasGlobalProjectReadAccess(roles[])`. |

### 4.3 Auth Service

| Файл | Строки | Что менять |
|------|--------|-----------|
| `backend/src/modules/auth/auth.service.ts` | 53, 56, 71, 100, 117, 123, 160, 175, 198 | Все Prisma select: `role: true` → `systemRoles: { select: { role: true } }`. JWT payload: передавать массив. Ответ `/me`: добавить `systemRoles`. |

### 4.4 Users & Admin Services

| Файл | Строки | Что менять |
|------|--------|-----------|
| `backend/src/modules/users/users.service.ts` | 10, 46–49, 55, 62, 67, 73 | `RoleChangeActor` тип: `role` → `systemRoles[]`. Все `isSuperAdmin(actor.role)` → `isSuperAdmin(actor.systemRoles)`. Метод `changeRole` — переосмыслить как `setSystemRoles` (принимает новый массив). |
| `backend/src/modules/admin/admin.service.ts` | 109, 159, 163 | Prisma select: добавить `systemRoles`. Создание пользователя: через `UserSystemRole.create`. |
| `backend/src/modules/users/super-admin-bootstrap.service.ts` | 18, 28, 38 | При upsert: создавать запись в `user_system_roles` вместо `data: { role: 'SUPER_ADMIN' }`. |

### 4.5 DTO / Validation

| Файл | Строки | Что менять |
|------|--------|-----------|
| `backend/src/modules/users/users.dto.ts` | 9 | `ChangeRoleDto`: поле `role: UserRole` → `roles: SystemRoleType[]`. Добавить `AssignSystemRoleDto`. |

### 4.6 Admin Router — новые endpoints

| Файл | Строки | Что менять |
|------|--------|-----------|
| `backend/src/modules/admin/admin.router.ts` | 3, 16, 25, 45, 54, 63, 72, 82, 91, 100, 109, 118, 127, 136, 150, 159, 170, 182, 207, 230 | Обновить импорт middleware. Добавить: `GET /users/:id/system-roles`, `POST /users/:id/system-roles`, `DELETE /users/:id/system-roles/:role`. Удалить или задепрекейтить `PATCH /users/:id/role`. |

### 4.7 Модульные роутеры (только guards)

Все `requireRole(...)` работают корректно после обновления middleware. Однако есть inline-проверки `req.user.role ===` / `req.user!.role` — они требуют ручной замены:

| Файл | Строки | Что менять |
|------|--------|-----------|
| `backend/src/modules/issues/issues.router.ts` | 36, 56, 196, 306 | `isSuperAdmin(req.user.role)` → `isSuperAdmin(req.user.systemRoles)`. Передавать `systemRoles` в `updateStatus`, `executeTransition`. |
| `backend/src/modules/releases/releases.router.ts` | 174, 193, 211 | `req.user!.role` → `req.user!.systemRoles`. Передавать `systemRoles` в release workflow engine. Убрать `MANAGER` из guards: `requireRole('ADMIN','MANAGER','RELEASE_MANAGER')` → `requireRole('ADMIN','RELEASE_MANAGER')`. |
| `backend/src/modules/comments/comments.router.ts` | 29, 36 | `req.user!.role` → `req.user!.systemRoles` при вызове сервисного метода. |
| `backend/src/modules/time/time.router.ts` | 58 | `requester.role === 'ADMIN' \|\| requester.role === 'MANAGER'` → проверку через `hasSystemRole(req.user.systemRoles, 'ADMIN')`. |

### 4.8 Сервисный слой модулей

| Файл | Строки | Что менять |
|------|--------|-----------|
| `backend/src/modules/issues/issues.service.ts` | 6, 503, 517, 981, 992 | Параметр `actorRole?: UserRole` → `actorRoles?: SystemRoleType[]`. Обновить все вызовы `executeTransition`. |
| `backend/src/modules/comments/comments.service.ts` | 23, 26, 37, 40 | Параметр `userRole: string` → `userRoles: SystemRoleType[]`. Проверки: `!(['ADMIN','SUPER_ADMIN'] as SystemRoleType[]).some(r => userRoles.includes(r))`. |
| `backend/src/modules/workflow-engine/workflow-engine.service.ts` | 2, 134, 223, 389 | Тип `actorRole: UserRole` → `actorRoles: SystemRoleType[]`. Передавать массив в conditions/validators. |
| `backend/src/modules/workflow-engine/conditions/index.ts` | 1, 6, 20 | `actorRole: UserRole` в контексте → `actorRoles: SystemRoleType[]`. При проверке `includes` — итерировать массив. |
| `backend/src/modules/releases/release-workflow-engine.service.ts` | 1, 35, 46, 50, 89, 169, 189, 226, 256 | Тип `UserRole` → `SystemRoleType[]` везде в контексте. `rule.roles.includes(ctx.actorRole)` → `ctx.actorRoles.some(r => rule.roles.includes(r))`. |
| `backend/src/modules/releases/releases.service.ts` | 1, 423, 500, 502 | Параметр `actorRole?: UserRole` → `actorRoles?: SystemRoleType[]`. |
| `backend/src/modules/webhooks/gitlab.service.ts` | 1, 49, 106 | Обновить тип агента, передавать `systemRoles` в `executeTransition`. |

### 4.9 Скрипты, bootstrap, seed

| Файл | Строки | Что менять |
|------|--------|-----------|
| `backend/src/prisma/bootstrap.ts` | 10, 24, 27–32, 113 | Тип `role: UserRole` → `systemRoles: SystemRoleType[]`. При создании пользователей — `UserSystemRole.createMany`. |
| `backend/src/prisma/seed.ts` | все вхождения `role:` | Заменить присвоение `role:` на создание записей в `user_system_roles`. |
| `backend/src/prisma/seed-workflow.ts` | по поиску | Аналогично. |
| `backend/src/prisma/seed-release-workflow.ts` | по поиску | Аналогично. |
| `backend/src/scripts/promote-super-admin.ts` | 16 | Обновить вывод: `user.systemRoles` вместо `user.role`. |
| `backend/src/prisma/prod-sync.domain.ts` | 201 | Обновить маппинг при синхронизации пользователей. |
| `backend/src/prisma/prod-sync.ts` | 308, 362, 368 | Обновить логику sync для `systemRoles`. |

---

## 5. Frontend — полный список изменений по файлам

### 5.1 Типы и утилиты

| Файл | Строки | Что менять |
|------|--------|-----------|
| `frontend/src/types/auth.types.ts` | 3, 9 | `UserRole` union → `SystemRoleType`. `role: UserRole` → `systemRoles: SystemRoleType[]` в интерфейсе User. |
| `frontend/src/lib/roles.ts` | 1–11 | Переписать все функции под массив. `hasRequiredRole(userRole, req)` → `hasSystemRole(userRoles[], role)`. |

### 5.2 Auth Store

| Файл | Что менять |
|------|-----------|
| `frontend/src/store/authStore.ts` | Поле `user.role` → `user.systemRoles: SystemRoleType[]`. Добавить хелпер `hasSystemRole(role)` в store. Обновить инициализацию из ответа `/me`. |

### 5.3 API Client

| Файл | Строки | Что менять |
|------|--------|-----------|
| `frontend/src/api/admin.ts` | 23, 44, 59–60 | Интерфейс `AdminUser`: `role:` → `systemRoles: SystemRoleType[]`. Метод `changeGlobalRole` — заменить на `setSystemRoles(userId, roles[])` или `addSystemRole` / `removeSystemRole`. |

### 5.4 Страницы (Pages)

| Файл | Строки | Что менять |
|------|--------|-----------|
| `frontend/src/pages/admin/AdminUsersPage.tsx` | 195, 331, 334, 389, 398, 477 | `user.role` → `user.systemRoles`. Фильтрация по роли. Проверка прав текущего пользователя (`currentUser?.systemRoles.includes('SUPER_ADMIN')`). |
| `frontend/src/pages/admin/AdminRolesPage.tsx` | 59, 151–299, 318, 320 | **Ключевое изменение UI.** Секция системных ролей: `<Select>` (одна роль) → `<Checkbox.Group>` или `<Select mode="multiple">`. API: вместо `changeGlobalRole(id, role)` — `setSystemRoles(id, roles[])` или инкрементальные add/remove. |
| `frontend/src/pages/admin/AdminDashboardPage.tsx` | 57 | `u.role` → отображать список из `u.systemRoles`. |
| `frontend/src/pages/SettingsPage.tsx` | 461, 548 | `user?.role` → `user?.systemRoles` для отображения. |
| `frontend/src/pages/BoardPage.tsx` | 134 | `user?.role !== 'VIEWER'` → через хелпер `hasSystemRole` или проверку проектной роли. |
| `frontend/src/pages/ProjectsPage.tsx` | 132 | `hasAnyRequiredRole` — будет работать после обновления хелпера. |
| `frontend/src/pages/SprintsPage.tsx` | 192 | Аналогично. |
| `frontend/src/pages/TeamsPage.tsx` | 80 | Аналогично. |
| `frontend/src/pages/ProjectDetailPage.tsx` | 197, 198, 709 | `user?.role !== 'VIEWER'` → хелпер. |
| `frontend/src/pages/IssueDetailPage.tsx` | 217, 218, 504, 631 | Через хелпер — работает после обновления. |
| `frontend/src/pages/UatTestsPage.tsx` | 20, 22, 27, 35, 42, 44, 45, 55 | `user?.role as UatRole` → `user?.systemRoles?.[0] as UatRole`. Уточнить логику фильтрации для UAT. |
| `frontend/src/pages/ReleasesPage.tsx` | 154 | `user?.role` → `user?.systemRoles?.includes(...)`. |
| `frontend/src/pages/GlobalReleasesPage.tsx` | 985 | Аналогично. |
| `frontend/src/pages/AdminPage.tsx` | 131, 452, 471 | Отображение ролей. |

### 5.5 Компоненты (Components)

| Файл | Строки | Что менять |
|------|--------|-----------|
| `frontend/src/components/layout/Sidebar.tsx` | 9, 73, 107, 108, 152, 153, 229, 479 | Параметр `userRole?: UserRole` → `userRoles?: SystemRoleType[]`. Все `hasRequiredRole(userRole, ...)` → хелперы с массивом. |
| `frontend/src/components/layout/AppLayout.tsx` | 114 | Передавать `systemRoles` в Sidebar вместо одной роли. |
| `frontend/src/components/layout/TopBar.tsx` | 57 | Отображение роли: показывать список или «старшую» роль. |

---

## 6. Тесты — что обновить

| Файл | Строки | Что менять |
|------|--------|-----------|
| `backend/tests/auth.test.ts` | 24, 90, 95 | `expect(res.body.user.role).toBe('USER')` → `expect(res.body.user.systemRoles).toContain('USER')`. |
| `backend/tests/users.test.ts` | 57, 66 | Аналогично. |
| `backend/tests/super-admin-bootstrap.test.ts` | 27, 39 | `expect(promoted.role).toBe('SUPER_ADMIN')` → `expect(promoted.systemRoles).toContain('SUPER_ADMIN')`. |

---

## 7. Итоговый план задач (порядок выполнения)

Задачи выполняются последовательно — каждый шаг зависит от предыдущего.

| # | Задача | Файлы |
|---|--------|-------|
| **1** | **Prisma: схема + миграция** — `UserSystemRole` таблица, `SystemRoleType` enum, миграционный SQL (перенос данных + удаление `user.role`) | `schema.prisma`, новый migration |
| **2** | **Backend core: типы и хелперы** — обновить `roles.ts`, `types/index.ts`, JWT utils | `roles.ts`, `types/index.ts`, `jwt.ts` |
| **3** | **Backend core: middleware** — `auth.ts`, `rbac.ts` под массив | `auth.ts`, `rbac.ts` |
| **4** | **Auth service** — JWT payload, `/me`, все select | `auth.service.ts` |
| **5** | **Users & Admin services** — `changeRole` → `setSystemRoles`, bootstrap, DTO | `users.service.ts`, `admin.service.ts`, `super-admin-bootstrap.service.ts`, `users.dto.ts` |
| **6** | **Admin router** — новые endpoints system-roles | `admin.router.ts` |
| **7** | **Модульные роутеры** — inline `req.user.role` → `systemRoles` | `issues.router.ts`, `releases.router.ts`, `comments.router.ts`, `time.router.ts` |
| **8** | **Сервисный слой модулей** — параметры `actorRole` → `actorRoles[]` | `issues.service.ts`, `comments.service.ts`, `workflow-engine.service.ts`, `conditions/index.ts`, `release-workflow-engine.service.ts`, `releases.service.ts`, `gitlab.service.ts` |
| **9** | **Seeds & Scripts** — обновить все seed/bootstrap скрипты | `bootstrap.ts`, `seed.ts`, `seed-workflow.ts`, `seed-release-workflow.ts`, `promote-super-admin.ts`, `prod-sync.ts`, `prod-sync.domain.ts` |
| **10** | **Frontend: типы и store** — `auth.types.ts`, `authStore.ts`, `lib/roles.ts`, `api/admin.ts` | 4 файла |
| **11** | **Frontend: AdminRolesPage** — UI multi-select системных ролей | `AdminRolesPage.tsx`, `AdminUsersPage.tsx` |
| **12** | **Frontend: остальные страницы и компоненты** — обновить все проверки ролей | 14 файлов из п.5.4–5.5 |
| **13** | **Тесты** | 3 test-файла |

**Итого:** ~65 файлов, 13 задач. Рекомендую реализовывать в одном PR (одна ветка), так как нет переходного периода — всё либо работает, либо нет.

---

## 8. Что НЕ меняется

- Проектные роли (`UserProjectRole`) — структура, API, UI не меняются
- Логика workflow engine — только типы параметров, не алгоритмы
- Структура teams, sprints, boards — без изменений
- Права внутри проекта — определяются проектной ролью, не системной
- Redis сессии — если хранятся только `userId`, не `role`, то ничего не меняется; если хранится `role` — обновить на `systemRoles[]`
