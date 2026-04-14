# ТЗ: Управление релизами (Release Management)

**Версия:** 1.0
**Дата:** 2026-04-11
**Автор:** AI-архитектор
**Статус:** Черновик → На согласование с PO

---

## 1. Цель

Реализовать полноценную систему управления релизами с двумя типами (атомарные и интеграционные), кастомной статусной моделью и централизованным разделом для релиз-менеджера.

---

## 2. Термины и определения

| Термин | Определение |
|--------|-------------|
| **Атомарный релиз** | Релиз одной системы (проекта). Содержит задачи только из одного проекта. Создаётся из контекста проекта или из раздела управления релизами. |
| **Интеграционный релиз** | Кросс-проектный релиз. Объединяет задачи любых типов из нескольких проектов. Создаётся **только** из раздела управления релизами. |
| **Статусная модель релиза** | Конфигурируемый набор статусов и переходов между ними, аналогичный workflow engine для задач, но применяемый к релизам. |
| **Релиз-менеджер** | Пользователь с глобальной ролью `RELEASE_MANAGER`. Имеет полный доступ к разделу управления релизами: создание, редактирование, переходы по статусам, управление составом. Не имеет доступа к админским функциям (управление пользователями, системные настройки). |

---

## 3. Текущее состояние (AS-IS)

### 3.1. Модель данных

Текущая модель `Release` в `schema.prisma` (строки 323–342):

```prisma
model Release {
  id          String       @id @default(uuid())
  projectId   String       @map("project_id")      // ← обязательная привязка к одному проекту
  name        String
  description String?
  level       ReleaseLevel @default(MINOR)           // MINOR | MAJOR
  state       ReleaseState @default(DRAFT)           // DRAFT | READY | RELEASED
  releaseDate DateTime?    @map("release_date")
  ...
  project     Project  @relation(...)
  issues      Issue[]
  sprints     Sprint[]
  @@unique([projectId, name])
}
```

### 3.2. Ограничения текущей реализации

| Проблема | Описание |
|----------|----------|
| Нет типов релизов | Все релизы — неявно «атомарные», привязанные к одному проекту |
| `projectId` — обязательный | Невозможно создать кросс-проектный релиз |
| Жёсткие статусы | 3 enum-значения (DRAFT → READY → RELEASED) зашиты в код, не конфигурируются |
| Нет workflow engine | Переходы между статусами захардкожены в сервисе (`markReleaseReady`, `markReleaseReleased`) |
| `addIssuesToRelease` — только один проект | Фильтр `projectId: release.projectId` блокирует добавление задач из других проектов |
| Unique constraint `[projectId, name]` | Не подходит для интеграционных релизов без `projectId` |
| GlobalReleasesPage | Загружает релизы повторно по каждому проекту (N+1), нет серверной агрегации |

### 3.3. Существующие API эндпоинты

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/projects/:projectId/releases` | Список релизов проекта |
| GET | `/releases/:id/issues` | Релиз с задачами |
| GET | `/releases/:id/sprints` | Спринты в релизе |
| GET | `/releases/:id/readiness` | Метрики готовности |
| POST | `/projects/:projectId/releases` | Создать релиз (привязан к проекту) |
| PATCH | `/releases/:id` | Обновить релиз |
| POST | `/releases/:id/issues` | Добавить задачи |
| POST | `/releases/:id/issues/remove` | Убрать задачи |
| POST | `/releases/:id/sprints` | Добавить спринты |
| POST | `/releases/:id/sprints/remove` | Убрать спринты |
| POST | `/releases/:id/ready` | DRAFT → READY |
| POST | `/releases/:id/released` | READY → RELEASED |

---

## 4. Целевое состояние (TO-BE)

### 4.1. Обзор архитектуры

```
                        ┌─────────────────────────────┐
                        │   Release Workflow Scheme    │
                        │  (набор статусов и переходов)│
                        └──────────┬──────────────────┘
                                   │ применяется к
                        ┌──────────▼──────────────────┐
                        │         Release             │
                        │  type: ATOMIC | INTEGRATION │
                        │  projectId: nullable        │
                        │  statusId: → ReleaseStatus  │
                        └──────┬───────────┬──────────┘
                               │           │
                    ┌──────────▼──┐   ┌────▼──────────┐
                    │ ReleaseItem │   │ ReleaseItem   │
                    │ (Issue A)   │   │ (Issue B)     │
                    │ projectId=1 │   │ projectId=2   │
                    └─────────────┘   └───────────────┘
```

### 4.2. Модель данных (TO-BE)

#### 4.2.1. Новые enum'ы

```prisma
enum ReleaseType {
  ATOMIC        // атомарный — одна система/проект
  INTEGRATION   // интеграционный — кросс-проектный
}
```

> **`ReleaseLevel` (MINOR | MAJOR)** — оставить как есть, без изменений.

> **`ReleaseState` (DRAFT | READY | RELEASED)** — **удалить**. Заменяется на `ReleaseStatus` + `ReleaseWorkflow`.

#### 4.2.2. Модель `ReleaseStatus`

```prisma
model ReleaseStatus {
  id          String              @id @default(uuid())
  name        String              @unique        // e.g. "Черновик", "В сборке", "На тестировании"
  category    ReleaseStatusCategory
  color       String              @default("#888888")
  description String?
  orderIndex  Int                 @default(0)
  createdAt   DateTime            @default(now()) @map("created_at")
  updatedAt   DateTime            @updatedAt @map("updated_at")

  releases              Release[]
  workflowSteps         ReleaseWorkflowStep[]
  transitionsFrom       ReleaseWorkflowTransition[]   @relation("FromReleaseStatus")
  transitionsTo         ReleaseWorkflowTransition[]   @relation("ToReleaseStatus")

  @@index([category])
  @@map("release_statuses")
}

