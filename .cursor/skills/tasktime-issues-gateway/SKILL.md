name: tasktime-issues-gateway
description: MCP/skill facade for TaskTime issue control (TTMP/LIVE), used by agents in Cursor to fetch and update tasks by key.

---

# TaskTime Issues Gateway (TTMP/LIVE)

## Назначение

Дать агенту в Cursor **единый флоу «TaskTime → план → код → тесты → коммит → TaskTime»** для задач по ключу (`TTMP-83`, `LIVE-3`), с учётом:

- статусов агента (`aiExecutionStatus`);
- флага **Agent can do this** (`aiEligible`, `aiAssigneeType`);
- комментариев и описаний в самой задаче;
- **учёта времени и стоимости ИИ** через модуль `ai-sessions` (`/api/ai-sessions` + time logs).

**Источник истины всегда REST‑API TaskTime.** MCP‑сервер `user-user-tasktime-issues` (если доступен) — **тонкая опциональная обёртка** над теми же REST‑эндпоинтами.

---

## Базовые REST‑эндпоинты (основной путь)

Агент всегда должен исходить из того, что доступны обычные HTTP‑эндпоинты TaskTime:

- **Задачи**
  - `GET /api/issues/key/:key` — получить задачу по ключу (`TTMP-83`).
  - `PATCH /api/issues/:id/ai-flags` — обновить `aiEligible`, `aiAssigneeType`.
  - `PATCH /api/issues/:id/ai-status` — обновить `aiExecutionStatus` (`NOT_STARTED` | `IN_PROGRESS` | `DONE` | `FAILED`).
  - `PATCH /api/issues/:id` — обновить `title`, `description`, `priority`, `assigneeId`, `parentId`.
  - `POST /api/issues/:issueId/comments` — добавить комментарий (`{ body: string }`).

- **AI‑эндпоинты для задач (Sprint 4)**
  - `POST /api/ai/estimate` — `{ issueId?: string; issueKey?: string }` → `{ issueId, estimatedHours }` + выставление `aiExecutionStatus`.
  - `POST /api/ai/decompose` — `{ issueId?: string; issueKey?: string }` → `{ issueId, createdCount, children[] }` + выставление `aiExecutionStatus`.

- **Учёт времени и cost для ИИ**
  - `POST /api/ai-sessions` — создать `AiSession` с полями:
    - `issueSplits[{ issueId, ratio }]` — как распределить время/стоимость по задачам;
    - `costMoney` — общая стоимость сессии;
    - `model`, `provider`, `tokensInput`, `tokensOutput`, `startedAt`, `finishedAt`, `notes`.
  - При создании сессии backend **автоматически создаёт time logs** с:
    - `source = 'AGENT'`;
    - `hours`, `costMoney`, `agentSessionId`, `logDate`, `startedAt`, `stoppedAt`.

**Авторизация:** через `Authorization: Bearer <accessToken>` (как в `frontend/src/api/client.ts`).

---

## MCP‑инструменты (опциональный фасад)

Если в окружении есть MCP‑сервер `user-user-tasktime-issues`, можно использовать его как удобную обёртку:

1. `list_mvp_livecode_active_issues` — список активных `LIVE-*` задач (по сути `GET /mvp-livecode/issues/active`).
2. `get_issue_by_key` — обёртка над `GET /api/issues/key/:key`.
3. `update_issue_ai_flags` — обёртка над `PATCH /api/issues/:id/ai-flags`.
4. `update_issue_ai_status` — обёртка над `PATCH /api/issues/:id/ai-status`.

**Правило:** MCP использовать **только как удобство**. Если MCP даёт ошибку (`-32603` и пр.), агент:

- явно пишет пользователю, что MCP недоступен;
- **переходит на REST‑флоу**, описанный выше (через скрипты, curl, Postman или инструкции пользователю).

---

## Распознавание ключа задачи

При фразах вида «возьми TTMP‑83», «сделай LIVE‑3», «возьми TTMP‑84, 83, 82, 81» агент:

