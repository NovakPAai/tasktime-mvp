# TaskTime MVP — План пересборки с нуля (v2)

**Дата:** 2026-03-09
**Статус:** В работе (Sprint 2 запущен)
**Конкуренты:** Т1 Сфера, EVA, Diasoft

---

## 1. Технический стек

| Слой | Технология | Версия | Обоснование |
|------|-----------|--------|-------------|
| Language | **TypeScript** | 5.x | Типизация → меньше багов, лучше AI-генерация, Prisma/Ant Design нативно типизированы |
| Frontend | **React 18** + Vite | 18.x / 6.x | Стандарт индустрии (Jira, Confluence). Компонентная модель, огромная экосистема |
| UI Kit | **Ant Design** | 5.x | Enterprise-grade: таблицы, деревья, формы, drag-n-drop. Open source (MIT) |
| Backend | **Node.js + Express** | 20 LTS / 4.x | Проверено в прототипе. Зрелая экосистема middleware |
| ORM | **Prisma** | 6.x | Автомиграции, типогенерация из схемы, удобный query builder |
| Database | **PostgreSQL** | 16.x | В реестре российского ПО. ACID, JSONB, рекурсивные CTE |
| Cache | **Redis** | 7.x | Сессии, кэш, очереди нотификаций. Open source, в реестре РФ |
| Auth | **JWT** + refresh tokens | — | Как в текущем прототипе, но с refresh-токенами |
| Tests | **Vitest** + Supertest | — | Быстрые, совместимы с Vite. Unit + Integration |
| Linting | **ESLint** + Prettier | — | Единообразие кода |
| CI | **GitHub Actions** | — | Линтинг, тесты, сборка на каждый PR |

**Импортозамещение:** Все компоненты — open source (MIT/Apache). Нет проприетарных зависимостей. PostgreSQL и Redis — в реестре российского ПО. Совместимо с Red OS / Astra Linux.

---

## 2. Архитектура

### 2.1 Общая схема

```
┌─────────────────────────────────────────────────┐
│                   Browser                        │
│  React 18 + Ant Design + React Router            │
│  (Vite dev server / nginx static in prod)        │
└────────────────────┬────────────────────────────┘
                     │ HTTPS / REST API
┌────────────────────▼────────────────────────────┐
│              Nginx (reverse proxy)               │
│  SSL termination, static files, rate limiting    │
└────────────────────┬────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────┐
│           Node.js + Express (TypeScript)         │
│                                                  │
│  ┌─────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ Routes  │→ │ Services │→ │ Prisma Client │  │
│  │ (API)   │  │ (Logic)  │  │ (Repository)  │  │
│  └─────────┘  └──────────┘  └───────┬───────┘  │
│                                      │          │
│  Middleware: auth, rbac, audit,      │          │
│  validation, error-handler           │          │
└──────────────────────────────────────┼──────────┘
                                       │
              ┌────────────────────────┤
              │                        │
    ┌─────────▼──────┐    ┌───────────▼───────┐
    │  PostgreSQL 16  │    │     Redis 7       │
    │  (основная БД)  │    │ (сессии, кэш,    │
    │                 │    │  очереди)          │
    └─────────────────┘    └───────────────────┘
```

### 2.2 Модульный монолит (backend)

Каждый домен = отдельный модуль с чёткими границами. Модули НЕ импортируют друг у друга repository-слой.

