# ТЗ: TTMP-223 — [Release Mgmt] Исправление несоответствий реализации спеке RELEASE_MANAGEMENT_SPEC

**Дата:** 2026-04-12
**Тип:** TASK | **Приоритет:** HIGH | **Статус:** OPEN
**Проект:** TaskTime MVP (TTMP)
**Автор ТЗ:** Claude Code (auto-generated)

---

## 1. Постановка задачи

В ходе аудита кодовой базы относительно спецификации `docs/specs/RELEASE_MANAGEMENT_SPEC.md` (v1.0, 2026-04-11) выявлено **14 несоответствий** разной степени критичности. Необходимо привести реализацию в соответствие со спекой без изменения публичного контракта для уже работающих клиентов (старые эндпоинты `/ready`, `/released` уже возвращают 410).

### Пользовательский сценарий

**Релиз-менеджер** (роль `RELEASE_MANAGER`) пытается создать / управлять релизом через UI и получает `403 Forbidden` — потому что роутер не включает эту роль. После исправления он сможет выполнять весь CRUD релизов и переходы по статусам. **MANAGER** при попытке удалить выпущенный релиз ожидает ошибку 403, но текущий код пропускает его — нарушение политики безопасности.

---

## 2. Текущее состояние

| Файл | Роль в проблеме |
|------|----------------|
| [releases.router.ts](../../backend/src/modules/releases/releases.router.ts) | Неверные `requireRole` на всех мутациях; нет `RELEASE_MANAGER` |
| [releases.service.ts](../../backend/src/modules/releases/releases.service.ts) | `removeReleaseItems` без DONE/CANCELLED-защиты; неверный shape `byProject`; нет `totalPages`; `search` только по `name` |
| [release-workflow-engine.service.ts](../../backend/src/modules/releases/release-workflow-engine.service.ts) | `CONDITION_NOT_MET` → 403 вместо 409; поле `minCount` вместо `min` |
| [release-workflows-admin.router.ts](../../backend/src/modules/releases/release-workflows-admin.router.ts) | `PUT` вместо `PATCH` для workflow и transitions; лишний `PATCH /steps/:id` |

Все затронутые файлы уже существуют, миграций БД **не требуется**.

---

## 3. Зависимости

### Модули backend
- [x] `releases` — основные правки (router, service, workflow-engine)

### Компоненты frontend
- [ ] Нет — все изменения только backend

### Модели данных (Prisma)
- [ ] Без изменений

### Внешние зависимости
- [ ] Нет новых

### Блокеры
- Нет

---

## 4. Риски

| # | Риск | Вероятность | Влияние | Митигация |
|---|------|-------------|---------|-----------|
| 1 | Смена метода `PUT → PATCH` в admin workflow ломает клиентов, использующих `PUT` | Низкая | Ошибки 405 в старых клиентах | Добавить `PUT` как алиас на 301 / оставить оба метода |
| 2 | Изменение поля `minCount → min` в conditions ломает существующие seed-данные в БД | Средняя | Переходы с этим условием перестанут работать | Проверить seed и данные в БД перед деплоем; при необходимости SQL-патч |
| 3 | Добавление `RELEASE_MANAGER` в requireRole открывает доступ ранее закрытым пользователям | Низкая | Непреднамеренное расширение прав | Добавить E2E-тест матрицы доступа |

---

## 5. Подробное описание правок

### 5.1. RBAC — роль `RELEASE_MANAGER` (CRITICAL)

**Файл:** `backend/src/modules/releases/releases.router.ts`

Заменить `requireRole('ADMIN', 'MANAGER')` на правильные по спеке:

| Эндпоинт | Текущий requireRole | Целевой requireRole |
|----------|--------------------|--------------------|
| `POST /releases` | `ADMIN, MANAGER` | `ADMIN, MANAGER, RELEASE_MANAGER` |
| `POST /projects/:id/releases` | `ADMIN, MANAGER` | `ADMIN, MANAGER, RELEASE_MANAGER` |
| `PATCH /releases/:id` | `ADMIN, MANAGER` | `ADMIN, MANAGER, RELEASE_MANAGER` |
| `DELETE /releases/:id` | `ADMIN, MANAGER` | `ADMIN, RELEASE_MANAGER` (убрать MANAGER) |
| `POST /releases/:id/items` | `ADMIN, MANAGER` | `ADMIN, MANAGER, RELEASE_MANAGER` |
| `POST /releases/:id/items/remove` | `ADMIN, MANAGER` | `ADMIN, MANAGER, RELEASE_MANAGER` |
| `POST /releases/:id/clone` | `ADMIN, MANAGER` | `ADMIN, MANAGER, RELEASE_MANAGER` |
| `POST /releases/:id/transitions/:id` | `ADMIN, MANAGER, USER` | `ADMIN, MANAGER, RELEASE_MANAGER` |
| `POST /releases/:id/sprints` | `ADMIN, MANAGER` | `ADMIN, MANAGER, RELEASE_MANAGER` |
| `POST /releases/:id/sprints/remove` | `ADMIN, MANAGER` | `ADMIN, MANAGER, RELEASE_MANAGER` |
| `GET /releases/:id/transitions` | `ADMIN, MANAGER, USER` | `authenticate` (все авторизованные, без requireRole) |