enum ReleaseStatusCategory {
  PLANNING       // сбор, планирование
  IN_PROGRESS    // в работе (сборка, тестирование, стабилизация)
  DONE           // выпущен, закрыт
  CANCELLED      // отменён
}
```

#### 4.2.3. Модель `ReleaseWorkflow`

```prisma
model ReleaseWorkflow {
  id              String       @id @default(uuid())
  name            String       @unique
  description     String?
  releaseType     ReleaseType? @map("release_type")  // null = для любого типа; ATOMIC/INTEGRATION = только для этого типа
  isDefault       Boolean      @default(false)  @map("is_default")
  isActive        Boolean      @default(true)   @map("is_active")
  createdAt       DateTime     @default(now())  @map("created_at")
  updatedAt       DateTime     @updatedAt       @map("updated_at")

  steps       ReleaseWorkflowStep[]
  transitions ReleaseWorkflowTransition[]

  @@map("release_workflows")
}
```

**Правила привязки workflow к типу:**
- `releaseType = null` — универсальный workflow, подходит для любого типа релиза
- `releaseType = ATOMIC` — только для атомарных релизов
- `releaseType = INTEGRATION` — только для интеграционных релизов
- При создании релиза: если `workflowId` не указан, берётся дефолтный workflow, совместимый с типом релиза
- `isDefault` может быть `true` для каждого типа + для универсального (до 3 дефолтных workflow)

```prisma
// Пример seed: два дефолтных workflow
// 1. "Стандартный релизный процесс" — releaseType=null, isDefault=true (fallback)
// 2. "Интеграционный процесс"       — releaseType=INTEGRATION, isDefault=true (приоритетнее для INTEGRATION)
```

#### 4.2.4. Модель `ReleaseWorkflowStep`

```prisma
model ReleaseWorkflowStep {
  id          String    @id @default(uuid())
  workflowId  String    @map("workflow_id")
  statusId    String    @map("status_id")
  isInitial   Boolean   @default(false)  @map("is_initial")
  orderIndex  Int       @default(0)      @map("order_index")

  workflow    ReleaseWorkflow   @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  status      ReleaseStatus     @relation(fields: [statusId], references: [id])

  @@unique([workflowId, statusId])
  @@map("release_workflow_steps")
}
```

#### 4.2.5. Модель `ReleaseWorkflowTransition`

```prisma
model ReleaseWorkflowTransition {
  id          String    @id @default(uuid())
  workflowId  String    @map("workflow_id")
  name        String                          // e.g. "Начать сборку", "Отправить на тестирование"
  fromStatusId String   @map("from_status_id")
  toStatusId  String    @map("to_status_id")
  conditions  Json?                           // ConditionRule[] — аналогично issue workflow
  isGlobal    Boolean   @default(false)       // доступен из любого статуса

  workflow    ReleaseWorkflow   @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  fromStatus  ReleaseStatus     @relation("FromReleaseStatus", fields: [fromStatusId], references: [id])
  toStatus    ReleaseStatus     @relation("ToReleaseStatus", fields: [toStatusId], references: [id])

  @@index([workflowId])
  @@map("release_workflow_transitions")
}
```

#### 4.2.6. Изменения модели `Release`

```prisma
model Release {
  id          String        @id @default(uuid())
  type        ReleaseType   @default(ATOMIC)
  projectId   String?       @map("project_id")         // ← nullable для INTEGRATION
  name        String
  description String?
  level       ReleaseLevel  @default(MINOR)
  statusId    String        @map("status_id")           // ← FK на ReleaseStatus (вместо state enum)
  workflowId  String        @map("workflow_id")         // ← привязка к конкретному workflow
  releaseDate DateTime?     @map("release_date") @db.Date
  plannedDate DateTime?     @map("planned_date") @db.Date  // ← новое: планируемая дата релиза
  createdById String        @map("created_by_id")       // ← автор релиза
  createdAt   DateTime      @default(now())  @map("created_at")
  updatedAt   DateTime      @updatedAt       @map("updated_at")

  project     Project?       @relation(fields: [projectId], references: [id], onDelete: Cascade)
  status      ReleaseStatus  @relation(fields: [statusId], references: [id])
  workflow    ReleaseWorkflow @relation(...)              // — нужна обратная связь в ReleaseWorkflow
  createdBy   User           @relation(fields: [createdById], references: [id])
  items       ReleaseItem[]
  sprints     Sprint[]

  @@unique([projectId, name], map: "releases_project_id_name_key")
  @@index([projectId])
  @@index([statusId])
  @@index([type])
  @@index([workflowId])
  @@map("releases")
}
```

#### 4.2.7. Новая модель `ReleaseItem` (замена прямой связи `Issue.releaseId`)

```prisma
model ReleaseItem {
  id          String    @id @default(uuid())
  releaseId   String    @map("release_id")
  issueId     String    @map("issue_id")
  addedAt     DateTime  @default(now())  @map("added_at")
  addedById   String    @map("added_by_id")

  release     Release   @relation(fields: [releaseId], references: [id], onDelete: Cascade)
  issue       Issue     @relation(fields: [issueId], references: [id], onDelete: Cascade)
  addedBy     User      @relation(fields: [addedById], references: [id])

  @@unique([releaseId, issueId])
  @@index([releaseId])
  @@index([issueId])
  @@map("release_items")
}
```

**Обоснование:** Связь через промежуточную таблицу `ReleaseItem` вместо `Issue.releaseId`:
- Позволяет одной задаче входить в несколько релизов (атомарный + интеграционный)
- Хранит метаданные (кто добавил, когда)
- Не требует изменения модели `Issue`

> **Примечание:** Поле `Issue.releaseId` сохраняется для обратной совместимости с текущей ReleasesPage. В будущей итерации мигрировать полностью на `ReleaseItem`.

---

## 5. Статусная модель релизов

### 5.1. Дефолтный workflow (seed)

Система поставляется с дефолтным workflow, который можно кастомизировать через UI админки.

```
┌────────────┐    Начать сборку    ┌────────────┐   Отправить на    ┌──────────────┐
│  ЧЕРНОВИК   │───────────────────→│  В СБОРКЕ  │   тестирование   │НА ТЕСТИРОВАНИИ│
│ (PLANNING)  │                    │(IN_PROGRESS)│─────────────────→│(IN_PROGRESS)  │
└──────┬──────┘                    └──────┬──────┘                  └───────┬───────┘
       │                                  │                                │
       │          Отменить                │        Отменить               │ Тесты пройдены
       │◄─────────────────────────────────┤◄───────────────────┐         │
       │                                  │                    │         ▼
       │                                  │              ┌─────┴────┐  ┌────────────┐
       │                                  │              │ ОТМЕНЁН  │  │   ГОТОВ К   │
       │                                  │              │(CANCELLED)│  │  ВЫПУСКУ   │
       │                                  │              └──────────┘  │(IN_PROGRESS)│
       │                                  │                            └──────┬──────┘
       │                                  │                                   │
       │                                  │                Выпустить          │
       │                                  │                                   ▼
       │                                  │                            ┌────────────┐
       │                                  │                            │  ВЫПУЩЕН   │
       │                                  └───────────────────────────→│   (DONE)   │
       │                                        Экстренный выпуск     └────────────┘
       │
       │          Глобальный: Отменить (из любого статуса)
       └─────────────────────────────────────────────────→ ОТМЕНЁН
