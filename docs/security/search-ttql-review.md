# TTS-QL (TTSRH-1) — Security Review Checklist

Используется перед merge любого PR, затрагивающего модуль `backend/src/modules/search/`. Цель — подтвердить что реализация не открывает вектор атаки.

## Скоуп

Все pull requests эпика TTSRH-1, касающиеся:
- `search.parser.ts`, `search.validator.ts`, `search.compiler.ts`
- `search.custom-field.ts`, `search.function-resolver.ts`
- `search.service.ts`, `search.router.ts`
- Связанные эндпоинты: `POST /api/search/issues`, `POST /api/search/validate`, `POST /api/search/export`, `GET /api/search/suggest`, `GET /api/search/schema`.

## Чек-лист (обязателен к прохождению перед merge)

### R1 — SQL injection через TTS-QL → raw SQL

- [ ] Парсер возвращает **строго типизированный AST**; любые user-controlled строки остаются в `span.value`/`name.value`.
- [ ] Компилятор system-полей использует только `Prisma.IssueWhereInput` и типизированные фильтры. В `search.compiler.ts` **нет** `Prisma.raw()`, **нет** string concatenation с user-input.
- [ ] Компилятор custom-полей (`search.custom-field.ts`) использует **только `Prisma.sql` template literal** с `${...}` interpolation. Grep'ом подтверждаем:
  ```bash
  grep -rn "Prisma.raw" backend/src/modules/search/
  # ожидается: 0 результатов (или явно обоснованный случай)
  ```
- [ ] Custom-field UUIDs передаются в SQL как `${cfId}::uuid` — PostgreSQL параметр, не interpolation.
- [ ] SQL операторы comparison (`=`, `<>`, `>`, …) приходят из `COMPARATOR_SQL: Record<string, Prisma.Sql>` — whitelist, не user-input.
- [ ] Fuzz-harness `tests/search-pipeline-fuzz.unit.test.ts` прошёл 1000+ random inputs с null-bytes, unicode RTL, SQL payloads — 0 unhandled throws.

### R3 — Leak данных через игнор scope-фильтра

- [ ] `searchIssues()` в `search.service.ts` всегда передаёт `accessibleProjectIds` в `CompileContext`.
- [ ] `compile()` в `search.compiler.ts` **безусловно** эмитит `{ projectId: { in: accessibleProjectIds } }` как `AND[0]` — проверено тестом `scope filter is always the top-level AND prefix` в `tests/search-compiler.unit.test.ts`.
- [ ] `accessibleProjectIds` резолвится в `search.router.ts:resolveAccessibleProjectIds` по тому же паттерну, что `issues.router.ts:requireIssueAccess`.
- [ ] Function-resolver (`search.function-resolver.ts`) scope'ит результаты: `findIssueByKey`, `resolveLinkedIssues`, `resolveSprintsByState`, `resolveReleases*`, `resolveChildrenOf`, `resolveMyOpenIssues` — все добавляют `projectId IN accessibleProjectIds`.
- [ ] Integration test T-5: USER без доступа к проекту получает пустой результат при `project = "SECRET"`.

### R15 — DoS через дорогие запросы

- [ ] Rate-limit 30 req/min/user на `POST /search/issues` через `searchRateLimit` middleware (`search.rate-limit.ts`).
- [ ] Hard timeout 10s (`QUERY_TIMEOUT_MS` в `search.service.ts`) возвращает **504**, не 500.
- [ ] Pagination каппится: `limit ≤ 100`, `startAt ≤ 10000` (`clampInt` в service + Zod DTO).
- [ ] JQL-string каппится до 10_000 символов в Zod DTO.
- [ ] Parser MAX_DEPTH=256 (`search.parser.ts`) — защита от stack-overflow через глубокую вложенность.
- [ ] `statement_timeout` на уровне Postgres (вне кода) — backup defence; проверить конфиг БД.

### R11 — Utечка данных через shared/public SavedFilter

- [ ] `SavedFilter` с `visibility = PUBLIC` **не** расширяет доступ к задачам — compiler всё равно применяет scope читающего (R3).
- [ ] UI показывает warning при выставлении `visibility = PUBLIC` на фильтр с потенциально чувствительным JQL-текстом.
- [ ] (покрытие — PR-7)

### Общие

- [ ] Все эндпоинты под `/api/search/*` требуют `authenticate` middleware (подтверждается `router.use(authenticate)` в `search.router.ts`).
- [ ] Zod-валидация на вход всех DTO.
- [ ] `AuditLog` для `SavedFilter` CRUD (покрытие — PR-7).
- [ ] `parse()`, `validate()`, `compile()` **никогда не бросают** — подтверждено pure-function unit-тестами.
- [ ] Endpoint `POST /search/issues` обрабатывает ошибки в try/catch → `next(err)` — никакой unhandled throw не даёт 500 без логирования.
- [ ] Все raw-SQL `$queryRaw` вызовы используют `Prisma.Sql` объекты, не строки:
  ```bash
  grep -rn "\\$queryRaw\\|\\$executeRaw" backend/src/modules/search/
  # проверить что каждый вызов передаёт Prisma.Sql, не raw string
  ```

## Apprоver sign-off

| PR | Дата | Approver | Ссылка на review |
|----|------|----------|------------------|
| PR-5 (#TBD) | | | |

## Процесс на будущее

1. Разработчик заполняет чек-лист локально перед запросом review.
2. Reviewer из списка security-approver'ов проверяет каждый пункт, подписывает в таблице sign-off.
3. Без подписи не merge'им PR, затрагивающий этот модуль.
