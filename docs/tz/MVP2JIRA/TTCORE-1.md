# ТЗ: TTCORE-1 — Priorities CRUD + IssueStatus → WorkflowStatus reconciliation

**Дата:** 2026-04-23
**Тип:** EPIC | **Приоритет:** P1 | **Статус:** OPEN
**Проект:** TaskTime MVP (TTMP)
**Исполнитель:** TBD
**Автор ТЗ:** Claude Code (auto-generated)

---

## 1. Постановка задачи

Две связанные миграции моделирования:

### 1.1 Priorities (enum → table)
`enum IssuePriority` (`CRITICAL/HIGH/MEDIUM/LOW`) хардкодится. Невозможно добавить «Blocker», изменить цвет/иконку, отключить уровень. Переводим в таблицу `Priority` с CRUD в админке.

### 1.2 IssueStatus reconciliation
На `Issue` сейчас сосуществуют `status: IssueStatus` (enum) и `workflowStatusId` (FK, nullable). Двойное моделирование — источник багов и ограничение для кастомных статусов. Убираем enum, оставляем только `workflowStatusId` (NOT NULL). Группировка «To Do / In Progress / Done» доступна через `workflowStatus.category` (enum `StatusCategory`, уже существует).

### Пользовательские сценарии

**Админ добавляет приоритет «Blocker»:**
1. `/admin/priorities` → «Добавить».
2. name=`Blocker`, color=#dc2626, iconName=`FireOutlined`, orderIndex=0 (выше Critical).
3. В UI Issue-формы в dropdown'е приоритетов появляется «Blocker».

**Проект ставит дефолтный приоритет:**
1. Project settings → «Приоритет по умолчанию» → выбрать `HIGH`.
2. Новые задачи в этом проекте создаются с priorityId = HIGH.

**Миграция статусов:**
- Все задачи с `status=DONE` имеют `workflowStatusId` указывающий на системный статус c `systemKey='DONE'` и `category='DONE'`.
- Фронт рендерит `category` для группировок (kanban-колонки).

---

## 2. Текущее состояние

- `IssuePriority` enum (4 значения), `Issue.priority` required.
- `IssueStatus` enum (5 значений: OPEN/IN_PROGRESS/REVIEW/DONE/CANCELLED), `Issue.status` required.
- `WorkflowStatus` таблица существует, имеет `category: StatusCategory`, `systemKey` unique, `color`, `iconName`, `isSystem`.
- `Issue.workflowStatusId` — FK nullable.
- TTQL-compiler поддерживает `priority` и `status` фильтры (по enum-значениям).

---

## 3. Зависимости

### Модули backend
- [ ] `modules/priorities/` — новый модуль: CRUD, default-per-project.
- [ ] `modules/issues/` — заменить `priority` enum на `priorityId` FK; `status` enum убрать, оставить только `workflowStatusId` NOT NULL.
- [ ] `modules/workflow-statuses/` — создать 5 системных статусов при миграции (если ещё нет).
- [ ] `modules/projects/` — добавить `defaultPriorityId`.
- [ ] `modules/search/search-compiler/` — переписать `priority` и `status` на join'ы по FK.

### Frontend
- [ ] `pages/admin/AdminPrioritiesPage.tsx` — новая.
- [ ] `pages/admin/AdminProjectSettingsPage.tsx` (existing) — добавить default priority.
- [ ] Все компоненты с приоритетом/статусом — обновить на FK-based rendering.

### Модели данных (Prisma)
- [ ] `Priority` — новая таблица (по образцу `WorkflowStatus`).
- [ ] `Issue.priority: IssuePriority` → `Issue.priorityId: String` (FK, NOT NULL).
- [ ] `Issue.status: IssueStatus` → удалить (после миграции).
- [ ] `Issue.workflowStatusId: String?` → NOT NULL.
- [ ] `Project.defaultPriorityId: String?` — новая колонка.

### Внешние зависимости
- Нет.

### Блокеры
- **TTRES-1 желателен** (resolution использует `workflowStatus.category === 'DONE'` вместо enum), но не блокирует — TTRES-1 написан с fallback'ом на legacy.

---

## 4. Риски