```

### 5.2. Дефолтные статусы (seed-данные)

| Статус | Категория | Цвет | Описание |
|--------|-----------|------|----------|
| Черновик | PLANNING | `#8C8C8C` | Начальный статус. Сбор задач в релиз. |
| В сборке | IN_PROGRESS | `#1890FF` | Идёт сборка и интеграция компонентов. |
| На тестировании | IN_PROGRESS | `#FA8C16` | Релиз передан на QA/тестирование. |
| Готов к выпуску | IN_PROGRESS | `#52C41A` | Тестирование пройдено, ожидает развёртывания. |
| Выпущен | DONE | `#389E0D` | Релиз развёрнут в production. |
| Отменён | CANCELLED | `#FF4D4F` | Релиз отменён. |

### 5.3. Дефолтные переходы

| Из | В | Название перехода | isGlobal |
|----|---|-------------------|----------|
| Черновик | В сборке | Начать сборку | false |
| В сборке | На тестировании | Отправить на тестирование | false |
| На тестировании | Готов к выпуску | Тесты пройдены | false |
| Готов к выпуску | Выпущен | Выпустить | false |
| В сборке | Выпущен | Экстренный выпуск | false |
| * (любой) | Отменён | Отменить | true |

### 5.4. Conditions для переходов (расширение)

Переиспользуются типы из workflow engine для задач:

```typescript
type ReleaseTransitionCondition =
  | { type: 'USER_HAS_GLOBAL_ROLE'; roles: UserRole[] }
  | { type: 'ALL_ITEMS_IN_STATUS_CATEGORY'; category: 'DONE' }  // все задачи в релизе DONE
  | { type: 'ALL_SPRINTS_CLOSED' }                                // все спринты CLOSED
  | { type: 'MIN_ITEMS_COUNT'; min: number }                      // минимум N задач
  | { type: 'ANY_OF'; conditions: ReleaseTransitionCondition[] }
  | { type: 'ALL_OF'; conditions: ReleaseTransitionCondition[] };
```

---

## 6. API (TO-BE)

### 6.1. Управление релизами (CRUD + статусы)

#### 6.1.1. Получить все релизы (глобально)

```
GET /api/releases
```

**Query-параметры:**

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|-------------|----------|
| `type` | `ATOMIC,INTEGRATION` | — | Фильтр по типу (через запятую) |
| `statusId` | `uuid` | — | Фильтр по ID статуса (через запятую) |
| `statusCategory` | `PLANNING,IN_PROGRESS,DONE,CANCELLED` | — | Фильтр по категории статуса |
| `projectId` | `uuid` | — | Фильтр по проекту (для атомарных) |
| `from` | `YYYY-MM-DD` | — | Дата создания от |
| `to` | `YYYY-MM-DD` | — | Дата создания до |
| `releaseDateFrom` | `YYYY-MM-DD` | — | Дата выпуска от |
| `releaseDateTo` | `YYYY-MM-DD` | — | Дата выпуска до |
| `search` | `string` | — | Поиск по имени/описанию |
| `page` | `number` | 1 | Страница |
| `limit` | `number` | 25 | Записей на страницу |
| `sortBy` | `createdAt,releaseDate,name,plannedDate` | `createdAt` | Поле сортировки |
| `sortDir` | `asc,desc` | `desc` | Направление сортировки |

