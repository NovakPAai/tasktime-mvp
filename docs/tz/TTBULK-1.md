# TTBULK-1 — Массовые операции с задачами из экрана поиска

> **Тип:** Feature · **Приоритет:** P1 · **Эпик:** Bulk Operations (Phase 1)
> **Источники контекста:** `frontend/src/pages/SearchPage.tsx`, `frontend/src/components/search/BulkActionsBar.tsx`, `frontend/src/components/issues/BulkStatusWizardModal.tsx`, `backend/src/modules/issues/issues.service.ts`, `backend/src/shared/middleware/rbac.ts`, `backend/src/prisma/schema.prisma`
> **Аналог:** Atlassian JIRA Cloud — «Bulk change» (4-step wizard + background task + progress drawer)

---

## 1. Цель и бизнес-контекст

### 1.1 Проблема

На экране [`/search`](../../frontend/src/pages/SearchPage.tsx) сейчас уже есть минимальный `BulkActionsBar` (PR-14 TTSRH-1), но он:

1. **Работает синхронно в браузере** — `Promise.allSettled` по N ID, каждая операция — отдельный HTTP-запрос. На 1 000+ задач вкладка «зависает», при закрытии теряется прогресс, таймаут прокси обрывает серию.
2. **Не является wizard'ом** — нельзя пред-просмотреть что именно изменится, нет разделения «eligible / ineligible / conflicts» для операций кроме Transition.
3. **Покрывает только Delete / Export / Transition** (см. [`BulkStatusWizardModal.tsx:121`](../../frontend/src/components/issues/BulkStatusWizardModal.tsx#L121)). Отсутствуют bulk Assign, Edit field, Move, Add/Remove label, Watch/Unwatch, Add comment, Change sprint/release, Edit custom fields.
4. **Не имеет отдельного прав-скоупа** — сейчас любой USER, имеющий доступ к проекту, может запускать bulk-delete/bulk-transition; blast-radius несоразмерен.
5. **Ошибки не структурированы** — `message.warning('Изменено: N, ошибок: M')` не даёт понять, какие именно задачи упали и почему; в отличие от JIRA, где финальный экран показывает таблицу ошибок по ключу задачи с человекочитаемой причиной.

### 1.2 Решение (одним абзацем)

Реализуем отдельный многошаговый wizard «Массовое изменение», запускаемый из `BulkActionsBar` на странице `/search`. Wizard собирает параметры операции, выполняет «dry-run» (pre-flight validation) и показывает пользователю **точный план** (какие задачи будут затронуты, какие пропущены и почему). При подтверждении создаётся **серверный фоновый job** в новой таблице `BulkOperation`, обработчик идёт по пачкам ~25 issue в транзакции, пишет прогресс в Redis + БД. UI подписывается через **SSE** на `/api/bulk-operations/:id/stream` и показывает `ProgressBar` с live-счётчиком «обработано / успешно / ошибок», доступ к детальному отчёту в конце. Право на запуск bulk-операций выдаётся новой системной ролью `BULK_OPERATOR`, которую можно назначить **напрямую юзеру** (`UserSystemRole`) или **группе** через новую связку `UserGroupSystemRole` (сейчас `UserGroup` хранит только project-level роли).

### 1.3 Нефункциональные требования

| NFR | Значение |
|-----|----------|
| Максимум задач в одной операции | **10 000** (hard cap, настраивается `BULK_OP_MAX_ITEMS`) |
| Размер одной внутренней пачки | 25 issue в транзакции, sequential между пачками |
| Latency UI-отклика на submit | ≤ 500 мс (создание job-а и возврат `operationId`) |
| Частота обновления прогресса в UI | каждые 500 мс или каждые 25 обработанных задач (что раньше) |
| Отмена операции | поддержана — `cancelRequested` флаг проверяется между пачками |
| Idempotency | client шлёт `Idempotency-Key` header, 24-часовое TTL в Redis |
| Аудит | каждая завершённая операция пишется в `AuditLog` action=`bulk_operation.completed` |
| Concurrency | максимум N одновременных операций на пользователя; **N настраивается через System settings в админке** (default 3) |
| Retention | в `BulkOperation` хранится только *факт запуска* (метаданные + счётчики); в `BulkOperationItem` — **только failed / skipped** записи (для retry и отчёта), successful items не персистятся — каждое изменение самой задачи пишется в обычный `IssueHistory` как действие от имени инициатора (см. §5.4) |

---

## 2. Скоуп

### 2.1 В скоупе

- Wizard на `/search` с 4 шагами (Choose operation → Configure → Preview → Confirm & run).
- Фоновый процессор на базе `node-cron` + Redis-lock (в стиле `checkpoint-scheduler.service.ts`), **без** добавления BullMQ — минимизируем зависимости.
- SSE-стрим прогресса + REST fallback (polling раз в 2 сек).
- Операции фазы 1:
  - **Transition** (изменить статус; агрегировать достижимые цели как в существующем `BulkStatusWizardModal`)
  - **Assign** (переназначить исполнителя; допускает `null` = unassigned)
  - **Edit field** (одно из: priority, due date, labels add/remove, description append)
  - **Edit custom field** (любое CF, одному значению)
  - **Move to sprint** (добавить/убрать в sprint текущего проекта задачи; cross-project не поддерживается в фазе 1)
  - **Add comment** (один комментарий ко всем задачам)
  - **Delete** (с confirm-гейтом — ввести слово DELETE)
- Новая системная роль `BULK_OPERATOR` + UI для её назначения юзеру / группе в админке.
- Новая таблица `UserGroupSystemRole` для связывания группы ↔ системная роль (сейчас группа умеет только project-роли).
- Модель `BulkOperation` + `BulkOperationItem` в Prisma.
- Отмена операции, возобновление после рестарта сервера (`status=RUNNING` + `heartbeatAt` стал stale → перезапуск от следующего необработанного item).
- UI страница `Operations` (`/operations`) со списком «мои массовые операции» и детальным отчётом по каждой.
- **Retry failed** — в Phase 1: кнопка «Повторить ошибки» на `/operations` и в финальном отчёте drawer'а, создаёт новую операцию с тем же payload и scope = failed-items предыдущей.
- Настройка `BULK_OP_MAX_CONCURRENT_PER_USER` через UI в System settings (админка).

### 2.2 Вне скоупа (Фаза 2)

- **Email-уведомление о завершении операции.** В Phase 1 поле `notifyByEmail` **не** реализуется — ни в UI, ни в API, ни в схеме БД. Добавляется в Phase 2.
- Cross-project Move. Сейчас `moveIssue` требует много проверок (type scheme remap, sprint remap); bulk-move отдельно в фазу 2.
- Undo операции. JIRA сохраняет rollback-план; у нас — через history log (просмотр, не откат).
- Запланированные операции (cron-based). Только on-demand.
- Публичный REST-API для внешних интеграций (за ним — TTMCP отдельно, Phase 3).
- Интеграция с MCP tools. Тоже Phase 3.

### 2.3 Не-цели

- Не переписываем существующий `BulkStatusWizardModal` — он остаётся как lightweight путь для ≤25 задач (например, из Sprint-борда). Wizard TTBULK-1 — отдельный компонент, работающий поверх async-job'а, в фазе 1 запускается **только** с `/search`.
- Не меняем семантику `bulkUpdateIssues` / `bulkTransitionIssues` (они остаются синхронными для legacy-вызовов).

---

## 3. UX

### 3.1 Точка входа

В [`BulkActionsBar.tsx`](../../frontend/src/components/search/BulkActionsBar.tsx) добавляется кнопка **«Массовые операции»** (primary), заменяющая текущие Delete / Export-only действия. Кнопка видна только пользователям с ролью `BULK_OPERATOR` (или `ADMIN` / `SUPER_ADMIN` через SUPER_ADMIN-override в [`hasSystemRole`](../../backend/src/shared/auth/roles.ts#L3)). Если роли нет — кнопка скрыта, а кнопки «Удалить» / «Экспорт» остаются как есть (export не требует роли).

Дополнительно — та же кнопка доступна **при 0 выбранных**, если JQL-запрос что-то нашёл: в этом случае wizard на шаге 1 предложит опцию *«применить ко всем N задачам по текущему запросу»* (как в JIRA `bulkedit?jql=…`). Это принципиально: для выборок >PAGE_SIZE (50) пользователь физически не может кликнуть «Выбрать всё» по страницам.

### 3.2 Wizard — 4 шага

**Компонент:** `frontend/src/components/bulk/BulkOperationWizardModal.tsx` (новый, Ant Design `Modal` с `width=720`, `destroyOnClose`, footer — `Steps` nav + primary/secondary).

Шаги (`steps=['pick', 'configure', 'preview', 'confirm']`), идут линейно, можно ходить назад до самого `run`.

---

#### Шаг 1 — Choose operation

Левая колонка списком-карточками (radio-group):

- `TRANSITION` — «Изменить статус»
- `ASSIGN` — «Изменить исполнителя»
- `EDIT_FIELD` — «Изменить поле» (priority / due date / labels / description)
- `EDIT_CUSTOM_FIELD` — «Изменить кастомное поле»
- `MOVE_TO_SPRINT` — «Переместить в спринт»
- `ADD_COMMENT` — «Добавить комментарий»
- `DELETE` — «Удалить задачи» (красный, с иконкой)

Справа — выбор scope'а:

- **Selected issues (N)** — дефолт, если юзер пришёл с выделенными строками
- **All matching issues (N)** — активно если `load.total > selectedIds.length`; вычисляется передачей JQL на backend, получаем точное число. Если `N > BULK_OP_MAX_ITEMS` — **silent-truncate** до лимита, inline-warning «Выбрано 12 547 задач, будут обработаны первые 10 000 по порядку сортировки JQL. Сузьте фильтр, чтобы обработать остальное».

Кнопка «Далее» active только если выбраны и operation, и scope.

---

#### Шаг 2 — Configure

Форма с полями операции. Все поля валидируются Zod DTO **на клиенте** и **на сервере**. Inline-ошибки под каждым полем. Обязательные поля помечены `*`.

| Операция | Поля формы |
|----------|-----------|
| TRANSITION | Target status (AntD Select, список агрегируется по `workflowEngineApi.getBatchTransitions(issueIds)` — как сейчас в `BulkStatusWizardModal`; для scope='all' берём первую страницу + warning «aggregated by sample») |
| ASSIGN | Assignee (поиск по юзерам, `UserPicker`); чекбокс «Unassign (clear)» |
| EDIT_FIELD | Dropdown поля (`priority` / `dueDate` / `labels.add` / `labels.remove` / `description.append`) → зависимый инпут |
| EDIT_CUSTOM_FIELD | Field selector (из `/custom-fields`, только тех что есть в pot. field-schemes пересечения проектов selected'а) → значение (тип зависит от field.type) |
| MOVE_TO_SPRINT | Target sprint (ограничиваем выбор — все задачи должны быть из проекта спринта; если есть cross-project — показываем warning и auto-исключаем «чужие» в preview) |
| ADD_COMMENT | Textarea (max 10000), чекбокс «Notify watchers» (фаза 2) |
| DELETE | Read-only уведомление «Это действие необратимо»; поле ввода `Введите DELETE для подтверждения` — типовая защита от accidental (unlock'ает «Далее») |

Внизу — кнопка **«Предпросмотр»** вместо «Далее», чтобы подчеркнуть: dry-run обязателен.

---

#### Шаг 3 — Preview (dry-run)

Крупный индикатор подсчёта: «Будет изменено: **X**  ·  Будет пропущено: **Y**  ·  Конфликтов: **Z**» + суммарное число N.

Под ним — **сворачиваемые секции**, каждая с virtualized-списком (`react-window` — уже в проекте для ResultsTable) на max 300 элементов + «показать ещё»:

1. **✅ Готовы к изменению (X)** — каждый row: `KEY`, title, current → new value (или визуализация перехода статусов). Цвет — зелёный бордер слева.
2. **⚠ Пропущены (Y)** — row + пояснение-бейдж почему:
   - `NO_TRANSITION` — нет перехода из текущего статуса
   - `NO_ACCESS` — у юзера нет прав на проект этой задачи
   - `INVALID_FIELD_SCHEMA` — у задачи нет custom field из выбранной CF
   - `TYPE_MISMATCH` — тип field != тип значения
   - `DELETED` — задача уже удалена (resolve-race)
   - `SPRINT_PROJECT_MISMATCH` — задача не из проекта спринта
3. **🔴 Потенциальные конфликты (Z)** — требуют явного решения пользователя, с inline-кнопками:
   - `WORKFLOW_REQUIRED_FIELDS` — переход требует заполнение X поля; кнопка «Указать значение для всех» → открывается sub-form
   - `WATCHED_BY_OTHERS` — «Задача на review у N людей, они получат уведомление»; кнопка «Ок, продолжить» / «Исключить из операции»
   - `AI_IN_PROGRESS` — у задачи `aiExecutionStatus=IN_PROGRESS`; «Исключить» / «Всё равно изменить»

Кнопка «Далее» дисейблится, пока остались нерешённые `WORKFLOW_REQUIRED_FIELDS`.

API: `POST /api/bulk-operations/preview` возвращает `{ totalMatched, eligible: BulkItem[], skipped: BulkItemSkipped[], conflicts: BulkItemConflict[], warnings: string[] }` за один вызов. Сервер генерирует **`previewToken`** (UUID, хранится в Redis 15 мин), который затем подставляется в submit — так гарантируется, что пользователь запускает ровно тот набор, что он видел, и под тем самым JQL-срезом.

---

#### Шаг 4 — Confirm & run

Компактное резюме:

> Вы собираетесь **изменить статус** у **1 247** задач.
> Пропущено по правилам: 38.
> **Необратимо.** Продолжить?

Кнопка **«Запустить»** (primary, danger для DELETE). На click — `POST /api/bulk-operations` с `previewToken` и `Idempotency-Key` (UUID, сгенерированный в `useMemo` на шаге 1; живёт до закрытия модалки). Сервер создаёт `BulkOperation` и возвращает `{ id, status: 'QUEUED' }`. Wizard немедленно переключается в **Progress view**.

---

### 3.3 Progress view (drawer)

После submit модалка схлопывается в небольшой drawer справа (`width=420`), который остаётся поверх `/search` и не блокирует работу (пользователь может менять JQL, листать таблицу). Drawer содержит:

- Заголовок операции + `BulkOperationStatusBadge` (`QUEUED` / `RUNNING` / `SUCCEEDED` / `PARTIAL` / `FAILED` / `CANCELLED`).
- `ProgressBar` (используем [`ui/ProgressBar.tsx`](../../frontend/src/components/ui/ProgressBar.tsx) с `showLabel`).
- Live-счётчики: «Обработано: 347 / 1 247  ·  Успешно: 340  ·  Ошибок: 7».
- ETA: по rolling average за последние 10 сек, отдаётся с backend'а.
- Кнопки: **«Отменить»** (запрашивает cancel, становится «Отмена запрошена…»; необработанные пропускаются, обработанные коммитятся). **«Свернуть»** — прячет drawer, внизу экрана остаётся floating-chip «Операция #123 — 28%» → возвращает drawer.
- По завершении — блок «Отчёт»:
  - Ссылка «Скачать CSV» (`GET /api/bulk-operations/:id/report.csv` — все items с статусом/ошибкой).
  - «Перейти к списку операций» → `/operations`.
  - Если есть ошибки — **первые 10 отчётных строк inline** («TTMP-123: WORKFLOW_REQUIRED_FIELDS — Field "Release version" is required»).

SSE-канал автоматически переподключается при разрыве (`retry=2000` + `eventsource-polyfill`). Если SSE недоступен (corp-proxy) — fallback на `GET /api/bulk-operations/:id` polling каждые 2 сек.

---

### 3.4 Страница `/operations`

Новая таблица (`pages/OperationsPage.tsx`): мои операции за последние 30 дней (фильтр «Все операции» — только для `ADMIN`). Колонки: дата, тип, scope summary, прогресс (bar + %), статус, actions (View report / Cancel если RUNNING / Retry failed если PARTIAL).

**Retry failed** (фаза 1, streched goal): создаёт новую операцию с idset=failed items из предыдущей.

---

### 3.5 Матрица обработки ошибок (UX)

Принцип: **«Ни один системный `500` не должен доехать до пользователя в виде stack trace или голого статус-кода»**. Все ошибки имеют человекочитаемую русскую формулировку.

| Сценарий | Где ловим | Что видит пользователь |
|----------|-----------|------------------------|
| Нет роли `BULK_OPERATOR` | 403 на `POST /bulk-operations/preview` | Modal не открывается; кнопка скрыта. Если всё-таки вызван напрямую — Toast «У вас нет прав на выполнение массовых операций. Обратитесь к администратору» |
| Истёк `previewToken` | 409 на `POST /bulk-operations` | Wizard откатывается на шаг 3, Toast «Предпросмотр устарел, пересчитываем…» + auto-rerun preview |
| Дубликат `Idempotency-Key` | 200 с тем же `operationId` | Подхватываем существующий job, открываем Progress drawer, никакого user-facing сообщения |
| Потеря соединения на SSE | клиентский fallback | Статус-бейдж «Соединение потеряно, переподключение…»; чёрный polling продолжает работу |
| Server restart во время RUNNING | heartbeat recovery | При следующем cron-tick — resume с первого `status='PENDING'` item; пользователь видит «Операция возобновлена» в drawer |
| Attempt to cancel COMPLETED | idempotent no-op | Кнопка «Отменить» disabled после terminal state |
| Race: задача удалена между preview и execute | per-item status=`SKIPPED_DELETED` | Отражается в финальном отчёте, не падает операция |
| Частичный failure (N/M успешно) | status=`PARTIAL` (HTTP 200 на GET) | Жёлтый бейдж + призыв «Скачать отчёт» |
| Полный failure на pre-flight (например, невалидный JQL) | 400 | Toast с подробным текстом от backend'а, шаг 1 |
| scope=jql возвращает > 10 000 | 200 + `warnings=['TRUNCATED_TO_MAX_ITEMS']` в preview | Inline-warning на шаге 1/3 «Ваш JQL матчит 12 547 задач, обработаны будут первые 10 000 (по порядку сортировки JQL). Повторите операцию с более узким фильтром для остальных 2 547». Кнопка «Далее» активна — пользователь осознанно соглашается |
| scope=ids > 10 000 (редкий кейс — API clients) | 400 `TOO_MANY_ITEMS` | Явная ошибка, т.к. ids шлёт только клиент и может разбить сам |
| Превышен concurrency на пользователя | 429 `TOO_MANY_CONCURRENT` | Inline-ошибка на шаге 4 «У вас уже выполняются 3 массовые операции. Дождитесь их завершения или отмените одну из них» + кнопка «Перейти к /operations» |
| Backend error in job (уже RUNNING) | per-item `FAILED` + `error.code` | Item отмечен в отчёте; операция продолжается |

---

## 4. API

### 4.1 Новые роуты

Префикс `/api/bulk-operations`. Авторизация — `requireRole('BULK_OPERATOR')` (с SUPER_ADMIN-override через `hasSystemRole`).

```
POST   /api/bulk-operations/preview
POST   /api/bulk-operations
GET    /api/bulk-operations/:id
GET    /api/bulk-operations/:id/stream        (SSE)
GET    /api/bulk-operations/:id/report.csv
POST   /api/bulk-operations/:id/cancel
POST   /api/bulk-operations/:id/retry-failed  (создаёт новую операцию с scope=ids из failed items; требует что предыдущая в терминальном статусе и её BulkOperationItem'ы ещё не зачищены по retention)
GET    /api/bulk-operations                   (список, пагинация)
```

Admin (требует `ADMIN` / `SUPER_ADMIN`):

```
GET    /api/admin/system-settings/bulk-operations             (текущие значения)
PATCH  /api/admin/system-settings/bulk-operations             (maxConcurrentPerUser, maxItems — пределы 1..20 и 100..50000)
```

### 4.2 DTO (Zod, `backend/src/modules/bulk-operations/bulk-operations.dto.ts`)

```ts
// Scope — либо явный список ID, либо JQL-запрос (сервер пересчитает ID'шники).
// Ровно одно из двух.
const scopeDto = z.union([
  z.object({ kind: z.literal('ids'), issueIds: z.array(z.string().uuid()).min(1).max(10000) }),
  z.object({ kind: z.literal('jql'),  jql: z.string().min(1).max(4000) }),
]);

const operationPayloadDto = z.discriminatedUnion('type', [
  z.object({ type: z.literal('TRANSITION'),         transitionId: z.string().uuid(), fieldOverrides: z.record(z.unknown()).optional() }),
  z.object({ type: z.literal('ASSIGN'),             assigneeId: z.string().uuid().nullable() }),
  z.object({ type: z.literal('EDIT_FIELD'),         field: z.enum(['priority','dueDate','labels.add','labels.remove','description.append']), value: z.unknown() }),
  z.object({ type: z.literal('EDIT_CUSTOM_FIELD'),  customFieldId: z.string().uuid(), value: z.unknown() }),
  z.object({ type: z.literal('MOVE_TO_SPRINT'),     sprintId: z.string().uuid().nullable() }),
  z.object({ type: z.literal('ADD_COMMENT'),        body: z.string().min(1).max(10000) }),
  z.object({ type: z.literal('DELETE'),             confirmPhrase: z.literal('DELETE') }),
]);

export const previewBulkOperationDto = z.object({
  scope: scopeDto,
  payload: operationPayloadDto,
});

export const createBulkOperationDto = z.object({
  previewToken: z.string().uuid(),
  /** Resolution for each conflict id from preview response. */
  conflictResolutions: z.record(z.enum(['INCLUDE','EXCLUDE','USE_OVERRIDE'])).optional(),
});
```

### 4.3 Preview response

```ts
type BulkPreviewResponse = {
  previewToken: string;              // 15-min TTL
  totalMatched: number;
  eligible: Array<{ issueId: string; issueKey: string; title: string; projectId: string; projectKey: string; preview?: Record<string, unknown> /* diff */ }>;
  skipped:  Array<{ issueId: string; issueKey: string; title: string; reasonCode: BulkSkipReason; reason: string }>;
  conflicts: Array<{ issueId: string; issueKey: string; title: string; code: BulkConflictCode; message: string; requiredFields?: string[] }>;
  warnings: string[];                // global warnings e.g. 'scope=jql was sampled'
};

enum BulkSkipReason {
  NO_TRANSITION, NO_ACCESS, INVALID_FIELD_SCHEMA, TYPE_MISMATCH, DELETED, SPRINT_PROJECT_MISMATCH, ALREADY_IN_TARGET_STATE
}
enum BulkConflictCode {
  WORKFLOW_REQUIRED_FIELDS, WATCHED_BY_OTHERS, AI_IN_PROGRESS
}
```

### 4.4 Create/status response

```ts
type BulkOperationResponse = {
  id: string;
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'PARTIAL' | 'FAILED' | 'CANCELLED';
  type: BulkOperationType;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  totals: { total: number; processed: number; succeeded: number; failed: number; skipped: number };
  etaSeconds: number | null;
  heartbeatAt: string | null;
  scopeSummary: { kind: 'ids' | 'jql'; preview: string };
  cancelRequested: boolean;
  reportUrl: string;                  // /api/bulk-operations/:id/report.csv
  /** true если есть failed items в BulkOperationItem И они ещё не зачищены retention. */
  canRetryFailed: boolean;
};
```

### 4.5 SSE event schema

```
event: progress
data: {"processed":340,"succeeded":335,"failed":5,"etaSeconds":42}

event: status
data: {"status":"SUCCEEDED","finishedAt":"2026-04-23T14:05:12Z"}

event: item
data: {"issueId":"…","issueKey":"TTMP-123","status":"FAILED","errorCode":"WORKFLOW_REJECTED","errorMessage":"Required field Release not set"}

event: heartbeat
data: {"ts":"2026-04-23T14:04:55Z"}
```

Heartbeat каждые 20 сек для keep-alive через прокси.

---

## 5. Модель данных (Prisma)

### 5.0 Принцип минимизации хранимых данных

Источник правды о том, *что именно* изменилось у конкретной задачи — существующая таблица `IssueHistory` (на которую уже пишет `executeTransition`, `updateIssue` и т.д.). Bulk-операция **не дублирует** diff-информацию: executor вызывает существующие сервисные функции от имени инициатора (`actorId = BulkOperation.createdById`), они пишут `IssueHistory` ровно так же, как при одиночном редактировании.

Как следствие:

- `BulkOperation` хранит **только факт запуска** — кто/когда/какой тип/счётчики.
- `BulkOperationItem` хранит строки **только для failed и skipped** items. **Succeeded items не пишутся никогда** — их diff уже в `IssueHistory`; счётчик `succeeded` в `BulkOperation` покрывает UX-отчёт «340 из 347 успешно».
- Ход выполнения (`pending` queue) живёт **в Redis**, не в БД: ключ `bulk-op:{id}:pending` — `LRANGE`-список issueId. Воркер `LPOP` пачку, обрабатывает, failed/skipped — пишет строку в `BulkOperationItem`. После завершения ключ удаляется.
- Preview-сет eligible ID хранится там же (`bulk-op:preview:{token}` — Redis SET, TTL 15 мин).

Retention: `BulkOperation` — 90 дней, `BulkOperationItem` — **30 дней** (cron-зачистка). После зачистки item'ов сохраняется сам факт операции со счётчиками (достаточно для расследования по времени, детали — в `IssueHistory`). Retry-failed доступен только первые 30 дней.

### 5.1 Новый enum + модели

```prisma
enum SystemRoleType {
  SUPER_ADMIN
  ADMIN
  RELEASE_MANAGER
  USER
  AUDITOR
  BULK_OPERATOR        // ← новое
}

enum BulkOperationType {
  TRANSITION
  ASSIGN
  EDIT_FIELD
  EDIT_CUSTOM_FIELD
  MOVE_TO_SPRINT
  ADD_COMMENT
  DELETE
}

enum BulkOperationStatus {
  QUEUED
  RUNNING
  SUCCEEDED
  PARTIAL
  FAILED
  CANCELLED
}

/// Minimal: only failed + skipped items are persisted; succeeded items
/// are reflected solely via IssueHistory for the affected issue.
enum BulkItemOutcome {
  FAILED
  SKIPPED
}

model BulkOperation {
  id                 String              @id @default(uuid())
  createdById        String              @map("created_by_id")
  type               BulkOperationType
  status             BulkOperationStatus @default(QUEUED)
  scopeKind          String              @map("scope_kind")         // 'ids' | 'jql'
  /// Snapshot JQL (for 'jql' scope) — ≤ 4000 chars, null для 'ids'
  scopeJql           String?             @map("scope_jql")
  /// Discriminated payload (minus user-generated long text — comment body
  /// is truncated to 500 chars for retention; full comment lives in Comment
  /// table as the normal side-effect)
  payload            Json
  idempotencyKey     String              @map("idempotency_key")
  total              Int
  processed          Int                 @default(0)
  succeeded          Int                 @default(0)
  failed             Int                 @default(0)
  skipped            Int                 @default(0)
  cancelRequested    Boolean             @default(false) @map("cancel_requested")
  /// Last beat from the worker — used by recovery cron to detect stalled jobs
  heartbeatAt        DateTime?           @map("heartbeat_at")
  startedAt          DateTime?           @map("started_at")
  finishedAt         DateTime?           @map("finished_at")
  createdAt          DateTime            @default(now()) @map("created_at")

  createdBy          User                @relation(fields: [createdById], references: [id])
  items              BulkOperationItem[]

  @@unique([createdById, idempotencyKey])
  @@index([createdById, createdAt])
  @@index([status, heartbeatAt])
  @@index([createdAt])                   // retention sweep
  @@map("bulk_operations")
}

/// Persisted ONLY for items that failed or were skipped.
/// Succeeded items leave their trace in IssueHistory, not here.
model BulkOperationItem {
  id            String          @id @default(uuid())
  operationId   String          @map("operation_id")
  issueId       String          @map("issue_id")
  /// Denormalised key so report stays readable if the issue is later deleted
  issueKey      String          @map("issue_key")
  outcome       BulkItemOutcome
  errorCode     String          @map("error_code")     // machine-readable
  errorMessage  String          @map("error_message")  // ≤ 500 chars, truncated
  processedAt   DateTime        @default(now()) @map("processed_at")

  operation     BulkOperation   @relation(fields: [operationId], references: [id], onDelete: Cascade)

  @@index([operationId])
  @@index([processedAt])                 // retention sweep
  @@map("bulk_operation_items")
}

/// TTBULK-1: system role assignment through group (previously groups had only project roles)
model UserGroupSystemRole {
  id        String         @id @default(uuid())
  groupId   String         @map("group_id")
  role      SystemRoleType
  createdAt DateTime       @default(now()) @map("created_at")
  createdBy String?        @map("created_by")

  group     UserGroup      @relation(fields: [groupId], references: [id], onDelete: Cascade)

  @@unique([groupId, role])
  @@index([groupId])
  @@map("user_group_system_roles")
}
```

> Обратите внимание: `UserGroup.members` + `UserGroupSystemRole` дают эффективную роль юзера объединением `UserSystemRole` (DIRECT) и `UserGroupSystemRole` (GROUP) — симметрично текущему pattern'у [`RoleAssignmentSource`](../../backend/src/prisma/schema.prisma#L90) для project-ролей.

### 5.2 Миграция

- `prisma migrate dev --name add_bulk_operations_and_bulk_operator_role` — Prisma сгенерирует 4 таблицы + расширение enum.
- **Важно:** расширение enum в Postgres требует `ALTER TYPE … ADD VALUE` и *не* может быть в одной транзакции с использованием нового значения. Migration — двумя шагами либо отдельный CREATE VALUE в `prisma/migrations/{ts}_bulk_operator_role/migration.sql` перед дефолт-генерацией.

### 5.3 Retention sweep

Новый cron (`BULK_OP_RETENTION_CRON`, default `30 3 * * *` — ночью):

1. `DELETE FROM bulk_operation_items WHERE processed_at < NOW() - interval '30 days'`.
2. `DELETE FROM bulk_operations WHERE created_at < NOW() - interval '90 days' AND status NOT IN ('QUEUED','RUNNING')`.

Пороги настраиваются через ENV (`BULK_OP_ITEMS_RETENTION_DAYS`, `BULK_OP_RETENTION_DAYS`).

### 5.4 Запись в IssueHistory от имени пользователя

Executor'ы вызывают *те же самые* сервисные функции (`workflowEngine.executeTransition`, `issues.assignIssue`, `issues.updateIssue`, `comments.createComment`, `issues.deleteIssue`, `issue-custom-fields.setValue`, `sprints.addIssuesToSprint`) с `actorId = operation.createdById`. Функции уже пишут history. Дополнительно — при записи истории проставляется **метка источника** `bulkOperationId`:

- Добавить в `IssueHistory` nullable-колонку `bulkOperationId String?` (FK на `BulkOperation.id`, `onDelete: SetNull` — при зачистке старой операции метка становится null, но сам history остаётся).
- Executor пробрасывает `bulkOperationId` через request-context (`AsyncLocalStorage`, уже используется в [request-context.ts](../../backend/src/shared/middleware/request-context.ts)) в момент применения change'а.
- UI карточки задачи отображает бейдж «Изменение в рамках массовой операции #123» рядом с записью в History.

### 5.5 Обновление auth-кэша

`getEffectiveUserSystemRoles(userId)` (новая функция в `shared/auth/roles.ts`):

```ts
export async function getEffectiveUserSystemRoles(userId: string): Promise<SystemRoleType[]> {
  const [direct, viaGroups] = await Promise.all([
    prisma.userSystemRole.findMany({ where: { userId }, select: { role: true } }),
    prisma.userGroupSystemRole.findMany({
      where: { group: { members: { some: { userId } } } },
      select: { role: true },
    }),
  ]);
  return Array.from(new Set([...direct.map(x => x.role), ...viaGroups.map(x => x.role)]));
}
```

Используется в middleware `authenticate` (`shared/middleware/auth.ts`) при построении `req.user.systemRoles`. **TTL-кэш** ключом `user:sysroles:{userId}` на 60 сек в Redis; инвалидируется при изменении assignments.

---

## 6. Backend — сервисный слой

### 6.1 Структура модуля

```
backend/src/modules/bulk-operations/
├── bulk-operations.dto.ts          // zod schemas
├── bulk-operations.router.ts       // routes + SSE handler
├── bulk-operations.service.ts      // preview + create + cancel + CSV report
├── bulk-operations.processor.ts    // фоновый worker (cron-tick)
├── executors/
│   ├── transition.executor.ts
│   ├── assign.executor.ts
│   ├── edit-field.executor.ts
│   ├── edit-custom-field.executor.ts
│   ├── move-to-sprint.executor.ts
│   ├── add-comment.executor.ts
│   └── delete.executor.ts
└── bulk-operations.types.ts
```

### 6.2 Executor contract

```ts
export interface BulkExecutor<P = unknown> {
  readonly type: BulkOperationType;
  /** Pre-flight check for one issue. Called during dry-run and before each item in job.
   *  Returns either ELIGIBLE (possibly with preview diff), SKIPPED (reasonCode), or CONFLICT (code + extra). */
  preflight(issue: IssueWithContext, payload: P, actor: AuthUser): Promise<PreflightResult>;
  /** Apply change. Must be idempotent when possible. Uses prisma transaction. */
  execute(issue: IssueWithContext, payload: P, actor: AuthUser): Promise<void>;
}
```

Каждый executor — чистая функция + конкретные типы; нет скрытой связности через глобальные хуки. Аудит пишется **снаружи** в processor'е, не в executor'е.

### 6.3 Processor (cron-based)

В стиле [`checkpoint-scheduler.service.ts`](../../backend/src/modules/releases/checkpoints/checkpoint-scheduler.service.ts) — cron каждые 5 сек (`*/5 * * * * *` — 6-field, у `node-cron` есть поддержка) тикает:

1. `acquireLock('bulk-ops:tick', TTL=30s)` — защита от двух инстансов.
2. Выбрать `BulkOperation where status IN ('QUEUED','RUNNING') and not cancelRequested order by createdAt asc limit 1`.
3. Если `RUNNING` и `heartbeatAt` > now − 60 сек → skip (ещё обрабатывается другим тиком, что не должно случаться при блокировке, но защита на случай рестарта).
4. Взять пачку issueId из Redis-очереди `LPOP bulk-op:{id}:pending 25` (pending-list живёт в Redis, не в БД — см. §5.0; `BulkOperationItem` пишется только для failed/skipped после обработки).
5. Для каждого — в транзакции: `preflight` → `execute` → `update item.status + operation counts`. Heartbeat раз в 1 сек.
6. Если `cancelRequested` между пачками — пометить оставшиеся `SKIPPED` с `errorCode='CANCELLED_BY_USER'`, зафинализировать как `CANCELLED`.
7. Когда все items обработаны → status = `SUCCEEDED` (если `failed=0` — skipped допустимо, это нормальный результат pre-flight'а), `PARTIAL` (если `failed>0` и `succeeded>0`), `FAILED` (если `failed=processed` и `succeeded=0`) → finalizer шлёт event в SSE + audit. Email-нотификация — Phase 2 (см. §2.2).

### 6.4 Recovery

Отдельный tick на старте сервера: `status=RUNNING and heartbeatAt < now - 5min` → reset `status=QUEUED` (items уже в правильном статусе; оставшиеся `PENDING` будут подхвачены).

### 6.5 Concurrency / ordering

- На пользователя — max 3 активных операции, проверяется в `create` по `status IN ('QUEUED','RUNNING')`.
- Global — max 1 операция одновременно (один tick = один лок). Несколько пользователей с операциями — обрабатываются последовательно по FIFO. Это намеренно **консервативно** для фазы 1: избегаем lock-contention на issues. В Phase 2 — расширение до N параллельных тиков с разводкой по projectId.

### 6.6 SSE-реализация

- `/stream` endpoint ставит `Content-Type: text/event-stream`, отключает compression (nginx `X-Accel-Buffering: no`).
- Pub/sub через Redis: processor публикует событие в `bulk-op:{id}:events` → роут подписан через `Subscriber`, форвардит в SSE-поток. Это позволяет UI переподключаться к другому инстансу API (round-robin) и не терять событий.
- Keep-alive `: ping\n\n` каждые 20 сек.

---

## 7. Permissions

### 7.1 Новая роль `BULK_OPERATOR`

- Системная, независимая — её наличие **не** даёт никакого доступа на чтение. Только возможность инициировать массовую операцию.
- **Per-item права всё равно проверяются** executor'ом. Пример: пользователь `BULK_OPERATOR` без доступа к проекту P1 запускает bulk-transition с JQL, который матчит задачи из P1 и P2 (где доступ есть) — executor пропустит P1-items с `reasonCode=NO_ACCESS`.
- По умолчанию — **никто её не имеет**, даже ADMIN. Назначается явно через `/admin/users/:id/system-roles` или `/admin/groups/:id/system-roles`.
- SUPER_ADMIN имеет её автоматически через [`hasSystemRole`](../../backend/src/shared/auth/roles.ts#L3) — там уже зашит bypass.

### 7.2 Admin UI

Расширить [`AdminRolesPage.tsx`](../../frontend/src/pages/admin/AdminRolesPage.tsx):

- В списке системных ролей — добавить `BULK_OPERATOR` с описанием «Позволяет запускать массовые операции над задачами. Высокий blast-radius; per-item права остаются в силе».
- Tab «Назначения роли»: две таблицы — «Напрямую пользователям» и «Через группы». Соответствующие API:
  - `GET /admin/system-roles/:role/assignments` → `{ users: [...], groups: [...] }`
  - `POST /admin/users/:id/system-roles` (уже есть)
  - `POST /admin/groups/:id/system-roles` (новый) + `DELETE /admin/groups/:id/system-roles/:role`

Страница группы (`AdminGroupDetailPage.tsx`) получает секцию «Системные роли группы» рядом с «Project roles», UX симметричный.

### 7.3 Audit

Каждое `BulkOperation` логируется:

- На create: `bulk_operation.created` с payload (без чувствительных данных).
- На finish: `bulk_operation.completed` с totals.
- На cancel: `bulk_operation.cancelled`.
- Назначение/отзыв роли `BULK_OPERATOR`: `system_role.granted|revoked` (уже есть существующий audit-ивент для системных ролей).

### 7.4 Расследование изменений, внесённых bulk-операцией

> **Принцип:** диффы каждой задачи не дублируются в `BulkOperation*` — они уже лежат в штатном `IssueHistory`. Для расследования «кто и когда изменил задачу X через массовую операцию» используется **связка двух источников**.

**Способ 1 — по задаче → к операции.**

1. Открыть карточку задачи → вкладка History.
2. Записи, сделанные через bulk, помечены бейджем «Массовая операция #N» (см. §5.4, колонка `IssueHistory.bulkOperationId`).
3. Клик по бейджу → открывает `/operations/:id` с подробностями запуска (кто, когда, payload, scope JQL, счётчики).

**Способ 2 — по операции → к задачам.**

1. `/operations/:id` → ссылка «Посмотреть все изменения этой операции».
2. Внутри — два блока:
   - **Успешные (N шт.)** — список уникальных `issueId` из `IssueHistory WHERE bulkOperationId = :id`, кликабельный.
   - **Failed/Skipped (M шт.)** — из `BulkOperationItem` (пока не зачищены по retention).
3. Для successful — в БД нет копии diff'а, но есть ссылка на соответствующие записи `IssueHistory`.

**Способ 3 — по юзеру → по времени (расследование после retention).**

Если `BulkOperationItem` уже зачищен, но запись `BulkOperation` ещё жива (90 дней), остаётся коррелировать:

1. Audit log: `SELECT * FROM audit_log WHERE user_id = :u AND action = 'bulk_operation.completed' AND created_at BETWEEN :t1 AND :t2` — даёт `operation.id` и payload.
2. История задач: `SELECT * FROM issue_history WHERE actor_id = :u AND created_at BETWEEN :started_at AND :finished_at` — даёт все изменения, сделанные этим юзером в окно выполнения операции. Из них те, что с `bulk_operation_id = :id`, — прямо от этой операции; те, что без — параллельная ручная работа.

**Способ 4 — после полного истечения retention (> 90 дней).**

Самого `BulkOperation` уже нет. Остаются:
- Audit log (срок определяется общим audit retention; по умолчанию 1+ год).
- `IssueHistory` (бессрочно) — записи с `bulkOperationId = NULL` (FK был `SetNull`), но `actor_id` и `created_at` целы. Аналитик соотносит по таймстемпу с audit log'ом `bulk_operation.*` — и так восстанавливает контекст.

Раздел «Как найти изменение, сделанное массовой операцией» идёт в [docs/user-manual/bulk-operations.md](../user-manual/bulk-operations.md) (поставляется вместе с PR-11) со скриншотами UI. Раздел «Forensics для админа / ИБ» идёт в [docs/OPERATIONS_RUNBOOK.md](../OPERATIONS_RUNBOOK.md) — с примерами SQL-запросов выше.

---

## 8. Frontend — детализация

### 8.1 Новые файлы

```
frontend/src/
├── api/bulkOperations.ts                                      // typed client
├── components/bulk/
│   ├── BulkOperationWizardModal.tsx                           // главный wizard
│   ├── BulkOperationWizardSteps/
│   │   ├── Step1PickOperation.tsx
│   │   ├── Step2Configure.tsx
│   │   ├── Step3Preview.tsx
│   │   └── Step4Confirm.tsx
│   ├── BulkOperationProgressDrawer.tsx                        // SSE subscriber + progress bar
│   ├── BulkOperationReportTable.tsx                           // финальный отчёт
│   └── useBulkOperationStream.ts                              // hook: SSE + polling fallback
├── pages/OperationsPage.tsx                                   // список операций юзера
├── store/bulkOperations.store.ts                              // zustand: активные операции (видны во всём приложении как chip)
└── types/bulk.types.ts
```

### 8.2 Интеграция с `BulkActionsBar`

`BulkActionsBar.tsx` принимает дополнительный prop `jql: string` и `total: number`, и рендерит кнопку «Массовые операции», открывающую wizard, с передачей `{ selectedIds, jql, total }`.

### 8.3 Floating operations chip

В `AppLayout.tsx` → глобальный portal-компонент `<BulkOperationChips />`, который слушает `bulkOperations.store` и показывает внизу-справа мини-бейджи для всех активных операций юзера. Click по chip'у — открывает `BulkOperationProgressDrawer`. Это гарантирует: если юзер ушёл со `/search` на другую страницу, он всё равно видит прогресс.

### 8.4 CLAUDE.md-правило о modal-onClose

[Корневой CLAUDE.md](../../CLAUDE.md) требует: «modal/drawer close → refresh parent data». Применяется и здесь:

- `BulkOperationWizardModal.onCancel` на шагах 1–3 → просто закрывает (нет серверных side-effects).
- `BulkOperationWizardModal.onCancel` на шаге 4, когда уже `POST /bulk-operations` случился → перевод в drawer, **не** закрытие (операция создана).
- `BulkOperationProgressDrawer.onClose` → **обязательно** вызывает `runQuery(state.jql, state.page)` на `SearchPage`, потому что за время работы операции данные изменились.

---

## 9. Производительность и безопасность

### 9.1 Производительность

- **JQL scope**: при scope=`jql` на `preview` мы не резолвим все 10k ID — используем `search/ids-only` endpoint (вернуть только id'шники, bypassing column hydration). Добавляется в `search.service` как легковесная ветка.
- **Batch size 25**: подобран исходя из Prisma transaction-timeout (по умолчанию 5 сек) и того, что `executeTransition` может триггерить webhook'и/AI hooks. Настраивается `BULK_OP_BATCH_SIZE`.
- **Rate-limit**: `BULK_OP_PAUSE_BETWEEN_BATCHES_MS` (default 0). Для пиковой защиты — ADMIN может выставить >0 чтобы размазать нагрузку.
- **CSV report**: stream-генерация через `@fast-csv/format`, не загружаем все items в память; `/report.csv` читает по 1000 строк пагинированно.

### 9.2 Безопасность

- Все executor'ы проверяют `assertProjectPermission(actor, issue.projectId, required)` внутри preflight. Пропуск проверок = P0 bug.
- `DELETE` executor дополнительно требует, чтобы actor имел `ISSUE_DELETE` permission в проекте задачи (помимо системной `BULK_OPERATOR`).
- `previewToken` хранит `userId` и не валиден для другого юзера.
- `Idempotency-Key` — unique на `(userId, key)`, защищает от double-submit.
- Payload в `BulkOperation.payload` хранит только ID, не PII; комментарии — это user-generated content, не секрет.
- SSE-подписка требует `authenticate` middleware; `operationId` привязан к `createdById`; другие юзеры — 404.

---

## 10. Тестирование

### 10.1 Unit (backend)

- Каждый executor: `preflight` и `execute` — таблица сценариев (happy, skip, conflict).
- `processor`: tick с mock'ами Prisma/Redis, проверяем batch-логику, recovery, cancellation.
- `service.preview`: scope=ids / scope=jql, лимит 10k, истёкший token.

### 10.2 Integration (backend, `vitest` + testcontainers postgres)

- Создание операции → processor tick → все item'ы `SUCCEEDED`.
- Частичный failure: 2 из 5 items фейлят preflight → operation `PARTIAL`, counts корректны.
- Cancel mid-flight: после 2 item'ов вызываем cancel → оставшиеся `SKIPPED` с `errorCode=CANCELLED_BY_USER`.
- Recovery: поставить `status=RUNNING, heartbeatAt=10min ago` → recovery tick переводит в QUEUED → обработка идёт дальше.
- Idempotency: два запроса с одним `Idempotency-Key` → один и тот же `operationId`.

### 10.3 E2E (Playwright)

Новый spec `frontend/e2e/specs/15-bulk-operations.spec.ts`:

- Юзер без роли `BULK_OPERATOR` → кнопка в `BulkActionsBar` скрыта.
- С ролью → открыть wizard, пройти transition для 3-х задач, дождаться SUCCEEDED, проверить статусы в таблице после refresh.
- Scope=JQL на 200+ задач (seed): preview показывает skipped/conflicts, confirm, progress bar растёт, отчёт в CSV скачивается.
- Cancel: запустить long-running (seed 500 items + artificial delay), нажать Cancel — увидеть CANCELLED.

### 10.4 Нагрузочное

- `k6` сценарий: 100 параллельных юзеров по 1 операции на 100 items — убедиться что tick не простаивает, p95 completion < 60 сек.

---

## 11. Конфигурация и feature flag

Новые ENV переменные (`backend/src/config.ts`):

```
BULK_OP_MAX_ITEMS=10000                   # также default для System settings (можно переопределить через админку)
BULK_OP_MAX_CONCURRENT_PER_USER=3         # также default для System settings
BULK_OP_BATCH_SIZE=25
BULK_OP_PAUSE_BETWEEN_BATCHES_MS=0
BULK_OP_PREVIEW_TTL_SECONDS=900
BULK_OP_PROCESSOR_ENABLED=true            # kill-switch
BULK_OP_TICK_CRON=*/5 * * * * *           # 6-field node-cron
BULK_OP_RECOVERY_STALE_SECONDS=300
BULK_OP_RETENTION_CRON=30 3 * * *         # ежедневная ночная зачистка
BULK_OP_RETENTION_DAYS=90                 # хранение записи BulkOperation
BULK_OP_ITEMS_RETENTION_DAYS=30           # хранение failed/skipped items
```

### 11.1 System settings в админке

В [AdminSystemPage.tsx](../../frontend/src/pages/admin/AdminSystemPage.tsx) добавляется секция «Массовые операции»:

- **Макс одновременных операций на пользователя** (number input, 1..20, default 3)
- **Макс задач в одной операции** (number input, 100..50 000, default 10 000)

Значения хранятся в новой записи `system_settings.bulk_operations` (JSON) — продолжение pattern'а [`getSystemSettings`](../../backend/src/modules/admin/admin.service.ts). Если запись отсутствует или поле не задано — используется ENV-default.

### 11.2 Frontend feature flag

`VITE_FEATURES_BULK_OPS=true` — скрывает точку входа в wizard целиком (fallback — старый `BulkActionsBar`).

---

## 12. Метрики и наблюдаемость

Экспорт в `/metrics` (Prometheus):

- `bulk_op_total{type,status}` counter
- `bulk_op_duration_seconds{type}` histogram
- `bulk_op_items_total{status}` counter
- `bulk_op_queued_depth` gauge
- `bulk_op_processor_ticks_total{result=ok|skipped|locked}` counter

Алёрты:

- `bulk_op_queued_depth > 10` on 5m → *warning* (processor может зависнуть)
- `bulk_op_processor_ticks_total{result=locked} rate > 0.5 /s` for 5m → *warning* (два инстанса борются за лок)

---

## 13. План реализации (PR / ветки / merge plan)

### 13.1 Стратегия

- **База:** все ветки создаются от свежего `main`, PR-ы мерджатся напрямую в `main` (консистентно с TTSRH-1 / TTMP-160).
- **Именование веток:** `ttbulk-1/<scope>`.
- **Имя коммита:** `feat(bulk-ops): TTBULK-1 PR-<N> — <summary>` / `feat(admin): …` / `chore(bulk-ops): …`.
- **Feature flag (cutover gate):**
  - Backend — `FEATURES_BULK_OPS=false` по умолчанию до PR-12 (UAT cutover); консистентно с `FEATURES_ADVANCED_SEARCH` в `shared/features.ts`. При `false` роут `/api/bulk-operations/*` не монтируется → fall-through 404.
  - Frontend — `VITE_FEATURES_BULK_OPS=false`. При `false` кнопка «Массовые операции» в `BulkActionsBar` и маршрут `/operations` скрыты.
  - Оба флага переводятся в `true` в PR-12 (единый UAT-коммит с docs и e2e).
- **Kill-switch (ops):** `BULK_OP_PROCESSOR_ENABLED=true` (default) — читается в PR-4 при регистрации processor-cron'а. Позволяет остановить фоновую обработку без rebuild'а (для incident-response), независимо от feature-flag'а.
- **Размер PR:** целимся 400–900 строк diff. PR-4, PR-5, PR-9 потенциально крупнее — при 1000+ строк разбиваем на два follow-up'а.
- **CI:** каждый PR — `npm run lint` (0 errors, 0 новых warnings), `npx tsc --noEmit`, `npm run test:parser` + `test:bulk-ops` (новый pure-unit script, добавляется в PR-3), Playwright e2e (PR-9+).
- **Pre-push review gate:** каждый PR проходит `pre-push-reviewer` агента ДО push'а. 🟠+🟡 фиксы — follow-up коммит `chore(bulk-ops): TTBULK-1 PR-<N> — pre-push review fixups`.
- **Security-review gate:** merge PR-1 (схема + миграция enum), PR-3 (DTO + rate-limit + idempotency), PR-4 (transaction-granularity + per-item RBAC), PR-5 (per-executor RBAC × 6 + DELETE double-check ISSUE_DELETE) требует apprоv'а отдельного security-review человека.
- **Миграции:** каждая Prisma-миграция — отдельный PR (PR-1), `prisma migrate deploy` проверяется на staging перед follow-up PR-2+.
- **Staging deploy:** авто-деплой на `main` после merge (см. memory-rule `feedback_deploy_staging.md`). Smoke-check по чек-листу PR.
- **Version history:** каждый PR обновляет `docs/version_history.md` в том же коммите (memory-rule `feedback_version_history.md`).

**Уточнение к §5.4 ТЗ (расхождение с фактическим состоянием кода):**
ТЗ упоминает «существующую таблицу `IssueHistory`» — в репозитории такой Prisma-модели нет. `executeTransition`, `assignIssue`, `updateIssue` сейчас пишут в таблицу `AuditLog` (`audit_logs`). Поэтому:
- колонка `bulkOperationId String?` добавляется к `AuditLog`, а не к несуществующему `IssueHistory`.
- UI-бейдж «Массовая операция #N» в §5.4 / §8 рендерится на базе `AuditLog`-записей с `bulkOperationId IS NOT NULL`.
- Forensics-SQL в §7.4 обновляется аналогично (audit_logs вместо issue_history).

Этот delta фиксируется в PR-1 (миграция) и в обновлении §5.0/§5.4 ТЗ (sanitizing pass в PR-12 docs).

### 13.2 DAG зависимостей

```
PR-1 (schema + enums + BulkOperation + UserGroupSystemRole + AuditLog.bulkOperationId)
  │
  ├─► PR-2 (getEffectiveUserSystemRoles + auth middleware + Redis TTL-cache)
  │     │
  │     └─► PR-3 (DTO + service: preview/create/get/cancel + Redis pending queue + previewToken)
  │           │
  │           ├─► PR-4 (TransitionExecutor + processor cron + recovery + retention sweep + AuditLog.bulkOperationId via request-context)
  │           │     │
  │           │     └─► PR-5 (Assign/EditField/EditCustomField/MoveToSprint/AddComment/Delete executors)
  │           │
  │           └─► PR-9 (Wizard Modal — 4 steps, preview/conflicts UI; statics против stub-service)
  │
  │     PR-4 ─► PR-6 (SSE + Redis pub/sub + report.csv + retry-failed — processor публикует event'ы)
  │
  └─► PR-7 (System settings maxConcurrentPerUser/maxItems)  [parallel с 3–6]
  └─► PR-8 (Admin UI BULK_OPERATOR role + assignments)       [parallel с 3–6]

PR-6 + PR-9 ─► PR-10 (ProgressDrawer + SSE hook + floating chip + zustand store)
PR-10       ─► PR-11 (/operations page + retry button + AuditLog badge в UI карточки задачи)
PR-5 + PR-7 + PR-8 + PR-11 ─► PR-12 (E2E + k6 + docs + feature-flag cutover: flip BULK_OP_PROCESSOR_ENABLED + VITE_FEATURES_BULK_OPS)
PR-12 ─► PR-13 (metrics + grafana + алёрты)
```

Параллелизм: после merge PR-3 — PR-7, PR-8, PR-9 идут параллельно с PR-4/PR-5 (frontend stubs mock-тестами против service-stub). PR-6 сдвинут за PR-4 — processor должен существовать, иначе SSE подписывается на пустой Redis-channel. PR-13 — независимая observability-доводка после cutover.

### 13.3 PR-ы Фазы 0 — Schema (~4ч)

#### PR-1: Prisma migration — models + BULK_OPERATOR enum + UserGroupSystemRole + AuditLog.bulkOperationId
- **Branch:** `ttbulk-1/schema`
- **Scope:** (§5.1, §5.4 с учётом delta)
  - Миграция `YYYYMMDDHHMMSS_ttbulk_bulk_operations` — двухшаговая (R5):
    1. `ALTER TYPE "SystemRoleType" ADD VALUE 'BULK_OPERATOR'` — отдельный SQL-блок перед Prisma-генерацией (new value не используется в той же транзакции).
    2. `CREATE TYPE` для `BulkOperationType`, `BulkOperationStatus`, `BulkItemOutcome`.
    3. `CREATE TABLE bulk_operations`, `bulk_operation_items`, `user_group_system_roles`.
    4. `ALTER TABLE audit_logs ADD COLUMN bulk_operation_id UUID REFERENCES bulk_operations(id) ON DELETE SET NULL` + индекс.
  - `backend/src/prisma/schema.prisma` — модели `BulkOperation`, `BulkOperationItem`, `UserGroupSystemRole`, новое значение `SystemRoleType.BULK_OPERATOR`, `AuditLog.bulkOperationId`.
  - Feature-flag `FEATURES_BULK_OPS=false` в `backend/src/shared/features.ts` (паттерн `advancedSearch`) + `VITE_FEATURES_BULK_OPS=false` в `frontend/src/lib/features.ts` и `frontend/.env.example`.
  - Пустой модуль `backend/src/modules/bulk-operations/` с `bulk-operations.router.ts` (на PR-1 — stub-ping → 501 `Not Implemented`); условный mount в `app.ts` под `if (features.bulkOps)` — при выключенном флаге роут не существует → 404.
  - `prisma generate`, `make test` (регрессии existing).
- **Не включает:** ни preview-логику, ни executor'ов, ни UI — только схема + инфраструктура.
- **Merge-ready check:** миграция применяется/откатывается на чистой БД; `SELECT 'BULK_OPERATOR'::"SystemRoleType"` работает; при `FEATURES_BULK_OPS=false` `/api/bulk-operations/*` → 404; при `true` — `/api/bulk-operations/ping` → 501.
- **Security-review:** схема + миграция (FK, on-delete-policy, индексы).
- **Оценка:** ~4ч.

### 13.4 PR-ы Фазы 1 — Auth + Service core (~16ч)

#### PR-2: getEffectiveUserSystemRoles + auth middleware + Redis TTL-cache
- **Branch:** `ttbulk-1/auth-effective-roles`
- **Scope:** (§5.5)
  - `backend/src/shared/auth/roles.ts` — новая функция `getEffectiveUserSystemRoles(userId)` (DIRECT ∪ GROUP).
  - `backend/src/shared/middleware/auth.ts` — при построении `req.user.systemRoles` используем effective resolver.
  - Redis TTL-cache `user:sysroles:{userId}` 60с; invalidation:
    - `POST /admin/users/:id/system-roles` / `DELETE …`
    - `POST /admin/groups/:id/system-roles` (новый endpoint stub — реальная UI в PR-8)
    - `POST /admin/groups/:id/members` (добавление/удаление члена группы).
  - Unit T-1: DIRECT only, GROUP only, DIRECT+GROUP union, SUPER_ADMIN bypass.
  - Unit T-2: cache-hit/miss, invalidation timing.
- **Не включает:** UI для назначений (PR-8), ни endpoint'ы самих bulk-операций.
- **Merge-ready check:** регрессий в existing RBAC-тестах нет; T-1/T-2 зелёные; cache TTL не течёт (мок timer'а).
- **Оценка:** ~4ч.

#### PR-3: DTO + service (preview/create/get/cancel) + Redis pending queue + previewToken
- **Branch:** `ttbulk-1/service-core`
- **Scope:** (§4.1–§4.4, §5.0)
  - `backend/src/modules/bulk-operations/bulk-operations.dto.ts` — Zod schemas (scope, operationPayload, preview, create, retry-failed).
  - `backend/src/modules/bulk-operations/bulk-operations.types.ts` — `BulkExecutor<P>` interface + `PreflightResult` discriminated union (типы нужны уже в PR-3 для executor-stub'ов; реализации executor'ов — в PR-4/PR-5).
  - `backend/src/modules/bulk-operations/bulk-operations.service.ts`:
    - `previewBulkOperation({ scope, payload, actor })` — резолв scope → issueIds (scope=ids / scope=jql через `search.service`), silent-truncate при > `maxItems` + warning; generate `previewToken` (UUID), сохранить SET в Redis `bulk-op:preview:{token}` TTL 15мин с { userId, operationType, payload, issueIds }; Executor-stub'ы — preflight возвращает ELIGIBLE для всех.
    - `createBulkOperation({ previewToken, idempotencyKey, conflictResolutions, actor })` — валидирует token (owner check), создаёт `BulkOperation` в БД, инициализирует Redis pending-list `bulk-op:{id}:pending` — `RPUSH` issueIds, возвращает `{ id, status: 'QUEUED' }`. Concurrency check (max 3 per user).
    - `getBulkOperation(id, actor)` — 404 если чужая.
    - `cancelBulkOperation(id, actor)` — `UPDATE SET cancel_requested = true`, событие в Redis pub/sub канал.
  - `backend/src/modules/bulk-operations/bulk-operations.router.ts` — роуты `preview`, `create`, `get`, `cancel`, `list`; rate-limit middleware 30/min/user; `authenticate` + `requireRole('BULK_OPERATOR')`.
  - Feature-flag mount в `app.ts` (404 при `BULK_OP_PROCESSOR_ENABLED=false`).
  - `npm run test:bulk-ops` — новый pure-unit script в `package.json` (Redis mock).
  - Integration T-3 (preview → create flow; idempotency; token expiry; quota 429).
- **Не включает:** executor'ов (preflight в PR-3 — stub ELIGIBLE), processor'а, SSE, CSV report, retry-failed endpoint.
- **Merge-ready check:** T-3 зелёные; `POST /preview` возвращает валидный token на 100 задач за <200ms; concurrency quota 3 enforced с 429; security-review gate пройден (raw-SQL отсутствует; RBAC на всех роутах).
- **Security-review:** DTO boundary + rate-limit + idempotency uniqueness (userId, key) + previewToken owner check.
- **Оценка:** ~12ч.

### 13.5 PR-ы Фазы 2 — Processor + Executors (~28ч)

#### PR-4: TransitionExecutor + processor cron + recovery + retention sweep + AuditLog.bulkOperationId via request-context
- **Branch:** `ttbulk-1/processor`
- **Scope:** (§5.4, §6.1–§6.4)
  - `backend/src/modules/bulk-operations/executors/transition.executor.ts` — preflight (NO_ACCESS / NO_TRANSITION / WORKFLOW_REQUIRED_FIELDS / ALREADY_IN_TARGET_STATE) + execute (вызов `workflowEngine.executeTransition` от имени `actor`).
  - `backend/src/modules/bulk-operations/bulk-operations.processor.ts`:
    - cron `BULK_OP_TICK_CRON` (default `*/5 * * * * *`) — 6-field.
    - Redis-lock `bulk-ops:tick` (паттерн `checkpoint-scheduler.service.ts`).
    - Pick 1 operation `status IN ('QUEUED','RUNNING') AND NOT cancel_requested ORDER BY created_at ASC LIMIT 1`.
    - Batch `LPOP bulk-op:{id}:pending 25`; для каждого item: preflight → execute (транзакция Prisma с actor-context через `AsyncLocalStorage` из `request-context.ts`, добавить поле `bulkOperationId`); on fail — insert `BulkOperationItem` (FAILED/SKIPPED) + increment counters; heartbeat каждую сек.
    - Cancel между пачками → finalize CANCELLED; все оставшиеся → SKIPPED + `errorCode='CANCELLED_BY_USER'`.
    - Finalize → SUCCEEDED / PARTIAL / FAILED + AuditLog `bulk_operation.completed`.
  - Recovery cron (`BULK_OP_RECOVERY_STALE_SECONDS=300`): stale `RUNNING` → reset to `QUEUED`.
  - Retention cron `BULK_OP_RETENTION_CRON=30 3 * * *`: DELETE items > 30d, DELETE operations > 90d. **Важно:** если PR-4 разобьётся по размеру (>1000 строк diff), retention cron выделяется в отдельный follow-up PR (чтобы не пропасть в split'е) — но сейчас он обязательный элемент scope-checklist'а этой карточки.
  - `shared/middleware/request-context.ts` — добавление `bulkOperationId` в контекст; `audit` helper (используется существующими сервисами) читает его и пишет в `AuditLog.bulkOperationId`.
  - Unit T-4: preflight-матрица для transition; batching; cancel mid-flight; recovery.
  - Integration T-5: полный flow 10 items + cancel + recovery. Использует паттерн существующих integration-тестов репозитория (vitest против CI-provisioned Postgres), **не testcontainers** — устанавливать testcontainers в рамках этого PR не будем (инфраструктурная задача на будущее). Если CI-Postgres недоступен локально — разработчик прогоняет unit-слой, CI — integration.
- **Не включает:** остальные 6 executor'ов (PR-5); SSE pub/sub (PR-6); retry-failed endpoint (PR-6).
- **Merge-ready check:** T-4/T-5 зелёные; locally processor-loop обрабатывает 100 items transition за <30s без утечек Redis-коннекций; recovery срабатывает после убитого инстанса.
- **Security-review:** per-item `assertProjectPermission` в `transition.executor.ts`; transaction scope (preflight+execute в одной Prisma-транзакции); actor-context propagation.
- **Оценка:** ~14ч.

#### PR-5: Остальные 6 executors (Assign / EditField / EditCustomField / MoveToSprint / AddComment / Delete)
- **Branch:** `ttbulk-1/executors`
- **Scope:** (§6.1, §9.2)
  - `executors/assign.executor.ts` — preflight (NO_ACCESS / cross-project ok); execute через `issues.assignIssue`.
  - `executors/edit-field.executor.ts` — dispatcher по `field`: priority / dueDate / labels.add / labels.remove / description.append; execute через `issues.updateIssue`.
  - `executors/edit-custom-field.executor.ts` — preflight (INVALID_FIELD_SCHEMA / TYPE_MISMATCH); execute через `issue-custom-fields.setValue`.
  - `executors/move-to-sprint.executor.ts` — preflight (SPRINT_PROJECT_MISMATCH); execute через `sprints.addIssuesToSprint`.
  - `executors/add-comment.executor.ts` — preflight noop; execute через `comments.createComment`.
  - `executors/delete.executor.ts` — preflight (project-permission ISSUE_DELETE); execute через `issues.deleteIssue`.
  - Реестр executor'ов `executors/index.ts` — `getExecutor(type): BulkExecutor`.
  - Unit T-6: preflight-матрица для каждого executor'а (happy, NO_ACCESS, type-specific skip/conflict).
  - Integration T-7: один тест flow для каждого типа на 3 items с cross-project выборкой.
- **Не включает:** SSE/report/retry.
- **Merge-ready check:** T-6/T-7 зелёные; per-item RBAC покрыт во всех 6 executor'ах; DELETE требует `ISSUE_DELETE` permission (security-review checklist); **security-review approver подписал**.
- **Security-review:** per-executor RBAC (все 6 executor'ов) + DELETE double-check (системная `BULK_OPERATOR` + project-level `ISSUE_DELETE`).
- **Оценка:** ~14ч.

### 13.6 PR-ы Фазы 3 — Streaming + Admin + Wizard (~30ч)

#### PR-6: SSE endpoint + Redis pub/sub + report.csv + POST /:id/retry-failed
- **Branch:** `ttbulk-1/streaming-report`
- **Scope:** (§4.5, §6.6, §9.1)
  - `bulk-operations.router.ts` — расширение:
    - `GET /:id/stream` (SSE, `Content-Type: text/event-stream`, `X-Accel-Buffering: no`, heartbeat 20s).
    - Redis subscriber на `bulk-op:{id}:events` → forward в SSE stream. **Важно:** создаётся отдельный subscriber-клиент через `redisClient.duplicate()` — shared-singleton из `shared/redis.ts` нельзя переиспользовать: `redis` v5 при subscribe переводит connection в эксклюзивный pub/sub-режим и блокирует обычные команды.
    - `GET /:id/report.csv` — streaming через `@fast-csv/format`, 1000-row pages. **Dep:** PR-6 добавляет `@fast-csv/format` в `backend/package.json` (не входит в существующие зависимости).
    - `POST /:id/retry-failed` — создание новой операции с scope=ids из failed items предыдущей; проверка retention (items ≤ 30d).
  - `bulk-operations.processor.ts` — публикация событий `progress` / `status` / `item` / `heartbeat` в Redis channel.
  - Integration T-8: SSE client subscribes → receives progress + status events; report.csv format валиден; retry-failed создаёт operation с правильным scope.
- **Не включает:** Frontend SSE hook (PR-10).
- **Merge-ready check:** T-8 зелёные; stream не утекает при disconnect (cleanup subscriber); retry-failed с просроченными items → 410 Gone.
- **Оценка:** ~8ч.

#### PR-7: System settings maxConcurrentPerUser / maxItems + AdminSystemPage UI
- **Branch:** `ttbulk-1/system-settings`
- **Scope:** (§11.1)
  - Backend: `GET/PATCH /api/admin/system-settings/bulk-operations` — Zod-валидация `maxConcurrentPerUser` (1..20) и `maxItems` (100..50000). Хранение в `SystemSetting.key='bulk_operations'` как JSON.
  - Service `getBulkOpsSettings()` с in-memory + 60s-кэшем, используется в `service.createBulkOperation` и `service.previewBulkOperation`.
  - Frontend: секция «Массовые операции» в `AdminSystemPage.tsx` — два number input + save. Modal close → refresh (CLAUDE.md правило).
  - Unit T-9: clamp значений, fallback на ENV-default.
- **Не включает:** UI wizard / drawer.
- **Merge-ready check:** PATCH сохраняет значение, `createBulkOperation` с `scope.issueIds.length > maxItems` возвращает 400; concurrency-quota применяется без рестарта.
- **Оценка:** ~4ч.

#### PR-8: Admin UI — BULK_OPERATOR role + assignments (direct + via groups)
- **Branch:** `ttbulk-1/admin-roles`
- **Scope:** (§7.2)
  - Backend: `POST /admin/groups/:id/system-roles`, `DELETE /admin/groups/:id/system-roles/:role`; `GET /admin/system-roles/:role/assignments` → `{ users, groups }`.
  - `BULK_OPERATOR` в списке системных ролей (`AdminRolesPage.tsx`) с описанием «высокий blast-radius».
  - Две таблицы «Напрямую» / «Через группы» с add/remove actions. Modal close → refresh.
  - Секция «Системные роли группы» в `AdminGroupDetailPage.tsx` рядом с «Project roles».
  - Audit-event `system_role.granted|revoked` (уже есть — покрываем groups-path'ом).
  - Integration T-10: group-assign → getEffectiveUserSystemRoles возвращает роль у member'а; remove → invalidation кэша.
- **Не включает:** не меняем UserSystemRole DIRECT-assign UI (уже есть).
- **Merge-ready check:** T-10 зелёные; UI обе таблицы отображают assignments; cache invalidation срабатывает.
- **Оценка:** ~8ч.

#### PR-9: BulkOperationWizardModal (4 шага, preview/conflicts UI)
- **Branch:** `ttbulk-1/wizard-modal`
- **Scope:** (§3.2, §8.1)
  - `frontend/src/components/bulk/BulkOperationWizardModal.tsx` + 4 step-компонента `Step1PickOperation.tsx`, `Step2Configure.tsx`, `Step3Preview.tsx`, `Step4Confirm.tsx`.
  - `frontend/src/api/bulkOperations.ts` — typed client `preview`, `create`, `get`, `cancel`, `listMine`, `retryFailed`, `downloadReport`.
  - `frontend/src/types/bulk.types.ts` — типы, enum'ы, валидационные схемы (зеркало backend DTO).
  - Integration с `BulkActionsBar.tsx`: добавляем prop `{ jql, total, allowedOperations }`; кнопка «Массовые операции» открывает wizard.
  - Preview-рендер: virtualized-списки (`react-window`) на 3 секции (eligible/skipped/conflicts), сворачиваемые, 300 items + «показать ещё». **Dep:** PR-9 добавляет `react-window` + `@types/react-window` в `frontend/package.json` (не входит в существующие зависимости, несмотря на устаревшее упоминание в §3.3 ТЗ).
  - Conflicts с inline-controls (INCLUDE/EXCLUDE/USE_OVERRIDE) — state через useReducer.
  - DELETE scope-confirm phrase gate.
  - Manual smoke: все 7 операций на seed-данных 10 items.
- **Не включает:** progress drawer / chip / `/operations` (PR-10/11).
- **Merge-ready check:** wizard открывается, preview возвращает корректный счётчик, submit возвращает `{ id, status: 'QUEUED' }`; Modal close на шагах 1-3 → `void load()` на `SearchPage` (CLAUDE.md правило).
- **Оценка:** ~14ч.

### 13.7 PR-ы Фазы 4 — Progress + Operations page + Cutover (~20ч)

#### PR-10: BulkOperationProgressDrawer + SSE hook + floating chip + zustand store
- **Branch:** `ttbulk-1/progress-drawer`
- **Scope:** (§3.3, §8.3)
  - `frontend/src/components/bulk/useBulkOperationStream.ts` — hook SSE + polling fallback (2s) при разрыве. **Dep:** PR-10 добавляет `eventsource-polyfill` в `frontend/package.json` (нативный `EventSource` не шлёт кастомные headers — нужен для auth через `Authorization: Bearer`; обходится polling-fallback'ом, но polyfill улучшает UX в corp-proxy).
  - `frontend/src/components/bulk/BulkOperationProgressDrawer.tsx` — `width=420`, status badge, ProgressBar, live-счётчики, ETA, кнопки Cancel / Collapse, inline-report первых 10 ошибок, «Скачать CSV», «Перейти к /operations».
  - `frontend/src/store/bulkOperations.store.ts` — zustand: активные операции юзера, подписки, текущий drawer state.
  - `frontend/src/components/bulk/BulkOperationChips.tsx` + mount в `AppLayout.tsx` — floating chip снизу-справа для каждой активной операции.
  - Wizard submit → collapse в drawer + push в store.
  - Manual smoke: full flow (wizard → submit → drawer → SSE progress → report).
- **Не включает:** `/operations` страница (PR-11).
- **Merge-ready check:** SSE подключается и получает события; polling fallback работает при блокировке EventSource; chip остаётся при смене страницы; drawer onClose → refresh `SearchPage` (CLAUDE.md правило).
- **Оценка:** ~8ч.

#### PR-11: /operations page + retry-failed UI + AuditLog badge в UI карточки задачи
- **Branch:** `ttbulk-1/operations-page`
- **Scope:** (§3.4, §5.4, §7.4)
  - `frontend/src/pages/OperationsPage.tsx` — таблица моих операций за 30 дней, колонки дата/тип/scope/progress/status/actions.
  - Route `/operations` (navigation sidebar-link виден при `VITE_FEATURES_BULK_OPS=true`).
  - «Retry failed» кнопка — создаёт новую операцию с предзаполненным payload, открывает progress drawer.
  - Админский filter «Все операции» (видим при `systemRoles.includes('ADMIN'|'SUPER_ADMIN')`).
  - В UI карточки задачи (`frontend/src/pages/IssuePage.tsx`) — вкладка History: при наличии `bulkOperationId` у записи AuditLog — бейдж «Массовая операция #N» с переходом на `/operations/:id`.
  - `GET /operations/:id` — детальная страница (payload summary, scope summary, report link, retry button).
- **Не включает:** cutover флагов (PR-12).
- **Merge-ready check:** page рендерит список, retry работает, бейдж в History UI рендерится и кликается на `/operations/:id`.
- **Оценка:** ~8ч.

#### PR-12: E2E + k6 + docs + feature-flag cutover
- **Branch:** `ttbulk-1/e2e-docs-cutover`
- **Scope:** (§10.3–§10.4, §5.4, §7.4)
  - `frontend/e2e/specs/15-bulk-operations.spec.ts` — 4 сценария (§10.3).
  - `backend/tests/bulk-operations-load.k6.js` — 100 параллельных юзеров × 100 items.
  - `docs/user-manual/bulk-operations.md` — пользовательская инструкция со скриншотами (все 7 операций + retry + cancel + как найти изменение в истории задачи).
  - `docs/OPERATIONS_RUNBOOK.md` — раздел «Forensics для массовых операций» с SQL-примерами (§7.4) + операционные алёрты.
  - Обновление §5.0/§5.4 ТЗ — sanitize `IssueHistory` → `AuditLog` (docs-correction).
  - **Cutover:** `FEATURES_BULK_OPS=true` в `backend/src/shared/features.ts` default; `VITE_FEATURES_BULK_OPS=true` в `frontend/.env` + `.env.staging`.
  - Manual UAT по чек-листу §15 (все 17 пунктов).
- **Не включает:** metrics/alerts (PR-13).
- **Merge-ready check:** все e2e зелёные; k6 p95 < 60s; feature-flag flip не ломает legacy `BulkStatusWizardModal` на Sprint-борде.
- **Оценка:** ~12ч.

### 13.8 PR-ы Фазы 5 — Observability (~4ч)

#### PR-13: Metrics + grafana dashboard + алёрты
- **Branch:** `ttbulk-1/metrics`
- **Scope:** (§12)
  - Prometheus `/metrics`: `bulk_op_total{type,status}`, `bulk_op_duration_seconds{type}`, `bulk_op_items_total{status}`, `bulk_op_queued_depth`, `bulk_op_processor_ticks_total{result}`.
  - `deploy/grafana/dashboards/bulk-operations.json` — panel layout.
  - Алёрты в `deploy/prometheus/alerts.yml`: `bulk_op_queued_depth>10` 5m warning; `bulk_op_processor_ticks_total{result="locked"} rate>0.5/s` 5m warning.
- **Не включает:** PagerDuty/Opsgenie integration — отдельная задача.
- **Merge-ready check:** `/metrics` вручную curl — все counters/gauges присутствуют; dashboard json валидный (Grafana CLI import).
- **Оценка:** ~4ч.

### 13.9 Итог: список PR

**Легенда статусов:** 📋 Планируется · 🚧 В работе · ✅ Done · 🟢 Merged

| №  | Branch                          | Scope (коротко)                                              | Часы | Зависимости       | Сабтаски           | Статус        |
|----|---------------------------------|--------------------------------------------------------------|------|-------------------|--------------------|---------------|
| 1  | `ttbulk-1/schema`               | Prisma models + enums + UserGroupSystemRole + AuditLog.bulkOperationId + feature-flag scaffolding | 4    | —                 | migration + mount  | 🟢 Merged (#143) |
| 2  | `ttbulk-1/auth-effective-roles` | `getEffectiveUserSystemRoles` + auth middleware + Redis cache | 4    | PR-1              | resolver + tests   | 🟢 Merged (#144) |
| 3  | `ttbulk-1/service-core`         | DTO + preview/create/get/cancel + Redis pending queue + previewToken | 12   | PR-2              | service + router   | 🟢 Merged (#145) |
| 4  | `ttbulk-1/processor`            | TransitionExecutor + processor cron + recovery + retention + AuditLog.bulkOperationId | 14   | PR-3              | executor + processor | 🟢 Merged (#146) |
| 5  | `ttbulk-1/executors`            | 6 executors (Assign/EditField/EditCustomField/MoveToSprint/AddComment/Delete) | 14   | PR-4              | per-executor + tests | 🟢 Merged (#147) |
| 6  | `ttbulk-1/streaming-report`     | SSE + Redis pub/sub + report.csv + retry-failed              | 8    | PR-3, PR-4        | router + processor hook | 🟢 Merged (#148) |
| 7  | `ttbulk-1/system-settings`      | maxConcurrentPerUser / maxItems API + AdminSystemPage UI     | 4    | PR-3              | backend + UI       | 🟢 Merged (#149) |
| 8  | `ttbulk-1/admin-roles`          | BULK_OPERATOR in admin roles UI + group-assign endpoints     | 8    | PR-2              | endpoints + UI     | 🟢 Merged (#150) |
| 9a | `ttbulk-1/wizard-modal-a`       | types + api client + wizard skeleton + Step1 + BulkActionsBar кнопка | 6 | PR-3 | types + api + skeleton | 🟢 Merged (#151) |
| 9b | `ttbulk-1/wizard-modal-b`       | Step2 (config) + Step3 (preview/virtualized) + Step4 (confirm/submit) + conflicts + react-window | 8 | PR-9a | step components | 🟢 Merged (#152) |
| 10 | `ttbulk-1/progress-drawer`      | ProgressDrawer + SSE hook + floating chip + zustand store    | 8    | PR-6, PR-9        | hook + drawer + chip | 📋 Планируется |
| 11 | `ttbulk-1/operations-page`      | /operations page + retry UI + AuditLog badge in IssuePage    | 8    | PR-10             | page + badge       | 📋 Планируется |
| 12 | `ttbulk-1/e2e-docs-cutover`     | Playwright + k6 + docs + feature-flag flip + UAT             | 12   | PR-5, PR-7, PR-8, PR-11 | e2e + docs + cutover | 📋 Планируется |
| 13 | `ttbulk-1/metrics`              | Prometheus metrics + grafana dashboard + алёрты              | 4    | PR-12             | metrics + alerts   | 📋 Планируется |

**Итого:** ≈ 114 часов ≈ 14.25 человеко-дней (близко к оригинальной оценке 13.5 д — разница за счёт детализации PR-3/PR-9 и явного выделения security-review gate'ов).

**Критический путь:** PR-1 → PR-2 → PR-3 → PR-4 → PR-5 → PR-12 → PR-13 ≈ 64ч. Параллелизуемое: PR-7 / PR-8 / PR-9 после PR-3; PR-6 после PR-4 (processor публикует event'ы); PR-10 после PR-6+PR-9; PR-11 после PR-10.

---

## 14. Риски и открытые вопросы

| # | Риск | Митигация |
|---|------|-----------|
| R1 | node-cron worker не tick'ает в multi-instance deploy — races | Redis lock уже используется в `checkpoint-scheduler.service.ts`; повторяем pattern |
| R2 | 10 000 transitions × per-issue webhook'и × 1 сек = 2.7 ч | Batch-size 25, pause опциональный, webhook'и (gitlab/audit) уже асинхронные |
| R3 | Юзер запустил операцию и закрыл вкладку — drawer исчез | `bulkOperations.store` + floating chip в `AppLayout` делают операции видимыми при возврате на любую страницу |
| R4 | JQL scope меняется со временем: через 10 мин задача переместилась в другой проект | preview резолвит ID'шники снапшотом, execute работает по тем же ID; новые задачи не подтягиваются |
| R5 | `ALTER TYPE SystemRoleType ADD VALUE` в старой Postgres | Проверить мин. версию Postgres в `deploy/`; PG ≥ 12 поддерживает без блокировок |
| R6 | Конфликт с существующим `BulkStatusWizardModal` | В фазе 1 оставляем оба; в фазе 2 — рефактор существующего на новый движок (deprecation) |
| R7 | `EDIT_CUSTOM_FIELD` на задачах из разных FieldSchemas — поле доступно в одном проекте и нет в другом | Задачи без поля помечаются skip=`INVALID_FIELD_SCHEMA`, показывается в preview |

**Согласованные с заказчиком решения (2026-04-23):**

1. ~~Email-notify в Phase 1?~~ → **Phase 2**. Убрано из DTO, схемы, UI wizard'а.
2. ~~Retry failed в Phase 1?~~ → **Да, в Phase 1.** Endpoint `POST /:id/retry-failed` + кнопка в отчёте и на `/operations`.
3. ~~Concurrent limit — константа или настройка?~~ → **Настройка в админке** (`AdminSystemPage` → System settings). ENV — только default.
4. ~~Какой срок хранения?~~ → **Минимизировать.** `BulkOperation` — 90 дней (факт запуска + счётчики); `BulkOperationItem` — только failed/skipped, 30 дней; succeeded items не персистятся — их diff в `IssueHistory`. Для расследований — связка `IssueHistory.bulkOperationId` + audit log. Инструкции по forensics — в `docs/user-manual/bulk-operations.md` + `docs/OPERATIONS_RUNBOOK.md` (см. §7.4).
5. ~~JQL scope > 10 000 — 400 или truncate?~~ → **Silent truncate + warning** на шагах 1 и 3 wizard'а. 400 остаётся только для scope=ids (API-клиенты должны сами разбивать).
6. ~~DELETE в Phase 1?~~ → **Да.** С confirm-phrase «DELETE» и red primary-кнопкой.
7. ~~Cross-project Assign/EditField работают, cross-project Move — нет?~~ → **Подтверждено.**

_Если возникнут новые открытые вопросы в ходе реализации — заводятся как отдельные вопросы в PR-review._

---

## 15. Критерии приёмки

- [ ] Пользователь с ролью `BULK_OPERATOR` видит на `/search` кнопку «Массовые операции», без роли — не видит.
- [ ] Wizard имеет 4 шага; каждый шаг навигируем назад; Esc/× закрывает wizard до submit без побочных эффектов.
- [ ] Preview возвращает точные счётчики для scope=ids (≤ max) и scope=jql (≤ max, при превышении — silent-truncate с warning).
- [ ] Каждая из 7 операций (Transition/Assign/EditField/EditCustomField/MoveToSprint/AddComment/Delete) работает корректно на выборке 100 задач + кросс-проектной (кроме Move — только within project).
- [ ] При ошибках per-item пользователь видит в отчёте код + читаемое сообщение (не stack trace, не 500).
- [ ] Прогресс в drawer обновляется каждые ≤ 2 сек, ETA есть.
- [ ] Cancel срабатывает ≤ 10 сек после клика, оставшиеся items — SKIPPED/CANCELLED_BY_USER.
- [ ] Recovery: killing API instance mid-flight → после рестарта операция продолжается и завершается.
- [ ] Роль `BULK_OPERATOR` назначается юзеру и группе через admin-UI; эффективные роли резолвятся объединением (DIRECT ∪ GROUP).
- [ ] **Retry failed**: после терминального `PARTIAL` операции кнопка «Повторить ошибки» создаёт новую операцию с scope=ids из failed items, с тем же payload. Работает до истечения retention item'ов.
- [ ] **Settings в админке**: `maxConcurrentPerUser` и `maxItems` меняются через UI, применяются без рестарта, превышение блокируется с корректным 429/warning.
- [ ] **Retention**: через N дней (30/90) cron-зачистка удаляет item'ы / операции; инвариант — `IssueHistory` для succeeded items остаётся.
- [ ] **`AuditLog.bulkOperationId`**: каждая запись audit-log'а, сделанная через bulk-операцию (фактический аналог `IssueHistory` в данном репозитории — см. §13.1 delta), помечена колонкой `bulk_operation_id`; UI карточки задачи (вкладка History) показывает бейдж «Массовая операция #N» с переходом на `/operations/:id`.
- [ ] **Audit forensics**: в `docs/OPERATIONS_RUNBOOK.md` приведены 3+ сценария поиска изменений, внесённых через bulk (по задаче, по операции, по юзеру+времени после истечения retention).
- [ ] Audit-лог содержит создание/завершение/отмену каждой операции.
- [ ] CSV-отчёт скачивается для любой терминальной операции и содержит строку на каждый failed/skipped item (succeeded — не персистятся, в отчёте только сводка счётчиков).
- [ ] На выборке max_items (10 000) задач (transition) операция завершается за разумное время без таймаутов прокси (стрим SSE, job асинхронный).
- [ ] `/operations` показывает список моих операций с возможностью фильтрации по статусу.