```
backend/
├── src/
│   ├── app.ts                    # Express app setup
│   ├── server.ts                 # Entry point (listen)
│   ├── config.ts                 # Environment config
│   ├── prisma/
│   │   └── schema.prisma         # Единая схема БД
│   ├── shared/
│   │   ├── middleware/
│   │   │   ├── auth.ts           # JWT verify + refresh
│   │   │   ├── rbac.ts           # Role-based access
│   │   │   ├── audit.ts          # Audit logging middleware
│   │   │   ├── validate.ts       # Request validation (zod)
│   │   │   └── error-handler.ts  # Global error handler
│   │   ├── types/
│   │   │   └── index.ts          # Shared TypeScript types
│   │   └── utils/
│   │       ├── password.ts       # bcrypt helpers
│   │       └── jwt.ts            # JWT sign/verify
│   └── modules/
│       ├── auth/
│       │   ├── auth.router.ts
│       │   ├── auth.service.ts
│       │   └── auth.dto.ts       # Zod schemas for validation
│       ├── users/
│       │   ├── users.router.ts
│       │   ├── users.service.ts
│       │   └── users.dto.ts
│       ├── projects/
│       │   ├── projects.router.ts
│       │   ├── projects.service.ts
│       │   └── projects.dto.ts
│       ├── issues/
│       │   ├── issues.router.ts
│       │   ├── issues.service.ts
│       │   └── issues.dto.ts
│       ├── comments/
│       │   ├── comments.router.ts
│       │   ├── comments.service.ts
│       │   └── comments.dto.ts
│       ├── boards/
│       │   ├── boards.router.ts
│       │   └── boards.service.ts
│       ├── sprints/
│       │   ├── sprints.router.ts
│       │   ├── sprints.service.ts
│       │   └── sprints.dto.ts
│       ├── time/
│       │   ├── time.router.ts
│       │   ├── time.service.ts
│       │   └── time.dto.ts
│       ├── teams/
│       │   ├── teams.router.ts
│       │   ├── teams.service.ts
│       │   └── teams.dto.ts
│       ├── audit/
│       │   ├── audit.router.ts
│       │   └── audit.service.ts
│       └── admin/
│           ├── admin.router.ts
│           └── admin.service.ts
├── tests/
│   ├── setup.ts                  # Test DB setup
│   ├── helpers.ts                # Auth helpers for tests
│   ├── auth.test.ts
│   ├── users.test.ts
│   ├── projects.test.ts
│   ├── issues.test.ts
│   └── ...
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── .env.example
```

### 2.3 Frontend (React)

```
frontend/
├── src/
│   ├── main.tsx                  # Entry point
│   ├── App.tsx                   # Router setup
│   ├── api/
│   │   ├── client.ts             # Axios instance + interceptors
│   │   ├── auth.ts               # Auth API calls
│   │   ├── projects.ts           # Projects API
│   │   ├── issues.ts             # Issues API
│   │   └── ...
│   ├── store/
│   │   ├── auth.store.ts         # Zustand auth state
│   │   ├── projects.store.ts
│   │   └── issues.store.ts
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppLayout.tsx     # Sidebar + Header + Content
│   │   │   ├── Sidebar.tsx
│   │   │   └── Header.tsx
│   │   ├── issues/
│   │   │   ├── IssueList.tsx
│   │   │   ├── IssueCard.tsx
│   │   │   ├── IssueForm.tsx
│   │   │   └── IssueDetail.tsx
│   │   ├── board/
│   │   │   ├── KanbanBoard.tsx
│   │   │   └── BoardColumn.tsx
│   │   └── common/
│   │       ├── LoadingSpinner.tsx
│   │       └── ErrorBoundary.tsx
│   ├── pages/
│   │   ├── LoginPage.tsx
│   │   ├── DashboardPage.tsx
│   │   ├── ProjectsPage.tsx
│   │   ├── ProjectDetailPage.tsx
│   │   ├── BoardPage.tsx
│   │   ├── BacklogPage.tsx
│   │   ├── SprintsPage.tsx
│   │   ├── TimePage.tsx
│   │   └── AdminPage.tsx
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   └── useProject.ts
│   └── types/
│       └── index.ts              # Shared frontend types
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── .env.example
```

**State management:** Zustand (легковесный, хорошо работает с TS и React 18).

---

## 3. Доменная модель (Prisma Schema)

### 3.1 Сущности первого спринта