**Доступ:** authenticate (все авторизованные пользователи)

**Ответ:**
```json
{
  "data": [
    {
      "id": "uuid",
      "type": "INTEGRATION",
      "name": "Release 2.5.0",
      "description": "...",
      "level": "MAJOR",
      "status": { "id": "uuid", "name": "В сборке", "category": "IN_PROGRESS", "color": "#1890FF" },
      "project": null,
      "plannedDate": "2026-05-01",
      "releaseDate": null,
      "createdBy": { "id": "uuid", "name": "Иванов И.И." },
      "createdAt": "2026-04-11T10:00:00Z",
      "updatedAt": "2026-04-11T12:00:00Z",
      "_count": { "items": 42, "sprints": 5 },
      "_projects": ["PROJ", "BACK", "FRONT"]
    }
  ],
  "meta": { "page": 1, "limit": 25, "total": 120, "totalPages": 5 }
}
```

> **`_projects`** — массив ключей проектов, чьи задачи входят в релиз. Вычисляется на лету для интеграционных релизов.

#### 6.1.2. Получить релизы проекта

```
GET /api/projects/:projectId/releases
```

Возвращает только атомарные релизы данного проекта + интеграционные, содержащие задачи из этого проекта. Те же query-параметры (кроме `projectId`).

**Доступ:** authenticate

#### 6.1.3. Создать релиз

```
POST /api/releases
```

**Body:**
```json
{
  "name": "Release 2.5.0",
  "type": "INTEGRATION",
  "projectId": null,
  "description": "Кросс-проектный релиз Q2",
  "level": "MAJOR",
  "workflowId": "uuid",
  "plannedDate": "2026-05-01"
}
```

**Валидация:**

| Правило | Описание |
|---------|----------|
| `type=ATOMIC` → `projectId` обязателен | Атомарный релиз привязан к проекту |
| `type=INTEGRATION` → `projectId` запрещён | Интеграционный релиз — без проекта |
| `workflowId` опционален | Если не указан — берётся дефолтный workflow (`isDefault=true`) |
| `name` уникален в scope | Для ATOMIC — уникален в пределах проекта; для INTEGRATION — глобально уникален |

**Доступ:** requireRole('ADMIN', 'MANAGER', 'RELEASE_MANAGER')

**Ответ:** 201, созданный релиз

> **Контекстное создание:** Эндпоинт `POST /api/projects/:projectId/releases` сохраняется для совместимости. Он проксирует на `POST /api/releases` с `type=ATOMIC` и `projectId` из path.

#### 6.1.4. Обновить релиз

```
PATCH /api/releases/:id
```

**Body (все поля опциональны):**
```json
{
  "name": "Release 2.5.1",
  "description": "Обновлённое описание",
  "level": "MINOR",
  "plannedDate": "2026-05-15",
  "releaseDate": null
}

```

**Ограничения:**
- `type` менять нельзя (immutable после создания)
- `projectId` менять нельзя (immutable)
- `statusId` менять через PATCH нельзя — только через переходы (см. 6.1.5)
- Если статус в категории `DONE` — обновлять можно только `description`

**Доступ:** requireRole('ADMIN', 'MANAGER', 'RELEASE_MANAGER')

#### 6.1.5. Получить доступные переходы

```
GET /api/releases/:id/transitions
```

**Ответ:**
```json
[
  {
    "id": "transition-uuid",
    "name": "Отправить на тестирование",
    "toStatus": { "id": "uuid", "name": "На тестировании", "category": "IN_PROGRESS", "color": "#FA8C16" },
    "conditions": [...]
  }
]
```

**Логика:** Workflow engine вычисляет доступные переходы на основе текущего `statusId` релиза и условий (`conditions`).

**Доступ:** authenticate

#### 6.1.6. Выполнить переход

```
POST /api/releases/:id/transitions/:transitionId
```

**Body (опционально):**
```json
{
  "comment": "Тестирование завершено, все тесты зелёные"
}
```

**Логика:**
1. Проверить, что переход доступен из текущего статуса
2. Оценить `conditions` (роль пользователя, состояние задач и спринтов)
3. Если условия выполнены → обновить `statusId` релиза
4. Если переход в статус категории `DONE` → установить `releaseDate = now()` (если не задана)
5. Записать в audit log

**Доступ:** requireRole('ADMIN', 'MANAGER', 'RELEASE_MANAGER')

**Коды ошибок:**
- `409 CONDITION_NOT_MET` — условия перехода не выполнены (с деталями)
- `409 INVALID_TRANSITION` — переход не доступен из текущего статуса
- `404 RELEASE_NOT_FOUND` — релиз не найден

#### 6.1.7. Клонировать релиз

```
POST /api/releases/:id/clone
```

**Body:**
```json
{
  "name": "Release 2.5.1-hotfix",
  "type": "ATOMIC",
  "projectId": "uuid",
  "cloneItems": true,
  "cloneSprints": false
}
```

