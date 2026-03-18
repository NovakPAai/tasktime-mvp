# MVP LiveCode Agent Tasks Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Добавить поддержку задач проекта MVP LiveCode с флагом «делает агент», фильтрами «активные для реализации» и базовой интеграцией со стороной агента (API для чтения/обновления флагов и статусов).

**Architecture:** Расширяем модель `Issue` дополнительными полями для ИИ, добавляем REST‑эндпоинты для выборки активных задач и управления флагами/статусами, обновляем фронтенд‑UI проекта и карточки задачи, а также подготавливаем простой HTTP‑интерфейс для команд из Cursor/агента. Каноничные данные хранятся в Flow Universe, интеграция с GSD/Codex реализуется через отдельный слой, использующий новые API.

**Tech Stack:** Node.js 20, Express 4, TypeScript 5, Prisma 6, PostgreSQL 16, React 18, Vite, Ant Design 5, Zustand, REST API.

---

### Task 1: Расширение Prisma‑модели Issue для ИИ

**Files:**
- Modify: `backend/src/prisma/schema.prisma` (модель `Issue`, новые enum’ы)
- Modify: `backend/src/prisma/seed.ts` (проект MVP LiveCode и пример задач)

**Step 1: Добавить enum AiExecutionStatus и AiAssigneeType в Prisma‑схему**

- В `schema.prisma` объявить:
  - `enum AiExecutionStatus { NOT_STARTED IN_PROGRESS DONE FAILED }`
  - `enum AiAssigneeType { HUMAN AGENT MIXED }`

**Step 2: Добавить новые поля в модель Issue**

- В модель `Issue` добавить:
  - `aiEligible Boolean @default(false) @map("ai_eligible")`
  - `aiExecutionStatus AiExecutionStatus @default(NOT_STARTED) @map("ai_execution_status")`
  - `aiAssigneeType AiAssigneeType @default(HUMAN) @map("ai_assignee_type")`
- Добавить индекс по `projectId`, `status`, `aiEligible` для быстрых выборок.

**Step 3: Сгенерировать миграцию Prisma**

- Запустить команду миграции (в dev‑окружении) для генерации схемы БД.
- Убедиться, что таблица `issues` получила новые колонки с корректными дефолтами.

**Step 4: Обновить seed‑скрипт для проекта MVP LiveCode**

- В `seed.ts`:
  - создать (если ещё нет) проект с `key = "LIVE"` и понятным названием `MVP LiveCode`.
  - добавить несколько примерных задач:
    - часть с `aiEligible = true`, `aiAssigneeType = AGENT`;
    - часть с `aiEligible = false`, `aiAssigneeType = HUMAN`.

**Step 5: Прогнать seed и проверить данные**

- Выполнить `prisma db seed` (или существующую seed‑команду Makefile).
- SQL/Prisma‑клиентом убедиться, что:
  - проект `LIVE` создан;
  - задачи имеют новые поля и дефолты.

---

### Task 2: Backend API для активных задач и флагов агента

**Files:**
- Modify: `backend/src/modules/issues/issues.service.ts`
- Modify: `backend/src/modules/issues/issues.router.ts`
- Modify: `backend/src/modules/issues/issues.dto.ts` (если используется Zod/DTO для валидации)
- Modify: `backend/src/modules/projects/projects.service.ts` (для поиска проекта по key `LIVE`, если нужно)
- Test: `backend/test/issues/*.test.ts` (новые тесты API)

**Step 1: Добавить метод поиска активных задач MVP LiveCode в сервис**

- В `issues.service` реализовать метод вроде:
  - `getActiveIssuesForMvpLiveCode(filters)`:
    - находит проект с key `LIVE`;
    - возвращает `Issue` с:
      - `projectId = liveProject.id`,
      - `status in [OPEN, IN_PROGRESS, REVIEW]`,
      - опциональными фильтрами по `aiEligible`, `aiAssigneeType`.