```prisma
// ===== USERS & AUTH =====

model User {
  id            String    @id @default(uuid())
  email         String    @unique
  passwordHash  String    @map("password_hash")
  name          String
  role          UserRole  @default(USER)
  isActive      Boolean   @default(true) @map("is_active")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  // Relations
  assignedIssues Issue[]  @relation("assignee")
  createdIssues  Issue[]  @relation("creator")
  comments       Comment[]
  timeLogs       TimeLog[]
  auditLogs      AuditLog[]

  @@map("users")
}

enum UserRole {
  ADMIN
  MANAGER
  USER
  VIEWER
}

model RefreshToken {
  id        String   @id @default(uuid())
  token     String   @unique
  userId    String   @map("user_id")
  expiresAt DateTime @map("expires_at")
  createdAt DateTime @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("refresh_tokens")
}

// ===== PROJECTS =====

model Project {
  id          String   @id @default(uuid())
  name        String
  key         String   @unique  // e.g. "PROJ" — для issue-ключей типа PROJ-123
  description String?
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  // Relations
  issues  Issue[]
  sprints Sprint[]

  @@map("projects")
}

// ===== ISSUES (TASK HIERARCHY) =====

model Issue {
  id          String      @id @default(uuid())
  projectId   String      @map("project_id")
  number      Int         // Автоинкремент в рамках проекта (PROJ-1, PROJ-2...)
  title       String
  description String?
  type        IssueType   @default(TASK)
  status      IssueStatus @default(OPEN)
  priority    IssuePriority @default(MEDIUM)
  orderIndex  Int         @default(0) @map("order_index")

  // Hierarchy
  parentId    String?     @map("parent_id")
  parent      Issue?      @relation("issueHierarchy", fields: [parentId], references: [id])
  children    Issue[]     @relation("issueHierarchy")

  // Assignments
  assigneeId  String?     @map("assignee_id")
  creatorId   String      @map("creator_id")
  assignee    User?       @relation("assignee", fields: [assigneeId], references: [id])
  creator     User        @relation("creator", fields: [creatorId], references: [id])

  // Sprint (null = backlog)
  sprintId    String?     @map("sprint_id")
  sprint      Sprint?     @relation(fields: [sprintId], references: [id])

  // Timestamps
  createdAt   DateTime    @default(now()) @map("created_at")
  updatedAt   DateTime    @updatedAt @map("updated_at")

  // Relations
  project     Project     @relation(fields: [projectId], references: [id], onDelete: Cascade)
  comments    Comment[]
  timeLogs    TimeLog[]

  @@unique([projectId, number])
  @@index([projectId, status])
  @@index([assigneeId])
  @@index([sprintId])
  @@index([parentId])
  @@map("issues")
}

enum IssueType {
  EPIC
  STORY
  TASK
  SUBTASK
  BUG
}

enum IssueStatus {
  OPEN
  IN_PROGRESS
  REVIEW
  DONE
  CANCELLED
}

enum IssuePriority {
  CRITICAL
  HIGH
  MEDIUM
  LOW
}

// ===== COMMENTS =====

model Comment {
  id        String   @id @default(uuid())
  issueId   String   @map("issue_id")
  authorId  String   @map("author_id")
  body      String
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  issue  Issue @relation(fields: [issueId], references: [id], onDelete: Cascade)
  author User  @relation(fields: [authorId], references: [id])

  @@index([issueId])
  @@map("comments")
}

// ===== TIME TRACKING =====

model TimeLog {
  id        String   @id @default(uuid())
  issueId   String   @map("issue_id")
  userId    String   @map("user_id")
  hours     Decimal  @db.Decimal(6, 2)
  note      String?
  startedAt DateTime? @map("started_at")
  stoppedAt DateTime? @map("stopped_at")
  createdAt DateTime @default(now()) @map("created_at")

  issue Issue @relation(fields: [issueId], references: [id], onDelete: Cascade)
  user  User  @relation(fields: [userId], references: [id])

  @@index([issueId])
  @@index([userId])
  @@map("time_logs")
}

// ===== SPRINTS =====

model Sprint {
  id        String       @id @default(uuid())
  projectId String       @map("project_id")
  name      String
  goal      String?
  startDate DateTime?    @map("start_date")
  endDate   DateTime?    @map("end_date")
  state     SprintState  @default(PLANNED)
  createdAt DateTime     @default(now()) @map("created_at")
  updatedAt DateTime     @updatedAt @map("updated_at")

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  issues  Issue[]

  @@index([projectId])
  @@map("sprints")
}

enum SprintState {
  PLANNED
  ACTIVE
  CLOSED
}

// ===== AUDIT =====

model AuditLog {
  id         String   @id @default(uuid())
  action     String   // e.g. "issue.created", "issue.status_changed"
  entityType String   @map("entity_type")
  entityId   String   @map("entity_id")
  userId     String?  @map("user_id")
  details    Json?    // { field, oldValue, newValue }
  ipAddress  String?  @map("ip_address")
  userAgent  String?  @map("user_agent")
  createdAt  DateTime @default(now()) @map("created_at")

  user User? @relation(fields: [userId], references: [id])

  @@index([entityType, entityId])
  @@index([userId])
  @@index([createdAt])
  @@map("audit_logs")
}
```

