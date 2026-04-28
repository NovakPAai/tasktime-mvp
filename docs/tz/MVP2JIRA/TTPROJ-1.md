# ТЗ: TTPROJ-1 — Components + fixVersion / affectsVersion

**Дата:** 2026-04-23
**Тип:** EPIC | **Приоритет:** P1 | **Статус:** OPEN
**Проект:** TaskTime MVP (TTMP)
**Исполнитель:** TBD
**Автор ТЗ:** Claude Code (auto-generated)

---

## 1. Постановка задачи

### 1.1 Components
В крупных проектах задачи группируются по **подсистемам** — `auth`, `billing`, `frontend`. Сейчас в TaskTime такого понятия нет. Добавляем модель `Component` с lead'ом и правилом auto-assignment.

### 1.2 fixVersion / affectsVersion
Сейчас задача может быть в одном primary релизе (`Issue.releaseId`). В Jira есть два отдельных поля:
- **fixVersion** — релиз(ы), в которых исправление выкатится.
- **affectsVersion** — релиз(ы), которые задача затрагивает (для bug-tracking: «найден в v1.0, исправлено в v1.2»).

**Решение:**
- `Issue.releaseId` оставляем как primary **fixVersion** (singular, обратная совместимость).
- Добавляем новую модель M:M — `IssueAffectsRelease` — для affectsVersion.

### Пользовательские сценарии

**QA репортит баг:**
1. Создаёт задачу. В affectsVersion — `v1.0, v1.1` (мультиселект).
2. После триажа в fixVersion ставит `v1.2`.
3. TTQL: `affectsVersion = "v1.0" AND fixVersion = "v1.2"` — находит.

**Развитие проекта:**
1. Админ в настройках проекта создаёт компоненты: `Frontend`, `Backend`, `Mobile`.
2. Назначает `Frontend`-lead на Alice, `Backend`-lead на Bob.
3. При создании issue с `components = [Frontend]` — assignee автоматически Alice.

---

## 2. Текущее состояние

- `Issue.releaseId: String?` — primary релиз (single).
- `ReleaseItem` — M:M `Release ↔ Issue`, используется для scope релиза (параллельно с releaseId).
- **Components** — модель отсутствует.
- **affectsVersion** — отсутствует.
- Releases — полноценные (workflow, checkpoints).

---

## 3. Зависимости

### Модули backend
- [ ] `modules/components/` — новый.
- [ ] `modules/issues/issues.service.ts` — поддержка components (M:M), affectsReleases (M:M), auto-assign.
- [ ] `modules/search/search-compiler/` — TTQL-поля `component`, `affectsVersion`, `fixVersion`.

### Frontend
- [ ] `pages/project/ProjectComponentsPage.tsx` — CRUD компонентов проекта.
- [ ] `components/issues/ComponentsSelector.tsx`.
- [ ] `components/issues/AffectsVersionSelector.tsx`.
- [ ] `components/issues/IssueDetailPage.tsx` — показывать components + affectsVersion.

### Модели данных (Prisma)
- [ ] `Component` — новая.
- [ ] `IssueComponent` — M:M.
- [ ] `IssueAffectsRelease` — M:M.

### Внешние зависимости
- Нет.

### Блокеры
- Нет.

---

## 4. Риски

| # | Риск | Вероятность | Влияние | Митигация |
|---|------|-------------|---------|-----------|
| 1 | Components M:M на популярной задаче (10+ компонентов) замедляет list-issues | Низкая | Slow queries | Индекс `(issueId)` и `(componentId)`, выборка компонентов отдельным запросом (not N+1) |
| 2 | Auto-assign через компонент перезаписывает явно выбранный assignee | Средняя | UX-регрессия | Auto-assign срабатывает **только если assignee=null в payload** |
| 3 | Component lead удалён из системы → auto-assign падает | Низкая | 500-error | При deactivate user component-lead обнуляется; при hard-delete — cascade |
| 4 | Ambiguity: `ReleaseItem` vs `IssueAffectsRelease` (какую модель для fixVersion использовать?) | Высокая | Путаница в коде | Чётко документировать: `Issue.releaseId` = fixVersion (single); `IssueAffectsRelease` = affectsVersions (M:M); `ReleaseItem` остаётся для release-scope planning как отдельная сущность |
| 5 | TTQL `fixVersion = "v1.0"` vs `release = "v1.0"` — какое поле? | Средняя | Confusion | `fixVersion` — новый ссылается на `Issue.releaseId`; `release` — alias для backward compat в TTQL |

---

## 5. Особенности реализации

### 5.1 Модели