**Step 2: Добавить DTO/валидатор для параметров фильтра**

- В DTO/валидаторе описать:
  - `onlyAiEligible?: boolean`
  - `assigneeType?: 'HUMAN' | 'AGENT' | 'MIXED' | 'ALL'`
- Обеспечить дефолты (`ALL`, `false`), если параметры не заданы.

**Step 3: Добавить endpoint `GET /api/mvp-livecode/issues/active`**

- В `issues.router`:
  - зарегистрировать новый маршрут под защищённым префиксом (с JWT и RBAC).
  - внутри:
    - парсить query‑параметры через DTO;
    - вызывать сервис;
    - возвращать список задач с новыми полями `aiEligible`, `aiExecutionStatus`, `aiAssigneeType`.

**Step 4: Добавить endpoint для обновления ai‑флагов**

- В `issues.router` добавить `PATCH /api/issues/:id/ai-flags`:
  - тело: `{ aiEligible?: boolean; aiAssigneeType?: 'HUMAN' | 'AGENT' | 'MIXED' }`.
  - RBAC:
    - минимум `MANAGER`/`ADMIN` (проверка через существующий guard роли).
  - сервисный метод:
    - обновляет поля в `Issue`,
    - пишет запись в `AuditLog` с типом действия, например `issue.ai.flags.updated`.

**Step 5: Добавить endpoint для обновления ai‑статуса**

- В `issues.router` добавить `PATCH /api/issues/:id/ai-status`:
  - тело: `{ aiExecutionStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE' | 'FAILED' }`.
  - использовать для обновлений со стороны интеграции/агента.
  - писать `AuditLog` с действием `issue.ai.status.updated` и пометкой источника (`AGENT_INTEGRATION` или текущий пользователь).

**Step 6: Написать базовые API‑тесты**

- В тестах `issues`:
  - кейс: `GET /api/mvp-livecode/issues/active` возвращает только задачи проекта `LIVE` со статусом OPEN/IN_PROGRESS/REVIEW.
  - кейс: фильтр `onlyAiEligible=true` возвращает только задачи с `aiEligible = true`.
  - кейс: `PATCH /api/issues/:id/ai-flags`:
    - обновляет флаг и тип исполнителя;
    - запрещён для ролей без прав.
  - кейс: `PATCH /api/issues/:id/ai-status` меняет статус и логируется.

---

### Task 3: UI проекта MVP LiveCode и чекбокса агента (frontend)

**Files:**
- Modify: `frontend/src/api/issues.ts` (типы Issue + новые поля, API‑клиент)
- Modify: `frontend/src/types/issue.ts` или аналогичный файл типов
- Modify: `frontend/src/pages/projects/ProjectIssuesPage.tsx` (или эквивалентный список/борда)
- Modify: `frontend/src/components/issues/IssueCard.tsx` / `IssueDetails.tsx`
- Test: фронтовые тесты, если есть (Vitest/RTL)

**Step 1: Обновить типы Issue на фронте**

- Добавить поля:
  - `aiEligible: boolean`
  - `aiExecutionStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE' | 'FAILED'`
  - `aiAssigneeType: 'HUMAN' | 'AGENT' | 'MIXED'`
- Убедиться, что сериализация/десериализация соответствует backend.

**Step 2: Добавить API‑клиент для получения активных задач MVP LiveCode**

- В `issues.ts` реализовать функцию:
  - `fetchMvpLivecodeActiveIssues(params)`:
    - GET ` /api/mvp-livecode/issues/active`,
    - принимает опциональные фильтры `onlyAiEligible`, `assigneeType`.

**Step 3: Добавить колонку/значок Agent в списке задач**

- В компоненте списка задач проекта:
  - добавить колонку/бейдж:
    - показывает:
      - чекбокс «Agent» (привязан к `aiEligible`);
      - краткий текст статуса агента (например, иконка + `DONE/IN PROGRESS`).

**Step 4: Реализовать изменение чекбокса «делает агент»**