### 3.2 Правила иерархии задач

| Тип | Может быть родителем для | Может быть дочерним для |
|-----|-------------------------|------------------------|
| EPIC | STORY, TASK | — (верхний уровень) |
| STORY | TASK, SUBTASK | EPIC |
| TASK | SUBTASK | EPIC, STORY |
| SUBTASK | — (нижний уровень) | STORY, TASK |
| BUG | SUBTASK | EPIC, STORY |

Валидация в `issues.service.ts` при создании/обновлении.

---

## 4. API Design (REST)

### 4.1 Auth

| Method | Path | Описание |
|--------|------|----------|
| POST | `/api/auth/register` | Регистрация |
| POST | `/api/auth/login` | Вход (возвращает access + refresh tokens) |
| POST | `/api/auth/refresh` | Обновление access token |
| POST | `/api/auth/logout` | Выход (инвалидация refresh token) |
| GET | `/api/auth/me` | Текущий пользователь |

### 4.2 Users

| Method | Path | Описание | Доступ |
|--------|------|----------|--------|
| GET | `/api/users` | Список пользователей | auth |
| GET | `/api/users/:id` | Профиль пользователя | auth |
| PATCH | `/api/users/:id` | Обновление профиля | self / admin |
| PATCH | `/api/users/:id/role` | Смена роли | admin |
| PATCH | `/api/users/:id/deactivate` | Деактивация | admin |

### 4.3 Projects

| Method | Path | Описание | Доступ |
|--------|------|----------|--------|
| GET | `/api/projects` | Список проектов | auth |
| POST | `/api/projects` | Создать проект | admin, manager |
| GET | `/api/projects/:id` | Детали проекта | auth |
| PATCH | `/api/projects/:id` | Обновить проект | admin, manager |
| DELETE | `/api/projects/:id` | Удалить проект | admin |

### 4.4 Issues

| Method | Path | Описание | Доступ |
|--------|------|----------|--------|
| GET | `/api/projects/:projectId/issues` | Список задач проекта | auth |
| POST | `/api/projects/:projectId/issues` | Создать задачу | auth |
| GET | `/api/issues/:id` | Детали задачи | auth |
| PATCH | `/api/issues/:id` | Обновить задачу | assignee, creator, admin, manager |
| PATCH | `/api/issues/:id/status` | Сменить статус | assignee, creator, admin, manager |
| PATCH | `/api/issues/:id/assign` | Назначить исполнителя | admin, manager |
| PATCH | `/api/issues/reorder` | Перетасовать порядок | auth |
| DELETE | `/api/issues/:id` | Удалить задачу | admin |
| GET | `/api/issues/:id/children` | Дочерние задачи | auth |
| GET | `/api/issues/:id/history` | История изменений (из audit_log) | auth |

### 4.5 Comments

| Method | Path | Описание |
|--------|------|----------|
| GET | `/api/issues/:issueId/comments` | Список комментариев |
| POST | `/api/issues/:issueId/comments` | Добавить комментарий |
| PATCH | `/api/comments/:id` | Редактировать (автор / admin) |
| DELETE | `/api/comments/:id` | Удалить (автор / admin) |

### 4.6 Sprints

| Method | Path | Описание |
|--------|------|----------|
| GET | `/api/projects/:projectId/sprints` | Список спринтов |
| POST | `/api/projects/:projectId/sprints` | Создать спринт |
| PATCH | `/api/sprints/:id` | Обновить спринт |
| POST | `/api/sprints/:id/start` | Запустить спринт |
| POST | `/api/sprints/:id/close` | Закрыть спринт |

### 4.7 Time Tracking

| Method | Path | Описание |
|--------|------|----------|
| POST | `/api/issues/:issueId/time/start` | Запустить таймер |
| POST | `/api/issues/:issueId/time/stop` | Остановить таймер |
| POST | `/api/issues/:issueId/time` | Ручной ввод времени |
| GET | `/api/issues/:issueId/time` | Логи времени по задаче |
| GET | `/api/users/:userId/time` | Логи времени по пользователю |

### 4.8 Board

