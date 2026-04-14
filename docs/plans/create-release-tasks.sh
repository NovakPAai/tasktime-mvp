#!/bin/bash
set -euo pipefail

BASE="https://flowuniverse.ru/api"
PROJECT_ID="bb450f20-798e-4e23-a69f-7d57f545ed98"
EPIC_ID="b6df7d5a-9146-41b6-af0b-f543dd0e45dc"
STORY_TYPE="96a022b1-6523-4705-aa62-892679529b59"
TASK_TYPE="cd075ae5-e084-42a4-8961-99a6cd0c2dd5"
LINK_BLOCKS="a942e9c3-2e72-4351-95c2-dce00a977c22"

# Authenticate
echo "=== Authenticating ==="
AUTH=$(curl -sL -X POST "$BASE/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"Claude@tasktime.ru","password":"Pa88W0rd89765123"}')
TOKEN=$(echo "$AUTH" | python3 -c "import json,sys; print(json.load(sys.stdin)['accessToken'])")
echo "Token obtained."

H1="Authorization: Bearer $TOKEN"
H2="Content-Type: application/json"

create_issue() {
  local title="$1"
  local desc="$2"
  local type_id="$3"
  local parent_id="$4"
  local priority="$5"

  local body
  body=$(python3 -c "
import json
d = {
  'title': '''$title''',
  'description': '''$desc''',
  'issueTypeConfigId': '$type_id',
  'parentId': '$parent_id' if '$parent_id' != '' else None,
  'priority': '$priority'
}
d = {k:v for k,v in d.items() if v is not None and v != ''}
print(json.dumps(d))
")

  local resp
  resp=$(curl -sL -X POST "$BASE/projects/$PROJECT_ID/issues" \
    -H "$H1" -H "$H2" -d "$body")

  local id
  id=$(echo "$resp" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])" 2>/dev/null)
  local num
  num=$(echo "$resp" | python3 -c "import json,sys; print(json.load(sys.stdin)['number'])" 2>/dev/null)

  if [ -z "$id" ] || [ "$id" = "None" ]; then
    echo "ERROR creating: $title"
    echo "$resp"
    return 1
  fi

  echo "TTMP-$num ($id): $title"
  echo "$id"
}

create_link() {
  local source_id="$1"
  local target_id="$2"

  curl -sL -X POST "$BASE/issues/$source_id/links" \
    -H "$H1" -H "$H2" \
    -d "{\"targetIssueId\":\"$target_id\",\"linkTypeId\":\"$LINK_BLOCKS\"}" > /dev/null
  echo "  Link: $source_id -> $target_id (blocks)"
}

# ============================================
# CREATE STORIES (children of EPIC TTMP-173)
# ============================================

echo ""
echo "=== Creating Stories ==="

S1_ID=$(create_issue \
  "[RM-01] Модель данных и миграция БД" \
  "## Цель
Создать новые модели данных для управления релизами: ReleaseStatus, ReleaseWorkflow, ReleaseWorkflowStep, ReleaseWorkflowTransition, ReleaseItem. Модифицировать модель Release (type, nullable projectId, statusId, workflowId). Добавить роль RELEASE_MANAGER. Seed дефолтных данных. Миграция существующих релизов.

## Acceptance Criteria
- Все новые модели созданы в schema.prisma с миграцией
- Enum ReleaseType (ATOMIC/INTEGRATION) добавлен
- Enum UserRole расширен на RELEASE_MANAGER
- ReleaseState enum удалён, заменён на FK к ReleaseStatus
- Seed дефолтных 6 статусов и workflow с переходами
- Существующие релизы мигрированы (state → statusId)
- Issue.releaseId → ReleaseItem миграция данных
- prisma migrate dev + typecheck проходят" \
  "$STORY_TYPE" "$EPIC_ID" "HIGH" | tail -1)

S2_ID=$(create_issue \
  "[RM-02] Release Workflow Engine (backend)" \
  "## Цель
Реализовать workflow engine для релизов по аналогии с issue workflow engine. Включает: резолюцию workflow, вычисление доступных переходов, выполнение переходов с conditions и audit log, Redis-кэш.

## Acceptance Criteria
- resolveWorkflowForRelease — определяет workflow релиза (с учётом releaseType)
- getAvailableTransitions — список доступных переходов из текущего статуса
- executeTransition — выполнение перехода с проверкой conditions
- Release-специфичные conditions: ALL_ITEMS_IN_STATUS_CATEGORY, ALL_SPRINTS_CLOSED, MIN_ITEMS_COUNT
- Redis-кэш workflow resolution с инвалидацией
- Audit log для всех переходов" \
  "$STORY_TYPE" "$EPIC_ID" "HIGH" | tail -1)

S3_ID=$(create_issue \
  "[RM-03] Обновлённый releases module (backend API)" \
  "## Цель
Рефакторинг releases module на новую модель данных. Новые эндпоинты: глобальный список с фильтрацией, создание с типом, transitions, клонирование. ReleaseItem CRUD. Deprecation старых эндпоинтов.

## Acceptance Criteria
- GET /api/releases — глобальный список с фильтрацией по type, statusId, statusCategory, projectId, from/to, search, пагинация и сортировка
- POST /api/releases — создание ATOMIC (с projectId) и INTEGRATION (без projectId)
- PATCH /api/releases/:id — обновление с валидацией
- DELETE /api/releases/:id — удаление с проверками (не DONE)
- POST/DELETE /api/releases/:id/items — управление составом через ReleaseItem
- GET/POST /api/releases/:id/transitions — статусная машина
- GET /api/releases/:id/readiness — расширенные метрики с byProject
- POST /api/releases/:id/clone — клонирование
- POST /releases/:id/ready и /released → 410 Gone
- RBAC: ADMIN, MANAGER, RELEASE_MANAGER" \
  "$STORY_TYPE" "$EPIC_ID" "HIGH" | tail -1)

S4_ID=$(create_issue \
  "[RM-04] Администрирование статусной модели (backend)" \
  "## Цель
Admin API для управления статусами релизов и workflow'ами. CRUD статусов, CRUD workflow + шаги + переходы, валидация графа.

## Acceptance Criteria
- CRUD /api/admin/release-statuses
- CRUD /api/admin/release-workflows (+ steps, transitions)
- GET /api/admin/release-workflows/:id/validate — валидация графа
- Ошибки: NO_INITIAL_STATUS, NO_DONE_STATUS
- Предупреждения: DEAD_END_STATUS, UNREACHABLE_STATUS
- Привязка workflow к типу релиза (releaseType)
- RBAC: только ADMIN, SUPER_ADMIN" \
  "$STORY_TYPE" "$EPIC_ID" "MEDIUM" | tail -1)

S5_ID=$(create_issue \
  "[RM-05] GlobalReleasesPage (frontend)" \
  "## Цель
Раздел управления релизами (/releases). Таблица всех релизов с фильтрами. Модальные окна создания/редактирования. Детальная карточка с вкладками (задачи, спринты, готовность, история). Кнопки переходов по статусам.

## Acceptance Criteria
- Таблица релизов с фильтрами: тип, статус, период, проект, поиск
- Пагинация, сортировка
- Модальное окно создания (тип ATOMIC/INTEGRATION, выбор проекта, workflow)
- Детальная карточка: вкладка «Задачи» с группировкой по проектам
- Вкладка «Спринты» с прогрессом
- Вкладка «Готовность» с метриками и диаграммой
- Вкладка «История» (audit log)
- Кнопки доступных переходов по статусам
- Dual-theme (DARK_C / LIGHT_C), inline-styles, UI Kit 2.0" \
  "$STORY_TYPE" "$EPIC_ID" "HIGH" | tail -1)

S6_ID=$(create_issue \
  "[RM-06] Обновление ReleasesPage (frontend)" \
  "## Цель
Адаптация существующей ReleasesPage (/projects/:id/releases) под новую модель: workflow-статусы вместо DRAFT/READY/RELEASED, показ интеграционных релизов проекта.

## Acceptance Criteria
- Workflow-статусы с цветными бейджами вместо жёстких enum
- Кнопки доступных переходов вместо markReady/markReleased
- Показ интеграционных релизов, содержащих задачи проекта (read-only, ссылка на /releases)
- Обратная совместимость с текущим UX
- Dual-theme" \
  "$STORY_TYPE" "$EPIC_ID" "MEDIUM" | tail -1)

S7_ID=$(create_issue \
  "[RM-07] Визуальный редактор workflow релизов (frontend)" \
  "## Цель
Визуальный drag-n-drop редактор workflow релизов на @xyflow/react в админке. Узлы = статусы, рёбра = переходы. Панель свойств, валидация в реальном времени.

## Acceptance Criteria
- Интеграция @xyflow/react (React Flow)
- Узлы = статусы (перетаскиваемые, с цветами по категории)
- Рёбра = переходы (кликабельные, с названием)
- Панель свойств при клике на переход (conditions, isGlobal)
- Валидация графа в реальном времени (подсветка ошибок)
- Привязка workflow к типу релиза (ATOMIC/INTEGRATION/универсальный)
- Сохранение изменений через admin API
- Dual-theme" \
  "$STORY_TYPE" "$EPIC_ID" "MEDIUM" | tail -1)

echo ""
echo "=== Story IDs ==="
echo "S1=$S1_ID S2=$S2_ID S3=$S3_ID S4=$S4_ID S5=$S5_ID S6=$S6_ID S7=$S7_ID"

# ============================================
# CREATE TASKS (children of Stories)
# ============================================

echo ""
echo "=== Creating Tasks for S1: Модель данных ==="

T1_1_ID=$(create_issue \
  "[RM-01.1] Создать enum ReleaseType и модели ReleaseStatus, ReleaseWorkflow, Step, Transition" \
  "Добавить в schema.prisma: enum ReleaseType (ATOMIC, INTEGRATION), enum ReleaseStatusCategory (PLANNING, IN_PROGRESS, DONE, CANCELLED), модели ReleaseStatus, ReleaseWorkflow (с полем releaseType), ReleaseWorkflowStep, ReleaseWorkflowTransition. Создать миграцию prisma migrate dev." \
  "$TASK_TYPE" "$S1_ID" "HIGH" | tail -1)

T1_2_ID=$(create_issue \
  "[RM-01.2] Создать модель ReleaseItem (связь release-issue)" \
  "Добавить модель ReleaseItem с полями: releaseId, issueId, addedAt, addedById. Unique constraint [releaseId, issueId]. Индексы по releaseId и issueId. Обратные связи в Release и Issue." \
  "$TASK_TYPE" "$S1_ID" "HIGH" | tail -1)

T1_3_ID=$(create_issue \
  "[RM-01.3] Модифицировать модель Release (type, statusId, workflowId, nullable projectId)" \
  "Добавить поля: type (ReleaseType, default ATOMIC), statusId (FK на ReleaseStatus), workflowId (FK на ReleaseWorkflow), plannedDate, createdById. Сделать projectId nullable. Добавить индексы по statusId, type, workflowId. Обновить unique constraint." \
  "$TASK_TYPE" "$S1_ID" "HIGH" | tail -1)

T1_4_ID=$(create_issue \
  "[RM-01.4] Добавить RELEASE_MANAGER в enum UserRole" \
  "Расширить enum UserRole на значение RELEASE_MANAGER. ALTER TYPE с IF NOT EXISTS. Обновить RBAC middleware для поддержки новой роли. Обновить hasRequiredRole в shared/auth/roles.ts." \
  "$TASK_TYPE" "$S1_ID" "MEDIUM" | tail -1)

T1_5_ID=$(create_issue \
  "[RM-01.5] Seed дефолтных статусов и workflow релизов" \
  "Создать seed-скрипт: 6 статусов (Черновик, В сборке, На тестировании, Готов к выпуску, Выпущен, Отменён) с категориями и цветами. Дефолтный workflow 'Стандартный релизный процесс' с 6 переходами. Seed должен быть идемпотентным (upsert)." \
  "$TASK_TYPE" "$S1_ID" "MEDIUM" | tail -1)

T1_6_ID=$(create_issue \
  "[RM-01.6] Миграция существующих данных (state→statusId, Issue.releaseId→ReleaseItem)" \
  "SQL-миграция: маппинг DRAFT→Черновик, READY→Готов к выпуску, RELEASED→Выпущен. Установить type=ATOMIC, workflowId=default, createdById=fallback admin. Создать ReleaseItem из существующих Issue.releaseId. Удалить колонку state. Сделать statusId/workflowId/createdById NOT NULL." \
  "$TASK_TYPE" "$S1_ID" "HIGH" | tail -1)

echo ""
echo "=== Creating Tasks for S2: Workflow Engine ==="

T2_1_ID=$(create_issue \
  "[RM-02.1] Сервис resolveWorkflowForRelease" \
  "Создать release-workflow-engine.service.ts. Функция resolveWorkflowForRelease(release): загружает workflow по release.workflowId, включая steps и transitions. Приоритет: типизированный workflow (releaseType) > универсальный (releaseType=null)." \
  "$TASK_TYPE" "$S2_ID" "HIGH" | tail -1)

T2_2_ID=$(create_issue \
  "[RM-02.2] getAvailableTransitions + evaluateConditions" \
  "Функция getAvailableTransitions(releaseId, actorId): получить текущий статус релиза, найти переходы из этого статуса (+ isGlobal), оценить conditions. Возвращает массив TransitionResponse с toStatus и requiresScreen." \
  "$TASK_TYPE" "$S2_ID" "HIGH" | tail -1)

T2_3_ID=$(create_issue \
  "[RM-02.3] executeTransition с audit log" \
  "Функция executeTransition(releaseId, transitionId, actorId, comment?): валидация перехода, проверка conditions, обновление statusId, установка releaseDate при переходе в DONE. Запись в audit_log (release.transition с fromStatus/toStatus)." \
  "$TASK_TYPE" "$S2_ID" "HIGH" | tail -1)

T2_4_ID=$(create_issue \
  "[RM-02.4] Redis-кэш workflow resolution" \
  "Кэширование resolveWorkflowForRelease в Redis. Ключ: rw:{workflowId}. TTL 300s. Инвалидация при изменении workflow/steps/transitions. Функции invalidateReleaseWorkflowCache." \
  "$TASK_TYPE" "$S2_ID" "MEDIUM" | tail -1)

T2_5_ID=$(create_issue \
  "[RM-02.5] Release-специфичные conditions" \
  "Реализовать условия переходов: ALL_ITEMS_IN_STATUS_CATEGORY (все задачи в категории DONE), ALL_SPRINTS_CLOSED (все спринты CLOSED), MIN_ITEMS_COUNT (минимум N задач в релизе). Интеграция с evaluateConditions." \
  "$TASK_TYPE" "$S2_ID" "MEDIUM" | tail -1)

echo ""
echo "=== Creating Tasks for S3: Releases Module ==="

T3_1_ID=$(create_issue \
  "[RM-03.1] GET /api/releases — глобальный список с фильтрацией и пагинацией" \
  "Новый эндпоинт: фильтры type, statusId, statusCategory, projectId, from/to, releaseDateFrom/To, search. Пагинация (page, limit), сортировка (sortBy, sortDir). Поле _projects — массив ключей проектов для интеграционных релизов. Redis-кэш." \
  "$TASK_TYPE" "$S3_ID" "HIGH" | tail -1)

T3_2_ID=$(create_issue \
  "[RM-03.2] POST /api/releases — создание с типом ATOMIC/INTEGRATION" \
  "Создание релиза с валидацией: ATOMIC→projectId обязателен, INTEGRATION→projectId запрещён. Автоматическое назначение начального статуса workflow. Если workflowId не указан — дефолтный для типа. Уникальность name в scope (проект/глобально). RBAC: ADMIN, MANAGER, RELEASE_MANAGER." \
  "$TASK_TYPE" "$S3_ID" "HIGH" | tail -1)

T3_3_ID=$(create_issue \
  "[RM-03.3] PATCH /api/releases/:id — обновление с валидацией" \
  "Обновление полей: name, description, level, plannedDate, releaseDate. Иммутабельные: type, projectId. Запрет statusId через PATCH (только через transitions). Если статус в категории DONE — только description. RBAC." \
  "$TASK_TYPE" "$S3_ID" "MEDIUM" | tail -1)

T3_4_ID=$(create_issue \
  "[RM-03.4] DELETE /api/releases/:id — удаление с проверками" \
  "Удаление релиза: запрет для статуса категории DONE. Каскадное удаление ReleaseItem. Обнуление Sprint.releaseId. RBAC: только ADMIN, RELEASE_MANAGER. Audit log." \
  "$TASK_TYPE" "$S3_ID" "MEDIUM" | tail -1)

T3_5_ID=$(create_issue \
  "[RM-03.5] ReleaseItem CRUD (add/remove items с валидацией по типу)" \
  "POST /api/releases/:id/items — добавление задач. Валидация: ATOMIC→только из projectId, INTEGRATION→любые проекты. Запрет для DONE/CANCELLED статусов. Upsert по [releaseId, issueId]. POST /api/releases/:id/items/remove — удаление задач. Пагинированный GET /api/releases/:id/items с фильтрами." \
  "$TASK_TYPE" "$S3_ID" "HIGH" | tail -1)

T3_6_ID=$(create_issue \
  "[RM-03.6] GET/POST transitions — статусная машина через workflow engine" \
  "GET /api/releases/:id/transitions — доступные переходы. POST /api/releases/:id/transitions/:transitionId — выполнение перехода. Интеграция с release-workflow-engine. Audit log для каждого перехода." \
  "$TASK_TYPE" "$S3_ID" "HIGH" | tail -1)

T3_7_ID=$(create_issue \
  "[RM-03.7] GET /releases/:id/readiness — расширенные метрики" \
  "Расширение readiness: totalItems, doneItems, cancelledItems, inProgressItems, totalSprints, closedSprints, byProject (разбивка по проектам для интеграционных), completionPercent, availableTransitions." \
  "$TASK_TYPE" "$S3_ID" "MEDIUM" | tail -1)

T3_8_ID=$(create_issue \
  "[RM-03.8] POST /releases/:id/clone — клонирование релиза" \
  "Создание нового релиза на основе существующего. Параметры: name (опционально, авто: 'original (copy)'), type, projectId, cloneItems (bool), cloneSprints (bool). Начальный статус workflow. Audit log release.cloned с sourceReleaseId." \
  "$TASK_TYPE" "$S3_ID" "MEDIUM" | tail -1)

T3_9_ID=$(create_issue \
  "[RM-03.9] Deprecation старых эндпоинтов (ready, released → 410 Gone)" \
  "POST /releases/:id/ready и POST /releases/:id/released возвращают 410 Gone с телом {error: 'Deprecated', message: 'Use POST /releases/:id/transitions/:transitionId'}. Обновить документацию." \
  "$TASK_TYPE" "$S3_ID" "LOW" | tail -1)

echo ""
echo "=== Creating Tasks for S4: Администрирование ==="

T4_1_ID=$(create_issue \
  "[RM-04.1] CRUD ReleaseStatus (admin endpoints)" \
  "GET/POST/PATCH/DELETE /api/admin/release-statuses. Валидация: name уникален. Запрет удаления используемых статусов. Zod DTOs. RBAC: ADMIN, SUPER_ADMIN. Redis-кэш release-statuses:all с TTL 600s." \
  "$TASK_TYPE" "$S4_ID" "MEDIUM" | tail -1)

T4_2_ID=$(create_issue \
  "[RM-04.2] CRUD ReleaseWorkflow + шаги + переходы (admin endpoints)" \
  "CRUD /api/admin/release-workflows. Вложенные: POST/DELETE steps, POST/PATCH/DELETE transitions. Привязка releaseType к workflow. Запрет удаления используемых workflow. Инвалидация Redis-кэша при изменении." \
  "$TASK_TYPE" "$S4_ID" "MEDIUM" | tail -1)

T4_3_ID=$(create_issue \
  "[RM-04.3] Валидация графа workflow релизов" \
  "GET /api/admin/release-workflows/:id/validate. Ошибки: NO_INITIAL_STATUS, NO_DONE_STATUS. Предупреждения: DEAD_END_STATUS, UNREACHABLE_STATUS, UNUSED_STATUS. Возвращает WorkflowValidationReport с isValid и массивами errors/warnings." \
  "$TASK_TYPE" "$S4_ID" "MEDIUM" | tail -1)

echo ""
echo "=== Creating Tasks for S5: GlobalReleasesPage ==="

T5_1_ID=$(create_issue \
  "[RM-05.1] Таблица релизов с фильтрами, пагинацией, сортировкой" \
  "Основной вид GlobalReleasesPage: таблица с колонками (имя, тип, проекты, статус, уровень, задачи/прогресс, плановая дата, дата выпуска, автор). Фильтры: тип (tabs), статус (multi-select), период (DateRangePicker), проект (select), поиск. Пагинация, сортировка. Dual-theme, inline-styles." \
  "$TASK_TYPE" "$S5_ID" "HIGH" | tail -1)

T5_2_ID=$(create_issue \
  "[RM-05.2] Модальное окно создания релиза (тип, проект, workflow)" \
  "Форма: Radio тип (ATOMIC/INTEGRATION), Select проект (показывается для ATOMIC), Input название, Textarea описание, Radio уровень (Minor/Major), Select workflow, DatePicker плановая дата. Валидация на фронте. Вызов POST /api/releases." \
  "$TASK_TYPE" "$S5_ID" "HIGH" | tail -1)

T5_3_ID=$(create_issue \
  "[RM-05.3] Детальная карточка релиза — вкладка Задачи" \
  "Слайд-панель или страница. Шапка: название, тип, статус, кнопки переходов. Вкладка «Задачи»: таблица с группировкой по проектам (для INTEGRATION), колонки (ключ, название, статус, приоритет, тип, исполнитель, проект). Кнопки «Добавить задачи» и «Убрать из релиза». Модальное окно поиска задач." \
  "$TASK_TYPE" "$S5_ID" "HIGH" | tail -1)

T5_4_ID=$(create_issue \
  "[RM-05.4] Детальная карточка — вкладка Спринты" \
  "Список спринтов в релизе: название, статус, кол-во задач, прогресс. Кнопки «Добавить спринт» / «Убрать спринт». Модальное окно выбора спринтов." \
  "$TASK_TYPE" "$S5_ID" "MEDIUM" | tail -1)

T5_5_ID=$(create_issue \
  "[RM-05.5] Детальная карточка — вкладка Готовность" \
  "Метрики из GET /releases/:id/readiness. Круговая диаграмма задач по статусам. Для INTEGRATION: разбивка по проектам (таблица). Процент завершённости. Визуализация блокеров." \
  "$TASK_TYPE" "$S5_ID" "MEDIUM" | tail -1)

T5_6_ID=$(create_issue \
  "[RM-05.6] Детальная карточка — вкладка История" \
  "Хронологический список из audit_log по entityType=release. Показ: кто, когда, какое действие (создание, переход, добавление/удаление задач). Форматирование для каждого типа action." \
  "$TASK_TYPE" "$S5_ID" "LOW" | tail -1)

T5_7_ID=$(create_issue \
  "[RM-05.7] Кнопки переходов по статусам (workflow transitions UI)" \
  "Компонент ReleaseTransitionButtons: загрузка доступных переходов из GET /releases/:id/transitions. Кнопки с цветами toStatus. Подтверждение перехода (modal). Показ ошибок conditions. Обновление карточки после перехода." \
  "$TASK_TYPE" "$S5_ID" "HIGH" | tail -1)

echo ""
echo "=== Creating Tasks for S6: Обновление ReleasesPage ==="

T6_1_ID=$(create_issue \
  "[RM-06.1] Адаптация ReleasesPage под workflow-статусы" \
  "Заменить жёсткие DRAFT/READY/RELEASED на динамические статусы из API. Цветные бейджи по status.color. Кнопки переходов вместо markReady/markReleased. Переиспользовать ReleaseTransitionButtons из RM-05.7." \
  "$TASK_TYPE" "$S6_ID" "MEDIUM" | tail -1)

T6_2_ID=$(create_issue \
  "[RM-06.2] Показ интеграционных релизов проекта (read-only)" \
  "В ReleasesPage добавить секцию «Интеграционные релизы» — список INTEGRATION-релизов, содержащих задачи из текущего проекта. Read-only: клик открывает ссылку на /releases (GlobalReleasesPage). Бейдж «Интеграционный»." \
  "$TASK_TYPE" "$S6_ID" "MEDIUM" | tail -1)

echo ""
echo "=== Creating Tasks for S7: Визуальный редактор ==="

T7_1_ID=$(create_issue \
  "[RM-07.1] Интеграция @xyflow/react, базовый граф" \
  "Установить @xyflow/react. Создать компонент ReleaseWorkflowEditor. Загрузка workflow из admin API. Узлы = статусы (с цветами по категории), рёбра = переходы (с названиями). Базовый layout и стилизация. Dual-theme." \
  "$TASK_TYPE" "$S7_ID" "HIGH" | tail -1)

T7_2_ID=$(create_issue \
  "[RM-07.2] Панель свойств перехода (conditions, isGlobal)" \
  "При клике на ребро (переход) — открытие боковой панели. Редактирование: название перехода, isGlobal, conditions (UI для добавления/удаления condition rules). Сохранение через PATCH admin API." \
  "$TASK_TYPE" "$S7_ID" "MEDIUM" | tail -1)

T7_3_ID=$(create_issue \
  "[RM-07.3] Валидация графа в реальном времени" \
  "Вызов GET /api/admin/release-workflows/:id/validate при изменениях. Подсветка узлов-ошибок (красная рамка): NO_INITIAL_STATUS, NO_DONE_STATUS. Подсветка предупреждений (жёлтая): DEAD_END, UNREACHABLE. Панель ошибок/предупреждений." \
  "$TASK_TYPE" "$S7_ID" "MEDIUM" | tail -1)

T7_4_ID=$(create_issue \
  "[RM-07.4] Привязка workflow к типу релиза в редакторе" \
  "В шапке редактора: select для releaseType (Все типы / Атомарные / Интеграционные). Сохранение через PATCH /api/admin/release-workflows/:id. Визуальная индикация типа привязки." \
  "$TASK_TYPE" "$S7_ID" "LOW" | tail -1)

# ============================================
# CREATE BLOCKING LINKS
# ============================================

echo ""
echo "=== Creating Blocking Links (Stories) ==="

# S1 blocks S2, S3, S4
create_link "$S1_ID" "$S2_ID"
create_link "$S1_ID" "$S3_ID"
create_link "$S1_ID" "$S4_ID"

# S2 blocks S3
create_link "$S2_ID" "$S3_ID"

# S3 blocks S5, S6
create_link "$S3_ID" "$S5_ID"
create_link "$S3_ID" "$S6_ID"

# S4 blocks S7
create_link "$S4_ID" "$S7_ID"

# S5 blocks S6 (update page after global page)
create_link "$S5_ID" "$S6_ID"

# S5 blocks S7 (visual editor after main page)
create_link "$S5_ID" "$S7_ID"

echo ""
echo "=== Creating Blocking Links (Tasks within S1) ==="
create_link "$T1_1_ID" "$T1_2_ID"
create_link "$T1_2_ID" "$T1_3_ID"
create_link "$T1_3_ID" "$T1_4_ID"
create_link "$T1_4_ID" "$T1_5_ID"
create_link "$T1_5_ID" "$T1_6_ID"

echo "=== Creating Blocking Links (Tasks within S2) ==="
create_link "$T2_1_ID" "$T2_2_ID"
create_link "$T2_2_ID" "$T2_3_ID"
create_link "$T2_3_ID" "$T2_4_ID"
create_link "$T2_4_ID" "$T2_5_ID"

echo "=== Creating Blocking Links (Tasks within S3) ==="
create_link "$T3_1_ID" "$T3_2_ID"
create_link "$T3_2_ID" "$T3_3_ID"
create_link "$T3_3_ID" "$T3_4_ID"
create_link "$T3_4_ID" "$T3_5_ID"
create_link "$T3_5_ID" "$T3_6_ID"
create_link "$T3_6_ID" "$T3_7_ID"
create_link "$T3_7_ID" "$T3_8_ID"
create_link "$T3_8_ID" "$T3_9_ID"

echo "=== Creating Blocking Links (Tasks within S4) ==="
create_link "$T4_1_ID" "$T4_2_ID"
create_link "$T4_2_ID" "$T4_3_ID"

echo "=== Creating Blocking Links (Tasks within S5) ==="
create_link "$T5_1_ID" "$T5_2_ID"
create_link "$T5_2_ID" "$T5_3_ID"
create_link "$T5_3_ID" "$T5_4_ID"
create_link "$T5_4_ID" "$T5_5_ID"
create_link "$T5_5_ID" "$T5_6_ID"
create_link "$T5_3_ID" "$T5_7_ID"

echo "=== Creating Blocking Links (Tasks within S6) ==="
create_link "$T6_1_ID" "$T6_2_ID"

echo "=== Creating Blocking Links (Tasks within S7) ==="
create_link "$T7_1_ID" "$T7_2_ID"
create_link "$T7_2_ID" "$T7_3_ID"
create_link "$T7_3_ID" "$T7_4_ID"

# Cross-story task links
echo ""
echo "=== Creating Cross-Story Blocking Links ==="
# T1.6 (last in S1) blocks T2.1 (first in S2)
create_link "$T1_6_ID" "$T2_1_ID"
# T2.5 (last in S2) blocks T3.1 (first in S3)
create_link "$T2_5_ID" "$T3_1_ID"
# T1.6 blocks T4.1 (S1 → S4)
create_link "$T1_6_ID" "$T4_1_ID"
# T3.6 (transitions API) blocks T5.1 (frontend table)
create_link "$T3_6_ID" "$T5_1_ID"
# T4.3 (validate API) blocks T7.1 (visual editor)
create_link "$T4_3_ID" "$T7_1_ID"
# T5.7 (transition buttons) blocks T6.1 (reuse in ReleasesPage)
create_link "$T5_7_ID" "$T6_1_ID"

echo ""
echo "=== DONE ==="
echo "Stories: 7, Tasks: 28, Total: 35 issues created"