**Логика:**
1. Создать новый релиз с начальным статусом workflow
2. Если `cloneItems=true` — скопировать все `ReleaseItem` из исходного релиза в новый
3. Если `cloneSprints=true` — привязать те же спринты к новому релизу (если спринт не привязан к другому релизу)
4. `type` и `projectId` можно переопределить (например, клонировать атомарный в интеграционный)
5. Если `name` не указан — автогенерация: `{original.name} (copy)`

**Доступ:** requireRole('ADMIN', 'MANAGER', 'RELEASE_MANAGER')

**Ответ:** 201, созданный клон

#### 6.1.8. Удалить релиз

```
DELETE /api/releases/:id
```

**Ограничения:**
- Нельзя удалять релизы в статусе категории `DONE` (выпущенные)
- При удалении: все `ReleaseItem` удаляются каскадно, `Sprint.releaseId` обнуляется

**Доступ:** requireRole('ADMIN', 'RELEASE_MANAGER')

### 6.2. Управление составом релиза

#### 6.2.1. Получить задачи релиза

```
GET /api/releases/:id/items
```

**Query-параметры:**

| Параметр | Тип | Описание |
|----------|-----|----------|
| `projectId` | `uuid` | Фильтр по проекту (актуально для интеграционных) |
| `status` | `OPEN,IN_PROGRESS,...` | Фильтр по статусу задачи |
| `page` | `number` | Страница |
| `limit` | `number` | Записей на страницу |

**Ответ:**
```json
{
  "data": [
    {
      "id": "release-item-uuid",
      "addedAt": "2026-04-11T10:00:00Z",
      "addedBy": { "id": "uuid", "name": "Иванов" },
      "issue": {
        "id": "issue-uuid",
        "number": 42,
        "title": "Реализовать авторизацию",
        "status": "DONE",
        "priority": "HIGH",
        "issueTypeConfig": { "id": "...", "name": "Task", "icon": "..." },
        "assignee": { "id": "...", "name": "Петров" },
        "project": { "id": "...", "name": "Backend", "key": "BACK" }
      }
    }
  ],
  "meta": { "page": 1, "limit": 50, "total": 42, "totalPages": 1 }
}
```

#### 6.2.2. Добавить задачи в релиз

```
POST /api/releases/:id/items
```

**Body:**
```json
{
  "issueIds": ["uuid-1", "uuid-2", "uuid-3"]
}
```

**Валидация:**

| Правило | Описание |
|---------|----------|
| Для `ATOMIC` | Все задачи должны принадлежать `release.projectId` |
| Для `INTEGRATION` | Задачи из любых проектов допустимы |
| Статус релиза | Нельзя добавлять задачи, если статус в категории `DONE` |
| Дубликаты | Пропускаются (upsert по `[releaseId, issueId]`) |

**Доступ:** requireRole('ADMIN', 'MANAGER', 'RELEASE_MANAGER')

#### 6.2.3. Убрать задачи из релиза

```
POST /api/releases/:id/items/remove
```

**Body:**
```json
{
  "issueIds": ["uuid-1", "uuid-2"]
}
```

**Ограничения:** Нельзя убирать задачи, если статус релиза в категории `DONE`.

**Доступ:** requireRole('ADMIN', 'MANAGER', 'RELEASE_MANAGER')

#### 6.2.4. Управление спринтами в релизе

Эндпоинты остаются без изменений:

```
POST /api/releases/:id/sprints        — добавить спринты
POST /api/releases/:id/sprints/remove  — убрать спринты
GET  /api/releases/:id/sprints         — список спринтов
```

**Изменение валидации для INTEGRATION:**
- Для `ATOMIC` — спринты только из `release.projectId` (как сейчас)
- Для `INTEGRATION` — спринты из любых проектов

### 6.3. Метрики и готовность

#### 6.3.1. Метрики готовности релиза

```
GET /api/releases/:id/readiness
```

**Ответ (расширенный):**
```json
{
  "totalItems": 42,
  "doneItems": 38,
  "cancelledItems": 1,
  "inProgressItems": 3,
  "totalSprints": 5,
  "closedSprints": 4,
  "byProject": [
    {
      "project": { "id": "uuid", "key": "BACK", "name": "Backend" },
      "total": 25,
      "done": 23,
      "inProgress": 2
    },
    {
      "project": { "id": "uuid", "key": "FRONT", "name": "Frontend" },
      "total": 17,
      "done": 15,
      "inProgress": 2
    }
  ],
  "completionPercent": 90,
  "availableTransitions": [
    { "id": "...", "name": "Отправить на тестирование", "toStatus": { ... } }
  ]
}
```

### 6.4. Администрирование статусной модели

#### 6.4.1. CRUD статусов релизов

```
GET    /api/admin/release-statuses                   — список всех статусов
POST   /api/admin/release-statuses                   — создать статус
PATCH  /api/admin/release-statuses/:id               — обновить статус
DELETE /api/admin/release-statuses/:id               — удалить (если не используется)
```

**Доступ:** requireRole('ADMIN', 'SUPER_ADMIN')

**DTO создания:**
```json
{
  "name": "На стабилизации",
  "category": "IN_PROGRESS",
  "color": "#722ED1",
  "description": "Фикс критичных багов перед выпуском"
}
```

#### 6.4.2. CRUD workflow'ов для релизов

