# ТЗ: TTSCR-1 — Screens (контекст видимости полей)

**Дата:** 2026-04-23
**Тип:** TASK | **Приоритет:** P1 | **Статус:** OPEN
**Проект:** TaskTime MVP (TTMP)
**Исполнитель:** TBD
**Автор ТЗ:** Claude Code (auto-generated)

---

## 1. Постановка задачи

В Jira есть понятие **Screens** — разные наборы полей на create/edit/view задачи. Сейчас в TaskTime `FieldSchema` управляет, **какие** поля доступны, но не **где именно** они видны. Админ не может скрыть `priority` с create-экрана, но показать на edit, или наоборот.

Задача **минимально расширяет существующую модель FieldSchema** флагами контекста без создания новых таблиц (Screen/ScreenScheme/IssueTypeScreenScheme), избегая дублирования.

**Системные поля имеют разную политику:**
- **Всегда видимы** (`summary`, `description`, текущий статус) — не управляются через FieldSchema.
- **Управляемы** (`priority`, `assignee`, `dueDate`, `reporter`, etc.) — могут быть скрыты/показаны.

### Пользовательские сценарии

**Админ настраивает упрощённую форму создания:**
1. `/admin/field-schemas/:id` → в списке полей у `priority` снимает флаг «Показывать при создании».
2. При создании новой задачи — `priority` в форме отсутствует (устанавливается default).

**Компактная карточка issue:**
1. У поля `dueDate` админ снимает флаг «Показывать при просмотре» для `FieldSchema=Kanban-min`.
2. В проектах с этой схемой dueDate не рендерится на issue-странице.

---

## 2. Текущее состояние

- `FieldSchema` + `FieldSchemaItem` — существуют, `isRequired` и `showOnKanban` уже есть.
- `FieldSchemaBinding` — 4 уровня (GLOBAL/PROJECT/ISSUE_TYPE/PROJECT_ISSUE_TYPE).
- Transition Screens — отдельная сущность (не трогаем).
- Системные поля рендерятся вручную в компонентах фронта (`IssueForm.tsx`, `IssueDetailPage.tsx`) — не через FieldSchema.

---

## 3. Зависимости

### Модули backend
- [ ] `modules/field-schemas/field-schemas.service.ts` — добавить 3 флага в DTO и persist.
- [ ] `modules/issues/issues.service.ts` — валидировать обязательные поля с учётом контекста (create/edit отличаются).
- [ ] `modules/custom-fields/` — для системных полей добавить «виртуальные» записи в FieldSchema.

### Frontend
- [ ] `pages/admin/AdminFieldSchemaDetailPage.tsx` — добавить 3 чекбокса в строке.
- [ ] `components/issues/IssueForm.tsx` — фильтрация полей по context (`create`/`edit`).
- [ ] `components/issues/IssueDetailPage.tsx` — фильтрация по `view`.

### Модели данных (Prisma)
- [ ] `FieldSchemaItem` — 3 новые boolean колонки: `showOnCreate`, `showOnEdit`, `showOnView` (default true).
- [ ] Миграция: для существующих записей проставить все 3 флага в `true`.

### Внешние зависимости
- Нет.

### Блокеры
- Нет.

---

## 4. Риски

| # | Риск | Вероятность | Влияние | Митигация |
|---|------|-------------|---------|-----------|
| 1 | Админ скрывает `priority` с create, но поле обязательное → 400 на каждый create | Средняя | Блокировка создания issue | Если `isRequired=true`, нельзя сохранить `showOnCreate=false` — валидация в backend и UI |
| 2 | Системные поля («priority» — встроенное в Issue, не FieldSchemaItem) — как управлять? | **Высокая** | Неконсистентность | Ввести «виртуальные» системные entries: при создании FieldSchema автоматически сидятся записи для priority/assignee/dueDate/reporter/components/fixVersion/affectsVersion (после TTPROJ-1). Админ управляет их видимостью через те же флаги |
| 3 | View-контекст скрывает поле, но оно заполнено — данные «невидимы», непонятно | Низкая | UX-путаница | Tooltip «Некоторые поля скрыты администратором»; admin debug-view для troubleshooting |
| 4 | При смене FieldSchema на проекте поведение форм меняется — пользователи в замешательстве | Низкая | UX | Changelog в audit-log; при смене — уведомление project-lead'ам |

---

## 5. Особенности реализации

### 5.1 Модель

```prisma
// Дополнение к существующей FieldSchemaItem:
model FieldSchemaItem {
  // ...existing fields...
  showOnCreate  Boolean  @default(true) @map("show_on_create")
  showOnEdit    Boolean  @default(true) @map("show_on_edit")
  showOnView    Boolean  @default(true) @map("show_on_view")
  // showOnKanban  Boolean  — уже есть
}
```

### 5.2 Системные поля — виртуальные FieldSchemaItem

Добавляем концепцию «системные поля» в `CustomField`:

```prisma
// CustomField.isSystem уже есть. Расширяем семантику:
// isSystem=true + systemKey='priority' → specialized rendering + behavior
```

Системные поля-кандидаты:
- `priority` — systemKey `priority`
- `assignee` — systemKey `assignee`
- `dueDate` — systemKey `dueDate`
- `reporter` — systemKey `reporter`
- `components` — systemKey `components` (появляется после TTPROJ-1)
- `fixVersion` — systemKey `fixVersion`
- `affectsVersion` — systemKey `affectsVersion`

При создании FieldSchema — автоматически (seed) добавляется FieldSchemaItem для каждого системного поля с default `showOnCreate=true, showOnEdit=true, showOnView=true`.

