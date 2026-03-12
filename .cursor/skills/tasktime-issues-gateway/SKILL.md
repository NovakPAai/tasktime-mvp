name: tasktime-issues-gateway
description: MCP/skill facade for TaskTime issue control (TTMP/LIVE), used by agents in Cursor to fetch and update tasks by key.

---

# TaskTime Issues Gateway (TTMP/LIVE)

## Назначение

Дать агенту в Cursor тонкий, единообразный интерфейс к backend TaskTime для:

- получения задач мета‑проекта **TaskTime MVP LiveCode** (`LIVE`) и продуктового проекта **TaskTime MVP (vibe-code)** (`TTMP`);
- включения/выключения флага **"Agent can do this"**;
- обновления статуса выполнения задачи агентом (`aiExecutionStatus`);
- работы по ключу тикета (`TTMP-81`, `LIVE-3`) без ручного копирования текста.

Этот skill описывает, **как агент должен использовать MCP‑tools/HTTP**, когда они доступны в окружении.

---

## Доступные операции (идеальный MCP‑набор)

Предполагаем, что в окружении агента есть MCP‑сервер `tasktime-issues`, предоставляющий 4 инструмента:

1. `tasktime-issues.list_mvp_livecode_active_issues`
2. `tasktime-issues.get_issue_by_key`
3. `tasktime-issues.update_issue_ai_flags`
4. `tasktime-issues.update_issue_ai_status`

Если MCP недоступен, агент следует тем же контрактам, но может просить пользователя выполнить запрос в HTTP/браузере вручную.

### 1. list_mvp_livecode_active_issues

- **Назначение**: получить все активные задачи мета‑проекта `TaskTime MVP LiveCode` (ключ `LIVE`).
- **HTTP под капотом**: `GET /mvp-livecode/issues/active`
- **Параметры**:
  - `onlyAiEligible?: boolean` — если `true`, вернуть только задачи, помеченные как агентские (`aiEligible = true`);
  - `assigneeType?: 'HUMAN' | 'AGENT' | 'MIXED' | 'ALL'` — фильтр по типу исполнителя.
- **Ответ (минимальный DTO)**:
  - `key: string` — например, `"LIVE-3"`;
  - `title: string`;
  - `status: 'OPEN' | 'IN_PROGRESS' | 'REVIEW' | 'DONE' | 'CANCELLED'`;
  - `priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'`;
  - `aiEligible: boolean`;
  - `aiExecutionStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE' | 'FAILED'`;
  - `aiAssigneeType: 'HUMAN' | 'AGENT' | 'MIXED'`;
  - `assigneeName?: string | null`;
  - `createdAt: string`.

### 2. get_issue_by_key

- **Назначение**: получить задачу по ключу вида `TTMP-81` или `LIVE-3`.
- **HTTP‑логика** (внутри MCP):
  1. Разобрать ключ на `projectKey` и `number`.
  2. Найти проект по `key` (например, `TTMP` или `LIVE`).
  3. Найти issue по `projectId` + `number` (используя существующий API списка задач; при необходимости — доработать backend филь ке по `number`).
- **Параметры**:
  - `key: string` — ключ вида `PROJECTKEY-NUMBER`.
- **Ответ**:
  - `key`, `projectKey`, `number`;
  - `title`, `description`;
  - `status`, `priority`, `type`;
  - `aiEligible`, `aiExecutionStatus`, `aiAssigneeType`;
  - `assigneeName`, `creatorName`.

### 3. update_issue_ai_flags

- **Назначение**: включить/выключить флаг "Agent can do this" и задать тип исполнителя для задачи.
- **HTTP‑логика**:
  1. `get_issue_by_key(key)` → `issue.id`;
  2. `PATCH /issues/{id}/ai-flags` с телом `{"aiEligible": ..., "aiAssigneeType": ...}`.
- **Параметры**:
  - `key: string`;
  - `aiEligible?: boolean`;
  - `aiAssigneeType?: 'HUMAN' | 'AGENT' | 'MIXED'`.
- **Ответ**:
  - `key`, `aiEligible`, `aiAssigneeType`, `aiExecutionStatus`.

### 4. update_issue_ai_status

- **Назначение**: обновить статус выполнения задачи агентом.
- **HTTP‑логика**:
  1. `get_issue_by_key(key)` → `issue.id`;
  2. `PATCH /issues/{id}/ai-status` с телом `{"aiExecutionStatus": ...}`.
- **Параметры**:
  - `key: string`;
  - `aiExecutionStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE' | 'FAILED'`.
- **Ответ**:
  - `key`, `aiExecutionStatus`.

---

## Как агент должен себя вести

### Когда пользователь говорит: «Покажи активные задачи для агента»

1. Вызвать:

   - `tasktime-issues.list_mvp_livecode_active_issues({ onlyAiEligible: true })`.

2. Показать человеку список: `KEY / Title / Status / Agent status / Priority`.
3. Не придумывать задачи сам — опираться только на то, что пришло из TaskTime.

### Когда пользователь говорит: «Возьми TTMP‑81» (или любую фразу с ключом тикета)

0. **Сначала распознать ключи задач в сообщении пользователя.**

   - Ищи в тексте все подстроки, которые подходят под шаблон регулярного выражения:  
     `[A-Z]{2,10}-\d+`  
     Примеры валидных ключей: `TTMP-81`, `LIVE-3`, `BACK-12`.
   - Если в сообщении найден **ровно один** такой ключ, считай его `key`.
   - Если найдено **несколько ключей**:
     - задай уточняющий вопрос: «С какой именно задачей работать: KEY1, KEY2, KEY3?».
     - после ответа продолжай, как будто пользователь сказал только один ключ.
   - Если ключей нет — не вызывай MCP и попроси у пользователя указать ключ явно.

1. Когда получен конкретный `key`, вызвать  
   `tasktime-issues.get_issue_by_key({ key })`.
2. Проверить:
   - если `aiEligible !== true` или `aiAssigneeType === 'HUMAN'`:
     - вежливо объяснить, что задача помечена как human‑only;
     - предложить пользователю явно разрешить агенту задачу, например:
       - «Хочешь, я сам помечу TTMP‑81 как Agent, или оставляем эту задачу человеку?».
   - если `aiEligible === true`:
     - вызвать `tasktime-issues.update_issue_ai_status({ key, aiExecutionStatus: 'IN_PROGRESS' })`;
     - начать работу, используя `title + description` как спецификацию.

3. В процессе:
   - при существенном прогрессе можно обновлять статус на `IN_PROGRESS`, а по завершении — `DONE`.

### Когда пользователь говорит: «Сделай TTMP‑81 агентской»

1. Вызвать:

   - `tasktime-issues.update_issue_ai_flags({ key: 'TTMP-81', aiEligible: true, aiAssigneeType: 'AGENT' })`.

2. Подтвердить в ответе:
   - «TTMP‑81 теперь помечена как Agent; я могу брать её в работу».

### Когда пользователь говорит: «Верни TTMP‑81 человеку»

1. Вызвать:

   - `tasktime-issues.update_issue_ai_flags({ key: 'TTMP-81', aiEligible: false, aiAssigneeType: 'HUMAN' })`.

2. Подтвердить:
   - «TTMP‑81 теперь помечена как human‑only; я больше не буду брать её без явного запроса».

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