```prisma
enum ComponentAssigneeType {
  PROJECT_DEFAULT    // project.leadId
  COMPONENT_LEAD     // component.leadId
  UNASSIGNED         // null
}

model Component {
  id            String                 @id @default(uuid())
  projectId     String                 @map("project_id")
  name          String
  description   String?
  leadId        String?                @map("lead_id")
  assigneeType  ComponentAssigneeType  @default(PROJECT_DEFAULT) @map("assignee_type")
  isActive      Boolean                @default(true) @map("is_active")
  orderIndex    Int                    @default(0) @map("order_index")
  createdAt     DateTime               @default(now())
  updatedAt     DateTime               @updatedAt

  project  Project          @relation(fields: [projectId], references: [id], onDelete: Cascade)
  lead     User?            @relation("componentLead", fields: [leadId], references: [id], onDelete: SetNull)
  issues   IssueComponent[]

  @@unique([projectId, name])
  @@index([projectId])
  @@map("components")
}

model IssueComponent {
  issueId      String   @map("issue_id")
  componentId  String   @map("component_id")
  addedAt      DateTime @default(now())

  issue        Issue     @relation(fields: [issueId], references: [id], onDelete: Cascade)
  component    Component @relation(fields: [componentId], references: [id], onDelete: Cascade)

  @@id([issueId, componentId])
  @@index([componentId])
  @@map("issue_components")
}

model IssueAffectsRelease {
  issueId    String   @map("issue_id")
  releaseId  String   @map("release_id")
  addedAt    DateTime @default(now())
  addedById  String?  @map("added_by_id")

  issue    Issue   @relation(fields: [issueId], references: [id], onDelete: Cascade)
  release  Release @relation(fields: [releaseId], references: [id], onDelete: Cascade)

  @@id([issueId, releaseId])
  @@index([releaseId])
  @@map("issue_affects_releases")
}
```

### 5.2 Auto-assign logic

```typescript
async function resolveAutoAssignee(
  projectId: string,
  componentIds: string[],
  explicitAssigneeId?: string | null,
): Promise<string | null> {
  if (explicitAssigneeId !== undefined) return explicitAssigneeId;  // явный — не трогаем, включая null

  if (componentIds.length === 0) return null;

  // Берём компоненты в порядке orderIndex, первый = primary
  const primary = await prisma.component.findFirst({
    where: { id: { in: componentIds }, isActive: true },
    orderBy: { orderIndex: 'asc' },
  });
  if (!primary) return null;

  switch (primary.assigneeType) {
    case 'PROJECT_DEFAULT':
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      return project?.leadId ?? null;
    case 'COMPONENT_LEAD':
      return primary.leadId;
    case 'UNASSIGNED':
    default:
      return null;
  }
}
```

### 5.3 Soft-delete компонента

```typescript
// DELETE /admin/projects/:projectId/components/:id
// → обязательно soft-delete (isActive=false)
await prisma.component.update({
  where: { id },
  data: { isActive: false },
});
```

Permanent delete через отдельный endpoint `DELETE /admin/projects/:projectId/components/:id/permanent` — **только если `_count.issues === 0`**, иначе 400 с сообщением «Сначала удалите привязки».

### 5.4 TTQL расширение

Новые поля:
- `component` — matches by component.name (case-insensitive) on joined `IssueComponent`.
- `affectsVersion` — matches by release.name through `IssueAffectsRelease`.
- `fixVersion` — alias для существующего `release` поля (для Jira-паритета).

Примеры:
- `component = Frontend` → `EXISTS (SELECT 1 FROM issue_components ic JOIN components c ON c.id = ic.component_id WHERE ic.issue_id = issue.id AND c.name ILIKE 'Frontend')`
- `component in (Frontend, Backend)` — аналог с `IN`.
- `affectsVersion = "v1.0"` → `EXISTS (SELECT 1 FROM issue_affects_releases iar JOIN releases r ON r.id = iar.release_id WHERE iar.issue_id = issue.id AND r.name = 'v1.0')`
- `fixVersion = "v1.2"` → `issue.release_id = (SELECT id FROM releases WHERE name='v1.2')`

### 5.5 Модуль Components — API

- `GET /api/projects/:projectId/components` — публичный (с `ISSUES_VIEW`).
- `POST /api/projects/:projectId/components` — требует `PROJECT_SETTINGS_EDIT`.
- `PATCH /api/projects/:projectId/components/:id` — тот же permission.
- `DELETE /api/projects/:projectId/components/:id` — soft-delete.
- `DELETE /api/projects/:projectId/components/:id/permanent` — hard-delete если 0 issues.

### 5.6 Issue API изменения

