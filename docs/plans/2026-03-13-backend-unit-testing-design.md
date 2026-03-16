# Backend Unit Testing Design

## Goal

Добавить в `backend` настоящие unit-тесты без фиктивных pass-сценариев, моков "ради покрытия" и подмены инфраструктурного поведения.

## Core Rule

Для этого направления принимаем жёсткое правило:

- unit-тест должен проверять реальную доменную или вычислительную логику;
- если код напрямую зависит от `Prisma`, `Redis`, `Express` middleware chain или внешнего процесса, это не unit-слой;
- если логика смешана с инфраструктурой, сначала выносим её в pure-функции, потом покрываем тестами;
- если без подмены зависимости тест становится нечестным, такой сценарий переносится в integration/API coverage.

## Decision

Используем вариант `2`: покрываем unit-тестами всё, что можно честно тестировать как чистую логику, и параллельно рефакторим сервисы так, чтобы отделить доменные правила от инфраструктурных вызовов.

Это решение выбрано потому, что:

- вариант "только уже чистые утилиты" даёт слишком узкое покрытие;
- вариант "тестировать сервисы как есть" без подмен превращает задачу в интеграционные тесты;
- вариант "массово мокать `Prisma`/`Redis`" нарушает согласованное правило про живые и полноценные тесты.

## Unit Scope

### Wave 1: Already Pure Utilities

Первая волна покрывает код, который уже годится для честных unit-тестов без архитектурных изменений:

- `backend/src/shared/utils/jwt.ts`
- `backend/src/shared/utils/password.ts`
- `backend/src/shared/utils/params.ts`

Что проверяем:

- подпись и валидацию access/refresh token;
- корректное различие секретов access и refresh;
- ошибки на невалидных/чужих токенах;
- hash/compare парольных значений на реальном `bcryptjs`;
- чтение параметров из `Request.params`, включая массивное значение.

### Wave 2: Sprint Domain Rules

`backend/src/modules/sprints/sprints.service.ts` уже содержит несколько доменных правил и вычислений, которые можно и нужно вынести в pure helpers:

- расчёт `totalIssues`, `estimatedIssues`, `planningReadiness`;
- правило старта спринта только из состояния `PLANNED`;
- правило закрытия спринта только из состояния `ACTIVE`;
- правило "один ACTIVE sprint на проект";
- построение фильтров для `listAllSprints`;
- определение набора незавершённых задач для возврата в backlog.

После выделения этих правил unit-тесты покрывают именно доменную семантику, а не запросы Prisma.

### Wave 3: Auth Domain Rules

`backend/src/modules/auth/auth.service.ts` смешивает доменную логику и side effects. Для unit-слоя из него нужно выделить:

- построение token payload;
- вычисление hash refresh token;
- расчёт `generateRefreshExpiry`;
- построение записи refresh token для persistence;
- построение session snapshot для Redis;
- правила отказа для `login` / `refresh` при неактивном или отсутствующем пользователе.

Важно: запись в `prisma.refreshToken` и вызовы `setUserSession` / `deleteUserSession` не тестируются в unit-слое. Там остаются только правила и структуры данных, которые к ним передаются.

### Wave 4: Remaining Services With Extractable Pure Logic

После `sprints` и `auth` делаем точечный audit остальных сервисов и вытаскиваем только ту логику, которая является реальным domain/pure code.

Приоритетные кандидаты:

- `backend/src/modules/issues/issues.service.ts`
  - проверка допустимых parent-child связей;
  - построение фильтров `listIssues`;
  - правила интерпретации `UNASSIGNED` и `BACKLOG`.
- `backend/src/modules/time/time.service.ts`
  - расчёт часов по `startedAt/stoppedAt`;
  - округление часов;
  - построение payload для manual log.
- `backend/src/modules/ai/ai-sessions.service.ts`
  - нормализация `issueSplits`;
  - распределение `hours` и `costMoney`;
  - округление значений.