### 5.2. `removeReleaseItems` — защита DONE/CANCELLED (CRITICAL)

**Файл:** `backend/src/modules/releases/releases.service.ts`, функция `removeReleaseItems` (~строка 340)

Добавить проверку после получения релиза:
```typescript
if (release.status?.category === 'DONE' || release.status?.category === 'CANCELLED') {
  throw new AppError(422, 'Cannot remove items from a release in DONE/CANCELLED status');
}
```
Нужно изменить `findUnique` — добавить `include: { status: true }`.

### 5.3. `CONDITION_NOT_MET` — 403 → 409 (CRITICAL)

**Файл:** `backend/src/modules/releases/release-workflow-engine.service.ts`, функция `executeTransition` (~строка 260)

```typescript
// БЫЛО:
throw new AppError(403, 'CONDITION_NOT_MET', { details: { conditionType: failedCondition ?? 'UNKNOWN' } });

// СТАЛО:
throw new AppError(409, 'CONDITION_NOT_MET', { details: { conditionType: failedCondition ?? 'UNKNOWN' } });
```

### 5.4. `MIN_ITEMS_COUNT.minCount → min` (CRITICAL)

**Файл:** `backend/src/modules/releases/release-workflow-engine.service.ts`

Тип `ReleaseConditionRule` (~строка 40):
```typescript
// БЫЛО:
| { type: 'MIN_ITEMS_COUNT'; minCount: number };

// СТАЛО:
| { type: 'MIN_ITEMS_COUNT'; min: number };
```

Использование в `evaluateReleaseCondition` (~строка 76):
```typescript
// БЫЛО:
return total >= rule.minCount;

// СТАЛО:
return total >= rule.min;
```

### 5.5. Response format — `meta` wrapper + `totalPages` (IMPORTANT)

**Файл:** `backend/src/modules/releases/releases.service.ts`

В `listReleasesGlobal` (~строка 98):
```typescript
// БЫЛО:
const result = { data: enriched, total, page, limit };

// СТАЛО:
const result = {
  data: enriched,
  meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
};
```

В `listReleaseItems` (~строка 390):
```typescript
// БЫЛО:
return { data: items, total, page, limit };

// СТАЛО:
return {
  data: items,
  meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
};
```

### 5.6. `readiness` — добавить `availableTransitions` + исправить `byProject` (IMPORTANT)

**Файл:** `backend/src/modules/releases/releases.service.ts`, функция `getReleaseReadiness`

1. **`byProject` shape** — изменить `return` маппинга (~строка 461):
```typescript
// БЫЛО:
byProject = projectBreakdown.map((row) => ({
  projectId: row.project_id,
  key: row.project_key,
  name: row.project_name,
  total: Number(row.total),
  done: Number(row.done),
}));

// СТАЛО:
byProject = projectBreakdown.map((row) => ({
  project: { id: row.project_id, key: row.project_key, name: row.project_name },
  total: Number(row.total),
  done: Number(row.done),
  inProgress: Number(row.in_progress ?? 0),
}));
```

SQL-запрос расширить — добавить поле `in_progress`:
```sql
COUNT(CASE WHEN ws.category = 'IN_PROGRESS' THEN 1 END) as in_progress
```

2. **`availableTransitions`** — вычислить через `releaseWorkflowEngine.getAvailableTransitions` и добавить в итоговый объект:
```typescript
// Нужно передать userId и role в getReleaseReadiness или вызывать отдельно в роутере
```
> **Примечание:** `getReleaseReadiness` вызывается без auth-контекста. Рекомендуемый подход: добавить опциональные параметры `actorId` и `actorRole` в сигнатуру функции, чтобы вычислять `availableTransitions` только при их наличии.

Роутер обновить:
```typescript
router.get('/releases/:id/readiness', async (req: AuthRequest, res, next) => {
  try {
    const readiness = await releasesService.getReleaseReadiness(
      req.params.id as string,
      req.user?.userId,
      req.user?.role,
    );
    res.json(readiness);
  } catch (err) {
    next(err);
  }
});
```

### 5.7. `search` — добавить поиск по `description` (IMPORTANT)

**Файл:** `backend/src/modules/releases/releases.service.ts` (~строка 37):
```typescript
// БЫЛО:
if (search) {
  where.name = { contains: search, mode: 'insensitive' };
}

// СТАЛО:
if (search) {
  where.OR = [
    { name: { contains: search, mode: 'insensitive' } },
    { description: { contains: search, mode: 'insensitive' } },
  ];
}
```

### 5.8. `statusId` — поддержка фильтра по нескольким значениям (IMPORTANT)

**Файл:** `backend/src/modules/releases/releases.service.ts` (~строка 34)

В DTO (`releases.dto.ts`) изменить тип `statusId` — принимать строку с разделителями:
```typescript
// В listReleasesQueryDto:
statusId: z.string().optional(), // "uuid1,uuid2"
```