| Method | Path | Описание |
|--------|------|----------|
| GET | `/api/projects/:projectId/board` | Kanban-доска (задачи по колонкам) |

### 4.9 Admin

| Method | Path | Описание |
|--------|------|----------|
| GET | `/api/admin/stats` | Общая статистика |
| GET | `/api/admin/users` | Все пользователи |
| GET | `/api/admin/activity` | Лог активности |

---

## 5. RBAC (Role-Based Access Control)

### 5.1 Глобальные роли (MVP)

| Роль | Описание |
|------|----------|
| `ADMIN` | Полный доступ. Управление пользователями, проектами, настройками |
| `MANAGER` | Создание проектов, управление командой, назначение задач |
| `USER` | Работа с задачами в назначенных проектах |
| `VIEWER` | Только чтение (для CIO, стейкхолдеров) |

### 5.2 Матрица разрешений

| Действие | ADMIN | MANAGER | USER | VIEWER |
|----------|-------|---------|------|--------|
| Создать проект | ✅ | ✅ | ❌ | ❌ |
| Удалить проект | ✅ | ❌ | ❌ | ❌ |
| Создать задачу | ✅ | ✅ | ✅ | ❌ |
| Обновить любую задачу | ✅ | ✅ | ❌ | ❌ |
| Обновить свою задачу | ✅ | ✅ | ✅ | ❌ |
| Удалить задачу | ✅ | ❌ | ❌ | ❌ |
| Управлять пользователями | ✅ | ❌ | ❌ | ❌ |
| Просмотр отчётов | ✅ | ✅ | ❌ | ✅ |
| Управление спринтами | ✅ | ✅ | ❌ | ❌ |

### 5.3 Будущее расширение

- Per-project roles (Project Lead, Developer, QA, Observer)
- Группы пользователей
- Field-level permissions
- KeyCloak / AD интеграция для SSO

---

## 6. План спринтов

### Sprint 1: Фундамент (Auth + Users + Projects + Issues)

**Цель:** Базовая работающая система — можно залогиниться, создать проект и задачи.

| # | Задача | Оценка |
|---|--------|--------|
| 1.1 | Инициализация монорепо: package.json, tsconfig, ESLint, Prettier | S |
| 1.2 | Backend skeleton: Express + TypeScript + Prisma setup | M |
| 1.3 | Prisma schema: User, Project, Issue, Comment, AuditLog | M |
| 1.4 | Auth module: register, login, refresh, logout, me | L |
| 1.5 | Users module: CRUD, role management | M |
| 1.6 | Projects module: CRUD | M |
| 1.7 | Issues module: CRUD + hierarchy + status transitions | XL |
| 1.8 | RBAC middleware | M |
| 1.9 | Audit logging middleware | S |
| 1.10 | Validation (Zod DTOs) | M |
| 1.11 | Error handling middleware | S |
| 1.12 | Frontend skeleton: Vite + React + Ant Design + Router | M |
| 1.13 | Login page | M |
| 1.14 | App layout (sidebar + header) | M |
| 1.15 | Projects list page | M |
| 1.16 | Project detail + issues list | L |
| 1.17 | Issue create/edit form | L |
| 1.18 | Seed script (demo data) | S |
| 1.19 | Integration tests для API | L |
| 1.20 | Docker Compose (dev environment) | M |

**Definition of Done Sprint 1:**
- Можно зарегистрироваться, залогиниться
- Создать проект с ключом (например "PROJ")
- Создать задачи разных типов (EPIC → STORY → TASK → SUBTASK)
- Назначить исполнителя
- Менять статусы
- Видеть список проектов и задач
- Все CRUD операции работают через API
- Есть минимум 20 интеграционных тестов

**Статус спринта:** DONE (все задачи 1.1–1.20 реализованы, см. `CLAUDE.md`, раздел "Sprint 1 — DONE").

---

### Sprint 2: Board + Sprints + Time

**Цель:** Kanban-доска, спринты, учёт времени.

| # | Задача |
|---|--------|
| 2.1 | Kanban Board API (задачи по статусам) |
| 2.2 | Kanban Board UI (drag-n-drop между колонками) |
| 2.3 | Sprints module API: CRUD + start/close |
| 2.4 | Sprints UI: backlog ↔ sprint перемещение |
| 2.5 | Time tracking module API: start/stop/manual |
| 2.6 | Time tracking UI: таймер + ручной ввод |
| 2.7 | Comments module API |
| 2.8 | Comments UI на странице задачи |
| 2.9 | Issue detail page (полная информация) |
| 2.10 | Issue history (из audit_log) |