- `backend/src/modules/admin/admin.service.ts`
  - построение cache keys;
  - маппинг `issuesByAssigneeRaw` в представление с именем пользователя;
  - фильтрация `UAT_TESTS` по роли.
- `backend/src/modules/projects/projects.service.ts`
  - построение summary для active sprint dashboard.

Не пытаемся искусственно "выжать" unit-тесты из каждого сервиса. Покрываем только тот код, который после выделения остаётся чистым и самодостаточным.

## What Stays Outside Unit Tests

Следующие вещи осознанно не относятся к unit-слою:

- реальные вызовы `Prisma`;
- реальные вызовы `Redis`;
- HTTP chain `router -> auth/rbac/validate middleware -> service`;
- сериализация HTTP ошибок;
- реальные `include/select/orderBy/groupBy` запросы ORM;
- миграции, схема БД и межтабличная согласованность.

Это не пробел в покрытии, а сознательное разделение слоёв тестирования.

## Remaining Coverage Plan

Всё, что не покрывается честными unit-тестами, закрываем отдельными слоями.

### Layer A: Service + Database Integration

Цель:

- проверить реальное поведение сервисов поверх `Prisma` и тестовой БД;
- проверить `groupBy`, `include`, `orderBy`, `count`, `createMany`, `updateMany`;
- проверить согласованность изменений между связанными сущностями.

Кандидаты:

- `auth.service.ts`
- `projects.service.ts`
- `issues.service.ts`
- `sprints.service.ts`
- `time.service.ts`
- `comments.service.ts`
- `teams.service.ts`
- `admin.service.ts`
- `ai-sessions.service.ts`

### Layer B: Service + Redis Integration

Цель:

- проверить кэш и session-related сценарии на реальном Redis;
- проверить graceful behavior при отсутствии `REDIS_URL` и при неготовом Redis;
- проверить auth/session flows, которые завязаны на Redis side effects.

Кандидаты:

- `backend/src/shared/redis.ts`
- `backend/src/shared/health.ts`
- `backend/src/modules/auth/auth.service.ts`
- `backend/src/modules/admin/admin.service.ts`
- `backend/src/modules/projects/projects.service.ts`

### Layer C: HTTP / API Coverage

Цель:

- проверить `router -> middleware -> dto validation -> service`;
- проверить RBAC и auth;
- проверить формат ошибок и HTTP status codes;
- проверить негативные сценарии с невалидным `body`, `params`, `query`.

Это уже частично есть в текущем `backend/tests/*.test.ts`, но слой нужно развивать системно, а не только по happy path.

### Layer D: End-to-End / Smoke

Цель:

- оставить ограниченный набор сквозных сценариев, которые подтверждают работоспособность ключевых пользовательских потоков;
- не дублировать ими unit/integration coverage;
- использовать их как smoke-проверки перед релизом.

## File Strategy

Новые unit-тесты располагаем отдельно от текущих API-тестов:

- `backend/tests/unit/shared/...`
- `backend/tests/unit/modules/...`

Это даст понятное разделение:

- `backend/tests/*.test.ts` — integration/API;
- `backend/tests/unit/**/*.test.ts` — настоящий unit-слой.

## Acceptance Criteria

Дизайн считается реализованным корректно, когда:

- unit-тестами покрыты все существующие и выделенные pure helpers в `backend`, которые можно проверить без инфраструктурных подмен;
- у каждого непокрытого участка есть явная причина, почему он относится к integration/API слою;
- в сервисах не появляются "тестовые" обходы и специальные ветки поведения ради unit-тестов;
- unit-тесты быстрые, детерминированные и не требуют БД/Redis для запуска.

## Risks

- можно начать выносить слишком много логики и превратить задачу в большой рефакторинг;
- можно случайно назвать integration-тесты unit-тестами;
- можно получить хрупкие тесты, если pure-слой будет выделен с плохими границами.

Снижение риска:

- начинаем с `shared utils`, затем `sprints`, затем `auth`;
- выносим только то, что уже явно выражает правило, вычисление или маппинг;
- каждый новый helper должен существовать ради доменной ясности, а не только ради теста.