- При клике по чекбоксу:
  - вызывает `PATCH /api/issues/:id/ai-flags`;
  - локально обновляет состояние списка;
  - показывает уведомление об успехе/ошибке.
- В UX:
  - запретить/скрыть чекбокс для ролей без прав (если роль < MANAGER).

**Step 5: Обновить карточку задачи**

- В деталях задачи:
  - показать блок «Исполнитель»:
    - тип: человек/агент/совместно (`aiAssigneeType`),
    - чекбокс «Задачу может выполнить агент»,
    - строку состояния агента (`aiExecutionStatus`).

**Step 6: Добавить представление/фильтр «Активные для реализации»**

- На странице проекта:
  - добавить преднастроенное представление:
    - фильтр по статусам (OPEN, IN_PROGRESS, REVIEW),
    - переключатель «Только задачи для агента» (фильтрует `aiEligible = true`),
    - селект «Тип исполнителя» (все/агент/человек).

---

### Task 4: Интерфейс для Cursor/агента (минимальный API и команды)

**Files:**
- Modify: MCP / agent‑интеграция (если есть отдельный модуль; иначе — документация и пример вызовов)
- Add: короткое описание команд в `docs/PIXEL_AGENTS_AND_TASKS.md` или отдельном README

**Step 1: Определить HTTP‑контракт для агента**

- Использовать уже реализованные эндпоинты:
  - `GET /api/mvp-livecode/issues/active`
  - `PATCH /api/issues/:id/ai-status`
  - `PATCH /api/issues/:id/ai-flags`
- Зафиксировать в доке ожидаемые параметры и форматы ответов.

**Step 2: Описать команды для Cursor**

- В документации (и при необходимости MCP‑описании) зафиксировать:
  - Команда: «Покажи все задачи, активные для реализации»
    - вызывает `GET /api/mvp-livecode/issues/active` без фильтров;
  - Команда: «Покажи задачи для агента»
    - вызывает `GET /api/mvp-livecode/issues/active?onlyAiEligible=true`;
  - Команда: «Отметь задачу LIVE‑XX как агентскую»
    - ищет задачу по ключу, вызывает `PATCH /api/issues/:id/ai-flags` с `aiEligible=true`.

**Step 3: Подготовить пример использования в агентских скиллах**

- В `docs/PIXEL_AGENTS_AND_TASKS.md` (или новом файле) добавить пример:
  - как агент запрашивает список активных задач;
  - как выбирает задачу, обновляет статус `aiExecutionStatus`,
  - как человек может снять чекбокс и вернуть задачу в human‑only поток.

---

### Task 5: Тестирование и доработка

**Files:**
- Update: backend тесты (issues, auth/RBAC)
- Update: frontend тесты (если есть)
- Add: документация по фиче в `docs/RU/REBUILD_PLAN_V2.md` или отдельном разделе

**Step 1: Прогнать все новые и существующие backend‑тесты**

- Убедиться, что:
  - новые эндпоинты работают и уважают RBAC;
  - изменения в `Issue` не ломают другие модули (boards, sprints, time tracking).

**Step 2: Прогнать фронтовые тесты и ручной сценарий**

- Ручной сценарий:
  - зайти под менеджером;
  - открыть проект `MVP LiveCode`;
  - включить чекбокс «делает агент» у одной задачи;
  - обновить страницу — убедиться, что состояние сохранилось;
  - открыть представление «Активные для реализации» и проверить фильтры.

**Step 3: Проверить безопасность и аудит**

- Убедиться, что:
  - без авторизации/с нужной ролью доступ к PATCH‑эндпоинтам запрещён;
  - записи об изменениях попадают в `AuditLog` с корректными деталями.

**Step 4: Обновить документацию**

- Кратко описать:
  - назначение проекта `MVP LiveCode`,
  - смысл чекбокса «делает агент»,
  - как пользоваться представлением «Активные для реализации»,
  - как агент/человек должны взаимодействовать с задачами.