```
GET    /api/admin/release-workflows                         — список workflow'ов
POST   /api/admin/release-workflows                         — создать workflow
GET    /api/admin/release-workflows/:id                     — получить с шагами и переходами
PATCH  /api/admin/release-workflows/:id                     — обновить название/описание
DELETE /api/admin/release-workflows/:id                     — удалить (если не используется)

POST   /api/admin/release-workflows/:id/steps               — добавить шаг (статус в workflow)
DELETE /api/admin/release-workflows/:id/steps/:stepId        — удалить шаг

POST   /api/admin/release-workflows/:id/transitions          — создать переход
PATCH  /api/admin/release-workflows/:id/transitions/:tid     — обновить переход
DELETE /api/admin/release-workflows/:id/transitions/:tid     — удалить переход

GET    /api/admin/release-workflows/:id/validate             — валидация графа
```

**Доступ:** requireRole('ADMIN', 'SUPER_ADMIN')

**Валидация графа** (аналогично issue workflow):
- Ошибки: `NO_INITIAL_STATUS`, `NO_DONE_STATUS`
- Предупреждения: `DEAD_END_STATUS`, `UNREACHABLE_STATUS`

---

## 7. Бизнес-правила

### 7.1. Создание релизов

| Правило | Описание |
|---------|----------|
| BR-1 | Атомарные релизы создаются из контекста проекта (`/projects/:id/releases`) **или** из раздела управления релизами (`/releases`) с указанием `projectId` |
| BR-2 | Интеграционные релизы создаются **только** из раздела управления релизами |
| BR-3 | При создании релизу автоматически назначается начальный статус workflow (шаг с `isInitial=true`) |
| BR-4 | Если `workflowId` не указан — берётся дефолтный workflow (`isDefault=true`) |

### 7.2. Включение/исключение задач

| Правило | Описание |
|---------|----------|
| BR-5 | Одна задача может входить в любое количество релизов без ограничений (через `ReleaseItem`) |
| BR-6 | Для ATOMIC: задачи только из `release.projectId` |
| BR-7 | Для INTEGRATION: задачи из любых проектов без ограничений |
| BR-8 | Нельзя модифицировать состав релиза в статусе категории `DONE` или `CANCELLED` |

### 7.3. Переходы по статусам

| Правило | Описание |
|---------|----------|
| BR-9 | Переход возможен только если он определён в workflow релиза |
| BR-10 | Conditions оцениваются перед переходом; если не пройдены → 409 |
| BR-11 | При переходе в статус категории `DONE` → `releaseDate` устанавливается автоматически (если пустая) |
| BR-12 | При переходе в `CANCELLED` → все `ReleaseItem` сохраняются (для аудита), но задачи становятся свободными для других релизов |

### 7.4. Удаление

| Правило | Описание |
|---------|----------|
| BR-13 | Нельзя удалить релиз в статусе категории `DONE` |
| BR-14 | При удалении: `ReleaseItem` удаляются каскадно, `Sprint.releaseId` обнуляется |

---

## 8. Frontend

### 8.1. Раздел «Управление релизами» (GlobalReleasesPage)

**Маршрут:** `/releases`
**Доступ:** Все авторизованные пользователи (чтение); ADMIN/MANAGER (создание, изменение)

#### 8.1.1. Основной вид — таблица/список релизов

**Шапка:**
- Заголовок «Управление релизами»
- Кнопка «Создать релиз» → модальное окно (доступна ADMIN/MANAGER)
- Фильтры:
  - Тип: `Все / Атомарные / Интеграционные` (вкладки или select)
  - Статус: multi-select с цветными бейджами
  - Период: DateRangePicker (по дате создания)
  - Проект: select с поиском (фильтрует релизы, содержащие задачи проекта)
  - Поиск: текстовое поле (по имени/описанию)

**Таблица:**

| Колонка | Описание |
|---------|----------|
| Имя | Кликабельное, открывает детальную карточку |
| Тип | Бейдж: «Атомарный» / «Интеграционный» |
| Проект(ы) | Для ATOMIC — ключ проекта; для INTEGRATION — список ключей проектов |
| Статус | Цветной бейдж с названием статуса |
| Уровень | MINOR / MAJOR |
| Задачи | Прогресс-бар (done/total) |
| Плановая дата | plannedDate |
| Дата выпуска | releaseDate (если выпущен) |
| Автор | Имя создателя |

**Сортировка:** По дате создания (по умолчанию), по плановой дате, по имени.

#### 8.1.2. Модальное окно «Создать релиз»

**Поля формы:**

| Поле | Тип | Обязательно | Описание |
|------|-----|-------------|----------|
| Тип | Radio: Атомарный / Интеграционный | Да | При выборе «Атомарный» появляется select проекта |
| Проект | Select с поиском | Да (для атомарного) | Скрыто для интеграционного |
| Название | Input | Да | Имя релиза (e.g. "Release 2.5.0") |
| Описание | Textarea | Нет | Release notes |
| Уровень | Radio: Minor / Major | Да | |
| Workflow | Select | Нет | Если не выбран — дефолтный |
| Плановая дата | DatePicker | Нет | Планируемая дата выпуска |

#### 8.1.3. Детальная карточка релиза (слайд-панель или отдельная страница)

**Шапка карточки:**
- Название, тип (бейдж), уровень
- Текущий статус (цветной бейдж)
- Кнопки доступных переходов (из `GET /releases/:id/transitions`)
- Кнопка «Редактировать» (модальное окно)
- Прогресс-бар готовности

**Вкладки:**