1. Ищет в тексте все подстроки по regex:  
   `[A-Z]{2,10}-\d+`
   - Примеры валидных ключей: `TTMP-81`, `LIVE-3`, `BACK-12`.
2. Если найден **один** ключ → использовать его как `key`.
3. Если найдено **несколько**:
   - можно либо:
     - спросить: «С какой именно задачей работать: KEY1, KEY2, KEY3?»,
     - либо, если пользователь явно сказал «возьми 81–84» — **обработать их по очереди** в порядке приоритета (EPIC → STORY → TASK).
4. Если ключей нет — не делать REST/MCP‑вызовов; попросить указать ключ явно.

---

## Полный флоу «возьми TTMP‑XXX» (REST‑первый)

### 1. Получить задачу и выставить IN_PROGRESS

1. Разобрать ключ `key` (например, `TTMP-83`).
2. Сходить в TaskTime:

   - `GET /api/issues/key/:key` → объект задачи (включая `id`, `aiEligible`, `aiAssigneeType`, `aiExecutionStatus`, `type`, `project.key`).

3. Проверить флаг агента:

   - если `aiEligible !== true` или `aiAssigneeType === 'HUMAN'`:
     - объяснить пользователю, что задача помечена как human‑only;
     - предложить явно разрешить работу агента («Сделать TTMP‑83 агентской?»).
     - при явном согласии:
       - `PATCH /api/issues/:id/ai-flags` → `{ aiEligible: true, aiAssigneeType: 'AGENT' }`.
   - если `aiEligible === true` (или `aiAssigneeType` в пользу агента):
     - `PATCH /api/issues/:id/ai-status` → `{ aiExecutionStatus: 'IN_PROGRESS' }`.

4. Добавить служебный комментарий:

   - `POST /api/issues/:id/comments` → `{ body: 'Взято в работу агентом (Cursor), старт плана и реализации.' }`.

### 2. План (docs/plans) по `tasktime-workflow`

1. Создать/обновить файл плана:

   - `docs/plans/YYYY-MM-DD-<KEY>-plan.md`, например `docs/plans/2026-03-16-TTMP-83-plan.md`.

2. Структура плана (как в `writing-plans`):

   - заголовок `# [KEY] Implementation Plan`;
   - блоки **Goal / Architecture / Tech Stack**;
   - декомпозиция на Task 1..N c шагами:
     - тест → запуск теста (ожидаемый FAIL) → минимальная реализация → запуск теста (PASS) → коммит;
   - блок **UAT / Приёмочные тесты** c чек‑листом ручной проверки.

3. Для специальных задач TTMP-81..84 использовать готовый флоу:

   - `docs/AGENT_FLOW_TTMP_81_84.md` + общий план `docs/plans/2026-03-16-TTMP-81-84-ai-module.md`.

### 3. Реализация (код, тесты) + учёт времени и cost

1. Выполнять реализацию в ветке по правилам репо (`claude/...` или `cursor/...`), следуя `tasktime-workflow`:

   - Backend → Frontend → тесты (Vitest/Supertest) → UAT.

2. **Учёт времени и стоимости ИИ**:

   - После существенной части работы (например, завершение плана по KEY) агент должен создать AI‑сессию:

     - `POST /api/ai-sessions` с телом:
       - `issueSplits: [{ issueId: <id задачи>, ratio: 1 }]` (или несколько задач, если работа делилась);
       - `model`, `provider` — в зависимости от фактической модели (Sonnet/Opus/…);
       - `startedAt`, `finishedAt` — ISO‑время начала и конца работы;
       - `tokensInput`, `tokensOutput` — примерная оценка (или точные данные, если есть);
       - `costMoney` — стоимость в рублях/долларах (как договорено в проекте);
       - `notes` — краткий комментарий «Работа по TTMP-83: реализация /ai/estimate».

   - Backend создаст связанные `timeLog` записи с:
     - `source = 'AGENT'`;
     - `hours` (по длительности сессии);
     - `costMoney` (распределённый по ratio);
     - `agentSessionId = id сессии`.

