# Флоу работы агента: TTMP-81, 82, 83, 84

Задачи Sprint 4 (AI-модуль: оценка и декомпозиция). Иерархия: **81** (EPIC) → **82** (STORY) → **83** (TASK), **84** (TASK).

---

## Общий порядок

1. **Взять задачу**: `get_issue_by_key({ key })` → при необходимости `update_issue_ai_status({ key, aiExecutionStatus: 'IN_PROGRESS' })`.
2. **Делать** по шагам ниже для конкретного ключа.
3. **Завершить**: либо вызвать API задачи (estimate/decompose), либо вручную `update_issue_ai_status({ key, aiExecutionStatus: 'DONE' })`.

Все вызовы по ключу: `GET /api/issues/key/:key`, `PATCH /api/issues/:id/ai-status`, `POST /api/ai/estimate`, `POST /api/ai/decompose` принимают или возвращают данные по задаче.

---

## TTMP-81 — EPIC: Sprint 4 — AI + Интеграции + Polish

**Тип:** контейнер (EPIC). Агент не реализует EPIC «кодом», а координирует входящие в него задачи.

### Флоу для агента

1. **Взять задачу** (по запросу пользователя «возьми TTMP-81»):
   - `get_issue_by_key({ key: 'TTMP-81' })`.
   - Если `aiEligible !== true` — предложить пользователю пометить задачу как Agent или оставить человеку.
   - Иначе: `update_issue_ai_status({ key: 'TTMP-81', aiExecutionStatus: 'IN_PROGRESS' })`.

2. **Действия**:
   - Показать пользователю состав EPIC: дочерние STORY/TASK (82, 83, 84 и др.).
   - Предложить взять следующую задачу по приоритету (например TTMP-82 или TTMP-83, TTMP-84).
   - Не писать код «за EPIC» — код пишется в дочерних задачах.

3. **Завершение**:
   - Когда все нужные дочерние задачи закрыты или пользователь просит закрыть EPIC:  
     `update_issue_ai_status({ key: 'TTMP-81', aiExecutionStatus: 'DONE' })`.

---

## TTMP-82 — STORY: AI-модуль: оценка и декомпозиция задач

**Тип:** контейнер (STORY). Включает две технические задачи: 83 (estimate), 84 (decompose).

### Флоу для агента

1. **Взять задачу**:
   - `get_issue_by_key({ key: 'TTMP-82' })`.
   - При согласии пользователя: `update_issue_ai_status({ key: 'TTMP-82', aiExecutionStatus: 'IN_PROGRESS' })`.

2. **Действия**:
   - Убедиться, что реализованы обе дочерние задачи:
     - **TTMP-83**: POST /ai/estimate (оценка трудоёмкости).
     - **TTMP-84**: POST /ai/decompose (декомпозиция в подзадачи).
   - Если 83 или 84 ещё не сделаны — взять их по очереди (см. ниже).
   - Проверить полный флоу: UI на странице задачи, вызов по `issueId`/`issueKey`, автообновление `aiExecutionStatus`.

3. **Завершение**:
   - После выполнения 83 и 84 и проверки:  
     `update_issue_ai_status({ key: 'TTMP-82', aiExecutionStatus: 'DONE' })`.

---

## TTMP-83 — TASK: Реализовать AI-оценку трудоёмкости (POST /ai/estimate)

**Уже реализовано.** Флоу для агента — проверка и доработки при необходимости.

### Флоу для агента

1. **Взять задачу**:
   - `get_issue_by_key({ key: 'TTMP-83' })`.
   - `update_issue_ai_status({ key: 'TTMP-83', aiExecutionStatus: 'IN_PROGRESS' })`.

2. **Проверить реализацию**:
   - Backend: `POST /api/ai/estimate` с телом `{ issueId }` или `{ issueKey: 'TTMP-83' }`.
   - Ответ: `{ issueId, estimatedHours }`; в БД у задачи обновляются `estimated_hours` и `ai_execution_status` (IN_PROGRESS → DONE/FAILED).
   - Frontend: на странице задачи (Issue Detail) в блоке «AI Execution» есть кнопка «Оценить трудоёмкость»; в блоке «Details» выводится «Estimated X.X h».