| # | Риск | Вероятность | Влияние | Влияние | Митигация |
|---|------|-------------|---------|---------|-----------|
| 1 | Миграция на prod с 100k+ issues упадёт по timeout | Средняя | Downtime релиза | Разбить миграцию на батчи (10k за раз), прогон на копии prod заранее |
| 2 | Legacy-code в frontend/TTQL использует строки `"DONE"` — ломается после удаления enum | **Высокая** | Невидимые регрессии | Dual-field API на 1 спринт: backend шлёт `status` (computed из statusCategory + workflowStatus.systemKey) рядом с `workflowStatus` объектом |
| 3 | Seed 5 системных статусов пересекается с существующими записями `WorkflowStatus` | Средняя | Дубли | Idempotent seed: `ON CONFLICT (systemKey) DO NOTHING` |
| 4 | TTQL `status = DONE` пользователей ломается после миграции | Высокая | UX-поломка | Compiler мапит `status` → category (если matches enum-like values) + `workflowStatus.systemKey` |
| 5 | Внешние интеграции (webhooks TTINTEG-1, events TTBUS-0) полагаются на enum | Средняя | Ломка | В payload событий отправляем оба: `statusId`, `statusCategory`, `statusName` |
| 6 | Priority удалён, а задачи используют его → FK violation | Средняя | 500-error | Soft-delete (`isActive=false`) или принудительная перепривязка на default перед удалением |

---

## 5. Особенности реализации

### 5.1 Модель Priority

```prisma
model Priority {
  id          String   @id @default(uuid())
  key         String   @unique           // 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'BLOCKER'
  name        String   @unique
  description String?
  color       String   @default("#9E9E9E")
  iconName    String?  @map("icon_name")  // имя из @ant-design/icons
  orderIndex  Int      @default(0) @map("order_index")
  isSystem    Boolean  @default(false) @map("is_system")
  isActive    Boolean  @default(true) @map("is_active")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  issues         Issue[]
  defaultProjects Project[]  @relation("projectDefaultPriority")

  @@map("priorities")
}
```

**Seed (в migration):**

```sql
INSERT INTO priorities (id, key, name, color, icon_name, order_index, is_system, is_active) VALUES
  (uuid(), 'CRITICAL', 'Критический', '#dc2626', 'ExclamationCircleOutlined', 1, true, true),
  (uuid(), 'HIGH',     'Высокий',     '#ea580c', 'ArrowUpOutlined',          2, true, true),
  (uuid(), 'MEDIUM',   'Средний',     '#ca8a04', 'MinusOutlined',            3, true, true),
  (uuid(), 'LOW',      'Низкий',      '#16a34a', 'ArrowDownOutlined',        4, true, true);
```

### 5.2 Миграция Priorities

```sql
-- 1. Добавить priority_id nullable
ALTER TABLE issues ADD COLUMN priority_id UUID REFERENCES priorities(id);

-- 2. Заполнить
UPDATE issues SET priority_id = (SELECT id FROM priorities WHERE key = priority::text);
-- priority::text превращает enum 'CRITICAL' → 'CRITICAL'

-- 3. Сделать NOT NULL
ALTER TABLE issues ALTER COLUMN priority_id SET NOT NULL;

-- 4. Удалить старую колонку
ALTER TABLE issues DROP COLUMN priority;

-- 5. Drop enum type
DROP TYPE "IssuePriority";
```

### 5.3 Миграция Status reconciliation

```sql
-- 1. Seed 5 system WorkflowStatus (idempotent)
INSERT INTO workflow_statuses (id, name, category, color, system_key, is_system) VALUES
  (uuid(), 'Открыто',     'TODO',        '#3b82f6', 'OPEN',         true),
  (uuid(), 'В работе',    'IN_PROGRESS', '#f59e0b', 'IN_PROGRESS',  true),
  (uuid(), 'Ревью',       'IN_PROGRESS', '#8b5cf6', 'REVIEW',       true),
  (uuid(), 'Готово',      'DONE',        '#10b981', 'DONE',         true),
  (uuid(), 'Отменено',    'DONE',        '#6b7280', 'CANCELLED',    true)
ON CONFLICT (system_key) DO NOTHING;

-- 2. Заполнить workflow_status_id для issues с null
UPDATE issues SET workflow_status_id = (
  SELECT id FROM workflow_statuses WHERE system_key = issues.status::text
) WHERE workflow_status_id IS NULL;

-- 3. Сделать NOT NULL
ALTER TABLE issues ALTER COLUMN workflow_status_id SET NOT NULL;

-- 4. Удалить status (ПОСЛЕ merge dual-field API — через 1 спринт, отдельная миграция)
-- ALTER TABLE issues DROP COLUMN status;
-- DROP TYPE "IssueStatus";
```