3. В TaskTime UI эти логи будут видны в блоке **Time Tracking** как `AI` с моделью и `costMoney`.

### 4. Коммит и (опционально) PR

1. После успешного прохождения тестов и UAT:

   - создать коммит в локальной ветке:
     - сообщение в формате репо: `feat: ...` / `fix: ...` и т.п.;
   - **push делать только если это явно разрешено правилами (см. `CLAUDE.md`) и пользователем.**

2. В комментарии к задаче в TaskTime указать:

   - ключ ветки (`claude/...`),
   - при наличии — ссылку на PR (если он создан),
   - путь к плану (`docs/plans/...`).

### 5. Завершение задачи и возврат на бой

1. Обновить статус агента:

   - `PATCH /api/issues/:id/ai-status` → `{ aiExecutionStatus: 'DONE' }`
     - либо через MCP `update_issue_ai_status`, если он работает.

2. Добавить финальный комментарий:

   - `POST /api/issues/:id/comments`:
     - краткое резюме: что реализовано, где лежит план, какая ветка/PR;
     - ссылка на UAT‑чеклист и результат (пройден/не пройден).

3. При необходимости обновить `description`:

   - например, дописать раздел «API» (endpoint, пример запроса/ответа) или ссылки на документацию:
     - `PATCH /api/issues/:id` → `{ description: '...обновлённое описание...' }`.

4. Для контейнеров (EPIC/STORY) типа TTMP-81/82:

   - убедиться, что дочерние задачи (83, 84 и т.п.) в нужном состоянии (`DONE`);
   - только после этого ставить им `aiExecutionStatus: 'DONE'` и добавлять комментарий, что дочерние задачи реализованы.

---

## Специальный флоу TTMP‑81..84 (Sprint 4 — AI)

Для ключей **TTMP-81**, **TTMP-82**, **TTMP-83**, **TTMP-84** действует дополнительный флоу:

- **Документы:**
  - `docs/AGENT_FLOW_TTMP_81_84.md` — доменный флоу;
  - `docs/plans/2026-03-16-TTMP-81-84-ai-module.md` — детальный план + sync «бой ↔ dev».

- **Роли:**
  - **TTMP-81** (EPIC) — контейнер; координация дочерних задач, без прямого кода.
  - **TTMP-82** (STORY) — контейнер; убедиться, что TTMP-83 и TTMP-84 реализованы и закрыты.
  - **TTMP-83** (TASK) — `POST /api/ai/estimate`; проверка и, при необходимости, доработки backend/frontend.
  - **TTMP-84** (TASK) — `POST /api/ai/decompose`; проверка и, при необходимости, доработки backend/frontend.

- **Sync с боем:**
  - использовать `backend/scripts/sync-issue-with-battle.mjs` (любые ключи):
    - `pull TTMP-81 TTMP-82 TTMP-83 TTMP-84 --set-in-progress` — забрать задачи с боя, сохранить snapshot и выставить `IN_PROGRESS`;
    - `push TTMP-81 ... --comments <file>` — выставить `DONE` и добавить комментарии из файла.

При работе с этими задачами сначала следовать `AGENT_FLOW_TTMP_81_84.md` и плану, затем общему REST‑флоу выше.

---

## Приоритет доверия

- **Источник истины по задачам** — всегда backend TaskTime (`TTMP` и `LIVE`).
- Если MCP‑вызов вернул ошибку:
  - не подменять данные догадками;
  - кратко объяснить пользователю суть ошибки (например, нет доступа, задача не найдена, сервер недоступен).

---

## Что делать, если MCP‑сервер отсутствует

Если в окружении Cursor нет MCP‑сервера `tasktime-issues`:

- Агент должен:
  - явно сказать, что автоматический доступ к TaskTime недоступен;
  - попросить пользователя:
    - либо прислать текст тикета и ключ вручную;
    - либо выполнить нужный HTTP‑запрос в Postman/браузере и вставить результат.

Даже в этом случае агент обязан следовать тем же правилам по статусовке `aiExecutionStatus` и уважать флаг `aiEligible/aiAssigneeType` из тикета.

