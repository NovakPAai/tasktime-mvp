# ТЗ: TTRES-1 — Resolutions (Результат закрытия задачи)

**Дата:** 2026-04-23
**Тип:** TASK | **Приоритет:** P0 | **Статус:** OPEN
**Проект:** TaskTime MVP (TTMP)
**Исполнитель:** TBD
**Автор ТЗ:** Claude Code (auto-generated)

---

## 1. Постановка задачи

Сейчас задача закрывается переходом в статус `DONE` или `CANCELLED` — но **почему** закрыта, не фиксируется. Это ломает базовый Jira-сценарий «закрыли как дубликат / как не баг / как не будет сделано» и обесценивает отчётность.

Задача вводит сущность `Resolution` (справочник) + поле `resolutionId` на `Issue` + validator на workflow-transition, требующий выбор resolution при переходе в терминальный статус.

### Пользовательский сценарий

**Разработчик:**
1. Задача в `IN_PROGRESS`. Кликает «Перейти в Done».
2. Появляется transition-screen с селектом «Результат: Решено / Дубликат / Не воспроизводится / …».
3. Выбирает, комментирует (опционально) → submit.

**Репортёр ищет старые закрытые задачи:**
- `TTQL: resolution = Duplicate AND resolved >= -30d` → список.

**Админ:**
- Идёт в `/admin/resolutions` → CRUD справочника.

---

## 2. Текущее состояние

- `Issue.status: IssueStatus` enum — проставляется при переходе, но нет «почему».
- Workflow-engine поддерживает `validators` на переходах (`workflow-engine/transition-validators`) — готовый механизм для принудительного требования resolution.
- Модели `Resolution` нет.
- TTQL-compiler (`search.service.ts`, `search-compiler`) — модульный, поддерживает добавление полей.

---

## 3. Зависимости

### Модули backend
- [ ] `modules/resolutions/` — новый модуль: CRUD + router `/admin/resolutions`.
- [ ] `modules/issues/issues.service.ts` — добавить `resolutionId`/`resolvedAt` в create/update API.
- [ ] `modules/workflow-engine/transition-validators/` — новый validator `RequireResolutionOnTerminalStatus`.
- [ ] `modules/search/search-compiler/` — добавить fields `resolution` + `resolved` в TTQL.
- [ ] `modules/transition-screens/` — возможность включить поле `resolution` в transition screen.

### Frontend
- [ ] `pages/admin/AdminResolutionsPage.tsx` — новая админ-страница.
- [ ] `components/issues/IssueDetailPage.tsx` — показывать `resolution` + `resolvedAt` если задача закрыта.
- [ ] `components/workflow/TransitionDialog.tsx` — рендерить селект resolution в transition-screen.
- [ ] `components/search/JqlEditor.tsx` — автодополнение для `resolution` / `resolved`.

### Модели данных (Prisma)
- [ ] `Resolution` — новая модель.
- [ ] `Issue.resolutionId` — новая колонка (nullable FK).
- [ ] `Issue.resolvedAt` — новая колонка (nullable DateTime).

### Внешние зависимости
- Нет.

### Блокеры
- [ ] TTCORE-1 **желательно** (но не обязательно) — согласование `IssueStatus` vs `WorkflowStatus`. Здесь `resolution` привязывается к `StatusCategory=DONE` (тот что уже есть на `WorkflowStatus`). Если TTCORE-1 мержится позже — логика validator'а резолвится через `workflowStatus.category === 'DONE'`.

---

## 4. Риски

| # | Риск | Вероятность | Влияние | Митигация |
|---|------|-------------|---------|-----------|
| 1 | Миграция существующих закрытых задач: неправильный auto-fill resolution | Низкая | UX-деградация | Auto-assign: `status=DONE` → `Решено`, `status=CANCELLED` → `Не будет сделано`. Флаг в audit-log `resolution_auto_assigned=true` для возможности массового отката |
| 2 | Validator ломает существующие workflow (старые задачи не могут переходить без resolution) | Высокая | Поломка UX | Validator опциональный на workflow level — админ включает явно; существующие workflow получают миграцию: флаг активируется только на новых |
| 3 | Удаление resolution из справочника, пока она используется 100+ задачами | Средняя | FK violation | Soft-delete (`isActive=false`), hard-delete — только если 0 задач используют |
| 4 | TTQL `resolution is EMPTY` — семантика? | Низкая | Неоднозначность | Документировать: `EMPTY` = NULL (открытая задача или закрытая без явного resolution) |