3. **При необходимости**:
   - Доработать тесты, обработку ошибок или описание в документации.

4. **Завершение**:
   - Либо вызвать `POST /api/ai/estimate` с `issueKey: 'TTMP-83'` (бэкенд сам выставит DONE), либо вручную:  
     `update_issue_ai_status({ key: 'TTMP-83', aiExecutionStatus: 'DONE' })`.

---

## TTMP-84 — TASK: Реализовать AI-декомпозицию (POST /ai/decompose)

**Уже реализовано.** Флоу для агента — проверка и доработки при необходимости.

### Флоу для агента

1. **Взять задачу**:
   - `get_issue_by_key({ key: 'TTMP-84' })`.
   - `update_issue_ai_status({ key: 'TTMP-84', aiExecutionStatus: 'IN_PROGRESS' })`.

2. **Проверить реализацию**:
   - Backend: `POST /api/ai/decompose` с телом `{ issueId }` или `{ issueKey: 'TTMP-84' }`.
   - Ответ: `{ issueId, createdCount, children }`; создаются дочерние SUBTASK; `ai_execution_status` обновляется автоматически.
   - Frontend: кнопка «Декомпозировать в подзадачи» в блоке «AI Execution»; после вызова в блоке «Sub-issues» появляются новые задачи.

3. **При необходимости**:
   - Доработать парсинг пунктов из описания, тесты или документацию.

4. **Завершение**:
   - Либо вызвать `POST /api/ai/decompose` с `issueKey: 'TTMP-84'` (бэкенд выставит DONE), либо вручную:  
     `update_issue_ai_status({ key: 'TTMP-84', aiExecutionStatus: 'DONE' })`.

---

## Сводка API по ключу

| Действие              | Метод/эндпоинт              | Тело (пример)                    |
|-----------------------|-----------------------------|----------------------------------|
| Получить задачу       | GET /api/issues/key/TTMP-83 | —                                |
| Статус агента         | PATCH /api/issues/:id/ai-status | `{ "aiExecutionStatus": "DONE" }` |
| Оценка трудоёмкости   | POST /api/ai/estimate       | `{ "issueKey": "TTMP-83" }`      |
| Декомпозиция          | POST /api/ai/decompose      | `{ "issueKey": "TTMP-84" }`      |

При вызове estimate/decompose с `issueKey` бэкенд сам выставляет задаче `aiExecutionStatus`: IN_PROGRESS в начале, DONE при успехе, FAILED при ошибке.

---

## Ссылки

- Skill агента: `.cursor/skills/tasktime-issues-gateway/SKILL.md`
- Backend: `backend/src/modules/ai/` (ai.router.ts, ai.service.ts)
- Frontend: страница задачи — кнопки «Оценить трудоёмкость», «Декомпозировать в подзадачи»

---

## Статус проверки (2026-03-16)

Проверка по запросу «возьми TTMP-84, 83, 82, 81 в работу»:

| Задача | Роль | Результат проверки |
|--------|------|---------------------|
| **TTMP-81** | EPIC | Состав: 82 (STORY) → 83, 84 (TASK). Код за EPIC не пишется, координация дочерних. |
| **TTMP-82** | STORY | Обе дочерние задачи реализованы: 83 (estimate), 84 (decompose). |
| **TTMP-83** | TASK | Backend: `POST /api/ai/estimate` с `issueId`/`issueKey`, DTO и `getIssueByKey` в порядке. Frontend: кнопка «Оценить трудоёмкость», блок Details с «Estimated X.X h». Готово к DONE. |
| **TTMP-84** | TASK | Backend: `POST /api/ai/decompose` с `issueId`/`issueKey`, создание SUBTASK из пунктов описания. Frontend: кнопка «Декомпозировать в подзадачи», блок Sub-issues. Готово к DONE. |

**Примечание:** MCP `user-user-tasktime-issues` при проверке вернул ошибку (бэкенд Flow Universe мог быть недоступен). Статусы `aiExecutionStatus` (IN_PROGRESS/DONE) при необходимости обнови вручную в UI или повтори вызов MCP при запущенном бэкенде.
