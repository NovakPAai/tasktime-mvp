# ТЗ: TTSRH-1 — Внутренний язык запросов TTS-QL (JQL-совместимый) + страница поиска задач с сохраняемыми фильтрами

---

## 1. Постановка задачи

В системе нет **глобального продвинутого поиска задач**. Текущая функциональность ограничена:

| Где | Что делает | Ограничение |
|-----|-----------|-------------|
| [backend/src/modules/issues/issues.router.ts:49](backend/src/modules/issues/issues.router.ts#L49) `GET /issues/search` | Подстрочный поиск по `title` + по `PROJECT-KEY` | Только для виджета связывания задач, 50 записей, без фильтров |
| [backend/src/modules/issues/issues.router.ts:74](backend/src/modules/issues/issues.router.ts#L74) `GET /projects/:projectId/issues` | Плоский фильтр: `status`/`priority`/`assigneeId`/`sprintId`/`from`/`to`/`search`/`issueTypeConfigId` | Только в рамках одного проекта, только AND, только equals/IN, без OR, без NOT, без кастомных полей, без связей |
| [frontend/src/pages/ProjectDetailPage.tsx](frontend/src/pages/ProjectDetailPage.tsx) — UI-фильтр | Выпадающие списки | Нельзя сохранить, нельзя разделить с командой, нет глобального вывода |

### Боль пользователя

1. **«Все мои задачи в ревью по трём проектам с приоритетом HIGH»** — приходится открывать каждый проект отдельно и глазами фильтровать.
2. **«Блокеры на этой неделе по моей команде»** — невозможно сформулировать (нет связей, нет команды, нет OR).
3. **«Задачи с кастомным полем ‘Story Points > 5’ из активного спринта»** — кастомные поля вообще не участвуют в фильтре.
4. **Повторный запрос** — фильтр нельзя сохранить; каждый раз кликаешь 6 выпадашек заново.
5. **Поделиться фильтром** — невозможно (URL не переживает изменения).
6. **Настроить колонки вывода** — жёсткий набор, нельзя добавить `Due date`, `Estimated` и кастомные поля.

### Цель

1. Реализовать **декларативный язык запросов TTS-QL** (TaskTime Query Language), максимально совместимый с **JQL** (JIRA Query Language) — те же имена операторов, функций, полей, приоритет парсинга. Это сокращает порог входа для команды, знакомой с Jira, и позволяет копировать существующие JQL-фильтры с минимальной адаптацией.
2. Вынести **поиск в отдельный пункт бокового меню** «Поиск задач» (`/search`), работающий поверх всех доступных пользователю проектов.
3. Сделать **форму поиска в UX-модели Jira Issue Navigator**:
   - Два режима: Basic (визуальный конструктор) + Advanced (текстовый TTS-QL с подсветкой и автодополнением).
   - Результаты — табличный вид с **конфигурируемыми колонками** (вкл. кастомные поля).
   - **Сохранение фильтров** с именем, описанием, режимами приватности (private / shared-with-users / public), избранным, шарингом по ссылке.
   - Избранные фильтры — быстрый доступ в левой панели и в сайдбаре (sub-menu).

---

## 2. Текущее состояние

### 2.1 Backend

- [backend/src/modules/issues/issues.service.ts:85-177](backend/src/modules/issues/issues.service.ts#L85-L177) — `listIssues(projectId, filters)` принимает плоский `ListIssuesFilters` с полями `status[]`, `issueTypeConfigId[]`, `priority[]`, `assigneeId`, `sprintId`, `from`/`to` (по `createdAt`), `search` (contains по `title`+`description`). Жёстко завязан на `projectId`.
- [backend/src/modules/issues/issues.service.ts:179-221](backend/src/modules/issues/issues.service.ts#L179-L221) — `searchIssuesGlobal(q, excludeId, projectIds)` — 50-записный поиск по `title`+`key`, без фильтров, без сортировки.
- **Нет** модели `SavedFilter`, нет `UserPreferences`, нет столбцовой кастомизации.
- **Нет** FTS-индексов (Postgres `tsvector`). Поиск по тексту — `contains` с `mode: 'insensitive'` (seq scan при большом объёме).
- Кастомные поля ([custom_fields](backend/src/prisma/schema.prisma#L658) + [issue_custom_field_values](backend/src/prisma/schema.prisma#L679)) в фильтре **не участвуют**.
- `IssueLink` (связи) — есть модель, но на фильтрацию не влияет.
- RBAC-фильтр по доступным проектам реализован в `/issues/search` ([issues.router.ts:57-65](backend/src/modules/issues/issues.router.ts#L57-L65)) — это единственный референсный паттерн, его переиспользовать.

### 2.2 Frontend

- [frontend/src/App.tsx](frontend/src/App.tsx) — роут `/search` отсутствует; нужно добавить новую страницу.
- [frontend/src/components/layout/Sidebar.tsx](frontend/src/components/layout/Sidebar.tsx) — сайдбар inline-SVG, паттерн копирования пункта понятен (Dashboard/Projects/Time с `data-testid="nav-*"`). Планируется вставить пункт **«Поиск задач»** между «Projects» и submenu «Planning». Sub-menu «Избранные фильтры» — раскрывается при активной странице или открытой submenu (аналог `planning-submenu`).
- [frontend/src/api/issues.ts:142-147](frontend/src/api/issues.ts#L142-L147) — `searchIssuesGlobal(q, excludeId)` — тонкая обёртка.
- **Нет** компонентов: `SearchPage`, `JqlEditor`, `BasicFilterBuilder`, `SavedFilterList`, `ColumnConfigurator`, `FilterShareModal`.
- **Нет** store `savedFilters.store.ts`.

### 2.3 БД / Prisma

- [backend/src/prisma/schema.prisma](backend/src/prisma/schema.prisma) — 54 модели, `Issue` широкий (status, priority, dueDate, estimatedHours, sprintId, releaseId, parentId, assigneeId, creatorId, workflowStatusId, issueTypeConfigId, aiEligible/aiExecutionStatus/aiAssigneeType).
- Нет модели `SavedFilter`, `FilterShare`, `UserPreferences` — придётся вводить.
- Нет истории изменения полей (`IssueHistory`/`FieldChangeLog`). Только `AuditLog` — сырой. Это ограничение для JQL-операторов `WAS`/`CHANGED` (см. разделы «Риски» и «Объём»).

---

## 3. Зависимости

### 3.1 Backend модули

- [ ] `search` — **новый модуль** `backend/src/modules/search/`:
  - `search.parser.ts` — токенизатор + парсер TTS-QL → AST.
  - `search.ast.ts` — типы AST (Node, Clause, Logical, Function, Literal).
  - `search.validator.ts` — семантическая валидация (field существует, operator совместим с типом поля, тип литерала подходит).
  - `search.compiler.ts` — AST → Prisma `Issue.findMany` `where` (+ raw-fragments для JSON-custom-field-value и для сложных текстовых клауз).
  - `search.functions.ts` — реализация функций (`currentUser()`, `now()`, `startOfDay()`, `openSprints()` и т.д.).
  - `search.schema.ts` — **реестр полей** (system + dynamically-discovered custom fields).
  - `search.suggest.ts` — автодополнение (поле/оператор/значение/функция).
  - `search.service.ts` — высокоуровневая `searchIssues(jql, ctx, pagination, columns?)` и `validate(jql, ctx)` + `suggest(jql, cursorOffset, ctx)`.
  - `search.router.ts` — роутер (`POST /api/search/issues`, `POST /api/search/validate`, `GET /api/search/suggest`, `POST /api/search/export`).
- [ ] `saved-filters` — **новый модуль** `backend/src/modules/saved-filters/`:
  - `saved-filters.dto.ts`, `saved-filters.service.ts`, `saved-filters.router.ts`.
  - CRUD, share, favorite, subscribe-to-changes (MVP без email-подписки).
- [ ] `users` — расширение: `GET/PATCH /api/users/me/preferences` для хранения дефолтных колонок и favorite фильтров (`preferences JSON` на `User`).

### 3.2 Frontend компоненты

- [ ] Новый роут `/search` (+ опциональный `/search/saved/:filterId`, `/search?jql=...&view=cards`).
- [ ] Пункт сайдбара **«Поиск задач»** между «Projects» и «Planning» (иконка — лупа, `data-testid="nav-search"`).
- [ ] Sub-menu «Избранные фильтры» раскрывается при раскрытии "Поиск задач" или на активной странице поиска (читает фавориты из `savedFilters.store`, до 5 последних).
- [ ] `frontend/src/pages/SearchPage.tsx` — оболочка, 3-колоночный layout: `SidebarFilters | ResultsArea | DetailPreview (опциональная правая панель)`.
- [ ] `frontend/src/components/search/` (новая директория):
  - `JqlEditor.tsx` — поле ввода с подсветкой и автодополнением (CodeMirror 6, расширение `StreamLanguage` с нашими токенами; либо Monaco, либо собственный на `<textarea>` + overlay — выбор в разделе 5.5).
  - `BasicFilterBuilder.tsx` — визуальные фильтры (chip-add: Project, Type, Status, Priority, Assignee, Sprint, Release, Due, Created, Labels, Custom fields). Каждый chip открывает Popover с поиском значений.
  - `FilterModeToggle.tsx` — переключатель Basic/Advanced. Basic→Advanced всегда, Advanced→Basic — только если JQL представим в Basic (иначе кнопка задизейблена с тултипом).
  - `SavedFiltersSidebar.tsx` — «Мои» / «Избранные» / «Общедоступные» / «Поделены со мной» / «Недавние».
  - `SaveFilterModal.tsx` — имя, описание, visibility (PRIVATE / SHARED / PUBLIC), список users/groups для SHARED.
  - `FilterShareModal.tsx` — копировать ссылку / изменить visibility / добавить участников.
  - `ColumnConfigurator.tsx` — drag-n-drop выбор и порядок колонок (включая кастомные поля).
  - `ResultsTable.tsx` — сортировка через `ORDER BY` в JQL (клик по заголовку — регенерирует JQL).
  - `ResultsCardsView.tsx` — альтернативный вид (опционально).
  - `BulkActionsBar.tsx` — массовые операции над выделенными (статус, assignee, sprint, delete) — вызов существующего `bulkUpdateIssues`.
  - `ExportMenu.tsx` — CSV / XLSX / JSON.
  - `ValidationErrorBanner.tsx` — показывает позицию ошибки в JQL (line/column + подчёркивание).
- [ ] `frontend/src/store/savedFilters.store.ts` + `frontend/src/store/search.store.ts` (Zustand, паттерн как существующие).
- [ ] `frontend/src/api/search.ts` + `frontend/src/api/savedFilters.ts`.
- [ ] Глобальный шорткат **`/`** → focus на JQL editor (по образцу GitHub); **Ctrl+S / Cmd+S** → сохранить фильтр (если уже назван) или открыть SaveAs.

### 3.3 Prisma / БД

- [ ] Новая модель `SavedFilter`:
  ```prisma
  model SavedFilter {
    id          String             @id @default(uuid())
    ownerId     String             @map("owner_id")
    name        String
    description String?
    jql         String             @db.Text
    visibility  FilterVisibility   @default(PRIVATE)
    columns     Json?              // { fields: string[] }
    isFavorite  Boolean            @default(false) @map("is_favorite")
    lastUsedAt  DateTime?          @map("last_used_at")
    useCount    Int                @default(0) @map("use_count")
    createdAt   DateTime           @default(now())
    updatedAt   DateTime           @updatedAt
    owner       User               @relation(fields: [ownerId], references: [id], onDelete: Cascade)
    shares      SavedFilterShare[]
    @@index([ownerId])
    @@index([visibility])
    @@map("saved_filters")
  }
  enum FilterVisibility { PRIVATE SHARED PUBLIC }
  model SavedFilterShare {
    filterId   String
    userId     String?
    groupId    String?
    permission FilterPermission @default(READ)
    filter     SavedFilter @relation(fields: [filterId], references: [id], onDelete: Cascade)
    @@id([filterId, userId, groupId])
  }
  enum FilterPermission { READ WRITE }
  ```
- [ ] Миграция на модель `User.preferences Json?` (или отдельная `UserPreferences` с `userId`-PK) — для хранения дефолтных колонок и недавних фильтров. Паттерн `JSON + версия` из раздела 5.4 TTUI-90.md.
- [ ] Postgres индекс для текстового поиска (Phase 2, не в MVP — см. Риск R8):
  ```sql
  CREATE INDEX issue_title_trgm_idx ON issues USING GIN (title gin_trgm_ops);
  CREATE INDEX issue_description_trgm_idx ON issues USING GIN (description gin_trgm_ops);
  ```
- [ ] Композитные индексы для частых TTS-QL-паттернов (если profiling покажет):
  ```prisma
  @@index([projectId, assigneeId, status])   // «assignee = currentUser() AND status = X»
  @@index([sprintId, status])                // «sprint in openSprints() AND status = X»
  ```

### 3.4 Внешние пакеты

- **CodeMirror 6** (`@codemirror/state`, `@codemirror/view`, `@codemirror/language`, `@codemirror/autocomplete`, `@codemirror/search`) — для `JqlEditor`. Вес ~120 KB gzip; оправдано, Monaco был бы 1.5 MB.
- Альтернативно **Lezer** для грамматики (если парсер писать на клиенте для syntax-highlight). MVP — подсветка упрощённая (regex-матчер keywords), полный AST парсится на backend.
- `papaparse` уже в проекте? — Проверить при реализации; для CSV-экспорта.
- Парсер — **hand-written recursive descent**, без зависимостей. JQL достаточно прост.

### 3.5 Блокеры

- Нет жёстких блокеров. Модель `SavedFilter` и модуль `search` не зависят друг от друга и могут разрабатываться параллельно после утверждения грамматики (см. разделы 5.1, 5.2).

---

## 4. Риски

| # | Риск | Вероятность | Влияние | Митигация |
|---|------|-------------|---------|-----------|
| R1 | **SQL-инъекция через JQL** — если хоть один путь компиляции собирает SQL строкой, это catastrophic CVE | MEDIUM | CRITICAL | Парсер возвращает **строго типизированный AST**; компилятор строит Prisma `where` **только через параметризованные вызовы** и `Prisma.sql` tag для raw-фрагментов. Fuzz-тесты в CI на 1000+ случайных query с экранируемыми кавычками, null-байтами, unicode-правосторонними. Security-review обязателен до merge |
| R2 | Приоритет операторов JQL нетривиален (`AND > OR`, `NOT` — унарный) — парсер может путать группы | HIGH | MEDIUM | Грамматика EBNF в разделе 5.1, unit-тесты на **~80 случаев парсинга** из JQL-reference Atlassian. Тесты проверяют AST-снимки (snapshot tests) |
| R3 | Задачи без доступа утекают через JQL (`project = "SECRET"`) | MEDIUM | CRITICAL | **Глобальный scope-фильтр** всегда добавляется в compiler на верхнем уровне (AND) — `projectId IN (доступные)`. Пользователь даже после корректного парсинга получит пустой результат. Covered by integration test + security review |
| R4 | Полнотекстовый поиск без индексов тормозит (~секунды на 100K задач) | HIGH | HIGH | MVP: `ILIKE` с cap результата ≤ 500 + strict timeout 5s. Phase 2: `pg_trgm` GIN-индексы (см. 3.3). В UI — блокирующий сообщ «⚠ Оператор `~` без других фильтров — результат ограничен до N» |
| R5 | JQL-операторы `WAS`/`CHANGED`/`WAS IN` требуют истории, которой нет (только `AuditLog` без поля-specific) | HIGH | LOW | **MVP — не реализуем** эти операторы. Парсер их принимает, валидатор выдаёт `NotImplementedError` с позицией и подсказкой «Будет в phase 2 при появлении FieldChangeLog». Документация явно перечисляет поддержку |
| R6 | Кастомные поля — JSON-колонка, Prisma не умеет типизировано фильтровать сложные операторы на JSON | MEDIUM | MEDIUM | Для кастомных полей использовать **`Prisma.sql` raw WHERE** с `JSONB` операторами (`->`, `->>`, `@>`, числовые касты). Компилятор знает тип кастомного поля (NUMBER/DATE/SELECT/MULTI_SELECT/USER/LABEL) и выбирает нужный путь |
| R7 | Разные пользователи видят разный реестр custom-field-ID (scoping через `FieldSchemaBinding`) — имя `"Story Points"` может быть у двух полей в разных проектах | MEDIUM | MEDIUM | При парсинге имени поля в AST **не резолвим** в ID; резолв — в compiler с учётом `project = X` клаузы. Если поле неоднозначно без scope — warning «Требуется указать `project = ...` до фильтра по "Story Points"» |
| R8 | CodeMirror 6 + полный редактор выхлопом ≥ 150KB gzip — регрессия initial-load | LOW | LOW | `React.lazy` + `Suspense` на `JqlEditor`; страница `/search` грузит редактор отдельным чанком. Monitoring web-vitals см. [frontend/src/lib/web-vitals.ts](frontend/src/lib/web-vitals.ts) |
| R9 | Basic↔Advanced mode round-trip — потеря структуры (парные скобки, комментарии) при переключении | MEDIUM | LOW | Basic всегда строит canonical JQL; Advanced→Basic невозможно, если AST содержит что-то, чего нет в Basic (OR, NOT с детьми-группами, custom operators) — кнопка disabled + tooltip |
| R10 | Сохранённые фильтры ломаются, когда автор удаляет проект/пользователя, на который ссылается (`assignee = "Ivan"`) | HIGH | LOW | **Ленивая валидация** — при выполнении, если ссылаемая сущность не найдена, возвращаем 0 задач + warning `UnknownEntity(field=assignee, value="Ivan")`. UI показывает non-blocking banner в результатах. CRUD фильтра не блокирует сохранение |
| R11 | Пользователь шарит public-фильтр с `summary ~ "пароль..."` — утечка чувствительных данных через query-text | LOW | MEDIUM | Визуальный warning в Save modal при `visibility=PUBLIC`: «JQL-текст виден всем». Фильтр НЕ даёт доступа к задачам, к которым у читателя нет прав (R3) |
| R12 | Массовые действия из результатов (`bulkUpdateIssues`) применяются к кросс-проектной выборке — существующий сервис принимает `projectId` | MEDIUM | MEDIUM | Разбивать выделенные задачи по проектам, вызывать bulk-update по каждому проекту в `Promise.all`, агрегировать `{succeeded, failed}`. Atomicity — per-project, НЕ кросс-проектная (документировать) |
| R13 | `ORDER BY cf["Story Points"]` по JSON-полю — медленно без функционального индекса | LOW | MEDIUM | MVP: разрешить сортировку только по system-полям. Custom-поле sort — Phase 2 с функциональными индексами по конкретным ID |
| R14 | Разница «diacritics insensitive» (поиск «резюме» найдёт «резюме́»?) — ожидания Jira | LOW | LOW | MVP: обычный `ILIKE` (case-insensitive, без unaccent). Документировать. Phase 2 — `unaccent` extension |
| R15 | Отсутствие rate-limiting на `POST /search/issues` — DDoS дорогими JQL | MEDIUM | HIGH | Per-user rate limit **30 запросов / минуту** через middleware (паттерн из существующих); hard timeout 10s; cap результат 1000; cap `startAt` 10000 |
| R16 | Дорогой TTS-QL в КТ замедляет scheduler — backlog оценок | MEDIUM | HIGH | Hard timeout **5s** на compile+exec TTQL-ветки; превышение → `state='ERROR'` + violationEvent `TTQL_ERROR`; scheduler продолжает обработку остальных КТ |
| R17 | Изменение TTS-QL-текста после генерации снапшота ломает историю | MEDIUM | MEDIUM | `ReleaseCheckpoint.ttqlSnapshot` — **замороженная копия**; evaluator использует snapshot, не живое значение `CheckpointType.ttqlCondition` |
| R18 | `now()`/`today()` внутри условия дают нестабильный результат между запусками scheduler'а → flap violations | MEDIUM | LOW | Evaluator передаёт фиксированный `now = scheduler.startedAt` одинаковый для всех КТ одного тика |
| R19 | `currentUser()` в TTQL-условии КТ всегда NULL → логика `assignee = currentUser()` даст всегда false | HIGH | LOW | Валидатор при сохранении WARNING (не ошибка). Документация явно описывает семантику. В suggester — `currentUser()` отсутствует в топе при `variant=CHECKPOINT` |
| R20 | Пользователь выбрал режим `TTQL`, стёр `criteria`, затем вернулся на `STRUCTURED` — потерял данные | MEDIUM | LOW | Frontend: скрытые поля хранятся в form-state, не стираются; backend Zod не ругается на «лишние» поля в неактивном режиме (они игнорируются при save) |
| R21 | Existing `CheckpointType` после миграции остаются в режиме `STRUCTURED`, но сотрудники ожидают автоматического переноса в TTQL | LOW | LOW | Миграция **НЕ конвертирует** structured → TTQL автоматически. В UI добавить кнопку «Сконвертировать в TTS-QL» (one-way), которая генерирует эквивалентный JQL и открывает редактор для ручной проверки перед save |
| R22 | `/admin/checkpoint-types/preview` с произвольным TTQL без сохранения — vector для resource-abuse на любом releaseId | MEDIUM | MEDIUM | Те же rate-limit + timeout, что у `/search/issues`; RBAC — только `canManageCheckpoints` |

---

## 5. Особенности реализации

### 5.1 Грамматика TTS-QL (EBNF)

```ebnf
query        ::= or_expr [ "ORDER" "BY" sort_list ]
or_expr      ::= and_expr { "OR" and_expr }
and_expr     ::= not_expr { "AND" not_expr }
not_expr     ::= [ "NOT" ] atom
atom         ::= "(" query ")" | clause
clause       ::= field ( cmp_op value
                       | in_op "(" value_list ")"
                       | "IS" [ "NOT" ] ("EMPTY" | "NULL")
                       | history_op hist_value )                  ; history в Phase 2

cmp_op       ::= "=" | "!=" | ">" | ">=" | "<" | "<=" | "~" | "!~"
in_op        ::= "IN" | "NOT" "IN"
history_op   ::= "WAS" | "WAS" "NOT" | "WAS" "IN" | "WAS" "NOT" "IN"
              | "CHANGED"
              | "CHANGED" ("FROM"|"TO"|"AFTER"|"BEFORE"|"ON"|"DURING"|"BY")

field        ::= IDENT | CUSTOM_FIELD                            ; IDENT — snake/camel/lowercase; CUSTOM_FIELD — cf[UUID] или "имя в кавычках"
value        ::= literal | function_call
value_list   ::= value { "," value }
literal      ::= STRING | NUMBER | DATE_ISO | IDENT | RELATIVE_DATE | "true" | "false" | "EMPTY" | "NULL"
function_call ::= IDENT "(" [ arg_list ] ")"
arg_list     ::= value { "," value }

sort_list    ::= sort_item { "," sort_item }
sort_item    ::= field [ "ASC" | "DESC" ]

STRING         ::= '"' ... '"' | "'" ... "'"                      ; с поддержкой \" \\ \n \t \u{HEX}
NUMBER         ::= -?\d+(\.\d+)?
DATE_ISO       ::= "YYYY-MM-DD" | "YYYY-MM-DD HH:MM[:SS]"        ; в строковых кавычках или как литерал
RELATIVE_DATE  ::= "-"?\d+[dwMyh]                                 ; -1d, 2w, 3M, 1y, 8h
IDENT          ::= [A-Za-z_][A-Za-z0-9_\-\.]*                     ; case-insensitive для keywords
CUSTOM_FIELD   ::= "cf" "[" UUID "]" | '"' NAME '"'
```

**Приоритет:** `( ) > NOT > AND > OR > ORDER BY` (строгий).
**Регистронезависимость:** ключевые слова (`AND`, `OR`, `IN`, `IS`, `EMPTY`, `ORDER`, `BY`, `ASC`, `DESC`, `NOT`, `WAS`, `CHANGED`) — case-insensitive. Имена полей — case-insensitive.
**Комментарии:** `-- ...` до конца строки (опционально; полезно в больших сохранённых фильтрах).

### 5.2 Поля TTS-QL — реестр (system)

| Поле | Синонимы | Тип | Операторы | Прим. |
|------|----------|-----|-----------|-------|
| `project` | `proj` | Project-ref | `=`, `!=`, `IN`, `NOT IN`, `IS [NOT] EMPTY` | по `key` или `id` |
| `key`, `issuekey` | — | Issue-ref | `=`, `!=`, `IN`, `NOT IN` | `PRJ-123` |
| `summary` | `title` | TEXT | `~`, `!~`, `=`, `!=`, `IS [NOT] EMPTY` | ILIKE |
| `description` | — | TEXT | `~`, `!~`, `IS [NOT] EMPTY` | |
| `status` | — | Status-ref | `=`, `!=`, `IN`, `NOT IN`, `CHANGED*`, `WAS*` | имя WorkflowStatus или systemKey (OPEN/IN_PROGRESS/REVIEW/DONE/CANCELLED) |
| `statusCategory` | `category` | Enum | `=`, `!=`, `IN`, `NOT IN` | `TODO`/`IN_PROGRESS`/`DONE` |
| `priority` | — | Enum | `=`, `!=`, `IN`, `NOT IN` | CRITICAL/HIGH/MEDIUM/LOW |
| `type`, `issuetype` | — | Type-ref | `=`, `!=`, `IN`, `NOT IN` | systemKey (TASK/EPIC/…) или UUID |
| `assignee` | — | User-ref | `=`, `!=`, `IN`, `NOT IN`, `IS [NOT] EMPTY` | email / id / `currentUser()` |
| `reporter`, `creator` | — | User-ref | то же | |
| `sprint` | — | Sprint-ref | `=`, `!=`, `IN`, `NOT IN`, `IS [NOT] EMPTY` | имя / id / функции |
| `release`, `fixVersion` | — | Release-ref | то же | |
| `parent` | — | Issue-ref | `=`, `!=`, `IN`, `NOT IN`, `IS [NOT] EMPTY` | |
| `epic` | — | Issue-ref | `=`, `IN` | parent, если type=EPIC |
| `due`, `dueDate` | — | DATE | `=`, `!=`, `>`, `<`, `>=`, `<=`, `IS [NOT] EMPTY` | + relative: `due <= "7d"` |
| `created` | — | DATETIME | то же | |
| `updated` | — | DATETIME | то же | |
| `resolvedAt` | — | DATETIME | то же | статус переходил в DONE-category |
| `estimatedHours`, `originalEstimate` | — | NUMBER | `=`, `!=`, `>`, `<`, `>=`, `<=`, `IS [NOT] EMPTY` | |
| `timeSpent`, `workLog` | — | NUMBER | то же | SUM(TimeLog.hours) |
| `timeRemaining` | — | NUMBER | то же | estimatedHours − timeSpent |
| `aiEligible` | — | BOOL | `=` | |
| `aiStatus` | — | Enum | `=`, `IN` | NOT_STARTED/IN_PROGRESS/DONE/FAILED |
| `aiAssigneeType` | — | Enum | `=`, `IN` | HUMAN/AGENT/MIXED |
| `labels`, `label` | — | LIST (custom field) | `=`, `!=`, `IN`, `NOT IN`, `IS [NOT] EMPTY` | |
| `comment` | — | TEXT | `~` | поиск по `Comment.content` |
| `orderIndex` | — | NUMBER | `=`, `>`, `<`, … | |
| `linkedIssue` | — | Issue-ref | `=`, `IN` | использовать через `linkedIssues()` |
| `hasChildren` | — | BOOL | `=` | вычисляемое |
| `hasSubtasks` | — | BOOL | `=` | алиас |
| `hasCheckpointViolation` | `hasViolation` | BOOL | `=` | `true`, если у задачи есть хоть один активный `CheckpointViolationEvent` (`resolvedAt IS NULL`); быстрый булев фильтр |
| `checkpointViolationType` | `violationType` | LIST (text) | `=`, `!=`, `IN`, `NOT IN`, `IS [NOT] EMPTY` | имена типов КТ (из `CheckpointType.name`), по которым задача сейчас нарушает; массив-семантика (IN проверяет хотя бы одно совпадение) |
| `checkpointViolationReason` | — | TEXT | `~`, `!~` | `CheckpointViolationEvent.reason` (только активные) — полезно для текстовых поисков по причинам |

### 5.3 Кастомные поля

- Синтаксис: `cf[UUID]` или `"Имя поля"` (name lookup).
- Типы из [CustomFieldType](backend/src/prisma/schema.prisma#L642) маппятся так:
  - `TEXT`, `TEXTAREA`, `URL` → `~`, `=`, `!=`, `IS [NOT] EMPTY`.
  - `NUMBER`, `DECIMAL` → все числовые.
  - `DATE`, `DATETIME` → все временные.
  - `CHECKBOX` → `=` (true/false).
  - `SELECT` → `=`, `!=`, `IN`, `NOT IN` (по опции name или id).
  - `MULTI_SELECT`, `LABEL` → `=`, `!=`, `IN`, `NOT IN` (проверка вхождения в массив).
  - `USER` → `=`, `!=`, `IN`, `NOT IN`, `currentUser()`.
  - `REFERENCE` → `=`, `!=`, `IN` (по ID связанной сущности).

### 5.4 Функции (совместимые с JQL)

| Функция | Возвращает | Семантика | Статус |
|---------|-----------|-----------|--------|
| `currentUser()` | User | текущий пользователь | MVP |
| `membersOf("group")` | User[] | члены группы | MVP |
| `now()` | DATETIME | текущий момент | MVP |
| `today()` | DATE | сегодня (в TZ пользователя) | MVP |
| `startOfDay([offset])`, `endOfDay([offset])` | DATETIME | | MVP |
| `startOfWeek([offset])`, `endOfWeek([offset])` | DATETIME | ISO-неделя | MVP |
| `startOfMonth([offset])`, `endOfMonth([offset])` | DATETIME | | MVP |
| `startOfYear([offset])`, `endOfYear([offset])` | DATETIME | | MVP |
| `openSprints()` | Sprint[] | активные спринты доступных проектов | MVP |
| `closedSprints()` | Sprint[] | завершённые | MVP |
| `futureSprints()` | Sprint[] | запланированные | MVP |
| `unreleasedVersions([project])` | Release[] | unreleased | MVP |
| `releasedVersions([project])` | Release[] | released | MVP |
| `earliestUnreleasedVersion([project])` | Release | ближайший unreleased | MVP |
| `latestReleasedVersion([project])` | Release | последний released | MVP |
| `linkedIssues(key[, linkType])` | Issue[] | связанные задачи | MVP |
| `subtasksOf(key)` | Issue[] | дети | MVP |
| `epicIssues(key)` | Issue[] | задачи под эпиком | MVP |
| `myOpenIssues()` | shortcut | `assignee = currentUser() AND statusCategory != DONE` | MVP |
| `violatedCheckpoints([typeName])` | Issue[] | задачи с активными нарушениями КТ (`CheckpointViolationEvent.resolvedAt IS NULL`). Без аргумента — нарушения любого типа; с аргументом — только по типу КТ с заданным `name` (регистр не важен) | MVP |
| `violatedCheckpointsOf(releaseKeyOrId[, typeName])` | Issue[] | то же, но ограниченное задачами конкретного релиза | MVP |
| `checkpointsAtRisk([typeName])` | Issue[] | задачи в релизах, где `ReleaseCheckpoint.state IN ('WARNING','OVERDUE','ERROR')`; с необязательным фильтром по типу | MVP |
| `checkpointsInState(state[, typeName])` | Issue[] | обобщённая — `state ∈ { PENDING, ON_TRACK, WARNING, OVERDUE, ERROR, SATISFIED }` (значения `CheckpointState`) | MVP |
| `watchedIssues()` | Issue[] | задачи, на которые подписан | Phase 2 (нет модели watchers) |
| `votedIssues()` | Issue[] | голоса | Phase 2 |
| `lastLogin()` | DATETIME | | Phase 2 |

**Offset-синтаксис:** `startOfDay("-7d")`, `endOfMonth("1M")`. Единицы: `d`/`w`/`M`/`y`/`h`/`m`.

#### 5.4.1 Компиляция checkpoint-функций

Источник «активного нарушения» — `CheckpointViolationEvent` с `resolvedAt IS NULL` (см. [schema.prisma:1215-1232](backend/src/prisma/schema.prisma#L1215-L1232)), в join с `ReleaseCheckpoint` → `CheckpointType` (для фильтра по `typeName`) и `Release` (для `violatedCheckpointsOf`).

```ts
// violatedCheckpoints([typeName])
// → id IN (SELECT cve.issue_id FROM checkpoint_violation_events cve
//          JOIN release_checkpoints rc ON rc.id = cve.release_checkpoint_id
//          JOIN checkpoint_types ct ON ct.id = rc.checkpoint_type_id
//          WHERE cve.resolved_at IS NULL
//            [AND LOWER(ct.name) = LOWER(:typeName)])
compileViolatedCheckpoints(typeName?: string): Prisma.Sql {
  return Prisma.sql`
    SELECT cve.issue_id FROM checkpoint_violation_events cve
    JOIN release_checkpoints rc ON rc.id = cve.release_checkpoint_id
    JOIN checkpoint_types ct ON ct.id = rc.checkpoint_type_id
    WHERE cve.resolved_at IS NULL
    ${typeName ? Prisma.sql`AND LOWER(ct.name) = LOWER(${typeName})` : Prisma.empty}
  `;
}

// violatedCheckpointsOf(releaseKeyOrId, typeName?) — + join c release + WHERE r.id = :releaseId OR r.name = :key
// checkpointsAtRisk/checkpointsInState — + WHERE rc.state IN (...) без требования наличия violation (может быть WARNING без violations)
```

Функции **подставляются в RHS** operator'а `IN` на псевдо-поле `issue` (или можно вообще без LHS-поля — для `violatedCheckpoints()` парсер принимает форму `issue IN violatedCheckpoints()`, совместимую с JQL-синтаксисом). Ради удобства поддерживаем **три эквивалентные формы**:

```sql
issue IN violatedCheckpoints()
violatedCheckpoints()                         -- сокращение, парсер оборачивает в issue IN (…)
hasCheckpointViolation = true                 -- булев-аналог без аргумента
```

Индексы для быстрой компиляции есть уже сейчас: [checkpoint_violation_events](backend/src/prisma/schema.prisma#L1225-L1230) имеет `@@index([issueId])`, `@@index([resolvedAt])`. Доп. индекс `@@index([resolvedAt, releaseCheckpointId])` — при profiling, если подтвердится замедление на >5K активных violations.

**Scope-фильтр (R3)** применяется на уровне верхнего AND — пользователь увидит нарушения только из доступных ему проектов. Для проектов без доступа результат — пусто.

**Относительные даты в литерале:** `due <= "7d"` — алиас `due <= now() + 7d` (парсер оборачивает).

### 5.5 Архитектура парсера и компилятора

```
jql text
  │
  ▼
┌────────────┐    ┌───────────┐    ┌────────────────┐    ┌────────────────────┐
│ Tokenizer  │───▶│  Parser   │───▶│   Validator    │───▶│  Compiler          │
│  (regex-   │    │ (recursive│    │ (resolve field │    │ (AST → Prisma where│
│   lexer)   │    │  descent) │    │  + type check) │    │  + raw SQL для CF) │
└────────────┘    └───────────┘    └────────────────┘    └─────────┬──────────┘
                                                                    │
                                                                    ▼
                                                   prisma.issue.findMany({where, orderBy, ...})
```

- **Tokenizer**: поддерживает `STRING` с escape, `NUMBER`, `IDENT`, `KEYWORD`, `LPAREN/RPAREN`, `COMMA`, `OP` (`=/!=/>/<=/>=/<=/~/!~`), `RELATIVE_DATE`. Возвращает массив `{type, value, start, end}` — позиции для error reporting.
- **Parser**: recursive descent. На каждой ноде хранит `span: {start, end}` для инлайн-подчёркивания ошибок в редакторе.
- **Validator**: семантика — поле существует? тип значения совместим с оператором? функция зарегистрирована? Ошибки накапливает в `errors: ValidationError[]`, не прерывая (для UX автодополнения).
- **Compiler**: строит Prisma `WhereInput`. Для кастомных полей — `Prisma.sql\`SELECT id FROM issue_custom_field_values WHERE ...\`` с `id IN` под-запросом. Для связей — под-запрос по `IssueLink`. Агрегатные поля (`timeSpent`) — `HAVING`-клауза через `$queryRaw` или материализованное поле. Верхний AND всегда добавляет scope: `projectId IN (:accessibleProjectIds)`.

#### Пример компиляции

Вход:
```
project = "TTMP" AND assignee = currentUser() AND status IN (OPEN, IN_PROGRESS)
  AND priority = HIGH AND due <= "7d"
  AND "Story Points" > 3
ORDER BY priority DESC, updated DESC
```

Выход:
```ts
prisma.issue.findMany({
  where: {
    AND: [
      { projectId: { in: accessibleProjectIds } },  // scope
      { project: { key: 'TTMP' } },
      { assigneeId: ctx.userId },
      { OR: [{ status: 'OPEN' }, { status: 'IN_PROGRESS' }] },
      { priority: 'HIGH' },
      { dueDate: { lte: addDays(new Date(), 7) } },
      { id: { in: Prisma.sql`SELECT issue_id FROM issue_custom_field_values
                             WHERE custom_field_id = ${spId}
                             AND (value->>'n')::numeric > 3` } }
    ]
  },
  orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
  skip, take,
  include: resultIncludeForColumns(columns)
})
```

### 5.6 HTTP API

| Метод | Путь | Входные | Выходные | Прим. |
|-------|------|---------|----------|-------|
| `POST` | `/api/search/issues` | `{ jql, startAt=0, limit=50 (max 100), columns?: string[] }` | `{ total, startAt, limit, issues: [...], warnings?: [] }` | Выполнение запроса |
| `POST` | `/api/search/validate` | `{ jql }` | `{ valid, ast?, errors: [{ start, end, code, message, hint? }] }` | Без выполнения |
| `GET`  | `/api/search/suggest` | `?jql=...&cursor=NN` | `{ completions: [{ label, type, insert, detail? }] }` | Автодополнение |
| `POST` | `/api/search/export` | `{ jql, format: 'csv'\|'xlsx', columns }` | Stream | Экспорт |
| `GET`  | `/api/saved-filters` | `?scope=mine\|shared\|public\|favorite` | `SavedFilter[]` | |
| `POST` | `/api/saved-filters` | `{ name, description, jql, visibility, columns, sharedWith }` | `SavedFilter` | |
| `GET`  | `/api/saved-filters/:id` | — | `SavedFilter` | |
| `PATCH`| `/api/saved-filters/:id` | partial | `SavedFilter` | Только owner или SHARED-WRITE |
| `DELETE`| `/api/saved-filters/:id` | — | 204 | Только owner |
| `POST` | `/api/saved-filters/:id/favorite` | `{ value: bool }` | `SavedFilter` | |
| `POST` | `/api/saved-filters/:id/share` | `{ users?: [], groups?: [], permission }` | `SavedFilter` | |
| `GET`  | `/api/search/schema` | — | `{ fields: [{ name, type, operators, sortable, synonyms }], functions: [...] }` | Для UI-подсказок и Basic builder |
| `PATCH`| `/api/users/me/preferences` | `{ searchDefaults?: { columns: [], pageSize } }` | `User` | |

### 5.7 UI / UX

#### Страница `/search` — макет

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  [☰] Поиск задач                                         [Export ▾] [Save ▾]│
├─────────────────────────────────────────────────────────────────────────────┤
│  [ Basic | Advanced ]   [? JQL help]                                         │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ project = "TTMP" AND assignee = currentUser() AND status IN (…)     │   │  ← JqlEditor (подсветка, автокомплит)
│  └──────────────────────────────────────────────────────────────────────┘   │
│  [▶ Выполнить] (или автозапуск при Enter вне строки)                         │
├──────────────┬──────────────────────────────────────────────────────────────┤
│ Мои фильтры  │  Результат: 142 задачи                    [Колонки ⚙] [CSV] │
│  ★ Мои HIGH  │  ┌─────────────────────────────────────────────────────────┐ │
│  ★ Ревью     │  │ Key    │ Тип │ Статус │ Приор. │ Assignee │ Due     │ … │ │
│  Общие       │  ├─────────────────────────────────────────────────────────┤ │
│    • Релизы  │  │TTMP-12 │ [T] │ OPEN   │ HIGH   │ @gd      │2026-04-25│ … │ │
│    • UAT     │  │TTMP-42 │ [S] │ REVIEW │ HIGH   │ @gd      │—         │ … │ │
│  Недавние    │  │…                                                        │ │
│  Поделены    │  └─────────────────────────────────────────────────────────┘ │
│  Избранные   │  ◀ 1 2 3 … ▶                                                 │
└──────────────┴──────────────────────────────────────────────────────────────┘
```

- **JqlEditor** (CodeMirror 6, lazy-loaded): подсветка токенов (keywords, strings, numbers, functions, идентификаторы полей), inline-ошибки (squiggle + gutter marker), автодополнение (Ctrl+Space / автоматически при наборе):
  - после `{ничего}` или `AND`/`OR`/`NOT`/`(` — поля;
  - после поля — операторы, совместимые с его типом;
  - после оператора — значения (fetch `/suggest`);
  - после `ORDER BY` — только sortable-поля.
- **Basic mode**: каждый clause — chip. Клик → Popover с autocomplete значений. Add-chip button → каскадное меню полей, разделённое на категории (Задача / Даты / Пользователи / Планирование / AI / Кастомные).
- **Save filter**: модалка «Имя», «Описание», «Visibility» (Private / Shared / Public), при Shared — мультиселект пользователей+групп, чекбокс «Сделать избранным».
- **Save columns**: автоматически в составе фильтра; отдельно — «Сделать колонки дефолтом для меня» → `PATCH /users/me/preferences`.
- **Bulk actions** (ADMIN/MANAGER, при выделении строк): Assign, Transition, Move to sprint, Delete, Export selected.
- **URL**: `/search?jql=<url-encoded>&view=table&columns=key,status,assignee,due&page=2`. Обновляется в history на каждое успешное выполнение — можно копировать ссылку.
- **Shortcuts**: `/` — focus, `Esc` — сброс фокуса, `Ctrl+Enter` — выполнить, `Ctrl+S` — сохранить, `Ctrl+Shift+S` — Save As.

#### Пункт меню в сайдбаре

- Место: между «Projects» и «Planning» (перед submenu Planning).
- Иконка — лупа (16×16 inline SVG, стиль по соседям).
- `data-testid="nav-search"`, active-detection `isActive('/search')`.
- При активной странице поиска под пунктом разворачивается sub-menu «Избранные фильтры» (до 5, отсортированы по `useCount DESC, lastUsedAt DESC`). Клик → `/search/saved/:id`.

### 5.8 Колонки и конфигуратор

- Доступные колонки: все system-поля из 5.2 + все включённые кастомные поля из `CustomField` (`isEnabled=true`).
- Дефолтный набор: `key, summary, type, status, priority, assignee, sprint, updated`.
- Конфигуратор (`ColumnConfigurator.tsx`) — два списка: «Доступные» ←→ «Выбранные», drag-n-drop для порядка. Сохранение:
  - в рамках текущего фильтра — в `SavedFilter.columns`;
  - как дефолт пользователя — в `User.preferences.searchDefaults.columns`.
- Сортировка — клик по заголовку колонки переписывает `ORDER BY` в JQL (с сохранением остального).

### 5.9 Безопасность и RBAC

- **Scope-фильтр** (R3): на каждый `POST /search/issues` middleware извлекает `accessibleProjectIds` точно по логике из `issues.router.ts:57-65` и передаёт компилятору как context.
- **Доступ к SavedFilter**:
  - `PRIVATE` — только owner.
  - `SHARED` — owner + entries в `SavedFilterShare`.
  - `PUBLIC` — все аутентифицированные.
  - Выполнение PUBLIC-фильтра всё равно использует accessible-projects читающего — никакой пользователь не получит задачи вне своих прав через чужой фильтр.
- **Write-доступ к SavedFilter**: owner всегда; `SHARED` с `permission=WRITE` — только если явно указано.
- **Аудит**: создание/удаление/обновление сохранённых фильтров → `AuditLog` запись (существующий middleware `logAudit`).
- **Rate limit**: 30 запросов/мин на пользователя.
- **Query-timeout**: 10 секунд на `POST /search/issues`, 2 секунды на `/validate`, 1 секунда на `/suggest`.

### 5.11 Подсказки значений полей (Value Suggesters) — JIRA-style

При наборе JQL после оператора (`=`, `!=`, `IN`, `NOT IN`, `~`) или внутри `(…)` для `IN`-клаузы JqlEditor вызывает `/api/search/suggest` с контекстом `{field, operator, prefix, cursor, scope}` и получает **типизированные предложения со значением для вставки, отображаемой меткой и дополнительным описанием** (email, аватар, цвет статуса). В Basic-builder те же провайдеры используются внутри Popover каждого chip.

Ключевая идея: **реестр провайдеров** — соответствие «field → suggester», где suggester знает, откуда брать значения, как их рендерить и как их сериализовать в JQL-литерал.

| Поле | Suggester | Источник | Представление | Сериализация в JQL |
|------|-----------|----------|---------------|---------------------|
| `project` | `ProjectSuggester` | `prisma.project.findMany({where: {id: in accessible}})` | `PRJ — Название` | `PRJ` (key без кавычек) или `"Название"` |
| `assignee`, `reporter`, `creator` | `UserSuggester` | `prisma.user.findMany({where: { OR: [{email: contains}, {name: contains}], isActive: true }}) LIMIT 20` | avatar + `Имя <email>` | `currentUser()` первой опцией, затем `"email@…"` или `id` |
| кастомное поле типа `USER` | `UserSuggester` | то же | то же | то же |
| `status` | `StatusSuggester` | `prisma.workflowStatus.findMany({where: {project: IN scope}})` + systemKeys (OPEN/IN_PROGRESS/…) | dot-цвет + имя + категория | `"Имя статуса"` или `OPEN` |
| `statusCategory` | `EnumSuggester` | литерал | `TODO / IN_PROGRESS / DONE` | идентификатор без кавычек |
| `priority` | `EnumSuggester` | литерал | `CRITICAL / HIGH / MEDIUM / LOW` | без кавычек |
| `type`, `issuetype` | `IssueTypeSuggester` | `prisma.issueTypeConfig.findMany` в scope | icon + имя + systemKey | systemKey или `"Имя"` |
| `sprint` | `SprintSuggester` | `prisma.sprint.findMany` в scope, **первой строкой — функции** `openSprints()`, `closedSprints()`, `futureSprints()` | state-dot + имя + период | имя в кавычках или ID |
| `release`, `fixVersion` | `ReleaseSuggester` | `prisma.release.findMany` в scope + функции `unreleasedVersions()`, `latestReleasedVersion()` | state + имя + дата | имя в кавычках или ID |
| `parent`, `epic`, `key`, `issuekey`, `linkedIssue` | `IssueSuggester` | `searchIssuesGlobal(prefix, accessible)` (переиспользуем) | `PRJ-123 — Title` | `PRJ-123` |
| `labels`, `label` | `LabelSuggester` | distinct из `IssueCustomFieldValue` по label-полям в scope + auto-complete своих | chip-стиль | `"label"` |
| кастомное поле `SELECT`/`MULTI_SELECT` | `OptionSuggester` | `CustomField.options` (JSON с опциями поля) | имя опции | имя в кавычках или id |
| кастомное поле `REFERENCE` | `ReferenceSuggester` | по target-типу поля (issue/user/project) | как соответствующий | как соответствующий |
| `aiAssigneeType`, `aiStatus` | `EnumSuggester` | литерал | чип | без кавычек |
| `aiEligible`, `hasChildren` | `BoolSuggester` | `true` / `false` | — | без кавычек |
| `due`, `created`, `updated`, `resolvedAt` + DATE/DATETIME custom | `DateSuggester` | **три секции**: (1) функции (`now()`, `startOfWeek()`, `endOfMonth("-1M")`), (2) относительные (`"-1d"`, `"-7d"`, `"-1M"`), (3) date-picker для абсолютной | label-с-календарём | функция / `"-7d"` / `"2026-04-18"` |
| `estimatedHours`, `timeSpent`, `timeRemaining`, `orderIndex` + NUMBER/DECIMAL custom | `NumberSuggester` | история типовых значений + свободный ввод | — | число |
| `summary`, `description`, `comment` + TEXT/TEXTAREA/URL custom | `TextSuggester` | без autocomplete значений — только шаблоны-кавычки и экранирование; можно предлагать **недавние запросы** пользователя | — | строка в кавычках |
| `membersOf("…")`-аргумент | `GroupSuggester` | `prisma.userGroup.findMany` | имя группы + счётчик | имя в кавычках |
| `hasCheckpointViolation` | `BoolSuggester` | литерал | `true` / `false` | без кавычек |
| `checkpointViolationType` | `CheckpointTypeSuggester` | `prisma.checkpointType.findMany({where:{isActive:true}})` | color-dot + имя + weight | имя в кавычках |
| `checkpointsAtRisk/checkpointsInState/violatedCheckpoints/violatedCheckpointsOf`-аргументы | те же, что для соответствующих Release/Checkpoint-типов | `ReleaseSuggester` (1-й arg) + `CheckpointTypeSuggester` (2-й) | — | — |
| `checkpointsInState("…")`-1-й аргумент | `CheckpointStateSuggester` | литерал | цвет-точка + state | `PENDING/ON_TRACK/WARNING/OVERDUE/ERROR/SATISFIED` без кавычек |

**Контракт `/api/search/suggest`** (расширение из §5.6):

```http
GET /api/search/suggest?jql=<text>&cursor=<offset>
      [&field=<name>&operator=<op>&prefix=<text>]   # опционально для Basic-mode popover
```

Ответ:
```ts
{
  completions: Array<{
    kind: 'field' | 'operator' | 'function' | 'value' | 'keyword';
    label: string;            // что показать
    insert: string;           // что вставить (уже экранировано, с кавычками если нужно)
    detail?: string;          // вторая строка (email, категория, дата)
    icon?: {
      kind: 'avatar' | 'color-dot' | 'svg' | 'emoji';
      value: string;          // url / hex / name
    };
    score: number;            // 0..1 для сортировки
  }>;
  context: {
    expectedField?: string;
    expectedType?: 'USER' | 'DATE' | 'NUMBER' | 'STATUS' | ...;
    inValueList?: boolean;    // курсор внутри IN (…)
  };
}
```

**Правила выбора suggester'а (алгоритм):**
1. По курсору в `jql` определяем синтаксическую позицию (после какого токена, ждём ли `value`, `operator`, `field`) — использует тот же парсер в recovery-режиме.
2. Если ожидается `value`, смотрим предыдущий `field`-токен → находим в `search.schema.ts` тип поля.
3. Для custom fields — резолвим по имени/UUID (с учётом scope, как в R7).
4. Если поле — enum/статический список → `EnumSuggester` вернёт константы без сетевого вызова.
5. Если поле — dynamic (User/Project/Sprint/…) → вызов provider'а с `prefix = текст от последней кавычки/запятой до cursor`, `limit = 20`, `scope = accessibleProjectIds`.
6. **Fuzzy-ranking**: точное совпадение > startsWith > contains > subsequence; для User — приоритизируем по последнему использованию (джойн по `AuditLog` или отдельное поле `lastInteractedAt`).
7. Результат всегда содержит **верхние константные предложения** — для User это `currentUser()`, для Sprint — `openSprints()`, для Release — `unreleasedVersions()`.
8. При `inValueList = true` — **не предлагаем уже выбранные значения** в том же IN-списке (дедупликация).

**Инлайн-ввод в редакторе:**
- Автоматически открывается при наборе символа после `=`/`!=`/`,`/`(` и при нажатии Ctrl+Space.
- Debounce **150ms** для dynamic-suggester'ов (User/Issue/Label).
- Tab / Enter — вставить выбранное (для Enum — без кавычек; для User — с форматом `"email@host"`).
- Esc — закрыть без вставки.
- Клавиши ↑/↓ — навигация, Home/End — границы.

**Basic-mode интеграция:**
- Chip для поля `assignee` открывает Popover, который рендерится тем же компонентом `ValueSuggesterPopup`, что и для Advanced, но с `mode=multi` для IN-clause (чекбоксы) и с preview выбранных chip'ов внизу.
- ChipBuilder → Advanced сериализация: `assignee IN (currentUser(), "alice@x.com", "bob@x.com")`.

**Кэш:**
- Enum — client-side forever.
- Project/IssueType/Status — client-side + SWR 60s.
- User/Label — debounced fetch, без client-cache (слишком много сущностей).
- Sprint/Release — SWR 30s (state меняется).

**Типизация редактора** — `@codemirror/autocomplete` extension вызывает `/suggest`, mapping `completions[]` в `CompletionResult` с `apply` (inserts raw) и `info` (detail + icon). Кастомный renderer для avatar/color-dot.

**Тесты:**
- Unit: для каждого suggester'а — prefix match + сортировка.
- Integration: `/suggest?field=assignee&prefix=al` возвращает `alice@...` в scope и НЕ возвращает пользователей без общих проектов.
- E2E: в редакторе набираем `assignee = a`, стрелкой выбираем `alice`, Enter — в строке `assignee = "alice@…"`.

### 5.12 TTS-QL как условие контроля в КТ (Release Checkpoints) — режим ADDITIVE к существующему

Текущая модель условий КТ (см. [TTMP-160](docs/tz/TTMP-160.md), [backend/src/modules/releases/checkpoints/checkpoint.types.ts](backend/src/modules/releases/checkpoints/checkpoint.types.ts)) — **discriminated union `CheckpointCriterion[]`**: `STATUS_IN`, `DUE_BEFORE`, `ASSIGNEE_SET`, `CUSTOM_FIELD_VALUE`, `ALL_SUBTASKS_DONE`, `NO_BLOCKING_LINKS`, AND-комбинируемые и оценивающие **каждую задачу релиза** per-issue через [evaluate-criterion.ts](backend/src/modules/releases/checkpoints/evaluate-criterion.ts). Этот механизм **сохраняется полностью** — формат `criteria Json`, UI [AdminReleaseCheckpointTypesPage](frontend/src/pages/admin/AdminReleaseCheckpointTypesPage.tsx), снимок `ReleaseCheckpoint.criteriaSnapshot`, миграции и евалюатор остаются рабочими без изменений.

**Новое поведение (add-only):** пользователь может дополнительно или альтернативно задать условие в виде **TTS-QL-запроса**. Оба способа сосуществуют, пользователь выбирает удобный — **структурированные `criteria` не убираются**.

#### 5.12.1 Режимы условия

Новое поле `conditionMode` в `CheckpointType`:

| Режим | Что оценивается | Когда использовать |
|-------|-----------------|--------------------|
| `STRUCTURED` (default) | Только `criteria[]` — текущий механизм | Простые правила, визуальный редактор, совместимость с существующими КТ |
| `TTQL` | Только `ttqlCondition: string` | Сложные условия: OR, NOT, вложенные группы, связи (`linkedIssues`), функции дат, кастом-поля через имена |
| `COMBINED` | `criteria[]` **AND** `ttqlCondition` — задача обязана пройти оба | Базовые правила через UI + точечное ограничение через TTS-QL |

**Миграция совместимости:** все существующие КТ получают `conditionMode = 'STRUCTURED'`, `ttqlCondition = NULL`. Поведение неизменно. DTO/API — новые поля опциональны, старые клиенты не ломаются.

#### 5.12.2 Prisma — изменения модели

```prisma
model CheckpointType {
  // ... существующие поля без изменений (criteria Json остаётся)
  ttqlCondition   String?                  @db.Text @map("ttql_condition")
  conditionMode   CheckpointConditionMode  @default(STRUCTURED) @map("condition_mode")
}

enum CheckpointConditionMode { STRUCTURED TTQL COMBINED }

model ReleaseCheckpoint {
  // criteriaSnapshot Json — остаётся для structured-снапшота
  ttqlSnapshot        String?  @db.Text @map("ttql_snapshot")    // NEW
  conditionModeSnapshot CheckpointConditionMode @default(STRUCTURED) @map("condition_mode_snapshot")  // NEW
}
```

**Snapshot-логика:** при генерации `ReleaseCheckpoint` из `CheckpointType` копируем **и** `criteria` в `criteriaSnapshot`, **и** `ttqlCondition` в `ttqlSnapshot`, **и** `conditionMode` в `conditionModeSnapshot`. Это сохраняет свойство «изменение типа после генерации не меняет уже поставленные КТ» (текущий инвариант).

#### 5.12.3 Zod DTO — расширение [checkpoint.dto.ts](backend/src/modules/releases/checkpoints/checkpoint.dto.ts)

```ts
export const createCheckpointTypeDto = z.object({
  // ... существующие поля без изменений
  conditionMode: z.enum(['STRUCTURED', 'TTQL', 'COMBINED']).default('STRUCTURED'),
  criteria: z.array(criterionSchema).max(10).default([]),     // min(1) → ослаблено до default([])
  ttqlCondition: z.string().max(10000).nullable().optional(),
}).superRefine((val, ctx) => {
  const needsStructured = val.conditionMode !== 'TTQL';
  const needsTtql = val.conditionMode !== 'STRUCTURED';
  if (needsStructured && val.criteria.length === 0) {
    ctx.addIssue({ path: ['criteria'], code: 'custom',
      message: 'Режим STRUCTURED/COMBINED требует хотя бы одно structured-условие' });
  }
  if (needsTtql && (!val.ttqlCondition || !val.ttqlCondition.trim())) {
    ctx.addIssue({ path: ['ttqlCondition'], code: 'custom',
      message: 'Режим TTQL/COMBINED требует непустой TTS-QL-запрос' });
  }
  if (!needsTtql && val.ttqlCondition) {
    ctx.addIssue({ path: ['ttqlCondition'], code: 'custom',
      message: 'Режим STRUCTURED несовместим с заполненным ttqlCondition — либо смените режим, либо очистите поле' });
  }
});
```

Дополнительно: на этапе save тип TTS-QL прогоняется через **Validator из §5.5** с предустановленным checkpoint-контекстом (см. 5.12.4). Невалидный JQL → 400 с позицией ошибки.

#### 5.12.4 TTS-QL контекст для КТ — отличия от пользовательского поиска

Evaluator КТ вызывается из scheduler'а без actor'а. Реестр функций и полей **тот же** (см. §5.2 и §5.4), но:

| Функция/поле | Поведение в контексте КТ | Обоснование |
|--------------|--------------------------|-------------|
| `currentUser()` | Резолвится в `NULL` → любой `=` возвращает false; валидатор при сохранении выдаёт **WARNING** (не ошибку) | Нет actor'а; не ошибка, т.к. условие может быть корректным (например, `assignee IS NOT EMPTY`) |
| `now()`, `today()` | Подставляется фиксированное `evaluatedAt` scheduler'а (одно и то же в рамках одной оценки) | Детерминизм результата |
| `releasePlannedDate()` | **Новая функция**, доступна только в КТ-контексте: возвращает `release.plannedDate` (якорь для `DUE_BEFORE` по аналогии с structured criteria) | Позволяет писать `due <= releasePlannedDate() + 3d` |
| `checkpointDeadline()` | **Новая функция**, доступна только в КТ-контексте: возвращает `releasePlannedDate + offsetDays` | Для writable-корреляции с дедлайном КТ |
| Scope-фильтр `projectId IN accessible` | **Не применяется** в evaluator (system-context) — область ограничена проектом релиза автоматически через `release.projectId` | Evaluator запускается от scheduler'а, прав нет; данные всё равно берутся только из проекта релиза |
| `ORDER BY` | Игнорируется (не влияет на matcher) | Условие КТ — булево, порядок не важен |

Валидатор помечает использование `currentUser()` предупреждением при `conditionMode IN (TTQL, COMBINED)`. Функции `releasePlannedDate()` / `checkpointDeadline()` вне КТ-контекста — ошибка.

#### 5.12.5 Алгоритм evaluator'а — расширение [checkpoint-engine.service.ts](backend/src/modules/releases/checkpoints/checkpoint-engine.service.ts)

```
evaluateCheckpoint(input):
  issues = input.issues                              // загружены loader'ом
  passedStructuredIds = {}
  passedTtqlIds = {}

  // ветка STRUCTURED (если mode ≠ TTQL) — existing
  if mode in [STRUCTURED, COMBINED]:
     for each issue:
        reasons = []
        for each criterion in criteriaSnapshot:
           r = evaluateCriterion(criterion, issue, evalCtx)
           if r.applicable && !r.passed: reasons.push(r.reason)
        if reasons.empty: passedStructuredIds.add(issue.id)

  // ветка TTQL (если mode ≠ STRUCTURED) — NEW
  if mode in [TTQL, COMBINED]:
     where = compileTtql(ttqlSnapshot, checkpointContext(release, checkpointType, now))
     applicableIds = [issue.id | issue in issues]
     matchedIds = prisma.issue.findMany({
        where: { AND: [ where, { id: { in: applicableIds } } ] },
        select: { id: true }
     }).map(r => r.id)
     passedTtqlIds = Set(matchedIds)

  // пересечение по моду
  passedFinal = switch mode:
     STRUCTURED → passedStructuredIds
     TTQL       → passedTtqlIds
     COMBINED   → passedStructuredIds ∩ passedTtqlIds

  violations = issues.filter(i => not passedFinal.has(i.id))
                    .map(i => buildViolation(i, reasonByMode(i)))
```

- **Единичный DB-вызов** для TTQL-ветки (не per-issue).
- Timeout 5s на `compileTtql` + `findMany`; превышение → `state=ERROR` для КТ + violationEvent с `criterionType='TTQL_ERROR'` и reason «TTS-QL timeout / compile error / runtime error: …».
- Ошибка компиляции (после деплоя структура поля изменилась) → `state=ERROR`, в UI — кнопка «Открыть тип и исправить».
- `violationsHash` считается так же, как сейчас; порядок причин фиксированный: сначала structured-reasons, затем `TTQL_MISMATCH`.

#### 5.12.6 UI — расширение [AdminReleaseCheckpointTypesPage](frontend/src/pages/admin/AdminReleaseCheckpointTypesPage.tsx)

В модалке создания/редактирования типа КТ добавляется **segmented control «Режим условия»**:

```
┌─ Условие контроля ──────────────────────────────────────────────┐
│  Режим: ( Structured │ TTQL │ Combined )                        │
├─────────────────────────────────────────────────────────────────┤
│  ▾ Structured criteria        [текущий UI, без изменений]       │
│    (видимо при STRUCTURED и COMBINED; скрыт при TTQL)           │
│                                                                 │
│  ▾ TTS-QL условие             [JqlEditor — §5.11/§5.5]          │
│    (видимо при TTQL и COMBINED; скрыт при STRUCTURED)           │
│    ┌───────────────────────────────────────────────────────┐   │
│    │ assignee IS NOT EMPTY AND                             │   │
│    │   (due IS NOT EMPTY AND due <= releasePlannedDate() ) │   │
│    │   AND NOT (status = "Blocked")                        │   │
│    └───────────────────────────────────────────────────────┘   │
│    ⓘ В контексте КТ доступны функции releasePlannedDate(),     │
│       checkpointDeadline(). currentUser() = NULL.               │
│                                                                 │
│  ▾ Preview (опционально)                                        │
│    [Выбрать релиз ▾]  → Passed: 42 · Violated: 3                │
│    Violations: TTMP-15 (не совпал с TTQL), TTMP-22 (…)          │
└─────────────────────────────────────────────────────────────────┘
```

- Переключение режима **не стирает заполненное**: скрытые поля сохраняются в `form`-state; при смене обратно — восстанавливаются. При save — отправляется только актуальное по режиму (Zod superRefine не пропустит противоречие).
- `JqlEditor` в режиме «checkpoint» получает `context={ variant: 'CHECKPOINT' }`, `Suggest API` подставляет в автокомплит функции `releasePlannedDate()` / `checkpointDeadline()` и убирает `currentUser()` из топ-функций (с warning-иконкой, если набрал руками).
- **Preview-панель** (disclosure): выбор тестового релиза → `POST /api/admin/checkpoint-types/:id/preview { releaseId, ttqlCondition?, criteria?, conditionMode? }` возвращает `{ applicable, passed, violated, violations[] }` без сохранения. Полезно при отладке сложного TTQL до сохранения типа.
- Close-handlers Modal/Drawer вызывают `load()` по [CLAUDE.md](CLAUDE.md)-правилу.

В таблице типов КТ добавляется **значок режима** (S / Q / S+Q) в колонку «Условия», при hover — короткий preview текста TTS-QL.

#### 5.12.7 API — новые и расширенные эндпоинты

| Метод | Путь | Изменение |
|-------|------|-----------|
| `POST /api/admin/checkpoint-types` | — | Принимает `conditionMode`, `ttqlCondition` (поля из §5.12.3) |
| `PATCH /api/admin/checkpoint-types/:id` | — | То же |
| `GET /api/admin/checkpoint-types` | — | Возвращает новые поля |
| `POST /api/admin/checkpoint-types/preview` | **NEW** | `{ releaseId, conditionMode, criteria, ttqlCondition }` → `{ applicable, passed, violated, violations[] }` без записи |
| `POST /api/search/validate` | — | Принимает опциональное `{ variant: 'CHECKPOINT' }` — меняет реестр функций (добавляет `releasePlannedDate()`, `checkpointDeadline()`) |
| `GET /api/search/suggest` | — | То же — с `variant=CHECKPOINT` suggester возвращает КТ-функции и прячет `currentUser()` из топа |
| `GET /api/search/schema?variant=CHECKPOINT` | — | Схема доступных функций для текущего контекста |

#### 5.12.8 Совместимость с текущей evaluation-loader инфраструктурой

- Структурные criteria продолжают работать через `EvaluationIssue.customFieldValues: Map<string, unknown>` из [evaluation-loader.service.ts](backend/src/modules/releases/checkpoints/evaluation-loader.service.ts).
- TTQL-ветка **не использует** `EvaluationIssue` — она ходит напрямую в Prisma через compiled `where`. Это осознанное разделение: loader оптимизирован под per-issue pure evaluation, а TTS-QL-compiler уже умеет строить эффективный SQL с JOIN'ами. Нет дублирования кода.
- В `COMBINED`-режиме оба пути выполняются параллельно (`Promise.all`), результаты пересекаются в памяти.

#### 5.12.9 Примеры конверсий

**Было (structured):**
```json
[
  { "type": "STATUS_IN", "categories": ["IN_PROGRESS", "DONE"], "issueTypes": ["STORY", "TASK"] },
  { "type": "ASSIGNEE_SET", "issueTypes": ["STORY", "TASK"] },
  { "type": "DUE_BEFORE", "days": 3 }
]
```

**Эквивалентный TTS-QL:**
```sql
(type IN (STORY, TASK) AND statusCategory IN (IN_PROGRESS, DONE) AND assignee IS NOT EMPTY)
  AND due <= releasePlannedDate() + 3d
```

**Чего нельзя в structured, но можно в TTQL:**
```sql
-- OR + вложенные группы + функция связей
(priority = CRITICAL OR labels IN ("hotfix"))
  AND NOT (issue IN linkedIssues(key, "blocks") AND statusCategory != DONE)
  AND "Story Points" IS NOT EMPTY
```

### 5.10 Feature flag

Под env-флагом `FEATURES_ADVANCED_SEARCH=true` (дефолт `false` в production до окончания UAT). Паттерн как `FEATURES_DASHBOARD_V2` и `FEATURES_DIRECT_ROLES_DISABLED`. Пункт сайдбара при выключенном флаге — не рендерится.

---

## 6. Требования к реализации

### Функциональные

- [ ] FR-1: Парсер принимает все **JQL-операторы** из раздела 5.1 (кроме `WAS*`/`CHANGED*` — они парсятся, но валидатор выдаёт `NotImplemented` с позицией)
- [ ] FR-2: Парсер поддерживает **все функции** из 5.4 (MVP-список)
- [ ] FR-3: Компилятор переводит AST в корректный Prisma-запрос для всех поддержанных операторов × полей из 5.2
- [ ] FR-4: Кастомные поля всех типов из 3.3 доступны в поиске по имени в кавычках или `cf[UUID]`
- [ ] FR-5: Верхний AND всегда добавляет `projectId IN (accessible)` (R3)
- [ ] FR-6: `POST /search/issues` возвращает пагинацию (`{total, startAt, limit, issues}`), лимит ≤ 100, startAt ≤ 10000
- [ ] FR-7: `POST /search/validate` возвращает структурированный список ошибок со `start`/`end` (для inline-подчёркивания в редакторе)
- [ ] FR-8: `GET /search/suggest` возвращает контекстные подсказки (поле/оператор/значение/функция) на основе позиции курсора
- [ ] FR-9: `POST /search/export` — CSV и XLSX, применяет те же права доступа, что и обычный поиск
- [ ] FR-10: Сохранённые фильтры — CRUD, шаринг (PRIVATE/SHARED/PUBLIC), избранное, счётчик использований
- [ ] FR-11: Страница `/search` отображается в сайдбаре отдельным пунктом, sub-menu «Избранные фильтры» (до 5)
- [ ] FR-12: Basic builder покрывает ≥ 80% частых запросов без перехода в Advanced
- [ ] FR-13: Advanced JQL-editor с подсветкой + автодополнением + inline-ошибками
- [ ] FR-14: Конфигурация колонок — drag-n-drop, сохраняется в фильтре и/или в user-preferences
- [ ] FR-15: URL-sharing: `/search?jql=...` — выполнимая ссылка
- [ ] FR-16: Массовые действия из результатов работают для кросс-проектной выборки (разбиение на `bulkUpdateIssues` по проектам)
- [ ] FR-17: Глобальный шорткат `/` фокусирует JQL-editor на странице `/search`
- [ ] FR-18: `Modal`/`Drawer` закрытие (Save filter, Share, Column config) вызывает `load()` страницы-родителя (по [CLAUDE.md](CLAUDE.md))
- [ ] FR-19: `/search/saved/:filterId` загружает сохранённый фильтр и выполняет его
- [ ] FR-20: **Value Suggesters по типу поля** (JIRA-style): после `=/!=/IN/,/(` всплывают значения именно для этого поля — пользователи с avatar+email для `assignee/reporter`, проекты с key для `project`, workflow-статусы с цвет-точкой для `status`, спринты с состоянием для `sprint`, релизы с датой для `release`, задачи `PRJ-123 — Title` для `parent/epic/linkedIssue`, опции для `SELECT`/`MULTI_SELECT` кастомных полей, enum-константы для `priority/type/statusCategory/aiStatus`, функции `currentUser()/openSprints()/now()` первыми строками (см. §5.11)
- [ ] FR-21: Debounced (150ms) dynamic-suggest для User/Issue/Label; кэш/SWR для Project/IssueType/Status/Sprint/Release (см. §5.11)
- [ ] FR-22: В `IN (…)`-списке уже выбранные значения не предлагаются повторно
- [ ] FR-23: Basic chip-popover и Advanced autocomplete используют **один и тот же** `ValueSuggesterPopup`-компонент и один backend-эндпоинт, чтобы результаты были идентичны
- [ ] FR-24: `CheckpointType` поддерживает `conditionMode ∈ {STRUCTURED, TTQL, COMBINED}` и новое поле `ttqlCondition` (§5.12.1–5.12.3). **Существующий механизм `criteria[]` НЕ удаляется и продолжает работать как дефолт.**
- [ ] FR-25: Все существующие `CheckpointType` после миграции имеют `conditionMode='STRUCTURED'`, `ttqlCondition=NULL`, поведение идентично текущему — backward compat
- [ ] FR-26: `ReleaseCheckpoint.ttqlSnapshot` + `conditionModeSnapshot` фиксируют TTS-QL-текст и режим в момент генерации; изменение `CheckpointType` после генерации не влияет на уже созданные `ReleaseCheckpoint`
- [ ] FR-27: Evaluator реализует TTQL-ветку одним Prisma-запросом на КТ (pre-computed passed-set); `COMBINED` пересекает structured-passed и ttql-passed в памяти
- [ ] FR-28: В контексте КТ TTS-QL поддерживает дополнительные функции `releasePlannedDate()`, `checkpointDeadline()`; `currentUser()` резолвится в NULL + WARNING при сохранении
- [ ] FR-29: UI модалки `CheckpointType` содержит segmented control «Режим условия» и показывает/скрывает секции structured/TTQL соответственно; заполнение не стирается при переключении
- [ ] FR-30: Preview-панель — `POST /admin/checkpoint-types/preview { releaseId, ... }` возвращает applicable/passed/violated без записи; доступна в UI до сохранения типа
- [ ] FR-31: Ошибка компиляции/runtime/timeout TTS-QL-условия в scheduler'е → `ReleaseCheckpoint.state='ERROR'` + violationEvent с `criterionType='TTQL_ERROR'`; UI показывает баннер с кнопкой «Открыть тип и исправить»
- [ ] FR-32: Таблица типов КТ показывает значок режима (S/Q/S+Q), hover — preview TTS-QL
- [ ] FR-33: `/search/validate`, `/search/suggest`, `/search/schema` принимают `variant=CHECKPOINT` и возвращают КТ-специфичный реестр функций
- [ ] FR-34: TTS-QL поддерживает **функции и поля для нарушений КТ** — `violatedCheckpoints([typeName])`, `violatedCheckpointsOf(releaseKeyOrId[, typeName])`, `checkpointsAtRisk([typeName])`, `checkpointsInState(state[, typeName])`, поля `hasCheckpointViolation`, `checkpointViolationType`, `checkpointViolationReason`. Источник — `CheckpointViolationEvent.resolvedAt IS NULL` и `ReleaseCheckpoint.state`. Результаты скоуплены по доступным проектам (R3).
- [ ] FR-35: Suggester `CheckpointTypeSuggester` подтягивает активные `CheckpointType` с color-dot и weight; `CheckpointStateSuggester` — enum-константы состояний.

### Нефункциональные

- [ ] NFR-1: TTFB `/search/issues` < 400ms (p95) при типичном запросе (5 clauses, limit=50, 10K задач в системе)
- [ ] NFR-2: TTFB `/search/validate` < 100ms (p95)
- [ ] NFR-3: TTFB `/search/suggest` < 200ms (p95)
- [ ] NFR-4: Парсер обрабатывает запрос 1KB за ≤ 20ms
- [ ] NFR-5: JqlEditor lazy-load, не добавляет > 160KB gzip к initial bundle
- [ ] NFR-6: Layout страницы адаптивен (≥ 1280px — 3 колонки, ≥ 900px — 2, < 900px — 1 со свёрнутой sidebar)
- [ ] NFR-7: Совместимость: Chrome 139+, Yandex Browser 25+, Edge 139+, Safari 18+
- [ ] NFR-8: Hard timeout `/search/issues` — 10s, `/export` — 60s

### Безопасность

- [ ] SEC-1: Scope-фильтр по `accessibleProjectIds` (R3) покрыт unit + integration-тестами для каждой роли (USER/MANAGER/ADMIN/AUDITOR/VIEWER)
- [ ] SEC-2: Все raw-SQL фрагменты — через `Prisma.sql` tag; fuzz-тест 1000+ JQL со спецсимволами без 500 и без утечки кросс-project
- [ ] SEC-3: Rate limit 30/min/user; превышение → 429 с `Retry-After`
- [ ] SEC-4: Hard timeout запроса 10s → 504 gateway-timeout, не 500
- [ ] SEC-5: `SavedFilter` visibility/permission строго enforced; 403 при чужом PATCH
- [ ] SEC-6: JSON-схема на вход всех эндпоинтов через Zod
- [ ] SEC-7: `AuditLog` на create/update/delete/share SavedFilter
- [ ] SEC-8: PUBLIC SavedFilter — warning в UI, но доступ к задачам не расширяется (R11)

### Тестирование

- [ ] T-1: Unit parser — **≥ 100 кейсов**, включая edge:
  - экранированные кавычки (`summary ~ "foo \"bar\""`);
  - пустые строки, unicode;
  - NOT с приоритетом (`NOT a = 1 AND b = 2` → `(NOT(a=1)) AND (b=2)`);
  - глубокая вложенность `(((a)))`;
  - неверный токен возвращает ошибку с позицией
- [ ] T-2: Unit compiler — per-field × per-operator — **матрица ≥ 60**
- [ ] T-3: Unit functions — `currentUser`, `startOfWeek(offset)`, `openSprints` с моком даты
- [ ] T-4: Integration `/search/issues` × 5 ролей × 5 типовых запросов = 25 сценариев
- [ ] T-5: Integration RBAC — user без доступа к проекту получает 0 задач даже при явном `project = "SECRET"`
- [ ] T-6: Integration SavedFilter CRUD + sharing
- [ ] T-7: Fuzz-тест парсера — 1000 случайных входов (включая null-byte, SQL-payload, unicode RTL), 0 unhandled exceptions, 0 500
- [ ] T-8: Performance — seed 100K задач, assert p95 < 400ms для 5-clause-query
- [ ] T-9: E2E ([frontend/e2e](frontend/e2e/)): `search.spec.ts` — basic→advanced→save→favorite→share→URL→open in new tab
- [ ] T-10: Snapshot test Basic builder → canonical JQL
- [ ] T-11: Integration `/suggest` для каждого suggester'а из §5.11:
  - `assignee` — prefix возвращает пользователей в scope, вне scope отфильтрованы
  - `status` — возвращает workflow-статусы + systemKeys, с цветом
  - `sprint` / `release` — функции (`openSprints()` / `unreleasedVersions()`) первыми
  - `IN`-дедупликация уже выбранных
  - кастомное `SELECT` — опции из `CustomField.options`
- [ ] T-12: E2E: печатаем `assignee = al`, выбираем `alice`, строка становится `assignee = "alice@…"`; печатаем `status IN (`, выбираем 2 статуса — они в списке не повторяются
- [ ] T-13: Unit evaluator — matrix `conditionMode × issue-data`:
  - `STRUCTURED` — backward-compat: все существующие тесты зелёные
  - `TTQL` — задача попала в `where` → passed; не попала → violated с reason «Не соответствует условию TTS-QL»
  - `COMBINED` — passed = structured ∩ ttql (четыре комбинации SS/SF/FS/FF)
- [ ] T-14: Integration — миграция данных: существующий сид с `CheckpointType.criteria=[...]` → `conditionMode='STRUCTURED'`, TTQL-ветка не выполняется, `evaluateCheckpoint` возвращает идентичный `violationsHash`
- [ ] T-15: Integration — `TTQL`-режим с `releasePlannedDate()` + `due <= releasePlannedDate() + 3d` даёт те же passed/violated, что эквивалентный `DUE_BEFORE {days: 3}` structured criterion
- [ ] T-16: Integration — timeout TTQL-запроса (stub 6s) → `ReleaseCheckpoint.state='ERROR'` + violationEvent с `criterionType='TTQL_ERROR'`
- [ ] T-17: Integration — невалидный TTS-QL при create/patch `CheckpointType` → 400 с позицией ошибки; сохранение блокируется
- [ ] T-18: Integration — `POST /admin/checkpoint-types/preview` без `:id` (для нового типа до сохранения) возвращает те же passed/violated, что и evaluator после сохранения
- [ ] T-19: E2E: админ создаёт тип КТ в режиме TTQL, открывает релиз, видит `state`/violations, переключает тип в `COMBINED`, добавляет structured criterion, видит обновлённый preview после генерации checkpoint'ов
- [ ] T-20: Integration — `violatedCheckpoints()` без аргументов возвращает **только** задачи с `CheckpointViolationEvent.resolvedAt IS NULL` из доступных проектов; после resolve event'а задача исчезает из выборки
- [ ] T-21: Integration — `violatedCheckpoints("Go-live")` фильтрует по `CheckpointType.name` без учёта регистра; несуществующее имя → 0 результатов + warning в ответе (не 500)
- [ ] T-22: Integration — `violatedCheckpointsOf("REL-2.5.0")` принимает как релиз-ключ, так и UUID; фильтрует по `release.id` или `release.name`
- [ ] T-23: Integration — `checkpointsAtRisk()` возвращает задачи релизов в `WARNING/OVERDUE/ERROR` даже если у самой задачи пока нет violation-event (в отличие от `violatedCheckpoints()`)
- [ ] T-24: Integration — `hasCheckpointViolation = true` и `issue IN violatedCheckpoints()` эквивалентны (snapshot-тест нормализованного where)
- [ ] T-25: Integration — scope: пользователь без доступа к проекту релиза не видит задачи через `violatedCheckpoints*`, даже если они нарушают КТ (R3)
- [ ] Покрытие: backend/modules/search ≥ 80%, saved-filters ≥ 75%, frontend/search ≥ 60%

### Доступность (a11y)

- [ ] A11Y-1: JqlEditor доступен с клавиатуры, умеет ARIA-live для ошибок валидации
- [ ] A11Y-2: Кнопки filter/sort/column — `<button>` с aria-label
- [ ] A11Y-3: Модалки Save/Share — focus trap, Esc → close (+ вызов `load()`)
- [ ] A11Y-4: Контраст выделенных токенов в редакторе ≥ WCAG AA на обеих темах

---

## 7. Критерии приёмки (Definition of Done)

- [ ] Под флагом `FEATURES_ADVANCED_SEARCH=true` в staging: пункт «Поиск задач» появляется в сайдбаре, страница `/search` открывается
- [ ] Basic builder — можно собрать и выполнить запрос из 5 clauses без написания JQL
- [ ] Advanced editor — подсветка, автодополнение, inline-ошибки работают для всех полей/операторов из 5.2/5.1
- [ ] Автодополнение значений (§5.11) возвращает типизированные предложения для всех полей из таблицы suggester'ов, с avatar/цвет-точкой/иконкой, функциями первыми строками, дедупликацией в IN-списке
- [ ] В модалке `CheckpointType` доступен segmented control «Режим условия» (Structured / TTQL / Combined); переключение не стирает заполненное
- [ ] Все существующие `CheckpointType` после миграции сохраняют поведение: `violationsHash` и `state` идентичны до/после миграции (T-14)
- [ ] Эквивалентный TTQL-аналог `DUE_BEFORE{days:3}` даёт те же passed/violated, что structured (T-15)
- [ ] Timeout 5s в TTQL-ветке → `state='ERROR'` + visible banner с CTA «Открыть тип» (T-16)
- [ ] Preview-панель КТ работает без сохранения типа (T-18)
- [ ] E2E: создание TTQL-типа, observation, перевод в COMBINED, regenerate, refreshed violations (T-19)
- [ ] Структурные criteria **не удалены**: страница-редактор, API, evaluator, миграции, UI-пейдж `AdminReleaseCheckpointTypesPage` текущих возможностей сохраняются; все существующие e2e-тесты checkpoint-flow зелёные
- [ ] Выполняется ≥ 90% JQL-запросов из приложенного golden-set (`docs/tz/TTSRH-1-goldenset.jql` — ~50 живых запросов команды)
- [ ] Сохранение фильтра (PRIVATE → SHARED → PUBLIC), избранное, Share, копирование URL — всё работает
- [ ] Конфигуратор колонок — drag-n-drop, добавление кастомных полей, сохранение в фильтре и в user-preferences
- [ ] Экспорт CSV/XLSX — respects access + columns
- [ ] RBAC: негативные тесты (T-5, SEC-1) зелёные
- [ ] Парсер fuzz-тест (T-7) — 0 unhandled exceptions на 1000 входов
- [ ] Performance (T-8) — p95 < 400ms на seed 100K
- [ ] `make test`, `make e2e`, `make lint` — зелёные
- [ ] [version_history.md](version_history.md) обновлён
- [ ] Code review пройден
- [ ] Security review (JQL → SQL injection vector) пройден отдельным approver

---

## 8. Оценка трудоёмкости

| Этап | Часы |
|------|------|
| Утверждение грамматики, BNF, golden-set (50 запросов) | 4 |
| Backend: tokenizer | 4 |
| Backend: parser (recursive descent) + AST типы | 12 |
| Backend: validator (field registry, type inference) | 6 |
| Backend: compiler system-полей | 10 |
| Backend: compiler custom-полей (raw JSON SQL) | 8 |
| Backend: functions (currentUser, now, startOfX, sprints, releases, linkedIssues) | 8 |
| Backend: suggest — позиционный парсер + роутинг на suggester'ы | 6 |
| Backend: value suggesters (User/Project/Status/Sprint/Release/IssueType/Option/Label/Group/Issue/Enum/Date/Bool) + scope-фильтр | 10 |
| Backend: endpoint `/search/issues` + pagination + rate-limit + timeout | 4 |
| Backend: endpoint `/search/validate` | 2 |
| Backend: endpoint `/search/export` CSV+XLSX | 4 |
| Backend: модель `SavedFilter` + миграция Prisma + CRUD + share | 8 |
| Backend: модель `User.preferences` + PATCH | 2 |
| Backend: fuzz-тест парсера + security-review harness | 4 |
| Backend: unit/integration тесты (все уровни) | 16 |
| Frontend: роут + SearchPage shell + layout | 4 |
| Frontend: `JqlEditor` (CodeMirror 6, подсветка, lazy-load) | 10 |
| Frontend: `ValueSuggesterPopup` (renderer avatar/dot/icon + keyboard nav + debounce + кэш SWR) | 6 |
| Frontend: интеграция `ValueSuggesterPopup` в CodeMirror autocomplete (CompletionSource adapter) | 4 |
| Frontend: интеграция `ValueSuggesterPopup` в BasicFilterBuilder chip-popover | 3 |
| Backend: Prisma миграция CheckpointType + ReleaseCheckpoint (TTSRH-27) | 3 |
| Backend: DTO superRefine + validator variant=CHECKPOINT (TTSRH-28) | 4 |
| Backend: КТ-функции releasePlannedDate / checkpointDeadline + schema variants (TTSRH-29) | 4 |
| Backend: checkpoint-engine TTQL-ветка + COMBINED intersect + violationsHash (TTSRH-30) | 8 |
| Backend: error-handling TTQL (timeout/compile/runtime) + state=ERROR + violationEvent (TTSRH-31) | 4 |
| Backend: /admin/checkpoint-types/preview (TTSRH-32) | 3 |
| Backend: unit/integration tests T-13..T-18 | 8 |
| Frontend: КТ segment-mode + show/hide + иконка (TTSRH-33) | 4 |
| Frontend: КТ JqlEditor variant=CHECKPOINT (TTSRH-34) | 3 |
| Frontend: КТ Preview-panel (TTSRH-35) | 4 |
| Frontend: structured→TTQL converter (TTSRH-36) | 4 |
| E2E: T-19 КТ-TTQL end-to-end сценарий | 3 |
| Backend: checkpoint-функции TTS-QL (violatedCheckpoints/OfRelease/AtRisk/InState + 3 поля) + suggesters + T-20..T-25 (TTSRH-37) | 8 |
| Frontend: inline-ошибки (линия/подчёркивание) | 3 |
| Frontend: `BasicFilterBuilder` | 12 |
| Frontend: Basic↔Advanced переключение + canonicalizer | 4 |
| Frontend: `SavedFiltersSidebar` + store | 6 |
| Frontend: `SaveFilterModal` + `FilterShareModal` | 6 |
| Frontend: `ColumnConfigurator` (drag-n-drop) | 6 |
| Frontend: `ResultsTable` + сортировка по клику + пагинация | 5 |
| Frontend: `BulkActionsBar` + кросс-проектный bulk | 5 |
| Frontend: `ExportMenu` | 2 |
| Frontend: sidebar-пункт + favorite submenu | 3 |
| Frontend: URL sync + deep-linking | 3 |
| Frontend: shortcuts (`/`, `Ctrl+Enter`, `Ctrl+S`) | 2 |
| Frontend: unit/component тесты | 8 |
| E2E (`search.spec.ts`) + screenshot snapshots | 6 |
| Perf-seed + profiling + composite-index tuning | 4 |
| Документация: руководство пользователя JQL ([docs/user-manual/jql.md](docs/user-manual/jql.md)), reference операторов/функций | 6 |
| Code review + фиксы | 8 |
| Security-review + фиксы | 4 |
| **Итого** | **278** |

---

## 9. Связанные задачи

**Родитель:** нет (STORY верхнего уровня).

**Дочерние:**
- TTSRH-2 — Backend: tokenizer + parser TTS-QL + AST + golden-set тесты
- TTSRH-3 — Backend: field registry + validator + suggest
- TTSRH-4 — Backend: compiler system-полей (AST → Prisma where)
- TTSRH-5 — Backend: compiler custom-полей (JSONB raw-SQL)
- TTSRH-6 — Backend: функции (currentUser/now/openSprints/…)
- TTSRH-7 — Backend: endpoints `/search/issues`, `/search/validate`, `/search/suggest` + rate-limit + timeout
- TTSRH-8 — Backend: SavedFilter модель + миграция + CRUD + share
- TTSRH-9 — Backend: User.preferences + PATCH /users/me/preferences
- TTSRH-10 — Backend: export CSV/XLSX
- TTSRH-11 — Backend: fuzz-тесты + security-review harness
- TTSRH-12 — Frontend: SearchPage shell + роут + сайдбар-пункт + submenu «Избранные»
- TTSRH-13 — Frontend: JqlEditor (CodeMirror 6, подсветка, lazy-load)
- TTSRH-14 — Frontend: автодополнение + inline-ошибки
- TTSRH-15 — Frontend: BasicFilterBuilder + Basic↔Advanced toggle
- TTSRH-16 — Frontend: SavedFiltersSidebar + save/share модалки + store
- TTSRH-17 — Frontend: ColumnConfigurator (drag-n-drop)
- TTSRH-18 — Frontend: ResultsTable + sort-by-click + bulk-actions + ExportMenu
- TTSRH-19 — Frontend: URL sync + deep linking + shortcuts
- TTSRH-20 — E2E + perf seed + Lighthouse budget
- TTSRH-21 — Документация: JQL reference + user manual
- TTSRH-22 — Feature flag `FEATURES_ADVANCED_SEARCH` + staging-cutover
- TTSRH-25 — Backend: Value Suggesters (реестр + 13 провайдеров + scope-enforce) + роутинг в `/suggest`
- TTSRH-26 — Frontend: `ValueSuggesterPopup` + CodeMirror autocomplete adapter + интеграция в BasicFilterBuilder
- TTSRH-27 — Prisma миграция: `CheckpointType.ttqlCondition`, `CheckpointType.conditionMode`, `ReleaseCheckpoint.ttqlSnapshot`, `ReleaseCheckpoint.conditionModeSnapshot`, backfill существующих строк в `STRUCTURED`
- TTSRH-28 — Backend: DTO/Zod superRefine для `conditionMode × criteria × ttqlCondition` + `/search/validate?variant=CHECKPOINT`
- TTSRH-29 — Backend: функции TTS-QL-контекста КТ (`releasePlannedDate()`, `checkpointDeadline()`), валидатор currentUser-warning, поведение scope-фильтра
- TTSRH-30 — Backend: расширение `checkpoint-engine.service.ts` — TTQL-ветка (compile → Prisma findMany → passed-set), COMBINED-пересечение, `violationsHash` стабилен
- TTSRH-31 — Backend: обработка ошибок TTQL — timeout 5s, compile-error, runtime-error → `state='ERROR'` + violationEvent `TTQL_ERROR` + UI-баннер
- TTSRH-32 — Backend: `POST /admin/checkpoint-types/preview` (dry-run для отладки до сохранения)
- TTSRH-33 — Frontend: segmented control «Режим условия» в `AdminReleaseCheckpointTypesPage`, show/hide секций structured/TTQL без потери form-state, иконка режима в таблице
- TTSRH-34 — Frontend: интеграция `JqlEditor` в модалку КТ с `variant=CHECKPOINT` (автокомплит КТ-функций, скрытие `currentUser()` из топа, warning-иконка при ручном вводе)
- TTSRH-35 — Frontend: Preview-панель КТ (выбор релиза → applicable/passed/violated + список violations)
- TTSRH-36 — Frontend: кнопка «Сконвертировать в TTS-QL» для existing structured-типов (one-way generator → ручная проверка)
- TTSRH-37 — Backend: checkpoint-функции и поля TTS-QL — `violatedCheckpoints([typeName])`, `violatedCheckpointsOf(release[, typeName])`, `checkpointsAtRisk([typeName])`, `checkpointsInState(state[, typeName])`, поля `hasCheckpointViolation`, `checkpointViolationType`, `checkpointViolationReason`, suggester'ы `CheckpointTypeSuggester` / `CheckpointStateSuggester`, unit + integration тесты T-20..T-25
- TTSRH-23 — *(Phase 2)* WAS/CHANGED операторы + FieldChangeLog таблица
- TTSRH-24 — *(Phase 2)* PG full-text + `pg_trgm` индексы + `unaccent`

---

## 10. Иерархия задач

```
TTSRH-1 (STORY) — Внутренний язык запросов TTS-QL + страница поиска + сохраняемые фильтры
├── TTSRH-2  (TASK) — Tokenizer + Parser + AST + golden-set
├── TTSRH-3  (TASK) — Field registry + Validator + Suggest
├── TTSRH-4  (TASK) — Compiler (system fields → Prisma where)
├── TTSRH-5  (TASK) — Compiler (custom fields → raw JSONB SQL)
├── TTSRH-6  (TASK) — Функции (currentUser, now, startOfX, sprints, releases, linkedIssues)
├── TTSRH-7  (TASK) — Endpoints /search/issues, /validate, /suggest + rate-limit + timeout
├── TTSRH-8  (TASK) — SavedFilter модель + CRUD + share
├── TTSRH-9  (TASK) — User.preferences + PATCH
├── TTSRH-10 (TASK) — Export CSV/XLSX
├── TTSRH-11 (TASK) — Fuzz-тесты + security-review harness
├── TTSRH-12 (TASK) — Frontend: SearchPage shell + сайдбар
├── TTSRH-13 (TASK) — Frontend: JqlEditor (CodeMirror 6)
├── TTSRH-14 (TASK) — Frontend: автодополнение + inline-ошибки
├── TTSRH-15 (TASK) — Frontend: BasicFilterBuilder + Basic↔Advanced
├── TTSRH-16 (TASK) — Frontend: SavedFiltersSidebar + save/share модалки
├── TTSRH-17 (TASK) — Frontend: ColumnConfigurator
├── TTSRH-18 (TASK) — Frontend: ResultsTable + bulk-actions + export UI
├── TTSRH-19 (TASK) — Frontend: URL sync + shortcuts
├── TTSRH-20 (TASK) — E2E + perf seed + Lighthouse
├── TTSRH-21 (TASK) — Документация: JQL reference + user manual
├── TTSRH-22 (TASK) — Feature flag + staging-cutover
├── TTSRH-25 (TASK) — Backend Value Suggesters (13 провайдеров + scope)
├── TTSRH-26 (TASK) — Frontend ValueSuggesterPopup + CM6/Basic интеграция
├── TTSRH-27 (TASK) — Prisma миграция: CheckpointType.ttqlCondition/conditionMode + snapshot
├── TTSRH-28 (TASK) — DTO superRefine + /search/validate?variant=CHECKPOINT
├── TTSRH-29 (TASK) — КТ-функции (releasePlannedDate, checkpointDeadline) + context-aware schema
├── TTSRH-30 (TASK) — checkpoint-engine: TTQL-ветка + COMBINED-пересечение
├── TTSRH-31 (TASK) — обработка ошибок TTQL (timeout/compile/runtime) → state=ERROR
├── TTSRH-32 (TASK) — POST /admin/checkpoint-types/preview (dry-run)
├── TTSRH-33 (TASK) — Frontend КТ: segment-mode + show/hide + иконка в таблице
├── TTSRH-34 (TASK) — Frontend КТ: JqlEditor variant=CHECKPOINT
├── TTSRH-35 (TASK) — Frontend КТ: Preview panel (applicable/passed/violated)
├── TTSRH-36 (TASK) — Frontend КТ: конвертер structured → TTS-QL (one-way, с ручной проверкой)
├── TTSRH-37 (TASK) — TTS-QL checkpoint-functions: violatedCheckpoints/OfRelease/AtRisk/InState + поля + suggesters + тесты
├── TTSRH-23 (PHASE-2) — WAS/CHANGED + FieldChangeLog
└── TTSRH-24 (PHASE-2) — PG full-text + pg_trgm + unaccent
```

**Порядок выполнения (критический путь):**

1. `TTSRH-2` → `TTSRH-3` → `TTSRH-4` → `TTSRH-6` → `TTSRH-7` (backend-цепочка: без парсера нет ничего)
2. `TTSRH-5` параллельно с `TTSRH-6` после `TTSRH-4`
3. `TTSRH-8` / `TTSRH-9` — параллельно, независимы от парсера
4. `TTSRH-12` → `TTSRH-13` → `TTSRH-14` → `TTSRH-15` → (`TTSRH-16`/`TTSRH-17`/`TTSRH-18` параллельно) → `TTSRH-19`
5. `TTSRH-11` (fuzz) — сразу после `TTSRH-4` и блокирует merge главной ветки
6. `TTSRH-10` (export) — после `TTSRH-18`
7. `TTSRH-20` → `TTSRH-21` → `TTSRH-22` — финал перед cutover
8. `TTSRH-23`/`TTSRH-24` — Phase 2, не блокируют MVP-релиз

---

## 11. Golden-set JQL (фрагмент, ≈ 20 из 50)

Файл [docs/tz/TTSRH-1-goldenset.jql](docs/tz/TTSRH-1-goldenset.jql) содержит канонические запросы, которые обязаны работать в DoD. Примеры:

```sql
-- 01: Мои открытые задачи
assignee = currentUser() AND statusCategory != DONE ORDER BY priority DESC, updated DESC

-- 02: Блокеры в активном спринте
status = "Blocked" AND sprint in openSprints()

-- 03: Просроченные задачи моей команды
assignee in membersOf("flow-team-1") AND due < now() AND statusCategory != DONE

-- 04: В ревью у меня дольше 3 дней
status = "REVIEW" AND assignee = currentUser() AND updated < "-3d"

-- 05: Критичные без оценки
priority = CRITICAL AND estimatedHours IS EMPTY

-- 06: Задачи по эпику
epic = "TTMP-10" ORDER BY priority DESC

-- 07: Story Points > 5 в активном спринте
"Story Points" > 5 AND sprint in openSprints()

-- 08: AI-eligible в AGENT-режиме
aiEligible = true AND aiAssigneeType = AGENT AND statusCategory != DONE

-- 09: Задачи, созданные на этой неделе
created >= startOfWeek() AND created < endOfWeek()

-- 10: Незакрытые блокирующие задачи
issue in linkedIssues("TTMP-42", "blocks") AND statusCategory != DONE

-- 11: Label поиск
labels in ("backend", "security") AND statusCategory != DONE

-- 12: Без assignee, HIGH и выше
assignee IS EMPTY AND priority IN (CRITICAL, HIGH)

-- 13: NOT-вложенные
NOT (status = DONE OR status = CANCELLED) AND assignee = currentUser()

-- 14: Текстовый поиск
summary ~ "аутентификация" OR description ~ "аутентификация"

-- 15: По релизу
release = "v2.5.0" AND statusCategory = DONE

-- 16: По нескольким проектам
project IN (TTMP, TTUI, TTSEC) AND priority = CRITICAL

-- 17: Без спринта, в бэклоге
sprint IS EMPTY AND status = OPEN AND project = "TTMP"

-- 18: Свежие комментарии
comment ~ "LGTM" AND updated >= "-1d"

-- 19: Сколько залогировано
timeSpent > 8 AND assignee = currentUser()

-- 20: Сортировка по сумме дедлайнов
due IS NOT EMPTY ORDER BY due ASC, priority DESC
```

---

## 12. Замечания к документации

- [ ] Обновить [docs/user-manual/](docs/user-manual/) разделом «Поиск задач / TTS-QL» с примерами из Golden-set и таблицами операторов/функций.
- [ ] Обновить [docs/api/reference.md](docs/api/reference.md) эндпоинтами из 5.6.
- [ ] Обновить [version_history.md](version_history.md) записью о TTSRH-1 в том же коммите, что функциональный код (memory rule).
- [ ] Добавить в [docs/MCP_GUIDE.html](docs/MCP_GUIDE.html) упоминание `search_issues` MCP-tool, если решим покрыть и MCP (отдельный тикет TTSRH-25, опционально).

---

## 13. План реализации (PR / ветки / merge plan)

### 13.1 Стратегия

- **База:** все ветки создаются от свежего `main`, PR-ы мерджатся напрямую в `main` (консистентно с TTMP-160).
- **Feature flag:** `FEATURES_ADVANCED_SEARCH=false` в production до PR-21 (UAT cutover). Пункт сайдбара, страница `/search` и Admin-секция «TTS-QL в КТ» при выключенном флаге не рендерятся / 404. Бекенд-эндпоинты `/api/search/*` и `/api/saved-filters/*` защищены тем же флагом (middleware → 404) чтобы не предлагать недокументированный API. КТ-TTQL ветка в evaluator'е — отдельный sub-flag `FEATURES_CHECKPOINT_TTQL=false` на случай, если core-поиск выкатим раньше.
- **Именование веток:** `ttsrh-1/<scope>` (совместимо с `ttmp-160/<scope>`, `ttadm-68/<scope>`).
- **Имя коммита:** `feat(search): TTSRH-1 — <scope>`, `feat(checkpoints): TTSRH-1 — <scope>`, `chore(search): …` для вспомогательных.
- **Размер PR:** целимся 400–900 строк diff. PR-10 и PR-15 потенциально крупнее — при 1000+ строк разбиваем на два.
- **CI:** каждый PR — `make lint`, `make test`, Playwright e2e (кроме PR, не меняющих UI). Начиная с PR-5 CI обязан прогонять fuzz-harness (5 мин, 1000 случайных JQL, 0 unhandled / 0 500).
- **Staging deploy:** авто-деплой на `main`; smoke-check по чек-листу PR (см. чек-листы в каждой карточке).
- **Security review gate:** merge PR-5 и PR-16 (анти-инъекция, скоуп, raw SQL в `Prisma.sql`) требует apprоv'а отдельного security-review человека (R1, R3).
- **Миграции:** каждая Prisma-миграция — отдельный PR (PR-1, PR-15), чтобы `prisma migrate deploy` был проверяем на staging перед follow-up кодом.
- **Backward compat:** PR-15 **не конвертирует** existing `CheckpointType.criteria` в TTQL — все существующие КТ остаются `conditionMode='STRUCTURED'`, поведение неизменно (R21, FR-25).

### 13.2 DAG зависимостей

```
PR-1 (schema+flag) ─► PR-2 (parser) ─► PR-3 (validator+schema) ─► PR-4 (compiler) ─► PR-5 (endpoints+fuzz)
                                                                                      │
                                                                                      ├─► PR-6 (suggesters backend)
                                                                                      ├─► PR-7 (SavedFilter API + user prefs)
                                                                                      └─► PR-8 (export CSV/XLSX)

PR-5 ─► PR-9  (SearchPage shell + sidebar + route)
PR-6 ─► PR-10 (JqlEditor + highlight + inline errors)
PR-6 ─► PR-11 (ValueSuggesterPopup + CM6 adapter)
PR-9+PR-10+PR-11 ─► PR-12 (BasicFilterBuilder + toggle)
PR-7 ─► PR-13 (SavedFiltersSidebar + modals + store)
PR-5 ─► PR-14 (ColumnConfigurator + ResultsTable + bulk + export UI + shortcuts)

PR-1 ─► PR-15 (Checkpoint Prisma + DTO + КТ-функции) ─► PR-16 (engine TTQL-ветка + error handling)
PR-16 ─► PR-17 (/preview + violatedCheckpoints* функции + checkpoint-поля)
PR-5+PR-15 ─► PR-18 (КТ UI: segment-mode + JqlEditor + Preview panel + mode-icon)
PR-18 ─► PR-19 (structured→TTQL converter)

PR-12+PR-13+PR-14+PR-17+PR-19 ─► PR-20 (E2E + perf seed + Lighthouse)
PR-20 ─► PR-21 (docs + feature flag cutover)
```

Параллелизм: после merge PR-5 — PR-6/PR-7/PR-8 параллельно; после PR-6 — PR-10/PR-11 параллельно; после PR-1 — PR-15 параллельно со всей core-цепочкой (backend КТ не зависит от завершённого frontend поиска).

### 13.3 PR-ы Фазы 0 — Foundation (~6ч)

#### PR-1: Prisma schema + feature flag
- **Branch:** `ttsrh-1/foundation`
- **Scope:**
  - Миграция `YYYYMMDDHHMMSS_ttsrh_saved_filters_and_checkpoint_ttql` — модели `SavedFilter`, `SavedFilterShare`, enum `FilterVisibility`, `FilterPermission`, `User.preferences Json?`. (§3.3)
  - env-флаги `FEATURES_ADVANCED_SEARCH`, `FEATURES_CHECKPOINT_TTQL` в [shared/config.ts](backend/src/shared/config.ts).
  - Пустой модуль `backend/src/modules/search/` и `backend/src/modules/saved-filters/` с `search.router.ts`/`saved-filters.router.ts`, возвращающими 404 при выключенном флаге; mount в `app.ts`.
  - Пустой файл `frontend/src/pages/SearchPage.tsx` (placeholder «Feature disabled»), условный рендер пункта сайдбара (только при флаге).
  - `prisma generate`, тесты `make test`.
- **Не включает:** ни грамматики, ни UI, ни CRUD SavedFilter — только инфраструктуру.
- **Merge-ready check:** миграция применяется/откатывается на чистой БД; при `FEATURES_ADVANCED_SEARCH=true` эндпоинты возвращают 501 (`Not implemented`); пункт сайдбара появляется.
- **Оценка:** ~6ч.

### 13.4 PR-ы Фазы 1 — TTS-QL Backend Core (~50ч)

#### PR-2: Tokenizer + Parser + AST + golden-set
- **Branch:** `ttsrh-1/parser`
- **Scope:** (§5.1, TTSRH-2)
  - `backend/src/modules/search/search.ast.ts` — типы `Node`, `OrNode`, `AndNode`, `NotNode`, `ClauseNode`, `FunctionCall`, `Literal`, `OrderBy`, `Span`.
  - `search.tokenizer.ts` — regex-лексер (STRING с escape, NUMBER, IDENT, KEYWORD, OP, RELATIVE_DATE, CUSTOM_FIELD), позиции `{start, end}`.
  - `search.parser.ts` — recursive descent, приоритет `( > NOT > AND > OR > ORDER BY`; ошибки с позицией (recovery-режим для частичного AST — подготовка к suggest).
  - Unit: **100+ кейсов** (экранирование, NOT-приоритет, глубокая вложенность, комментарии `--`, unicode, RTL, null-byte) + snapshot-тесты AST.
  - Golden-set: [docs/tz/TTSRH-1-goldenset.jql](docs/tz/TTSRH-1-goldenset.jql) — все 50 запросов парсятся без ошибок; выделить под это тест-файл `parser-goldenset.test.ts`.
- **Не включает:** валидатор, компилятор, эндпоинты.
- **Merge-ready check:** T-1, T-7 (1000-fuzz через базовый harness — 0 unhandled) зелёные; покрытие парсера ≥ 95%.
- **Оценка:** ~14ч.

#### PR-3: Field registry + Validator + функции + /search/schema
- **Branch:** `ttsrh-1/validator`
- **Scope:** (§5.2, §5.4, TTSRH-3, TTSRH-6)
  - `search.schema.ts` — реестр полей (system из 5.2) + динамическая подгрузка custom fields через `CustomField.findMany({where: {isEnabled: true}})` с кэшем 60с.
  - `search.functions.ts` — реализация MVP-функций (`currentUser()`, `now()`, `today()`, `startOfDay/Week/Month/Year`, `openSprints()`, `closedSprints()`, `futureSprints()`, `unreleasedVersions()`, `releasedVersions()`, `linkedIssues()`, `subtasksOf()`, `epicIssues()`, `myOpenIssues()`, `membersOf()`).
  - `search.validator.ts` — ходит по AST, резолвит field↔type, operator↔type-compatibility, function arity/types; возвращает `{valid, errors: [{start, end, code, message, hint?}]}` без прерывания (для UX автокомплита).
  - `GET /api/search/schema` (`?variant=default`) — структура для UI-подсказок: `{fields: [{name, type, operators, sortable, synonyms}], functions: [...]}`.
  - `POST /api/search/validate` — stub, делегирует в validator (без выполнения).
  - Unit T-3 (функции с моком даты), snapshot-тесты validator-ошибок.
- **Не включает:** компилятор (нет SQL/where), suggest (только schema).
- **Merge-ready check:** T-3 зелёные; `/search/validate` на 50 golden-set-запросов возвращает `valid: true`; все Phase-2 операторы (`WAS`, `CHANGED`) возвращают `NotImplemented` с позицией.
- **Оценка:** ~14ч.

#### PR-4: Compiler (system + custom fields → Prisma where)
- **Branch:** `ttsrh-1/compiler`
- **Scope:** (§5.5, TTSRH-4, TTSRH-5)
  - `search.compiler.ts`:
    - AST → `Prisma.IssueWhereInput` для system-полей.
    - Custom fields — `Prisma.sql` raw-fragment с JSON-операторами (`->>`, `@>`, числовые касты) в `id IN (SELECT issue_id FROM issue_custom_field_values WHERE ...)`. Диспетчеризация по `CustomFieldType` (§5.3).
    - **Scope-фильтр на верхнем AND** (R3): `projectId IN (:accessibleProjectIds)` — всегда добавляется компилятором, не парсером. Извлекаем `accessibleProjectIds` тем же паттерном, что `issues.router.ts:57-65` (R3).
    - Ambiguity-резолв для `"Story Points"` (R7): если без `project = X` и поле есть в нескольких scoped `FieldSchemaBinding` — warning через `warnings[]` в ответе, компилятор выбирает union всех совпадений.
    - Композитные индексы, обоснованные профайлингом (`@@index([projectId, assigneeId, status])`, `@@index([sprintId, status])`) — в follow-up миграции после perf-seed (PR-20).
  - Unit T-2 (per-field × per-operator матрица ≥ 60), integration T-5 (RBAC negative — 0 задач при `project = "SECRET"` без доступа).
  - Property-based тест: fuzzer→parser→validator→compiler не падает на 1000 random inputs (расширение fuzz-harness).
- **Не включает:** эндпоинты (`/search/issues` пока недоступен), suggest, history-операторы.
- **Merge-ready check:** T-2, T-5 зелёные; security-review gate — все raw-SQL через `Prisma.sql`; покрытие compiler ≥ 85%.
- **Оценка:** ~18ч.

#### PR-5: Endpoints + rate-limit + timeout + fuzz-harness
- **Branch:** `ttsrh-1/endpoints`
- **Scope:** (§5.6, §5.9, TTSRH-7, TTSRH-11)
  - `POST /api/search/issues` — pipeline `parse → validate → compile → prisma.findMany` с pagination (`startAt ≤ 10000`, `limit ≤ 100`, total count), scope-фильтр из context.
  - Rate-limit middleware 30/min/user (паттерн существующих middlewares), hard-timeout 10с (504 gateway-timeout, не 500), cap-результат 500 для «только-текстовых» запросов (R4). Middleware пишет в `AuditLog` medium-debug.
  - Fuzz-harness `backend/tests/search-fuzz.test.ts`: 1000 случайных JQL (экранируемые кавычки, null-bytes, unicode RTL, SQL-payloads), 0 unhandled, 0 500.
  - Security-review checklist `docs/security/search-ttql-review.md`: raw-SQL paths, scope-enforcement, rate-limit, timeout, CSRF/CORS.
  - Integration T-4 (5 ролей × 5 запросов), T-8 (perf на 100K задач — выносится сидер в `backend/tests/fixtures/search-100k.ts`).
- **Не включает:** `/suggest`, `/export`, SavedFilter.
- **Merge-ready check:** T-4, T-5, T-7, T-8 зелёные; **security-review approver** подписал; staging под флагом работает для golden-set.
- **Оценка:** ~10ч.

### 13.5 PR-ы Фазы 2 — Suggest + SavedFilter + Export (~22ч)

#### PR-6: Value Suggesters backend + /search/suggest
- **Branch:** `ttsrh-1/suggesters`
- **Scope:** (§5.11, TTSRH-25)
  - `search.suggest.ts`:
    - Позиционный парсер (recovery-режим из PR-2): определяет `expectedField | expectedOperator | expectedValue | inValueList`.
    - Реестр провайдеров: `ProjectSuggester`, `UserSuggester`, `StatusSuggester`, `EnumSuggester`, `IssueTypeSuggester`, `SprintSuggester`, `ReleaseSuggester`, `IssueSuggester`, `LabelSuggester`, `OptionSuggester`, `ReferenceSuggester`, `DateSuggester`, `NumberSuggester`, `TextSuggester`, `BoolSuggester`, `GroupSuggester`.
    - Scope-фильтр для dynamic-provider'ов (scoped user-set, project-set).
    - Fuzzy-ranking (exact → startsWith → contains → subsequence); user-suggester приоритизирует по `AuditLog.lastInteractedAt` (или считаем per-request top-50 без истории).
    - Дедупликация в `IN (…)` (R7).
  - `GET /api/search/suggest?jql=...&cursor=N[&field=&operator=&prefix=]` — §5.11 контракт.
  - Integration T-11 (13 suggester'ов × prefix-ранжирование + scope).
- **Не включает:** frontend-адаптер — он в PR-11.
- **Merge-ready check:** T-11 зелёные; /suggest p95 < 200ms на seed (NFR-3).
- **Оценка:** ~10ч.

#### PR-7: SavedFilter CRUD + sharing + favorite + User.preferences
- **Branch:** `ttsrh-1/saved-filters`
- **Scope:** (§5.6, TTSRH-8, TTSRH-9)
  - `saved-filters.dto.ts`, `saved-filters.service.ts`, `saved-filters.router.ts`:
    - `GET /api/saved-filters?scope=mine|shared|public|favorite`.
    - `POST /api/saved-filters` с Zod-валидацией visibility/sharedWith.
    - `GET/PATCH/DELETE /api/saved-filters/:id` (403 на чужое, 200 на SHARED-WRITE).
    - `POST /api/saved-filters/:id/favorite`, `POST /api/saved-filters/:id/share`.
    - Инкремент `useCount`/`lastUsedAt` при `GET /:id/execute` (или при фронт-оркестрированном `POST /search/issues` с `savedFilterId=` — выбрать паттерн, зафиксировать в PR).
    - `AuditLog` на create/update/delete/share (SEC-7).
  - `users.service.ts` — расширение `GET/PATCH /api/users/me/preferences` для `{searchDefaults: {columns: string[], pageSize: number}}`. JSON-схема с версионированием (паттерн TTUI-90 §5.4).
  - Integration T-6 (CRUD + sharing + RBAC negative).
- **Merge-ready check:** T-6 зелёные; SavedFilter PUBLIC + невидимые проекты → 0 задач (SEC-8).
- **Оценка:** ~8ч.
- **Статус: ✅ Done** — 24 integration-теста (CRUD × 10, Sharing × 6, Favorite/use × 4, Audit × 1, Preferences × 5) + shallow-merge preferences + owner-only favorite + group-share через `UserGroupMember`. Добавлен `POST /:id/use` для incrementUseStats (инкремент `useCount` + `lastUsedAt`). В §13.9 — 🟢 Merged после слияния PR.

#### PR-8: Export CSV/XLSX
- **Branch:** `ttsrh-1/export`
- **Scope:** (§5.6, TTSRH-10)
  - `POST /api/search/export { jql, format: 'csv'|'xlsx', columns }` — streaming response, hard-timeout 60с (NFR-8).
  - `papaparse` для CSV (проверить наличие в deps, иначе добавить), `exceljs` или `xlsx` для XLSX — минимизировать зависимость (можно стримом из JSON).
  - Respect колонок (включая кастомные поля через JSON-extract).
  - Integration: negative-test на закрытый проект — строки не попадают в экспорт (SEC-1).
- **Merge-ready check:** /export для 10K задач укладывается в 60с, респонс 200 OK.
- **Оценка:** ~4ч.

### 13.6 PR-ы Фазы 3 — Frontend Search Page (~50ч)

#### PR-9: SearchPage shell + route + sidebar + URL sync base
- **Branch:** `ttsrh-1/frontend-shell`
- **Scope:** (§5.7, TTSRH-12, частично TTSRH-19)
  - Роут `/search` + `/search/saved/:filterId` в [App.tsx](frontend/src/App.tsx); условный рендер по флагу.
  - Пункт сайдбара «Поиск задач» с `data-testid="nav-search"` между «Projects» и «Planning»; иконка-лупа 16×16 SVG (§5.7).
  - Submenu «Избранные фильтры» — раскрывается при активной странице (до 5, сорт `useCount DESC`, `lastUsedAt DESC`); читает из `savedFilters.store.ts` (пустая реализация в этом PR).
  - 3-колоночный layout `SidebarFilters | ResultsArea | DetailPreview` (пустые placeholder'ы).
  - URL-синхронизация: `?jql=<encoded>&view=table&columns=...&page=N` — чтение на mount, запись на каждое успешное выполнение.
  - `frontend/src/api/search.ts`, `frontend/src/api/savedFilters.ts` (тонкие клиенты для PR-5, PR-6, PR-7).
- **Merge-ready check:** страница открывается, URL-sync работает на пустом JQL, снэпшот-тест layout.
- **Оценка:** ~6ч.

#### PR-10: JqlEditor (CodeMirror 6) + inline errors
- **Branch:** `ttsrh-1/jql-editor`
- **Scope:** (§5.7, TTSRH-13, TTSRH-14)
  - `frontend/src/components/search/JqlEditor.tsx` — CodeMirror 6 + `StreamLanguage` с нашими токенами (подсветка keywords/strings/numbers/functions/IDENT), lazy-load через `React.lazy` + `Suspense` (R8, NFR-5 ≤ 160KB gzip).
  - Добавить deps `@codemirror/state`, `@codemirror/view`, `@codemirror/language`, `@codemirror/autocomplete`, `@codemirror/search` в [frontend/package.json](frontend/package.json).
  - Inline-errors: подключаем `/search/validate` (debounce 300ms), рендерим `Decoration.mark` squiggle + gutter-marker по `{start, end}`.
  - ValidationErrorBanner для error-sum.
  - Shortcut `/` → focus editor (глобально, регистрируется через `window.addEventListener('keydown')` с респектом input-focus); `Ctrl+Enter` → выполнить.
  - Бандл-аудит в CI: `npx source-map-explorer` на chunk `/search` или Lighthouse budget (NFR-5).
- **Merge-ready check:** NFR-5 не превышен; a11y A11Y-1 (ARIA-live для ошибок) покрыт.
- **Оценка:** ~13ч.

#### PR-11: ValueSuggesterPopup + CM6 autocomplete adapter
- **Branch:** `ttsrh-1/value-suggester`
- **Scope:** (§5.11, TTSRH-26)
  - `frontend/src/components/search/ValueSuggesterPopup.tsx` — unified-компонент: renderer по `kind` (avatar/color-dot/svg/emoji), keyboard navigation, debounce 150ms для dynamic-provider'ов, SWR-кэш 60с для Project/IssueType/Status, 30с для Sprint/Release.
  - CM6 `CompletionSource` adapter, который маппит `/search/suggest` → `CompletionResult` с `apply` (вставка raw) и `info` (detail + icon). Автоматически открывается после `=`/`!=`/`,`/`(` и при Ctrl+Space.
  - Первый раунд интеграции с BasicFilterBuilder — попап используется в chip-popover (mode=multi для IN-clause).
  - E2E T-12 (автокомплит assignee+status).
- **Merge-ready check:** T-12 зелёный; визуальный снапшот popup для 5 suggester'ов.
- **Оценка:** ~10ч.

#### PR-12: BasicFilterBuilder + Basic↔Advanced toggle
- **Branch:** `ttsrh-1/basic-builder`
- **Scope:** (§5.7, TTSRH-15)
  - `BasicFilterBuilder.tsx` — chip-add с каскадным меню полей (Задача / Даты / Пользователи / Планирование / AI / Кастомные). Каждый chip = popover с `ValueSuggesterPopup`.
  - Canonicalizer AST → canonical JQL → Basic-chips (и обратно); Advanced→Basic disabled при OR/NOT-с-группами/custom-operators (R9) + tooltip.
  - `FilterModeToggle.tsx`.
  - Snapshot T-10 (Basic → canonical JQL).
- **Merge-ready check:** 80% golden-set-запросов строится в Basic без перехода в Advanced (FR-12).
- **Оценка:** ~12ч.

#### PR-13: SavedFiltersSidebar + Save/Share modals + store
- **Branch:** `ttsrh-1/saved-filters-ui`
- **Scope:** (§5.7, TTSRH-16)
  - `frontend/src/store/savedFilters.store.ts` (Zustand, паттерн существующих); `search.store.ts` для runtime-состояния.
  - `SavedFiltersSidebar.tsx` — списки «Мои» / «Избранные» / «Общедоступные» / «Поделены со мной» / «Недавние».
  - `SaveFilterModal.tsx` — имя/описание/visibility/shared-with; warning при PUBLIC (R11).
  - `FilterShareModal.tsx` — copy-link, visibility switch, users/groups picker.
  - **CLAUDE.md правило:** `onCancel`/`onClose` всех модалок вызывают `load()` родительского `SavedFiltersSidebar` (FR-18).
  - Shortcut `Ctrl+S` → Save (или SaveAs если не назван); `Ctrl+Shift+S` → SaveAs.
- **Merge-ready check:** E2E create → favorite → share → copy-link.
- **Оценка:** ~8ч.

#### PR-14: ColumnConfigurator + ResultsTable + bulk + export UI
- **Branch:** `ttsrh-1/results`
- **Scope:** (§5.7, §5.8, TTSRH-17, TTSRH-18, остаток TTSRH-19)
  - `ColumnConfigurator.tsx` — drag-n-drop (react-dnd или нативный HTML5 DnD — выбрать по наличию в deps) двух списков Available/Selected; сохранение в `SavedFilter.columns` или `User.preferences.searchDefaults.columns`.
  - `ResultsTable.tsx` — Ant Table с virtualized rows при >200, клик по заголовку → перегенерация `ORDER BY` в JQL (canonical re-parse).
  - `BulkActionsBar.tsx` — разбивает выделенные задачи по `projectId`, вызывает `bulkUpdateIssues` на каждый в `Promise.all`, агрегирует `{succeeded, failed}` (R12).
  - `ExportMenu.tsx` — вызов `POST /search/export` с текущим `jql` + `columns`.
  - `/` focus, `Esc` blur, `Ctrl+Enter` — выполнить (часть уже в PR-10; финализируем здесь).
- **Merge-ready check:** E2E search → sort → выделить 3 → bulk-status; кросс-проектный bulk не валит транзакцию.
- **Оценка:** ~11ч.

### 13.7 PR-ы Фазы 4 — Checkpoint TTQL Integration (~30ч)

Параллельно с Фазой 3 (зависит только от PR-1 и PR-5).

#### PR-15: Checkpoint Prisma + DTO + КТ-функции + schema variant
- **Branch:** `ttsrh-1/checkpoint-foundation`
- **Scope:** (§5.12.1–5.12.4, TTSRH-27, TTSRH-28, TTSRH-29)
  - Миграция `YYYYMMDDHHMMSS_ttsrh_checkpoint_ttql`: `CheckpointType.ttqlCondition` (Text?), `CheckpointType.conditionMode` (enum default STRUCTURED), `ReleaseCheckpoint.ttqlSnapshot` (Text?), `ReleaseCheckpoint.conditionModeSnapshot` (enum default STRUCTURED). Backfill: все existing рядки получают `STRUCTURED`, `NULL`.
  - Zod `checkpoint.dto.ts` — `conditionMode`/`ttqlCondition` + `superRefine` для cross-field валидации (§5.12.3).
  - Функции КТ-контекста в `search.functions.ts`: `releasePlannedDate()`, `checkpointDeadline()` — доступны только при `variant=CHECKPOINT`; вне контекста — validator-ошибка.
  - `/search/validate?variant=CHECKPOINT`, `/search/schema?variant=CHECKPOINT`, `/search/suggest?variant=CHECKPOINT` — возвращают расширенный реестр.
  - `currentUser()` в CHECKPOINT-контексте → warning при save (не ошибка) (§5.12.4, R19).
  - Unit-тесты validator'а по variant; integration T-14 (backward-compat: existing КТ → `violationsHash` не меняется).
- **Не включает:** engine TTQL-ветку, UI.
- **Merge-ready check:** T-14 зелёный; миграция идемпотентна.
- **Оценка:** ~10ч.

#### PR-16: Checkpoint engine TTQL branch + error handling
- **Branch:** `ttsrh-1/checkpoint-engine`
- **Scope:** (§5.12.5, TTSRH-30, TTSRH-31)
  - Расширение [checkpoint-engine.service.ts](backend/src/modules/releases/checkpoints/checkpoint-engine.service.ts) — ветка `TTQL` + `COMBINED` (алгоритм §5.12.5).
  - **Единичный** `prisma.issue.findMany` с compiled `where` + `{id: {in: applicableIds}}` — не per-issue.
  - `compileTtql(ttqlSnapshot, checkpointContext)` — `{now: scheduler.startedAt, release, checkpointType}`, детерминистичный `now` на весь тик (R18).
  - `violationsHash` стабилен (порядок reasons: структурные → `TTQL_MISMATCH`).
  - Timeout 5с на compile+exec; превышение / compile-error / runtime-error → `ReleaseCheckpoint.state='ERROR'` + `CheckpointViolationEvent` с `criterionType='TTQL_ERROR'`, `reason` из сообщения (R16, FR-31).
  - **Под флагом `FEATURES_CHECKPOINT_TTQL=false`** в production: ветка TTQL не выполняется, `conditionMode=TTQL/COMBINED` саммится как NOOP (state=OK) до включения флага; чтобы security-review уже merged без ожидания UAT.
  - Integration T-13, T-14, T-15 (эквивалентность DUE_BEFORE), T-16 (timeout → ERROR).
  - Security-review gate — RBAC отдельный подписывает (R3 + R16).
- **Merge-ready check:** T-13..T-16 зелёные; existing КТ-тесты не ломаются (FR-25); security-review.
- **Оценка:** ~10ч.

#### PR-17: /admin/checkpoint-types/preview + TTS-QL checkpoint-функции/поля
- **Branch:** `ttsrh-1/checkpoint-search-integration`
- **Scope:** (§5.2 строки checkpoint-*, §5.4 строки violatedCheckpoints*, §5.12.6, TTSRH-32, TTSRH-37)
  - `POST /api/admin/checkpoint-types/preview { releaseId, conditionMode, criteria?, ttqlCondition? }` — dry-run, без записи. Тот же rate-limit + timeout + RBAC `canManageCheckpoints` (R22).
  - Функции в TTS-QL (вне КТ-контекста, доступны обычному поиску!): `violatedCheckpoints([typeName])`, `violatedCheckpointsOf(releaseKeyOrId[, typeName])`, `checkpointsAtRisk([typeName])`, `checkpointsInState(state[, typeName])` (§5.4.1). Scope-фильтр (R3) применяется к результатам.
  - Поля: `hasCheckpointViolation`, `checkpointViolationType`, `checkpointViolationReason`.
  - `CheckpointTypeSuggester` (CheckpointType.findMany с color-dot + weight), `CheckpointStateSuggester` (enum).
  - Индекс `@@index([resolvedAt, releaseCheckpointId])` — if profiling подтверждает (§5.4.1).
  - Integration T-18, T-20..T-25.
- **Merge-ready check:** T-18, T-20..T-25 зелёные; `hasCheckpointViolation=true` и `issue IN violatedCheckpoints()` дают одинаковый normalized where (T-24).
- **Оценка:** ~6ч.

#### PR-18: Frontend КТ — segmented control + JqlEditor + Preview panel + mode-icon
- **Branch:** `ttsrh-1/checkpoint-admin-ui`
- **Scope:** (§5.12.6, TTSRH-33, TTSRH-34, TTSRH-35)
  - В [AdminReleaseCheckpointTypesPage.tsx](frontend/src/pages/admin/AdminReleaseCheckpointTypesPage.tsx):
    - Segmented control «Режим условия» (Structured / TTQL / Combined).
    - Show/hide секций структурных criteria / TTQL editor без стирания form-state (R20).
    - Интеграция `JqlEditor` с `variant=CHECKPOINT` (КТ-функции в автокомплите, `currentUser()` с warning-иконкой).
    - Preview-панель (disclosure) — выбор релиза → `POST /api/admin/checkpoint-types/preview` → {applicable, passed, violated}.
    - Иконка режима в таблице типов КТ (S / Q / S+Q), hover — preview TTS-QL.
    - Баннер при `state=ERROR` с кнопкой «Открыть тип и исправить» (FR-31).
  - **CLAUDE.md правило** для всех модалок — `onCancel`/`onClose` → `load()`.
- **Merge-ready check:** E2E T-19 (создать TTQL-тип → видеть violations → перейти в COMBINED → добавить structured → regen → обновлённый preview).
- **Оценка:** ~11ч.

#### PR-19: Structured → TTQL converter (frontend)
- **Branch:** `ttsrh-1/checkpoint-converter`
- **Scope:** (§R21, TTSRH-36)
  - Кнопка «Сконвертировать в TTS-QL» на existing structured-типах → one-way generator (`criteria[] → canonical JQL`). Открывает TTQL-редактор для **ручной проверки** перед save (не автоматический switch).
  - Snapshot-тест: каждый тип `CheckpointCriterion` → ожидаемая строка JQL (пример в §5.12.9).
- **Merge-ready check:** конверсия `[STATUS_IN, ASSIGNEE_SET, DUE_BEFORE]` → ожидаемый канонический JQL; ручное ревью админа требуется (кнопка save не автосохраняется без взаимодействия).
- **Оценка:** ~3ч.

### 13.8 PR-ы Фазы 5 — Release (~15ч)

#### PR-20: E2E + perf seed + Lighthouse budget
- **Branch:** `ttsrh-1/e2e-perf`
- **Scope:** (TTSRH-20)
  - `frontend/e2e/specs/20-search.spec.ts` — basic→advanced→save→favorite→share→URL→open in new tab + T-9, T-12.
  - `frontend/e2e/specs/21-checkpoints-ttql.spec.ts` — T-19 (КТ-TTQL end-to-end).
  - `backend/tests/fixtures/search-seed-100k.ts` — 100K задач seed для perf-теста T-8 (p95 < 400ms).
  - Lighthouse budget в CI для `/search` (NFR-5 ≤ 160KB gzip lazy-chunk; initial без JqlEditor).
  - axe-core для A11Y-1..A11Y-4.
  - Композитные индексы, если profiling подтверждает (§3.3) — отдельная follow-up миграция.
- **Merge-ready check:** T-8, T-9, T-12, T-19 зелёные; Lighthouse budget не перевышен.
- **Оценка:** ~9ч.

#### PR-21: Документация + feature flag cutover
- **Branch:** `ttsrh-1/docs-cutover`
- **Scope:** (TTSRH-21, TTSRH-22, §12)
  - [docs/user-manual/jql.md](docs/user-manual/jql.md) — полный reference TTS-QL: §5.1 грамматика, §5.2 поля, §5.4 функции, примеры из golden-set.
  - [docs/user-manual/search.md](docs/user-manual/search.md) — руководство по странице «Поиск задач», сохранению фильтров, шарингу, колонкам.
  - [docs/api/reference.md](docs/api/reference.md) — эндпоинты из §5.6 + §5.12.7.
  - [docs/architecture/backend-modules.md](docs/architecture/backend-modules.md) — модуль `search` и `saved-filters`.
  - Раздел про КТ-TTQL в `docs/user-manual/checkpoints.md` (существующий файл из TTMP-160).
  - [version_history.md](version_history.md) — запись о TTSRH-1 (memory rule).
  - Feature flag cutover: `FEATURES_ADVANCED_SEARCH=true` в staging → UAT → production; `FEATURES_CHECKPOINT_TTQL=true` после отдельного UAT.
  - Опциональный пункт: MCP-tool `search_issues` — вынести в отдельный follow-up тикет TTSRH-38, **не** в этот PR.
- **Merge-ready check:** все Definition of Done пункты из §7 зелёные; UAT-чек-лист подписан.
- **Оценка:** ~6ч.

### 13.9 Итог: список PR

**Легенда статусов:** `📋 Планируется` · `🚧 В работе` · `✅ Done` (готов к merge / на ревью) · `🟢 Merged`.

| № | Branch | Scope | Часы | Зависит от | TTSRH-сабтаски | Статус |
|---|--------|-------|------|-----------|----------------|--------|
| 1 | `ttsrh-1/foundation` | Prisma schema (SavedFilter, User.preferences), feature flags, пустые модули | 6 | — | TTSRH-8 (schema), TTSRH-22 (flag) | 🟢 Merged ([#100](https://github.com/NovakPAai/tasktime-mvp/pull/100)) |
| 2 | `ttsrh-1/parser` | Tokenizer + Parser + AST + golden-set | 14 | PR-1 | TTSRH-2 | 🟢 Merged ([#101](https://github.com/NovakPAai/tasktime-mvp/pull/101)) |
| 3 | `ttsrh-1/validator` | Field registry + Validator + functions + `/search/schema`, `/validate` | 14 | PR-2 | TTSRH-3, TTSRH-6 | 🟢 Merged ([#102](https://github.com/NovakPAai/tasktime-mvp/pull/102)) |
| 4 | `ttsrh-1/compiler` | Compiler system + custom fields + scope-фильтр R3 | 18 | PR-3 | TTSRH-4, TTSRH-5 | 🟢 Merged ([#103](https://github.com/NovakPAai/tasktime-mvp/pull/103)) |
| 5 | `ttsrh-1/endpoints` | `/search/issues` + rate-limit + timeout + fuzz-harness | 10 | PR-4 | TTSRH-7, TTSRH-11 | 🟢 Merged ([#104](https://github.com/NovakPAai/tasktime-mvp/pull/104)) |
| 6 | `ttsrh-1/suggesters` | Value Suggesters backend + `/search/suggest` | 10 | PR-5 | TTSRH-25 | ✅ Done (готов к push после merge PR-5) |
| 7 | `ttsrh-1/saved-filters` | SavedFilter CRUD/share/favorite + User.preferences | 8 | PR-5 | TTSRH-8, TTSRH-9 | ✅ Done (готов к push после merge PR-6) |
| 8 | `ttsrh-1/export` | `/search/export` CSV/XLSX | 4 | PR-5 | TTSRH-10 | 📋 Планируется |
| 9 | `ttsrh-1/frontend-shell` | SearchPage shell + route + sidebar + URL sync | 6 | PR-5 | TTSRH-12, часть TTSRH-19 | 📋 Планируется |
| 10 | `ttsrh-1/jql-editor` | JqlEditor (CM6) + inline errors + lazy-load | 13 | PR-9 | TTSRH-13, TTSRH-14 | 📋 Планируется |
| 11 | `ttsrh-1/value-suggester` | ValueSuggesterPopup + CM6 adapter | 10 | PR-6, PR-10 | TTSRH-26 | 📋 Планируется |
| 12 | `ttsrh-1/basic-builder` | BasicFilterBuilder + Basic↔Advanced toggle | 12 | PR-11 | TTSRH-15 | 📋 Планируется |
| 13 | `ttsrh-1/saved-filters-ui` | SavedFiltersSidebar + Save/Share modals + store | 8 | PR-7, PR-9 | TTSRH-16 | 📋 Планируется |
| 14 | `ttsrh-1/results` | ColumnConfigurator + ResultsTable + bulk + ExportMenu + shortcuts | 11 | PR-8, PR-10 | TTSRH-17, TTSRH-18, остаток TTSRH-19 | 📋 Планируется |
| 15 | `ttsrh-1/checkpoint-foundation` | Checkpoint Prisma + DTO + КТ-функции + variant=CHECKPOINT | 10 | PR-1, PR-3 | TTSRH-27, TTSRH-28, TTSRH-29 | 📋 Планируется |
| 16 | `ttsrh-1/checkpoint-engine` | Engine TTQL-ветка + COMBINED + error handling | 10 | PR-4, PR-15 | TTSRH-30, TTSRH-31 | 📋 Планируется |
| 17 | `ttsrh-1/checkpoint-search-integration` | `/preview` + violatedCheckpoints* функции + поля + suggesters | 6 | PR-5, PR-16 | TTSRH-32, TTSRH-37 | 📋 Планируется |
| 18 | `ttsrh-1/checkpoint-admin-ui` | Segment-mode + JqlEditor КТ + Preview panel + mode-icon | 11 | PR-10, PR-15, PR-17 | TTSRH-33, TTSRH-34, TTSRH-35 | 📋 Планируется |
| 19 | `ttsrh-1/checkpoint-converter` | Structured → TTQL converter (one-way) | 3 | PR-18 | TTSRH-36 | 📋 Планируется |
| 20 | `ttsrh-1/e2e-perf` | E2E + perf 100K seed + Lighthouse budget + axe-core | 9 | PR-12, PR-13, PR-14, PR-17, PR-19 | TTSRH-20 | 📋 Планируется |
| 21 | `ttsrh-1/docs-cutover` | Документация + feature flag cutover | 6 | PR-20 | TTSRH-21, TTSRH-22 | 📋 Планируется |
| **Итого** | | | **199** | | | |

**Дельта к §8 (278ч):** план покрывает ~199ч. Недостающие ~79ч — это (a) code review + фиксы (~8ч per §8), (b) security review + фиксы (~4ч), (c) докуметация JQL полная (~6ч уже в PR-21, ~0ч дополнительно), (d) профайлинг + composite-index tuning (~4ч в PR-20), (e) fuzz-harness extended (~4ч в PR-5); остальное — buffer на unknown unknowns и Phase-2-проникновение. Реалистичный календарный план — 8–10 недель при одном fullstack-разработчике или 5–6 недель при параллельной работе двоих (backend + frontend после PR-5).

### 13.10 Phase 2 (не включена в TTSRH-1)

- **TTSRH-23** — `WAS`/`CHANGED` + модель `FieldChangeLog` — отдельный story-ticket.
- **TTSRH-24** — `pg_trgm` GIN-индексы + `unaccent` extension + Postgres FTS.
- **TTSRH-38** — *(опционально)* MCP-tool `search_issues` для Agent SDK consumers.

Phase 2 не блокирует MVP-релиз TTSRH-1.

