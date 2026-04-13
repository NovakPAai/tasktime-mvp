# Version History

Все значимые изменения в проекте. Для каждого изменения указана ссылка на задачу (если есть).

**Last version: 2.9**

---

## [2.9] [2026-04-13] feat(releases): RELEASE_MANAGER role + INTEGRATION release UI fixes

**PR:** [#32](https://github.com/NovakPAai/tasktime-mvp/pull/32)
**Ветка:** `claude/alex-release-manager-ui-fixes`

### Что изменилось
- `frontend/src/types/auth.types.ts`: добавлена роль `RELEASE_MANAGER` в union type `UserRole`
- `frontend/src/api/admin.ts`: добавлен метод `changeGlobalRole` для смены глобальной роли пользователя
- `backend/src/modules/users/users.dto.ts`: `RELEASE_MANAGER` добавлен в `changeRoleDto` Zod enum
- `frontend/src/pages/admin/AdminUsersPage.tsx`: добавлен раздел "Глобальная роль" в модал редактирования, поддержка RELEASE_MANAGER в цветах и отображении
- `frontend/src/pages/admin/AdminRolesPage.tsx`: `RELEASE_MANAGER` добавлен в выпадающие списки ролей
- `frontend/src/pages/admin/AdminReleaseStatusesPage.tsx`: новая страница CRUD для управления статусами релизов
- `frontend/src/App.tsx`: добавлен маршрут `/admin/release-statuses`
- `frontend/src/components/layout/Sidebar.tsx`: добавлена ссылка "Статусы релизов" в секцию администрирования
- `frontend/src/pages/GlobalReleasesPage.tsx`: `canManage` расширен для RELEASE_MANAGER; INTEGRATION релизы теперь поддерживают выбор проекта при добавлении задач и используют `listAllSprints` для добавления спринтов
- `frontend/src/pages/ReleasesPage.tsx`: `canManage` расширен для RELEASE_MANAGER и SUPER_ADMIN; исправлена загрузка INTEGRATION релизов через `projectId` query param
- `backend/src/modules/releases/releases.service.ts`: `listReleasesGlobal` — при `type=INTEGRATION&projectId=X` фильтрация через `items.some.issue.projectId` вместо `where.projectId` (INTEGRATION релизы имеют `projectId=null`)

---

## [2.8] [2026-04-12] fix(releases): align implementation with RELEASE_MANAGEMENT_SPEC

**Задача:** [TTMP-223](https://github.com/NovakPAai/tasktime-mvp/issues/223)
**PR:** [#31](https://github.com/NovakPAai/tasktime-mvp/pull/31)
**Ветка:** `claude/alex-ttmp-223-release-mgmt-fixes`

### Что изменилось
- `releases.router.ts`: RELEASE_MANAGER добавлен во все мутации релизов; MANAGER убран из `DELETE /releases/:id`; `GET /releases/:id/transitions` теперь требует только authenticate (доступен VIEWER)
- `releases.service.ts` `removeReleaseItems`: добавлена защита DONE/CANCELLED → 422
- `release-workflow-engine.service.ts`: CONDITION_NOT_MET 403 → 409; поле `minCount → min`; audit action `release.transitioned → release.transition`
- `releases.service.ts` `listReleasesGlobal` + `listReleaseItems`: ответ обёрнут в `{ data, meta: { page, limit, total, totalPages } }`
- `releases.service.ts` `getReleaseReadiness`: `byProject` shape изменён на `{ project, total, done, inProgress }`; добавлен `availableTransitions` для авторизованных пользователей
- `releases.service.ts`: поиск по `name OR description`; `statusId` принимает comma-separated UUIDs
- `release-workflows-admin.router.ts`: добавлен `PATCH` для `/:id` и `/:id/transitions/:tid`; `PUT` сохранён как alias

---

## [2.7] [2026-04-06] feat(ui): Fonts & Tokens + Sidebar Collapse + Bug Fixes

**PR:** [#NovakPA/thirsty-feynman](https://github.com/jackrescuer-gif/tasktime-mvp)
**Ветка:** `NovakPA/thirsty-feynman`

### Что изменилось
- **TTUI-162/163:** @font-face для Space Grotesk 600/700, Inter 400/500/600 из `/public/fonts/*.woff2`. Google Fonts CDN удалён из `index.html`. Работает offline (Astra Linux, Red OS)
- **TTUI-118:** `[data-theme='light']` CSS-токены в `styles.css` — полный набор переменных для светлой темы
- **TTUI-119:** Шрифты self-hosted подтверждены, CDN зависимость устранена
- **TTUI-84:** `frontend/src/store/ui.store.ts` — Zustand persist store (`tt-ui`) с `sidebarCollapsed: boolean`
- **TTUI-85:** `AppLayout.tsx` читает `sidebarCollapsed` из ui.store, передаёт `collapsed` и `onCollapseToggle` в Sidebar
- **TTUI-86:** Sidebar анимируется 220→52px (`transition: width 0.2s cubic-bezier`). Collapsed: иконки центрированы, текст/сабменю/разделители скрыты
- **TTUI-87:** Кнопка-шеврон в футере сайдбара — раскрыть/свернуть. Анимация rotate(180deg)
- **TTUI-73/170:** `[data-theme='light']` overrides для glass-эффектов: убраны `rgba(255,255,255,X)` в кнопках, заголовках таблиц, модалах, дровере
- **TTUI-173:** `AppLayout` main-scroll контейнер `overflowY:auto` — страницы теперь скроллируются
- **TTUI-174:** CSS для `.ant-table-row-expand-icon` через CSS vars — expand-иконка дерева задач корректна в обеих темах

---

## [2.6] [2026-03-28] fix(workflow-schemes): информативные ошибки при сохранении маппинга

**Ветка:** `claude/jack-fix-workflow-scheme-mapping`

### Что изменилось
- `backend/src/modules/workflow-schemes/workflow-schemes.service.ts` — транзакция `replaceItems` обёрнута в try/catch: P2002 (unique constraint) → 409 `DUPLICATE_ISSUE_TYPE_MAPPING`, P2003 (foreign key violation) → 422 `INVALID_REFERENCE`; вместо безымянного 500
- `frontend/src/pages/admin/AdminWorkflowSchemeEditorPage.tsx` — catch-блок `handleSaveItems` разбирает код ошибки и показывает конкретный текст: для `WORKFLOW_INVALID` — название workflow и причину (нет начального статуса / нет DONE), для `DUPLICATE_ISSUE_TYPE_MAPPING` и `INVALID_REFERENCE` — русское описание из detail-поля

---

## [2.5] [2026-03-27] feat(webhooks): TTADM-63 — адаптация GitLab-интеграции к workflow-движку

**Задача:** [TTADM-63](http://5.129.242.171) — Адаптация GitLab-интеграции к workflow-движку
**Ветка:** `claude/jack-ttadm-63-gitlab-workflow-adapter`

### Что изменилось
- `backend/src/modules/webhooks/gitlab.service.ts` — заменён прямой `prisma.issue.update({ status })` на вызов `executeTransition` через workflow-движок; добавлены `transitionIssueBySystemKey`, `getSystemActor`; audit log с `source: 'gitlab_webhook'` для каждого успешного перехода; обработка недоступного перехода (логирует `issue.gitlab_transition_unavailable`) без краша
- `backend/src/app.ts` — webhooksRouter перемещён выше всех роутеров с JWT-аутентификацией (bugfix: GitLab-вебхуки не могли пройти через authenticate-middleware и получали 401)
- `backend/tests/gitlab-webhook.test.ts` — новый файл, 13 интеграционных тестов: merge_request merged → DONE, opened → REVIEW, push → IN_PROGRESS, недоступный переход, несколько ключей в одном MR, security (X-Gitlab-Token), pipeline, unknown event

---

## [2.4] [2026-03-26] fix(admin): workflow editor crashes + scheme editor can't manage mappings

**PR:** [#134](https://github.com/jackrescuer-gif/tasktime-mvp/pull/134)
**Ветка:** `claude/alex-fix-workflow-admin`

### Что изменилось
- `backend/src/modules/workflows/workflows.service.ts` — добавлены `include: { fromStatus: true, toStatus: true, screen: true }` для transitions в `workflowInclude`; без этого `AdminWorkflowEditorPage` падала с TypeError на `t.toStatus.color` и страница не открывалась
- `frontend/src/pages/admin/AdminWorkflowSchemeEditorPage.tsx` — переписан: вместо read-only таблицы теперь локальное состояние `localItems`, добавлены кнопки "Добавить строку" и удаления каждой строки, загрузка `issueTypeConfigs` для dropdown типа задачи, валидация перед сохранением (минимум одна строка "По умолчанию")

---

## [2.3] [2026-03-26] test(workflow-engine): TTADM-65 — интеграционные тесты workflow-движка

**Задача:** [TTADM-65](https://github.com/jackrescuer-gif/tasktime-mvp/issues/65)
**PR:** [#133](https://github.com/jackrescuer-gif/tasktime-mvp/pull/133)
**Ветка:** `claude/jack-workflow-engine-sprint6`

### Что изменилось
- `backend/tests/workflow-engine.test.ts` — 67 интеграционных тестов (Vitest + Supertest): CRUD статусов/workflow/схем, выполнение transitions, conditions (USER_HAS_GLOBAL_ROLE, USER_IS_ASSIGNEE, USER_IS_REPORTER, ANY_OF), validators (ALL_SUBTASKS_DONE, COMMENT_REQUIRED, TIME_LOGGED), screen fields, post-functions (ASSIGN_TO_CURRENT_USER, ASSIGN_TO_REPORTER, CLEAR_ASSIGNEE, LOG_AUDIT), per-issue-type routing, error cases
- `backend/src/modules/workflows/workflows.dto.ts` — исправлен тип `conditions`/`validators`/`postFunctions` с `z.record(z.unknown())` на `z.array(z.record(z.unknown()))` (хранятся как массивы правил, не объекты)

---

## [2.2] [2026-03-25] feat(workflow-engine): TTADM-60 — Workflow Engine UI (экраны переходов, Issue Detail, Kanban, Admin)

**Задача:** [TTADM-60](https://github.com/jackrescuer-gif/tasktime-mvp/issues/60)
**PR:** [#133](https://github.com/jackrescuer-gif/tasktime-mvp/pull/133)
**Ветка:** `claude/jack-workflow-engine-sprint6`

### Что изменилось
- `frontend/src/api/workflow-engine.ts` — API клиент для `GET/POST /api/issues/:id/transitions`
- `frontend/src/api/workflow-statuses.ts` — CRUD клиент для `/api/admin/workflow-statuses`
- `frontend/src/api/workflows.ts` — CRUD клиент для `/api/admin/workflows` (шаги, переходы, копирование)
- `frontend/src/api/workflow-schemes.ts` — CRUD клиент для `/api/admin/workflow-schemes` (маппинг, проекты)
- `frontend/src/api/transition-screens.ts` — CRUD клиент для `/api/admin/transition-screens` (поля экрана)
- `frontend/src/hooks/useIssueTransitions.ts` — хук для загрузки доступных переходов задачи
- `frontend/src/components/issues/StatusTransitionPanel.tsx` — панель с кнопками переходов (текущий статус + кнопки)
- `frontend/src/components/issues/TransitionModal.tsx` — модалка для заполнения полей экрана перехода
- `frontend/src/pages/IssueDetailPage.tsx` — заменён Select статуса на `StatusTransitionPanel`; удалён `handleStatusChange`
- `frontend/src/pages/BoardPage.tsx` — drag-and-drop между колонками теперь использует `POST /api/issues/:id/transitions`; показывает `TransitionModal` если переход требует экран
- `frontend/src/pages/admin/AdminWorkflowStatusesPage.tsx` — CRUD страница для workflow-статусов
- `frontend/src/pages/admin/AdminWorkflowsPage.tsx` — список workflow с дублированием
- `frontend/src/pages/admin/AdminWorkflowEditorPage.tsx` — редактор workflow: шаги и переходы через drawer
- `frontend/src/pages/admin/AdminWorkflowSchemesPage.tsx` — список схем workflow
- `frontend/src/pages/admin/AdminWorkflowSchemeEditorPage.tsx` — редактор схемы: маппинг типов задач → workflow, привязка проектов
- `frontend/src/pages/admin/AdminTransitionScreensPage.tsx` — список экранов переходов
- `frontend/src/pages/admin/AdminTransitionScreenEditorPage.tsx` — редактор экрана: добавление полей, isRequired, orderIndex
- `frontend/src/App.tsx` — 7 новых роутов для Admin UI (`/admin/workflow-*`, `/admin/transition-screens/*`)
- `frontend/src/components/layout/Sidebar.tsx` — раздел «Workflow» в Admin-меню (Статусы, Workflow, Схемы workflow, Экраны переходов)

## [2.1] [2026-03-25] feat(issues): TTADM-64 — Backward compatibility REST API (строковые алиасы статусов)

**Задача:** [TTADM-64](https://github.com/jackrescuer-gif/tasktime-mvp/issues/64)
**PR:** [#TBD](https://github.com/jackrescuer-gif/tasktime-mvp/pull/TBD)
**Ветка:** `claude/jack-ttadm-64-backward-compat`

### Что изменилось
- `backend/src/modules/issues/issues.service.ts` — добавлен `workflowStatus` в `include` всех issue-запросов: `listIssues`, `getIssue`, `getIssueByKey`, `createIssue`, `updateIssue`, `getChildren`
- `createIssue` — при создании задачи автоматически устанавливается `workflowStatusId` на системный статус `OPEN`
- `updateStatus` (legacy path) — при смене строкового статуса теперь также обновляет `workflowStatusId` (маппинг через `systemKey`), возвращает `workflowStatus` объект в ответе
- `backend/src/shared/openapi.ts` — поле `status` помечено `deprecated: true` (поддержка до 2026-09-01), добавлено поле `workflowStatus` в схему `Issue`; эндпоинт `PATCH /issues/{id}/status` помечен `deprecated: true` с описанием маппинга
- `backend/tests/issue-status-compat.test.ts` — 12 тестов: проверка наличия обоих полей в ответах, маппинг строковых статусов, фильтрация, round-trip, systemKey == legacy status

---

## [2.0] [2026-03-25] feat(workflow-engine): TTADM-59 — Runtime движок (условия, валидаторы, постфункции)

**Задача:** TTADM-59
**PR:** [#TBD](https://github.com/jackrescuer-gif/tasktime-mvp/pull/TBD)
**Ветка:** `claude/jack-workflow-engine-runtime`

### Что изменилось
- `backend/src/modules/workflow-engine/` — новый модуль: `types.ts`, `workflow-engine.service.ts`, `workflow-engine.dto.ts`, `workflow-engine.router.ts`
- `conditions/index.ts` — `evaluateConditions` с рекурсией для `ANY_OF`/`ALL_OF`; типы: `USER_HAS_GLOBAL_ROLE`, `USER_IS_ASSIGNEE`, `USER_IS_REPORTER`
- `validators/` — 5 валидаторов: `required-fields`, `subtasks-done`, `comment-required`, `time-logged`, `field-value`
- `post-functions/` — 5 постфункций: `assign`, `set-field`, `webhook` (fire-and-forget, timeout 5s), `audit`; ошибки не откатывают переход — логируются в auditLog
- `GET /api/issues/:id/transitions` — доступные переходы с фильтром по conditions (403 → исключение, не ошибка)
- `POST /api/issues/:id/transitions` — полный pipeline: conditions → validators → screen validation → DB transaction → post-functions → auditLog (`issue.transitioned`)
- `issues.service.ts::updateStatus` — dual-mode: если у проекта есть workflow scheme, ищет подходящий transition и вызывает `executeTransition(bypassConditions=true)`; иначе legacy path
- `boards.service.ts::getBoard` — dual-mode: `mode:'workflow'` с динамическими колонками из workflow steps для проектов со схемой; `mode:'legacy'` для остальных
- `app.ts` — зарегистрирован `workflowEngineRouter` на `/api`

---

## [1.9] [2026-03-25] feat(workflow): TTADM-62 — дефолтный workflow + data migration (enum → dynamic statuses)

**Задача:** TTADM-62
**Ветка:** `claude/jack-ttadm-62-default-workflow-migration`

### Что изменилось
- `migrations/20260325020000_default_workflow_init_and_backfill/migration.sql` — идемпотентная миграция: вставляет 5 системных `WorkflowStatus` (ON CONFLICT DO NOTHING), default `Workflow` + 5 шагов + 8 переходов, `WorkflowScheme` со схемным item-ом; привязывает все существующие проекты к схеме; делает backfill `issues.workflow_status_id` по `status::text = workflow_statuses.system_key`. Устраняет проблему предыдущей `010000`-миграции, которая была no-op (запускалась до появления данных).
- `scripts/rollback-workflow-migration.sql` — rollback-план: сбрасывает `workflow_status_id` → NULL на issues, удаляет данные workflow (без DDL rollback)
- `package.json` → добавлен скрипт `db:seed:workflow` (`npx tsx src/prisma/seed-workflow.ts`) для dev-окружения

---

## [1.8] [2026-03-25] feat(workflow-engine): Sprint 6 — БД-схема, CRUD статусов, workflow и схем [TTADM-58]

**Задача:** TTADM-58
**Ветка:** `claude/jack-workflow-engine-foundation`

### Что изменилось
- `schema.prisma` — новый enum `StatusCategory`; новые модели: `WorkflowStatus`, `Workflow`, `WorkflowStep`, `WorkflowTransition`, `TransitionScreen`, `TransitionScreenItem`, `WorkflowScheme`, `WorkflowSchemeItem`, `WorkflowSchemeProject`; поле `workflowStatusId` в `Issue`; relations в `Project`, `IssueTypeConfig`, `CustomField`
- `migrations/20260325000000_add_workflow_engine` — DDL всех новых таблиц, FK, индексы
- `migrations/20260325010000_backfill_workflow_status_id` — SQL UPDATE для бэкфилла `workflow_status_id` на основе `status` enum
- `src/prisma/seed-workflow.ts` — сид 5 системных статусов (OPEN/IN_PROGRESS/REVIEW/DONE/CANCELLED), Default Workflow, шаги, 8 переходов, Default WorkflowScheme, привязка всех проектов к схеме
- `modules/workflows/workflow-statuses.{dto,service,router}.ts` — CRUD статусов; DELETE запрещён для `isSystem=true` или статусов в шагах
- `modules/workflows/workflows.{dto,service,router}.ts` — CRUD workflow, управление steps/transitions, `POST /:id/copy`; защита системных workflow от изменений; валидация отсутствия дублей переходов
- `modules/workflow-schemes/workflow-schemes.{dto,service,router}.ts` — CRUD схем, атомарная замена items (`PUT /:id/items`), attach/detach проектов
- `modules/transition-screens/transition-screens.{dto,service,router}.ts` — CRUD экранов, атомарная замена items (`PUT /:id/items`)
- `app.ts` — регистрация 4 новых роутеров на `/api/admin/...` + `GET /api/projects/:projectId/workflow-scheme`

---

## [1.7] [2026-03-24] feat(custom-fields): тип поля Справочник (REFERENCE) [TTADM-52]

**Задача:** TTADM-52
**PR:** [#125](https://github.com/jackrescuer-gif/tasktime-mvp/pull/125)
**Ветка:** `sprint/ttadm`

### Что изменилось
- `schema.prisma` — добавлен `REFERENCE` в enum `CustomFieldType`; миграция `20260324000000_add_reference_field_type` (`ALTER TYPE ... ADD VALUE IF NOT EXISTS`)
- `custom-fields.dto.ts` — `referenceOptionsSchema` (`maxValues: int ≥ 0`, `items[]: {value, label, isEnabled}`)
- `custom-fields.service.ts` — валидация REFERENCE при `createCustomField` / `updateCustomField`
- `custom-fields.ts` (frontend API) — типы `ReferenceItem`, `ReferenceOptions`; union в `CustomField.options`
- `issue-custom-fields.ts` — union `ReferenceOptions` в `IssueCustomFieldValue.options`
- `AdminCustomFieldsPage.tsx` — тип «Справочник» (`BookOutlined`) в FIELD_TYPE_META; форма управления значениями справочника (добавить/включить/отключить/удалить) и настройка `maxValues` с дисклеймером
- `CustomFieldInput.tsx` — `ReadValue` (Tags по `items`) и `EditInput` (single/multiple Select по `maxValues`, только enabled items)
- `KanbanCardCustomFields.tsx` — отображение значений REFERENCE: первые 2 Tags + счётчик остальных

---

## [1.6] [2026-03-24] fix(admin): удалять постфикс " (N/A)" при реактивации пользователя [TTADM-33]

**Задача:** TTADM-33
**PR:** [#125](https://github.com/jackrescuer-gif/tasktime-mvp/pull/125)
**Ветка:** `sprint/ttadm`

### Что изменилось
- `admin.service.ts` — `NA_SUFFIX` вынесен на уровень модуля; в `updateUserAdmin()` добавлена очистка постфикса при реактивации (`isActive: false → true`)

---

## [1.5] [2026-03-23] fix(sprints): единый стиль статусов задач через IssueStatusTag

**PR:** [#123](https://github.com/jackrescuer-gif/tasktime-mvp/pull/123)
**Ветка:** `claude/jack-ttmp-145-sprint-status-tag`

### Что изменилось
- `SprintsPage.tsx` — кастомные CSS-пилюли статусов (`tt-sprint-status-pill`) заменены на компонент `IssueStatusTag` — единый стиль с остальными страницами приложения
- Удалены неиспользуемые константы `STATUS_LABEL_RU` и `STATUS_CLASS`

---

## [1.4] [2026-03-23] fix(sprints): добавление задач в активный спринт + колонка ТИП

**Задача:** [TTMP-145](http://5.129.242.171/projects/bb450f20-798e-4e23-a69f-7d57f545ed98/sprints)
**PR:** [#122](https://github.com/jackrescuer-gif/tasktime-mvp/pull/122)
**Ветка:** `claude/jack-ttmp-145-sprint-add-from-backlog`

### Что изменилось
- `SprintsPage.tsx` — кнопка «Добавить из бэклога» теперь открывает `SprintPlanningDrawer` (выбор задач из бэклога) вместо `SprintIssuesDrawer` (просмотр задач спринта); компонент `SprintPlanningDrawer` уже существовал, но не был подключён
- `SprintsPage.tsx` — добавлена колонка «ТИП» с `IssueTypeBadge` в таблицу задач спринта; `colSpan` empty-state обновлён с 6 до 7

---

## [1.3] [2026-03-23] fix(links): 500 при редактировании видов связей + системный бейдж + заглавные буквы

**Ветка:** `claude/jack-fix-link-types-500-system-badge`

### Что изменилось

**Backend:**
- `links.service.ts` — импортирован `AppError`; все `Object.assign(new Error(), { status })` заменены на `new AppError(N, '...')`, ошибки 404/400 теперь возвращают правильные HTTP-статусы вместо 500
- `links.dto.ts` — добавлен трансформ `capitalizeFirst` на поля `outboundName` и `inboundName` в `createLinkTypeDto` и `updateLinkTypeDto`; первая буква названия связи автоматически становится заглавной при сохранении
- `migrations/20260323120000_capitalize_link_type_names` — новая миграция: обновляет `outbound_name` и `inbound_name` всех существующих записей в `issue_link_types` к заглавной первой букве

**Frontend:**
- `AdminLinkTypesPage` — поля «Исходящая связь» и «Входящая связь» в форме редактирования заблокированы (`disabled`) для системных типов (ранее только «Наименование» было задизейблено, что позволяло отправить запрос и получить 500)
- `AdminLinkTypesPage` — в колонке «Наименование» системные виды связей отмечены бейджем «Системный» (иконка замка, синий тег) с тултипом «Системный тип — нельзя переименовать»

---

## [1.2] [2026-03-23] feat(links): улучшение механизма связей между задачами

**Ветка:** `claude/jack-remove-issue-type-enum`

### Что изменилось

**Backend:**
- `links.router.ts` — добавлен публичный endpoint `GET /link-types` (активные типы для всех авторизованных пользователей); ранее `GET /admin/link-types` был доступен только MANAGER+, из-за чего Select показывал «no data» для обычных пользователей

**Frontend:**
- `api/links.ts` — добавлена `listActiveLinkTypes()` для вызова `/link-types`
- `IssueLinksSection` — выбор направления связи вместо типа: каждый тип разворачивается в два варианта («блокирует» / «заблокировано»); при выборе inbound-направления источник и цель меняются местами; после сохранения выполняется перезагрузка списка
- `IssueLinksSection` — группировка связей по лейблу направления с заголовком группы (uppercase, серый)
- `AdminLinkTypesPage` — добавлена кнопка «Изменить» в таблице видов связей; модальное окно с формой изменения наименования, исходящей и входящей связи; поле «Наименование» задизейблено для системных типов

---

## [1.1] [2026-03-22] feat(issues): добавлено поле «Срок исполнения» (dueDate)

**PR:** TBD
**Ветка:** `claude/jack-duedate`

### Что изменилось

**Backend:**
- `schema.prisma` — добавлено поле `dueDate DateTime? @db.Date` в модель `Issue` + индекс `@@index([dueDate])`
- `migrations/20260322000000_add_issue_due_date` — SQL-миграция: `ALTER TABLE "issues" ADD COLUMN "due_date" DATE` + индекс
- `issues.dto.ts` — `dueDate: z.string().date().optional()` в `createIssueDto`; `dueDate: z.string().date().nullable().optional()` в `updateIssueDto`
- `issues.service.ts` — передача `dueDate` при создании задачи

**Frontend:**
- `issue.types.ts` — добавлено `dueDate?: string | null` в интерфейс `Issue`
- `api/issues.ts` — добавлено `dueDate?: string | null` в `CreateIssueBody`
- `IssueDetailPage` — поле «Срок исполнения» в панели Details с индикатором «просрочено» (красный Tag + жирный шрифт) для задач не в DONE/CANCELLED; поле DatePicker в форме Edit Issue
- `ProjectDetailPage` — колонка «СРОК» в таблице задач с overdue-индикацией; поле DatePicker в форме создания New Issue

---

## [1.0] [2026-03-21] feat(issues): TTADM-46 — блокировка перевода в DONE при незаполненных обязательных полях (фронтенд)

**Задача:** [TTADM-46](http://5.129.242.171)
**PR:** TBD
**Ветка:** `claude/jack-ttadm-46`

### Что изменилось

**Frontend:**
- `IssueDetailPage` — `handleStatusChange` перехватывает 422 `REQUIRED_FIELDS_MISSING` от бэкенда (PR 5 / TTADM-40)
- При ошибке открывается модальное окно «Обязательные поля не заполнены»:
  - Alert с предупреждением о необходимости заполнить поля перед закрытием задачи
  - Список незаполненных полей с названием и типом
  - Кнопка «Перейти к полям» — плавно скроллит к секции «Дополнительные поля» и закрывает модалку
- Добавлен `ref` на враппер `IssueCustomFieldsSection` для таргетированного скролла
- Эпик TTADM-34 «Кастомные поля задач» завершён (PR 5–9)

---

## [0.9] [2026-03-21] feat(issues): TTADM-45+47+48 — кастомные поля на карточке задачи, kanban и форме создания

**Задача:** [TTADM-45](http://5.129.242.171), [TTADM-47](http://5.129.242.171), [TTADM-48](http://5.129.242.171)
**PR:** TBD
**Ветка:** `claude/jack-ttadm-45-47-48`

### Что изменилось

**Backend:**
- `field-schemas.service.ts` — `listProjectFieldSchemas` принимает опциональный `issueTypeConfigId`; фильтрует `ISSUE_TYPE` / `PROJECT_ISSUE_TYPE` привязки по конкретному типу задачи
- `field-schemas.router.ts` — `GET /projects/:projectId/field-schemas?issueTypeConfigId=...` пробрасывает параметр в сервис

**Frontend (новые файлы):**
- `frontend/src/api/issue-custom-fields.ts` — типы `IssueCustomFieldValue`, API `getFields(issueId)` / `updateFields(issueId, values[])`
- `frontend/src/components/issues/CustomFieldInput.tsx` — универсальный inline-редактор полей (11 типов: TEXT, TEXTAREA, NUMBER, DECIMAL, CHECKBOX, DATE, DATETIME, SELECT, MULTI_SELECT, LABEL, URL, USER); `inlineEdit=false` для модальных форм
- `frontend/src/components/issues/IssueCustomFieldsSection.tsx` — секция «Дополнительные поля» на странице задачи (tt-panel); inline-редактирование полей, сохранение через API
- `frontend/src/components/issues/KanbanCardCustomFields.tsx` — компактное отображение до 3 кастомных полей на kanban-карточке

**Frontend (изменённые файлы):**
- `frontend/src/types/index.ts` — добавлен `KanbanField`, поле `kanbanFields?: KanbanField[]` в `Issue`
- `frontend/src/api/issues.ts` — добавлена `listIssuesWithKanbanFields(projectId, sprintId?)`
- `frontend/src/api/field-schemas.ts` — добавлен `listProjectSchemas(projectId, issueTypeConfigId?)`
- `IssueDetailPage` — добавлен `<IssueCustomFieldsSection>` между деталями задачи и AI-панелью
- `BoardPage` — kanban-карточки отображают кастомные поля (`KanbanCardCustomFields`); форма создания задачи подгружает поля по типу задачи (`fieldSchemasApi.listProjectSchemas`) и сохраняет значения после создания

---

## [0.8] [2026-03-21] feat(admin-ui): TTADM-42+43+44 — список схем, детали и публикация

**Задача:** [TTADM-42](http://5.129.242.171), [TTADM-43](http://5.129.242.171), [TTADM-44](http://5.129.242.171)
**PR:** TBD
**Ветка:** `claude/jack-ttadm-42-43-44`

### Что изменилось

**Frontend:**
- `frontend/src/api/field-schemas.ts` — API-модуль (list, get, create, update, delete, copy, publish, unpublish, setDefault, conflicts, items CRUD, bindings CRUD)
- `AdminFieldSchemasPage` — таблица схем с badge DRAFT/ACTIVE/По умолчанию; меню действий: Редактировать, Копировать, Опубликовать, Деактивировать, По умолчанию, Удалить; диалог копирования с checkbox «Копировать привязки»
- `AdminFieldSchemaDetailPage` — редактирование метаданных; drag-and-drop сортировка полей (@hello-pangea/dnd); checkbox isRequired/showOnKanban с inline-сохранением; управление привязками с live preview области; кнопка «Опубликовать»
- `SchemaConflictsModal` — модалка конфликтов при публикации; разделение ERROR/WARNING; кнопка скачать `.json`; кнопка «Опубликовать с предупреждениями» только если нет ERROR

---

## [0.7] [2026-03-21] feat(admin-ui): TTADM-49+41 — роутинг и страница кастомных полей

**Задача:** [TTADM-49](http://5.129.242.171), [TTADM-41](http://5.129.242.171)
**PR:** TBD
**Ветка:** `claude/jack-ttadm-41-49`

### Что изменилось

**Backend:**
- `GET /api/admin/custom-fields` — теперь возвращает `_count: { schemaItems, values }` для каждого поля

**Frontend:**
- `frontend/src/api/custom-fields.ts` — новый API-модуль (list, create, get, update, delete, toggle, reorder)
- `AdminCustomFieldsPage` (`/admin/custom-fields`) — таблица всех полей (имя, тип с иконкой, статус, кол-во схем); форма создания/редактирования с вариантами ответа для SELECT/MULTI_SELECT; isSystem-поля без кнопки удаления
- Стаб-страницы `AdminFieldSchemasPage` и `AdminFieldSchemaDetailPage` (реализуются в следующем PR)
- Роуты: `/admin/custom-fields`, `/admin/field-schemas`, `/admin/field-schemas/:id`
- Меню Admin-панели: пункты «Кастомные поля» и «Схемы полей» в группе Admin

---

## [0.6] [2026-03-21] feat(issues): TTADM-40 — блокировка перехода в DONE при незаполненных обязательных полях

**Задача:** [TTADM-40](http://5.129.242.171)
**PR:** TBD
**Ветка:** `claude/jack-ttadm-40`

### Что изменилось

**Backend:**
- `PATCH /api/issues/:id/status` — при переходе в `DONE` вызывает `validateRequiredFieldsForDone(issueId)` перед обновлением
- Логика валидации: находит все обязательные (`isRequired`) кастомные поля для задачи через `getApplicableFields`, проверяет наличие непустых значений в `IssueCustomFieldValue`
- При незаполненных полях возвращает `422` с телом `{ error: "REQUIRED_FIELDS_MISSING", fields: [{ customFieldId, name, fieldType }] }`
- Проверка пустоты учитывает: `null`, пустую строку, пустой массив, а также JSONB-обёртку `{ v: ... }`

---

## [0.5] [2026-03-21] feat(issue-custom-fields): TTADM-39 — API кастомных полей задачи

**Задача:** [TTADM-39](http://5.129.242.171)
**PR:** TBD
**Ветка:** `claude/jack-ttadm-39`

### Что изменилось

**Backend:**
- Новая модель `IssueCustomFieldValue` (issueId+customFieldId unique, value: JSONB) + миграция `20260321150000_add_issue_custom_field_values`
- Связи: `Issue.customFieldValues`, `CustomField.values`, `User.customFieldUpdates`
- Новый модуль `backend/src/modules/issue-custom-fields/`
- `GET /api/issues/:id/custom-fields` — применимые поля с текущими значениями; разрешение схем по приоритету scope (PROJECT_ISSUE_TYPE > PROJECT > ISSUE_TYPE > GLOBAL)
- `PUT /api/issues/:id/custom-fields` — batch upsert значений; проверка применимости полей к задаче
- `GET /api/projects/:projectId/issues?includeKanbanFields=true` — расширение существующего эндпоинта: добавляет `kanbanFields[]` (top-3 showOnKanban полей с текущими значениями) к каждой задаче

---

## [0.4] [2026-03-21] feat(field-schemas): TTADM-38 — проверка конфликтов при публикации схемы

**Задача:** [TTADM-38](http://5.129.242.171)
**PR:** TBD
**Ветка:** `claude/jack-ttadm-38`

### Что изменилось

**Backend:**
- Новый файл `field-schemas.conflicts.ts` — вся логика детектирования конфликтов
- Три типа конфликтов: `FIELD_DUPLICATE_SAME_SCOPE` (ERROR), `REQUIRED_MISMATCH` (ERROR), `KANBAN_OVERFLOW` (WARNING)
- `POST /api/admin/field-schemas/:id/publish` — теперь проверяет конфликты перед активацией; при наличии ERROR возвращает 422 со списком конфликтов; WARNING не блокирует публикацию
- `GET /api/admin/field-schemas/:id/conflicts` — предварительная проверка без публикации; возвращает `{ hasErrors, hasWarnings, conflicts[] }`
- Алгоритм: сравнение биндингов кандидата с биндингами всех ACTIVE схем на одном уровне scope; дедупликация конфликтов

---

## [0.3] [2026-03-21] feat(field-schemas): TTADM-36+37 — backend модуль схем полей и биндингов

**Задача:** [TTADM-36](http://5.129.242.171), [TTADM-37](http://5.129.242.171)
**PR:** TBD
**Ветка:** `claude/jack-ttadm-36-37`

### Что изменилось

**Backend:**
- Новые enum: `FieldSchemaStatus` (DRAFT/ACTIVE), `FieldScopeType` (GLOBAL/PROJECT/ISSUE_TYPE/PROJECT_ISSUE_TYPE)
- Новые модели: `FieldSchema`, `FieldSchemaItem`, `FieldSchemaBinding` + миграция `20260321140000_add_field_schemas`
- Связи добавлены в `Project.fieldSchemaBindings`, `IssueTypeConfig.fieldSchemaBindings`, `CustomField.schemaItems`
- Новый модуль `backend/src/modules/field-schemas/`
- Admin CRUD: `GET/POST/PATCH/DELETE /api/admin/field-schemas`
- Жизненный цикл: `POST .../publish`, `POST .../unpublish`, `PATCH .../set-default`
- Копирование: `POST .../copy` (с опциональным копированием биндингов)
- Управление полями схемы: `PUT/POST .../items`, `DELETE .../items/:itemId`, `PATCH .../items/reorder`
- Управление биндингами: `GET/POST .../bindings`, `DELETE .../bindings/:bindingId`
- Публичный эндпоинт: `GET /api/projects/:projectId/field-schemas` — схемы применимые к проекту

---

## [0.2] [2026-03-21] feat(custom-fields): backend модуль кастомных полей — CRUD и валидация

**Задача:** [TTADM-35](http://5.129.242.171)
**PR:** TBD
**Ветка:** `claude/jack-ttadm-35`

### Что изменилось

**Backend:**
- Новый enum `CustomFieldType` (12 значений: TEXT, TEXTAREA, NUMBER, DECIMAL, DATE, DATETIME, URL, CHECKBOX, SELECT, MULTI_SELECT, USER, LABEL) в `schema.prisma`
- Новая модель `CustomField` + миграция `20260321130000_add_custom_fields`
- Новый модуль `backend/src/modules/custom-fields/`
- `GET /api/admin/custom-fields` — список всех кастомных полей (ADMIN+)
- `POST /api/admin/custom-fields` — создать поле (ADMIN+)
- `GET /api/admin/custom-fields/:id` — получить поле (ADMIN+)
- `PATCH /api/admin/custom-fields/:id` — редактировать поле (ADMIN+)
- `DELETE /api/admin/custom-fields/:id` — удалить поле (ADMIN+, системные поля удалить нельзя)
- `PATCH /api/admin/custom-fields/:id/toggle` — включить/выключить поле (ADMIN+)
- `PATCH /api/admin/custom-fields/reorder` — изменить порядок (ADMIN+)
- Бизнес-правила: options обязательны для SELECT/MULTI_SELECT; fieldType нельзя изменить; isSystem поля нельзя удалить

---

## [0.1] [2026-03-21] feat(admin): управление публичной регистрацией пользователей

**Задача:** [TTADM-32](http://5.129.242.171) (история под эпиком TTADM-5 «Управление пользователями»)
**PR:** [#79](https://github.com/jackrescuer-gif/tasktime-mvp/pull/79)
**Ветка:** `claude/jack-ttadm-32-registration-toggle`

### Что изменилось

**Backend:**
- Новая модель `SystemSetting` в `schema.prisma` + миграция `20260321120000_add_system_settings`
- `GET /api/auth/registration-status` — публичный эндпоинт (без авторизации), читается страницей входа
- `GET /api/admin/settings/registration` — текущее состояние для авторизованных пользователей
- `PATCH /api/admin/settings/registration` — изменение настройки, только `SUPER_ADMIN`; создаёт запись в `audit_log` с действием `system.registration_toggled`
- `POST /api/auth/register` — возвращает `403 "Регистрация пользователей отключена"` если настройка выключена

**Frontend:**
- `AdminUsersPage`: Switch «Публичная регистрация» в шапке страницы — активен только для `SUPER_ADMIN`, `disabled` для остальных
- `LoginPage`: скрывает вкладку «Регистрация» если настройка выключена; показывает информационное сообщение

### Файлы
- `backend/src/prisma/schema.prisma`
- `backend/src/prisma/migrations/20260321120000_add_system_settings/`
- `backend/src/modules/admin/admin.router.ts`
- `backend/src/modules/admin/admin.service.ts`
- `backend/src/modules/auth/auth.router.ts`
- `frontend/src/api/admin.ts`
- `frontend/src/pages/admin/AdminUsersPage.tsx`
- `frontend/src/pages/LoginPage.tsx`