**Definition of Done Sprint 2:**
- Kanban-доска с drag-n-drop
- Спринты: создание, старт, закрытие
- Перемещение задач между спринтом и бэклогом
- Таймер работает
- Комментарии к задачам
- История изменений задачи

**Статус спринта:** DONE. Все задачи 2.1–2.10 реализованы (Kanban Board, Sprints, Time tracking, Comments, Issue detail, Issue history).

---

### Sprint 3: Teams + Admin + Reports

**Цель:** Командная работа, администрирование, базовая аналитика.

| # | Задача |
|---|--------|
| 3.1 | Teams module: CRUD + members |
| 3.2 | Teams UI |
| 3.3 | Admin panel: пользователи, статистика |
| 3.4 | Admin UI |
| 3.5 | Dashboard: статистика по проекту |
| 3.6 | Базовые отчёты: задачи по статусам, по исполнителям |
| 3.7 | Фильтрация и поиск задач |
| 3.8 | Bulk-операции (массовое обновление задач) |
| 3.9 | Redis: сессии + кэширование |
| 3.10 | E2E тесты основных сценариев |

**Статус спринта:** DONE. Все задачи 3.1–3.10 реализованы (Teams модуль и UI, Admin панель, дашборд и отчёты, фильтрация/поиск и bulk-операции по задачам, Redis для сессий/кэша, e2e-сценарии основных пользовательских флоу).

---

### Sprint 4: AI + Интеграции + Polish

**Цель:** AI-модуль, интеграции, финальная полировка.

| # | Задача |
|---|--------|
| 4.1 | AI module: оценка трудоёмкости задач |
| 4.2 | AI module: декомпозиция требований |
| 4.3 | Telegram-бот: нотификации |
| 4.4 | GitLab webhook: автообновление статусов |
| 4.5 | Экспорт отчётов (CSV, PDF) |
| 4.6 | Performance optimization |
| 4.7 | Security audit |
| 4.8 | Deployment scripts (production) |
| 4.9 | Документация API (Swagger) |
| 4.10 | User guide обновление |

---

## 7. Миграция с текущего прототипа

### Полная очистка репо

В репозитории НЕ ДОЛЖНО остаться ничего от старого прототипа. Удаляется ВСЁ:

**Удаляем:**
- `backend/` — весь старый JS-код
- `frontend/` — старые HTML-монолиты
- `scripts/` — старые деплой-скрипты
- `MCP/` — старый MCP-сервер
- `cursorrules` — старые правила Cursor
- `.cursor/` — старые скиллы и правила
- `DEPLOY.md`, `ACCOUNTS.md`, `DEPLOYMENT_STEPS.md` — устаревшая документация
- `package.json`, `package-lock.json` — корневые (если есть)
- Все файлы, не относящиеся к новой архитектуре

**Сохраняем только:**
- `docs/` — документация (включая этот план)
- `ТЗ_JIRA_CUT.txt` — исходное ТЗ заказчика
- `.git/` — история коммитов
- `CLAUDE.md` — память контекста проекта
- `.gitignore` — обновляем под новый стек

**Всё остальное создаётся с нуля** по структуре из раздела 9.

### Порядок действий
1. Создать ветку `rebuild/v2` от текущего main
2. **Удалить ВСЕ файлы** кроме docs/, ТЗ_JIRA_CUT.txt, CLAUDE.md, .gitignore
3. Коммит: "chore: clean repo for v2 rebuild"
4. Инициализировать новую структуру
5. Начать Sprint 1

---

## 8. Нефункциональные требования

### 8.1 Производительность
- Время ответа API: < 200ms (p95)
- Время загрузки страницы: < 2s
- Поддержка 2500+ одновременных сессий
- Поддержка 1M+ объектов в БД

### 8.2 Безопасность
- HTTPS + TLS 1.2+
- JWT с refresh tokens (access: 15min, refresh: 7d)
- bcrypt для паролей (cost factor 12)
- Rate limiting на auth endpoints
- CORS whitelist
- Helmet.js для HTTP headers
- SQL injection protection (Prisma parameterized queries)
- XSS protection (React default escaping + Helmet)
- Audit log для всех мутаций