**Миграция разбивается на 2 PR'а:**
- **PR1 (TTCORE-1.a):** добавить Priority таблицу + priorityId, заполнить, переключить API на FK, оставить enum temporarily.
- **PR2 (TTCORE-1.b):** через 1 спринт после деплоя PR1 — убрать enum колонку.

### 5.4 API мигрирует

**До:**
```json
{ "id": "...", "priority": "HIGH", "status": "IN_PROGRESS" }
```

**Dual-field (промежуточная 1 спринт):**
```json
{
  "id": "...",
  "priority": "HIGH",                          // legacy string
  "priorityId": "uuid",
  "priorityObj": { "key": "HIGH", "name": "Высокий", "color": "#ea580c", "iconName": "..." },
  "status": "IN_PROGRESS",                     // legacy string
  "workflowStatusId": "uuid",
  "statusCategory": "IN_PROGRESS",             // computed
  "workflowStatus": { "name": "В работе", "systemKey": "IN_PROGRESS", "category": "IN_PROGRESS", "color": "..." }
}
```

**После (через 1 спринт):**
```json
{
  "id": "...",
  "priorityId": "uuid",
  "priority": { "key": "HIGH", "name": "Высокий", "color": "#ea580c", ... },
  "workflowStatusId": "uuid",
  "status": { "name": "В работе", "systemKey": "IN_PROGRESS", "category": "IN_PROGRESS", "color": "..." }
}
```

### 5.5 TTQL-compiler изменения

- `priority = high` → `WHERE p.key = 'HIGH'` (case-insensitive match по `key` или `name`).
- `priority in (Blocker, Critical)` → `WHERE p.key IN ('BLOCKER', 'CRITICAL')`.
- `priority = "Высокий"` — литерал совпадает с `name` — работает.
- `status = done` → `WHERE ws.system_key = 'DONE' OR ws.category = 'DONE'` (до удаления enum — fallback на старое поле).
- `statusCategory = Done` — новая возможность фильтровать по категории.

### 5.6 Default priority per project

- `Project.defaultPriorityId: String?` — nullable, FK на `Priority`.
- При создании Issue без явного `priorityId`:
  - Использовать `project.defaultPriorityId` если задан.
  - Иначе — системный `MEDIUM` (lookup по `key='MEDIUM'` один раз, кэш).

### 5.7 Admin UI — AdminPrioritiesPage

- Таблица: name, color-swatch, iconName (preview), orderIndex, isSystem, isActive, _count.issues.
- Создание/редакция — form с ColorPicker и IconPicker (dropdown из предустановленного набора `@ant-design/icons`: `ArrowUpOutlined`, `ExclamationCircleOutlined`, `FireOutlined`, и т.д., ~20 штук).
- Drag-and-drop для orderIndex.
- Delete: если `isSystem=true` — отклоняется, если `_count.issues > 0` — prompt «Перепривязать на другой приоритет сначала» + dropdown.

### 5.8 IssueStatus — handling enum removal plan

**Спринт 1 (TTCORE-1.a):**
- Seed 5 system statuses.
- Миграция `workflow_status_id` NOT NULL.
- Backend API возвращает оба поля (dual-field).
- Frontend читает `workflowStatus.systemKey` и `statusCategory`, но может fallback на `status` enum.

**Спринт 2 (TTCORE-1.b — через 1 спринт после релиза спринта 1):**
- Удаление колонки `status` и enum type.
- Frontend — убрать legacy-ветку.
- TTQL — убрать fallback на enum-поле.

---

## 6. Требования к реализации

