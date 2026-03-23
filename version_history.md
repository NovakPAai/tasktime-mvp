# Version History

Все значимые изменения в проекте. Для каждого изменения указана ссылка на задачу (если есть).

**Last version: 1.4**

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