В сервисе:
```typescript
if (statusId) {
  const ids = statusId.split(',').map(s => s.trim()).filter(Boolean);
  where.statusId = ids.length === 1 ? ids[0] : { in: ids };
}
```

### 5.9. `PUT → PATCH` в admin workflow роутере (IMPORTANT)

**Файл:** `backend/src/modules/releases/release-workflows-admin.router.ts`

- Строка 54: `router.put('/:id', ...)` → `router.patch('/:id', ...)`
- Строка 140: `router.put('/:id/transitions/:tid', ...)` → `router.patch('/:id/transitions/:tid', ...)`

Для обратной совместимости добавить алиасы `router.put(...)` с тем же обработчиком.

### 5.10. Audit action name (MINOR)

**Файл:** `backend/src/modules/releases/release-workflow-engine.service.ts` (~строка 291)

```typescript
// БЫЛО:
action: 'release.transitioned',

// СТАЛО:
action: 'release.transition',
```

---

## 6. Требования к реализации

### Функциональные
- [ ] FR-1: Роль `RELEASE_MANAGER` имеет доступ ко всем мутациям релизов кроме управления workflow/статусами
- [ ] FR-2: Роль `MANAGER` не может удалять релизы
- [ ] FR-3: Нельзя убирать задачи из релиза в статусе DONE/CANCELLED
- [ ] FR-4: `CONDITION_NOT_MET` возвращает HTTP 409
- [ ] FR-5: `listReleasesGlobal` и `listReleaseItems` возвращают `meta.totalPages`
- [ ] FR-6: `readiness` содержит `availableTransitions`, корректный `byProject` с `inProgress`
- [ ] FR-7: Поиск по name и description одновременно
- [ ] FR-8: `statusId` фильтр поддерживает несколько UUID через запятую
- [ ] FR-9: Admin workflow эндпоинты используют метод PATCH

### Нефункциональные
- [ ] API response < 200ms (p95) — правки не должны ухудшать
- [ ] Обратная совместимость: `PUT` на admin workflow работает как алиас

### Безопасность
- [ ] SEC-1: MANAGER не может удалять релизы (закрыть escalation privilege)
- [ ] SEC-2: RELEASE_MANAGER не имеет доступа к `/api/admin/release-statuses` и `/api/admin/release-workflows`

### Тестирование
- [ ] Unit-тест матрицы доступа: роль × эндпоинт (RELEASE_MANAGER, MANAGER, USER, VIEWER)
- [ ] Integration-тест `removeReleaseItems` для релиза в статусе DONE → 422
- [ ] Integration-тест `executeTransition` с невыполненным condition → 409
- [ ] Integration-тест `readiness` — проверить shape `byProject` и наличие `availableTransitions`
- [ ] Integration-тест поиска по description

---

## 7. Критерии приёмки (Definition of Done)

- [ ] AC-1: `POST /api/releases` с ролью `RELEASE_MANAGER` → 201 (не 403)
- [ ] AC-2: `DELETE /api/releases/:id` с ролью `MANAGER` → 403
- [ ] AC-3: `POST /api/releases/:id/items/remove` на DONE-релизе → 422
- [ ] AC-4: `POST /api/releases/:id/transitions/:tid` с нарушенным condition → 409 (не 403)
- [ ] AC-5: `GET /api/releases` → ответ содержит `meta.totalPages`
- [ ] AC-6: `GET /api/releases?search=test` находит записи по description
- [ ] AC-7: `GET /api/releases/:id/readiness` → содержит `availableTransitions` и `byProject[].inProgress`
- [ ] AC-8: `PATCH /api/admin/release-workflows/:id` → 200 (не 404/405)
- [ ] AC-9: `GET /api/releases/:id/transitions` доступен для роли VIEWER
- [ ] AC-10: Все существующие тесты (`make test`) остаются зелёными

---

## 8. Оценка трудоёмкости

| Этап | Часы |
|------|------|
| Анализ и план | 0.5 |
| Backend (RBAC, сервисы) | 3.0 |
| Backend (readiness, search, format) | 2.0 |
| Тесты | 2.0 |
| Code review + fixes | 1.0 |
| **Итого** | **8.5** |

---

## 9. Связанные задачи

- Спека: `docs/specs/RELEASE_MANAGEMENT_SPEC.md`
- Исходный PR с реализацией: #30 (`feat(releases): release management data model`)

---

## 10. Порядок реализации (рекомендуемый)

1. **Сначала RBAC** — правки в роутере (строки 38-169), без логики — низкий риск
2. **`removeReleaseItems` защита** — добавить include + guard
3. **HTTP коды и поля условий** — `403→409`, `minCount→min`
4. **Response format** — `meta` wrapper в двух функциях
5. **`readiness` доработка** — byProject shape, inProgress, availableTransitions
6. **`search` и `statusId`** — расширение фильтрации
7. **`PATCH` вместо `PUT`** — admin роутер
8. **Тесты** — покрыть все AC