---

## 5. Особенности реализации

### 5.1 Модель

```prisma
model Resolution {
  id          String   @id @default(uuid())
  key         String   @unique          // 'DONE', 'WONT_DO', etc. — стабильный ID для миграций
  name        String                    // RU-строка, editable
  description String?
  color       String?  @default("#6B7280")
  orderIndex  Int      @default(0)
  isSystem    Boolean  @default(false)  // нельзя hard-delete
  isActive    Boolean  @default(true)   // архивация
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  issues      Issue[]

  @@map("resolutions")
}

// Изменения в модели Issue:
// resolutionId String?   @map("resolution_id")
// resolvedAt   DateTime? @map("resolved_at")
// resolution   Resolution? @relation(fields: [resolutionId], references: [id])
```

### 5.2 Seed (при создании миграции)

```sql
INSERT INTO resolutions (id, key, name, order_index, is_system, is_active) VALUES
  (uuid(), 'DONE',              'Решено',                  1, true, true),
  (uuid(), 'WONT_DO',            'Не будет сделано',        2, true, true),
  (uuid(), 'DUPLICATE',          'Дубликат',                3, true, true),
  (uuid(), 'CANNOT_REPRODUCE',   'Не воспроизводится',      4, true, true),
  (uuid(), 'INCOMPLETE',         'Недостаточно информации', 5, true, true);
```

### 5.3 Миграция данных (в той же Prisma-миграции)

```sql
-- Установить resolution для всех existing closed задач:
UPDATE issues SET
  resolution_id = (SELECT id FROM resolutions WHERE key = 'DONE'),
  resolved_at = updated_at
WHERE status = 'DONE' AND resolution_id IS NULL;

UPDATE issues SET
  resolution_id = (SELECT id FROM resolutions WHERE key = 'WONT_DO'),
  resolved_at = updated_at
WHERE status = 'CANCELLED' AND resolution_id IS NULL;

-- audit-log:
INSERT INTO audit_logs (entity_type, entity_id, action, details)
SELECT 'Issue', id, 'resolution_auto_assigned', json_build_object('source', 'migration_TTRES-1')
FROM issues WHERE resolution_id IS NOT NULL AND status IN ('DONE', 'CANCELLED');
```

### 5.4 Validator на workflow-transition

Новый тип validator в `workflow-engine/transition-validators/`:

```typescript
// RequireResolutionOnTerminalStatus
export const requireResolutionValidator: TransitionValidator = {
  type: 'REQUIRE_RESOLUTION_ON_TERMINAL',
  validate: async ({ issue, transition, toStatus, input }) => {
    if (toStatus.category !== 'DONE') return { ok: true };
    if (!input.resolutionId) {
      return { ok: false, error: 'RESOLUTION_REQUIRED' };
    }
    const res = await prisma.resolution.findUnique({ where: { id: input.resolutionId } });
    if (!res || !res.isActive) return { ok: false, error: 'RESOLUTION_INVALID' };
    return { ok: true };
  },
};
```

В админке workflow-editor — добавить checkbox на transition: «Требовать resolution при переходе».

### 5.5 UI на карточке задачи

- Если `resolutionId != null`: показывать рядом со статусом бейдж с `resolution.name` + `resolution.color`.
- Клик на бейдж — tooltip с `resolution.description` и `resolvedAt` (relative: «закрыто 3 дня назад»).
- Поле **не редактируется напрямую** на карточке — только через transition (re-open issue → снова закрыть с другим resolution).

### 5.6 Transition screen

Расширить `TransitionScreen` — добавить системное поле `resolution` как опциональный элемент (в стиле существующих custom fields). При `validator=REQUIRE_RESOLUTION_ON_TERMINAL` — поле required.

### 5.7 TTQL-расширение

Новые поля в грамматике:
- `resolution` — ожидает `key` или `name` resolution'а (case-insensitive).
- `resolved` — date-field, аналог `created`/`updated`.

Примеры:
- `resolution = "Дубликат"` → `WHERE r.name ILIKE 'Дубликат'`
- `resolution = Duplicate` → `WHERE r.key = 'DUPLICATE'`
- `resolution is EMPTY` → `WHERE issue.resolution_id IS NULL`
- `resolution in (Done, Duplicate)` → `WHERE r.key IN ('DONE', 'DUPLICATE')`
- `resolved >= -7d` → `WHERE issue.resolved_at >= NOW() - INTERVAL '7 days'`