**NEVER-HIDDEN (захардкожены):**
- `summary`, `description`, `status` — нельзя управлять через FieldSchema; всегда видимы во всех контекстах.

### 5.3 Backend API обогащается контекстом

```
GET /api/issues/:id?context=view      → возвращает только showOnView=true
GET /api/issues/:id?context=edit      → только showOnEdit=true
POST /api/issues (create)             → принимает только showOnCreate=true
```

Контекст определяется endpoint'ом + полем в query. Поля, исключённые через FieldSchema, **не попадают** в API-ответ (исключение — системные: они всегда в response, но frontend решает показывать).

### 5.4 Frontend logic

```typescript
// components/issues/useFieldSchema.ts
export function useVisibleFields(
  projectId: string,
  issueTypeId: string,
  context: 'create' | 'edit' | 'view',
): FieldSchemaItem[] {
  const schema = useFieldSchema(projectId, issueTypeId);
  const contextKey =
    context === 'create' ? 'showOnCreate' :
    context === 'edit'   ? 'showOnEdit'   :
                           'showOnView';
  return schema.items.filter((i) => i[contextKey]);
}
```

`IssueForm` и `IssueDetailPage` используют этот хук. Системные поля рендерятся conditionally:

```tsx
{visible.find(i => i.customField.systemKey === 'priority') && <PriorityField />}
```

### 5.5 Admin UI обновление

В `AdminFieldSchemaDetailPage.tsx`, таблица FieldSchemaItem — добавить 3 чекбокса в колонке «Контекст»:

| Поле | Обязательно | Create | Edit | View | Kanban |
|------|------------|--------|------|------|--------|
| priority | ☐ | ☑ | ☑ | ☑ | ☑ |
| dueDate | ☐ | ☐ | ☑ | ☑ | ☐ |

**Validation на save:** если `isRequired=true && showOnCreate=false` — запрет с сообщением «Обязательное поле должно быть видимо при создании».

### 5.6 Transition screens — не трогаем

Подчёркивается: `TransitionScreen` остаётся отдельной моделью. Она работает **в контексте transition**, и контексты `create/edit/view` её не касаются.

---

## 6. Требования к реализации

### Функциональные
- [ ] FR-1: FieldSchemaItem получает 3 новых флага с default true.
- [ ] FR-2: При создании FieldSchema seed'ятся записи для 7 системных полей (priority/assignee/dueDate/reporter/components/fixVersion/affectsVersion).
- [ ] FR-3: `summary`/`description`/`status` — NEVER hidden.
- [ ] FR-4: API принимает/возвращает поля согласно контексту.
- [ ] FR-5: Admin UI показывает 3 чекбокса в FieldSchema.
- [ ] FR-6: Валидация: `isRequired=true && showOnCreate=false` блокирует save.
- [ ] FR-7: Frontend форм: фильтрация полей через `useVisibleFields`.

### Нефункциональные
- [ ] NFR-1: `useVisibleFields` кеширует schema per-project-per-issueType в React-Query.
- [ ] NFR-2: Render IssueForm с 20 полями < 100ms.

### Безопасность
- [ ] SEC-1: FieldSchema CRUD — ADMIN+.
- [ ] SEC-2: Скрытое поле **не возвращается** в API (kannikkuse: fully not-in-response, чтобы не утекало существование значения).

### Тестирование
- [ ] Unit: validation `isRequired + !showOnCreate`.
- [ ] Integration: API с `?context=view` исключает `showOnView=false` поля.
- [ ] E2E: админ убирает `dueDate` с view → на issue-странице поле отсутствует.
- [ ] Покрытие ≥ 70%.

---

## 7. Критерии приёмки

- [ ] AC-1: 3 новых колонки в `field_schema_items`.
- [ ] AC-2: 7 системных полей добавлены в существующие FieldSchemas при миграции (idempotent seed).
- [ ] AC-3: `summary`/`description`/`status` всегда видимы.
- [ ] AC-4: Validation блокирует `required && !showOnCreate`.
- [ ] AC-5: IssueForm на create не рендерит поля с `showOnCreate=false`.
- [ ] AC-6: IssueDetailPage на view не рендерит с `showOnView=false`.
- [ ] AC-7: Admin UI работает, 3 чекбокса сохраняются.
- [ ] AC-8: Tests зелёные.

---

## 8. Оценка трудоёмкости

| Этап | Часы |
|------|------|
| Prisma migration + seed системных полей | 3 |
| Backend: API context-filtering | 4 |
| Backend: validation isRequired+showOnCreate | 1 |
| Frontend: useVisibleFields hook | 3 |
| Frontend: IssueForm/IssueDetailPage рефактор | 4 |
| Frontend: AdminFieldSchemaDetailPage UI | 3 |
| Tests | 4 |
| Code review | 2 |
| **Итого** | **24** (~0.5 спринта) |

---

## 9. Связанные задачи

- **Зависит от:** нет (TTPROJ-1 желателен — добавляет `components`/`fixVersion`/`affectsVersion` системные поля).
- **Связано:** TTADM-68 (Workflow Editor).

---

## 10. Иерархия задач

```
TTSCR-1 (TASK) — Screens (context flags)
  ├─ TTSCR-1.1 — Prisma migration + seed system fields
  ├─ TTSCR-1.2 — Backend API filtering
  ├─ TTSCR-1.3 — Frontend useVisibleFields + form refactor
  └─ TTSCR-1.4 — Admin UI + tests
```