### 8.3 Тестирование
- Unit тесты: services (бизнес-логика)
- Integration тесты: API endpoints (Supertest)
- Минимальное покрытие: 60% для Sprint 1, растёт с каждым спринтом
- CI: тесты запускаются на каждый PR

### 8.4 Совместимость браузеров
- Chrome 139+
- Yandex Browser 25+
- Microsoft Edge 139+ (Chromium-based)
- Safari 18+ (macOS / iOS)
- Firefox ESR 128+ (опционально, по запросу)

### 8.5 Требования к целевым ОС (Astra Linux / Red OS)

**Целевые платформы деплоя:**

| ОС | Версия | Особенности |
|-----|--------|------------|
| **Astra Linux SE** | 1.7+ (Смоленск) | Сертификация ФСТЭК до 1 класса защищённости. Мандатный контроль доступа (MAC), замкнутая программная среда (ЗПС) |
| **Red OS** | 7.3+ (Муром) | В реестре российского ПО. Основан на RPM (CentOS/RHEL-совместим). Сертификация ФСТЭК |
| **Ubuntu** | 22.04 LTS | Для dev/staging окружения |

**Требования совместимости:**
1. **Пакетный менеджер:** приложение должно устанавливаться через стандартные пакеты (.deb для Astra, .rpm для Red OS) или Docker
2. **Системный init:** совместимость с systemd (используется в обеих ОС)
3. **SELinux / AppArmor:** контексты безопасности не должны блокировать работу Node.js, PostgreSQL, Redis, Nginx
4. **Мандатный контроль доступа (Astra):** приложение работает на нулевом уровне мандатного доступа (без грифов секретности для MVP)
5. **Замкнутая программная среда (Astra):** все исполняемые файлы должны быть подписаны или ЗПС отключена для контура приложения
6. **Криптография:** TLS 1.2+ с поддержкой ГОСТ (при наличии КриптоПро на хосте — опционально для MVP)
7. **PostgreSQL:** использовать версию из репозитория целевой ОС (14+ для Astra, 15+ для Red OS) или отдельную установку PostgreSQL 16
8. **Node.js:** установка через NodeSource или сборка из исходников (не включён в стандартные репозитории)
9. **Логирование:** вывод в journald (systemd) для интеграции с SIEM
10. **Сетевые порты:** конфигурируемые порты, работа за корпоративным прокси

**Что НЕ требуется для MVP (но предусмотреть в архитектуре):**
- Интеграция с ALD Pro / FreeIPA (аналог Active Directory для Astra/Red OS) — Sprint 4+
- Сертификат ФСТЭК на само приложение — это процесс, не техническое требование
- Поддержка ГОСТ-шифрования в приложении — достаточно TLS на уровне Nginx

---

## 9. Структура репозитория (итоговая)

```
tasktime-mvp/
├── backend/
│   ├── src/
│   │   ├── app.ts
│   │   ├── server.ts
│   │   ├── config.ts
│   │   ├── prisma/
│   │   ├── shared/
│   │   └── modules/
│   ├── tests/
│   ├── package.json
│   ├── tsconfig.json
│   └── vitest.config.ts
├── frontend/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── api/
│   │   ├── store/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   └── types/
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── docs/
│   ├── RU/
│   ├── ENG/
│   └── archive/
├── docker-compose.yml
├── .github/
│   └── workflows/
│       └── ci.yml
├── .env.example
├── .gitignore
├── ТЗ_JIRA_CUT.txt
└── README.md
```

---

## 10. Критерии приёмки MVP

MVP считается "готовым к использованию" когда:

1. **Ядро работает:** auth, проекты, задачи с иерархией, kanban-доска, спринты
2. **Учёт времени:** таймер + ручной ввод + отчёты
3. **Команды:** создание, управление участниками
4. **Безопасность:** RBAC, audit log, HTTPS
5. **Производительность:** < 200ms API, < 2s загрузка страницы
6. **Тесты:** минимум 60% coverage, CI green
7. **Деплой:** Docker Compose для dev, скрипты для production

---

*Документ подготовлен на основе анализа ТЗ, 8 блоков интервью с product owner, и аудита текущего прототипа.*