### 5.8 API

- `GET /api/resolutions` — публичный (для UI-дропдаунов), только `isActive=true`.
- `GET /admin/resolutions` — админский, все, с `_count.issues`.
- `POST /admin/resolutions` — create.
- `PATCH /admin/resolutions/:id` — update (name, description, color, orderIndex, isActive).
- `DELETE /admin/resolutions/:id` — hard-delete если `_count.issues === 0 && !isSystem`; иначе 400.

---

## 6. Требования к реализации

### Функциональные
- [ ] FR-1: Справочник `Resolution` — CRUD в `/admin/resolutions` (только ADMIN/SUPER_ADMIN).
- [ ] FR-2: 5 системных resolution сидятся при миграции, `isSystem=true`.
- [ ] FR-3: На `Issue` появляются поля `resolutionId` + `resolvedAt`.
- [ ] FR-4: Validator `REQUIRE_RESOLUTION_ON_TERMINAL` — доступен в workflow-editor, опционален per-transition.
- [ ] FR-5: Transition screen умеет показывать selector resolution.
- [ ] FR-6: Существующие закрытые задачи автозаполняются (`DONE` → `Решено`, `CANCELLED` → `Не будет сделано`).
- [ ] FR-7: TTQL поддерживает `resolution` и `resolved`.
- [ ] FR-8: При `status → OPEN` (re-open) — `resolutionId` и `resolvedAt` очищаются.

### Нефункциональные
- [ ] NFR-1: Миграция данных на БД с 100k issues выполняется < 30 сек.
- [ ] NFR-2: Индекс на `(project_id, resolution_id)` — фильтрация «все resolved задачи проекта» быстрая.

### Безопасность
- [ ] SEC-1: `Resolution` CRUD — только ADMIN/SUPER_ADMIN.
- [ ] SEC-2: Изменение `resolution` на задаче — требует `ISSUES_EDIT` или разрешение на transition.

### Тестирование
- [ ] Unit: validator, TTQL-compiler для `resolution` и `resolved`.
- [ ] Integration: переход в `DONE` без resolution (с активным validator) → 400.
- [ ] Integration: soft-delete resolution при использовании её в issues → отклоняется.
- [ ] Migration-тест: фикстура с 50 issues, миграция, проверка auto-fill.
- [ ] Покрытие ≥ 70%.

---

## 7. Критерии приёмки

- [ ] AC-1: `/admin/resolutions` — CRUD страница работает.
- [ ] AC-2: 5 системных resolution созданы.
- [ ] AC-3: Переход в `DONE` с активным validator без resolution → 400 `RESOLUTION_REQUIRED`.
- [ ] AC-4: Карточка resolved-задачи показывает бейдж с цветом и именем.
- [ ] AC-5: TTQL: `resolution = Duplicate` находит задачи.
- [ ] AC-6: TTQL: `resolved >= -7d` находит.
- [ ] AC-7: Миграция на dev-БД прошла, все старые closed задачи имеют `resolution_id`.
- [ ] AC-8: Re-open задачи обнуляет `resolution_id` и `resolved_at`.
- [ ] AC-9: Тесты зелёные. Lint проходит.

---

## 8. Оценка трудоёмкости

| Этап | Часы |
|------|------|
| Prisma-миграция (модель + seed + data-migration) | 4 |
| `modules/resolutions/` CRUD + router | 4 |
| Validator `REQUIRE_RESOLUTION_ON_TERMINAL` | 3 |
| Transition screen integration | 3 |
| TTQL extension (fields: resolution, resolved) | 4 |
| Frontend: AdminResolutionsPage | 4 |
| Frontend: transition dialog + issue card badge | 4 |
| Tests | 5 |
| Code review | 2 |
| **Итого** | **33** (~0.5 спринта) |

---

## 9. Связанные задачи

- **Зависит от:** нет (TTCORE-1 желателен).
- **Блокирует:** нет.
- **Связано:** TTSRH-1 (TTQL-compiler — расширяем).

---

## 10. Иерархия задач

```
TTRES-1 (TASK) — Resolutions
  ├─ TTRES-1.1 — Prisma model + seed + data migration
  ├─ TTRES-1.2 — Backend CRUD + validator + TTQL
  ├─ TTRES-1.3 — Frontend AdminResolutionsPage + transition dialog
  └─ TTRES-1.4 — Tests + docs
```