**Create/Update DTO:**
```typescript
{
  ...existingFields,
  componentIds?: string[];                // UUID компонентов
  affectsReleaseIds?: string[];           // UUID релизов
}
```

В response:
```json
{
  ...,
  "components": [{ "id", "name", "leadName" }],
  "affectsReleases": [{ "id", "name" }]
}
```

### 5.7 Archive Release — небольшое расширение из 3.5.KKK

Добавляем в `Release`:
```prisma
isArchived   Boolean  @default(false) @map("is_archived")
archivedAt   DateTime? @map("archived_at")
```

Архивированные релизы:
- Не появляются в dropdown'ах `fixVersion`/`affectsVersion` (но остаются связь для уже существующих привязок).
- `/admin/releases/archived` — отдельная админ-страница.

---

## 6. Требования к реализации

### Функциональные
- [ ] FR-1: Модель Component + M:M IssueComponent.
- [ ] FR-2: Модель IssueAffectsRelease.
- [ ] FR-3: CRUD компонентов в project settings.
- [ ] FR-4: Auto-assign по primary (orderIndex=0) компоненту работает согласно assigneeType.
- [ ] FR-5: Auto-assign НЕ срабатывает, если assignee явно указан в payload.
- [ ] FR-6: Soft-delete компонента; hard-delete только с 0 issues.
- [ ] FR-7: TTQL: `component`, `affectsVersion`, `fixVersion` (alias для `release`).
- [ ] FR-8: Release.isArchived + UI.
- [ ] FR-9: `Issue.release_id` не меняется семантически — остаётся primary fixVersion.

### Нефункциональные
- [ ] NFR-1: Issue list с component-JOIN не замедляется более чем на 30ms p95.
- [ ] NFR-2: TTQL поиск по component на 10k issues < 400ms.

### Безопасность
- [ ] SEC-1: Component CRUD требует `PROJECT_SETTINGS_EDIT`.
- [ ] SEC-2: Lead user может быть только с ролью в проекте.

### Тестирование
- [ ] Unit: auto-assign logic (все 3 варианта assigneeType, ambiguous orderIndex).
- [ ] Integration: create issue с компонентом → assignee подставился.
- [ ] Integration: create issue с assignee + компонентом → не перезаписан.
- [ ] Integration: TTQL `component = X AND affectsVersion = Y`.
- [ ] E2E: full flow через UI (admin → create component → user → create issue).
- [ ] Покрытие ≥ 70%.

---

## 7. Критерии приёмки

- [ ] AC-1: Project settings → components CRUD работает.
- [ ] AC-2: Issue-create с `componentIds` → запись в `IssueComponent`.
- [ ] AC-3: Issue-create с компонентом, assigneeType=COMPONENT_LEAD → assignee = lead.
- [ ] AC-4: TTQL `component = Frontend` находит задачи.
- [ ] AC-5: TTQL `affectsVersion = "v1.0"` — аналогично.
- [ ] AC-6: Soft-delete компонента → `isActive=false`, задачи сохраняют privязку.
- [ ] AC-7: Hard-delete с существующими привязками → 400.
- [ ] AC-8: Archive release → не в dropdown'ах.
- [ ] AC-9: Tests зелёные.

---

## 8. Оценка трудоёмкости

| Этап | Часы |
|------|------|
| Prisma models (Component, IssueComponent, IssueAffectsRelease, archive-fields) | 4 |
| Backend components module + CRUD | 5 |
| Backend Issue-service: componentIds, affectsReleaseIds, auto-assign | 6 |
| TTQL compiler: component, affectsVersion, fixVersion alias | 5 |
| Frontend: ProjectComponentsPage | 5 |
| Frontend: ComponentsSelector + AffectsVersionSelector | 6 |
| Frontend: IssueDetailPage updates | 3 |
| Archive Release — minor UI + endpoint | 3 |
| Tests | 8 |
| Code review | 3 |
| **Итого** | **48** (~1 спринт) |

---

## 9. Связанные задачи

- **Зависит от:** нет.
- **Связано:** TTMP-140 (Releases), TTSRH-1 (TTQL compiler).

---

## 10. Иерархия задач

```
TTPROJ-1 (EPIC) — Components + fix/affects Versions
  ├─ TTPROJ-1.1 — Prisma models
  ├─ TTPROJ-1.2 — Backend components CRUD + auto-assign
  ├─ TTPROJ-1.3 — Backend Issue-service updates (M:M)
  ├─ TTPROJ-1.4 — TTQL extensions
  ├─ TTPROJ-1.5 — Frontend pages + selectors
  ├─ TTPROJ-1.6 — Release.isArchived
  └─ TTPROJ-1.7 — Tests + docs
```