1. **Задачи**
   - Таблица задач релиза с группировкой по проектам (для интеграционных)
   - Колонки: ключ задачи, название, статус, приоритет, тип, исполнитель, проект
   - Кнопка «Добавить задачи» → модальное окно с поиском задач
   - Кнопка «Убрать из релиза» (по выделенным строкам)
   - Фильтры: по проекту, по статусу задачи

2. **Спринты**
   - Список спринтов, привязанных к релизу
   - Статус спринта, количество задач, прогресс
   - Кнопки «Добавить спринт» / «Убрать спринт»

3. **Готовность**
   - Метрики из `GET /releases/:id/readiness`
   - Круговая диаграмма: задачи по статусам
   - Для интеграционных: разбивка по проектам (таблица)
   - Визуализация: % завершённости, количество открытых блокеров

4. **История**
   - Audit log: кто и когда создал, изменил статус, добавил/убрал задачи
   - Хронологический список из `audit_log` по `entityType='release'`

### 8.2. Раздел релизов внутри проекта (ReleasesPage)

**Маршрут:** `/projects/:id/releases`

Текущая ReleasesPage сохраняется с доработками:
- Добавить кнопку «Создать атомарный релиз» (вместо текущей «Создать релиз»)
- Показывать также интеграционные релизы, содержащие задачи этого проекта (read-only, с ссылкой на глобальную карточку)
- Переход на workflow-статусы вместо жёстких DRAFT/READY/RELEASED

### 8.3. Модальное окно «Добавить задачи в релиз»

- Поиск задач по названию, ключу, проекту
- Для ATOMIC: задачи только из проекта релиза
- Для INTEGRATION: задачи из всех проектов с фильтром по проекту
- Чекбокс-выбор, кнопка «Добавить выбранные»
- Исключение уже добавленных задач

---

## 9. RBAC и безопасность

### 9.1. Новая глобальная роль `RELEASE_MANAGER`

Добавляется в enum `UserRole`:

```prisma
enum UserRole {
  SUPER_ADMIN
  ADMIN
  MANAGER
  RELEASE_MANAGER   // ← новая роль
  USER
  VIEWER
}
```

**Scope роли:** полный доступ к управлению релизами (CRUD, переходы, состав), но без доступа к административным функциям (управление пользователями, системные настройки, управление workflow — это остаётся за ADMIN).

### 9.2. Матрица доступа

| Действие | SUPER_ADMIN | ADMIN | MANAGER | RELEASE_MANAGER | USER | VIEWER |
|----------|:-----------:|:-----:|:-------:|:---------------:|:----:|:------:|
| Просмотр списка релизов | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Просмотр деталей релиза | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Создание атомарного релиза | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Создание интеграционного релиза | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Редактирование релиза | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Переход по статусам | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Добавление/удаление задач | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Удаление релиза | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| Клонирование релиза | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Управление статусами релизов | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Управление workflow релизов | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

### 9.3. Audit log

Все мутации релизов записываются в `audit_log`:

| action | entityType | Описание |
|--------|------------|----------|
| `release.created` | `release` | Создание релиза |
| `release.updated` | `release` | Обновление полей |
| `release.transition` | `release` | Переход по статусу (with `fromStatus`, `toStatus`) |
| `release.deleted` | `release` | Удаление релиза |
| `release.cloned` | `release` | Клонирование релиза (with `sourceReleaseId`) |
| `release.items_added` | `release` | Добавление задач |
| `release.items_removed` | `release` | Удаление задач |
| `release.sprints_added` | `release` | Добавление спринтов |
| `release.sprints_removed` | `release` | Удаление спринтов |

---

## 10. Кэширование (Redis)

| Ключ | TTL | Инвалидация при |
|------|-----|-----------------|
| `releases:all:pg=X:lm=Y:...` | 300s | CRUD релизов |
| `releases:project:{projectId}:...` | 300s | CRUD релизов данного проекта |
| `release:{id}:items` | 300s | add/remove items |
| `release:{id}:readiness` | 60s | add/remove items, transition |
| `release:{id}:transitions` | 300s | transition, workflow change |
| `release-statuses:all` | 600s | CRUD статусов |
| `release-workflows:all` | 600s | CRUD workflow |
| `release-workflow:{id}` | 300s | CRUD шагов/переходов |

---

## 11. Миграция данных

### 11.1. План миграции (одна транзакция)

1. Создать таблицы: `release_statuses`, `release_workflows`, `release_workflow_steps`, `release_workflow_transitions`, `release_items`
2. Seed дефолтные статусы и workflow (см. секцию 5)
3. Добавить поля в `releases`: `type`, `status_id`, `workflow_id`, `planned_date`, `created_by_id`
4. Мигрировать существующие данные:
   - `state = 'DRAFT'` → `status_id` = ID статуса «Черновик»
   - `state = 'READY'` → `status_id` = ID статуса «Готов к выпуску»
   - `state = 'RELEASED'` → `status_id` = ID статуса «Выпущен»
   - `type = 'ATOMIC'` для всех существующих релизов
   - `workflow_id` = ID дефолтного workflow
   - `created_by_id` = ID первого ADMIN-пользователя (fallback)
5. Мигрировать `Issue.releaseId` → создать записи в `release_items`
6. Сделать `status_id`, `workflow_id`, `created_by_id` NOT NULL
7. Удалить колонку `state` из `releases`
8. (Опционально) Удалить `Issue.releaseId` в следующей итерации

### 11.2. Обратная совместимость