### Функциональные
- [ ] FR-1: Модель `Priority` создана, 4 системных приоритета сидятся.
- [ ] FR-2: `/admin/priorities` CRUD (ADMIN/SUPER_ADMIN).
- [ ] FR-3: `Issue.priorityId` NOT NULL; endpoint принимает.
- [ ] FR-4: `Project.defaultPriorityId` настраивается в project settings.
- [ ] FR-5: При create issue без priority — используется project default, иначе `MEDIUM`.
- [ ] FR-6: TTQL: `priority = High`, `priority in (...)` работают.
- [ ] FR-7: 5 системных WorkflowStatus сидятся (если ещё нет).
- [ ] FR-8: Все Issue имеют `workflow_status_id NOT NULL`.
- [ ] FR-9: API возвращает dual-field (status + workflowStatus) на 1 спринт переходного периода.
- [ ] FR-10: TTQL: `status = DONE`, `statusCategory = Done` работают.

### Нефункциональные
- [ ] NFR-1: Миграция Issue-priority на prod-snapshot (1M задач) < 5 мин.
- [ ] NFR-2: Миграция workflow_status_id — тот же SLA.
- [ ] NFR-3: Issue list API не замедляется более чем на 30ms (доп. JOIN'ы на Priority + WorkflowStatus).

### Безопасность
- [ ] SEC-1: Priority CRUD — ADMIN+.
- [ ] SEC-2: Удаление системных priorities — 403.

### Тестирование
- [ ] Unit: TTQL priority/status match, Priority-service CRUD.
- [ ] Integration: миграция на фикстуре (100 issues) — все получают corrent FK.
- [ ] Integration: TTQL `priority = high` находит задачи.
- [ ] Integration: dual-field API — legacy field совместим.
- [ ] Migration rollback: проверить, что миграция обратима (add columns, drop new, restore old).
- [ ] Покрытие ≥ 70%.

---

## 7. Критерии приёмки

- [ ] AC-1: `/admin/priorities` работает: создание/редактирование/архивация.
- [ ] AC-2: 4 системных priorities сидятся, нельзя удалить.
- [ ] AC-3: Issue создаётся с project default priority, если не указан явно.
- [ ] AC-4: TTQL `priority = High` находит задачи с `HIGH`.
- [ ] AC-5: Все existing issues имеют `workflow_status_id`.
- [ ] AC-6: `status = DONE` возвращает все issues с workflowStatus.category=DONE.
- [ ] AC-7: Frontend показывает цветные priority-бейджи с иконками.
- [ ] AC-8: Tests зелёные, миграция dry-run на prod-snapshot успешна.

---

## 8. Оценка трудоёмкости

| Этап | Часы |
|------|------|
| Prisma model `Priority` + seed + миграция | 5 |
| Seed system WorkflowStatus + миграция `workflow_status_id` NOT NULL | 3 |
| Backend: modules/priorities CRUD + router | 4 |
| Backend: Issue-service рефактор (priority FK, dual-field) | 6 |
| Backend: project default priority | 2 |
| Backend: TTQL-compiler updates | 5 |
| Backend: webhooks/events payload dual-field | 2 |
| Frontend: AdminPrioritiesPage | 6 |
| Frontend: все формы/фильтры/бейджи на новый API | 10 |
| Tests + migration verification | 8 |
| Code review + AI review | 4 |
| **Итого PR1 (TTCORE-1.a)** | **55** |
| Спринт 2 — удаление enum колонки `status` | 4 |
| Frontend — убрать legacy | 2 |
| Tests cleanup | 2 |
| **Итого PR2 (TTCORE-1.b)** | **8** |
| **Общий итог** | **63** (~1 спринт) |

---

## 9. Связанные задачи

- **Зависит от:** нет.
- **Связано:** TTRES-1 (использует category='DONE'), TTSRH-1 (TTQL).
- **Частично блокирует (fallback OK):** TTRES-1 (может работать без TTCORE-1 через fallback).

---

## 10. Иерархия задач

```
TTCORE-1 (EPIC) — Priorities + Status reconciliation
  ├─ TTCORE-1.1 — Priority model + seed
  ├─ TTCORE-1.2 — Issue.priorityId + миграция
  ├─ TTCORE-1.3 — Project defaultPriorityId
  ├─ TTCORE-1.4 — AdminPrioritiesPage
  ├─ TTCORE-1.5 — WorkflowStatus seed + Issue.workflow_status_id NOT NULL
  ├─ TTCORE-1.6 — Dual-field API (status + workflowStatus)
  ├─ TTCORE-1.7 — TTQL compiler updates
  └─ TTCORE-1.8 — (через 1 спринт) — drop Issue.status enum
```
