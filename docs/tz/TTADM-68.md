# ТЗ: TTADM-68 — [Workflow Editor] Невозможно добавить переход: conditions/validators/postFunctions null не проходит Zod валидацию

**Дата:** 2026-04-07
**Тип:** BUG | **Приоритет:** CRITICAL | **Статус:** OPEN (фактически исправлено в e8d59eb)
**Проект:** TaskTime Admin (TTADM)
**Автор ТЗ:** Claude Code (auto-generated)

> ⚠️ **Примечание:** Все фиксы уже реализованы в коммите `e8d59eb` (PR#138+#143, 26 марта 2026).
> Задача требует только закрытия на проде.

---

## 1. Постановка задачи

При создании перехода в **любом** воркфлоу возникала ошибка «Не удалось сохранить переход», если поля Условия/Валидаторы/Постфункции оставлены пустыми. Это блокировало базовый сценарий использования Workflow Editor.

### Пользовательский сценарий
**Кто:** Администратор системы  
**Что делает:** Открывает Workflow Editor → добавляет переход с пустыми полями conditions/validators/postFunctions  
**Что происходило:** Toast «Не удалось сохранить переход» — переход не создавался  
**Что ожидалось:** Переход успешно создаётся, пустые поля интерпретируются как «без правил»

### Воспроизведение (было)
1. Admin → Workflows → открыть любой воркфлоу со шагами
2. «Добавить переход» → заполнить Название, Из статуса, В статус; оставить Условия/Валидаторы/Постфункции **пустыми**
3. «Сохранить»
4. Toast: «Не удалось сохранить переход»

---

## 2. Текущее состояние (ПОСЛЕ фикса)

Все четыре исправления реализованы и смержены в `main`:

### Fix 1 — Backend Zod schema (✅ DONE)
[backend/src/modules/workflows/workflows.dto.ts](../../backend/src/modules/workflows/workflows.dto.ts) — строки 26–27:
```typescript
// Было: .optional() — не принимает null
// Стало: .nullish() — принимает и null, и undefined
const rulesField = z.array(z.record(z.unknown())).nullish();
const rulesFieldNullish = z.array(z.record(z.unknown())).nullish();
```

### Fix 2 — Frontend parseJson (✅ DONE)
[frontend/src/pages/admin/AdminWorkflowEditorPage.tsx](../../frontend/src/pages/admin/AdminWorkflowEditorPage.tsx) — строки 35–38:
```typescript
// Было: return s ? JSON.parse(s) : null;
// Стало: return s ? JSON.parse(s) : undefined;
function parseJson(s?: string): unknown[] | undefined {
  if (!s) return undefined;
  try { return JSON.parse(s) as unknown[]; } catch { return undefined; }
}
```

### Fix 3 — Error messages (✅ DONE)
Реализована функция `apiErrorMessage` с маппингом кодов API ошибок → читаемые тексты (`TRANSITION_ERRORS`, `STEP_ERRORS`).

### Fix 4 — UX fromStatusId/isGlobal (✅ DONE)
- Поле «Из статуса» скрывается при `isGlobal=true` (conditional rendering через `shouldUpdate`)
- Убрана опция `__global__` из дропдауна
- Добавлена required-валидация на поле «Из статуса» при `isGlobal=false`

---

## 3. Зависимости

### Модули backend
- [x] `workflows` — DTO `rulesField` исправлен на `.nullish()`

### Компоненты frontend
- [x] `AdminWorkflowEditorPage.tsx` — `parseJson`, `apiErrorMessage`, UX фикс isGlobal

### Модели данных (Prisma)
- Изменений нет

### Блокеры
- Нет

---

## 4. Риски

| # | Риск | Вероятность | Влияние | Митигация |
|---|------|-------------|---------|-----------|
| 1 | Регрессия при пустых массивах в БД (null vs []) | Низкая | Сервис не создаёт переход | `.nullish()` покрывает оба случая |
| 2 | Пустой массив `[]` vs `undefined` на клиенте | Низкая | Визуальное расхождение при редактировании | parseJson возвращает undefined, не [] |

---

## 5. Особенности реализации

### Backend
- `POST /api/admin/workflows/:id/transitions` — теперь принимает `conditions: null`
- `PUT /api/admin/workflows/:id/transitions/:tid` — то же

### Frontend
- Conditional rendering через Ant Design `Form.Item shouldUpdate` — корректно работает в React 18

---

## 6. Требования к реализации (выполнены)

### Функциональные
- [x] FR-1: Создание перехода с пустыми conditions/validators/postFunctions не возвращает ошибку 400
- [x] FR-2: При `isGlobal=true` поле «Из статуса» скрывается
- [x] FR-3: Сообщения об ошибках читаемы (не generic)

### Нефункциональные
- [x] API response < 200ms (p95) — изменений в логике нет, только схема валидации
- [x] Нет изменений схемы Prisma — миграция не требуется

### Безопасность
- [x] SEC-1: Пустые массива не изменяют RBAC-проверки

---

## 7. Критерии приёмки (Definition of Done)

- [x] AC-1: Переход с пустыми rules создаётся без ошибки
- [x] AC-2: При `isGlobal=true` поле «Из статуса» не отображается
- [x] AC-3: Ошибка при попытке изменить системный воркфлоу — читаемый текст
- [x] AC-4: Все тесты зелёные (`make test`)
- [x] AC-5: Code review пройден (PR#138 + PR#143)

---

## 8. Оценка трудоёмкости (фактическая)

| Этап | Часы |
|------|------|
| Анализ и план | 0.2 |
| Backend Fix 1 | 0.1 |
| Frontend Fix 2+3 | 0.3 |
| Frontend Fix 4 (UX) | 0.5 |
| Code review + fixes | 0.4 |
| **Итого** | **~1.5** |

---

## 9. Связанные задачи

- Связана с: TTADM-67 — системный воркфлоу: защита в UI (исправлено в том же PR)
- Коммит: `e8d59eb` — `feat+fix: merge PR#138 + PR#143 — workflow editor fixes + Session 3 UI rebuild`

---

## 10. Иерархия задач

```
TTADM (проект) → TTADM-68 (BUG, листовой узел, без дочерних)
```