- Эндпоинт `POST /projects/:projectId/releases` продолжает работать (создаёт ATOMIC)
- Старые эндпоинты `POST /releases/:id/ready` и `POST /releases/:id/released` — deprecated, возвращают 410 Gone с подсказкой использовать `/transitions`
- `Issue.releaseId` сохраняется в текущей итерации для обратной совместимости

---

## 12. Этапы реализации

### Этап 1: Модель данных + Миграция

- Новые Prisma-модели (статусы, workflow, шаги, переходы, items)
- Миграция `prisma migrate dev`
- Seed-скрипт для дефолтных статусов и workflow
- Миграция существующих данных

### Этап 2: Backend — Release Workflow Engine

- Сервис `release-workflow-engine`: resolveWorkflow, getAvailableTransitions, executeTransition
- Кэширование workflow resolution в Redis
- Conditions для переходов (`ALL_ITEMS_IN_STATUS_CATEGORY`, `ALL_SPRINTS_CLOSED`, etc.)

### Этап 3: Backend — Обновлённый releases module

- Рефакторинг `releases.service.ts` на новую модель
- Новые эндпоинты: `GET /releases`, `POST /releases`, `GET/POST transitions`
- `ReleaseItem` CRUD
- Обновление валидации (ATOMIC vs INTEGRATION)
- Deprecation старых эндпоинтов

### Этап 4: Backend — Администрирование

- CRUD для `ReleaseStatus`
- CRUD для `ReleaseWorkflow` + шаги + переходы
- Валидация графа workflow

### Этап 5: Frontend — GlobalReleasesPage

- Таблица с фильтрами, пагинацией, сортировкой
- Модальное окно создания релиза (с типом)
- Детальная карточка: задачи, спринты, готовность, история
- Кнопки переходов по статусам

### Этап 6: Frontend — Обновление ReleasesPage

- Адаптация под workflow-статусы
- Показ интеграционных релизов проекта
- Ссылки на глобальную карточку

### Этап 7: Frontend — Админка

- Страница управления статусами релизов
- Визуальный редактор workflow релизов (drag-n-drop граф):
  - Узлы = статусы (перетаскиваемые, с цветами по категории)
  - Рёбра = переходы (кликабельные, с названием перехода)
  - Панель свойств при клике на переход (conditions, isGlobal)
  - Валидация графа в реальном времени (подсветка ошибок)
  - Библиотека: `@xyflow/react` (React Flow) — MIT, активно поддерживается
  - Привязка workflow к типу релиза (ATOMIC / INTEGRATION / универсальный)

---

## 13. Решения PO (2026-04-11)

| # | Вопрос | Решение |
|---|--------|---------|
| Q1 | Роль «Релиз-менеджер» | **Да** — добавить `RELEASE_MANAGER` в `UserRole`. Отдельная глобальная роль с доступом к управлению релизами. |
| Q2 | Задача в нескольких атомарных релизах одного проекта | **Да** — через `ReleaseItem` без ограничений. Одна задача может входить в любое количество релизов. |
| Q3 | Привязка workflow к типу релиза | **Да** — возможность привязать разные workflow к ATOMIC и INTEGRATION. |
| Q4 | Уведомления при переходах релиза | **Нет в MVP** — реализовать в будущих итерациях. |
| Q5 | Редактор workflow | **Визуальный** (drag-n-drop граф) — лучший UX для релиз-менеджера. |
| Q6 | Клонирование релиза | **Да** — возможность создать новый релиз на основе существующего состава задач. |

---

## Приложение A: ER-диаграмма (текстовая)

```
ReleaseStatus ──< ReleaseWorkflowStep >── ReleaseWorkflow
      │                                          │
      │                                          │
      ├──< ReleaseWorkflowTransition.from        ├──< ReleaseWorkflowTransition
      ├──< ReleaseWorkflowTransition.to          │
      │                                          │
      └──< Release.statusId                      └──< Release.workflowId
                │
                ├──< ReleaseItem >── Issue
                │
                ├──< Sprint (releaseId)
                │
                └── Project? (projectId, nullable)
```

---

## Приложение B: Пример JSON — полный релиз

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "type": "INTEGRATION",
  "name": "Release 3.0.0 — Модернизация платформы",
  "description": "Объединённый релиз backend + frontend + мобильное приложение",
  "level": "MAJOR",
  "status": {
    "id": "uuid-status-testing",
    "name": "На тестировании",
    "category": "IN_PROGRESS",
    "color": "#FA8C16"
  },
  "workflow": {
    "id": "uuid-default-workflow",
    "name": "Стандартный релизный процесс"
  },
  "project": null,
  "plannedDate": "2026-05-15",
  "releaseDate": null,
  "createdBy": { "id": "uuid-user", "name": "Иванов И.И." },
  "createdAt": "2026-04-01T08:00:00Z",
  "updatedAt": "2026-04-11T14:30:00Z",
  "_count": { "items": 87, "sprints": 8 },
  "_projects": ["BACK", "FRONT", "MOBILE"],
  "availableTransitions": [
    {
      "id": "uuid-transition-pass",
      "name": "Тесты пройдены",
      "toStatus": { "id": "...", "name": "Готов к выпуску", "category": "IN_PROGRESS", "color": "#52C41A" }
    },
    {
      "id": "uuid-transition-cancel",
      "name": "Отменить",
      "toStatus": { "id": "...", "name": "Отменён", "category": "CANCELLED", "color": "#FF4D4F" }
    }
  ]
}
```
