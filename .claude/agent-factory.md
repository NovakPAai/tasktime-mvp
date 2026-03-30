# Agent Factory — Система управления агентами для Flow Universe MVP

**Дата:** 2026-03-19
**Статус:** Sprint 4-5 в работе (частично завершены)
**Цель:** Ускорить реализацию проекта с гарантиями безопасности (no breaking changes, no lost functionality)

---

## 1. Архитектура агентского завода

```
┌──────────────────────────────────────────────────────────────────┐
│                        AGENT FACTORY                             │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐     ┌─────────────┐     ┌──────────────┐      │
│  │  ANALYZER   │────→│  SCHEDULER  │────→│  AGENT POOL  │      │
│  │  (Explore)  │     │  (Pipeline) │     │  (Sonnet ×3) │      │
│  └─────────────┘     └─────────────┘     └──────────────┘      │
│        ↓                    ↓                     ↓              │
│   State scan          Task queue          Parallel exec        │
│   (5 min)             (priority)           (token budget)       │
│                                                  ↓              │
│                                          ┌──────────────┐      │
│                                          │  GUARDRAILS  │      │
│                                          │  (Safety)    │      │
│                                          └──────────────┘      │
│                                                  ↓              │
│                                          ┌──────────────┐      │
│                                          │   REPORTER   │      │
│                                          │  (Metrics)   │      │
│                                          └──────────────┘      │
│                                                  ↓              │
│                                          ┌──────────────┐      │
│                                          │  MEMORY.md   │      │
│                                          │  (Context)   │      │
│                                          └──────────────┘      │
│                                                                │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. Pipeline 5 этапов (Workflow)

### Stage 1: State Scan (5 мин, Haiku, background)

**Что делает:** Сканирует текущее состояние проекта, составляет матрицу "Сделано vs Не сделано".

**Входы:**
- Git log (последние 10 коммитов)
- Файлы: `package.json`, `tsconfig.json`, `schema.prisma`
- Тесты: `backend/tests/*.test.ts`
- Feature flags: `src/shared/features.ts`

**Выходы:**
```markdown
## State Snapshot (2026-03-19 12:30)

### Sprint 4 Status Matrix
| Task | Status | Tests | Docs |
|------|--------|-------|------|
| 4.1 AI estimation | ✅ | 3/3 | ✅ |
| 4.2 AI decomposition | ✅ | 2/2 | ✅ |
| 4.3 Telegram bot | ❌ | 0/3 | 🟡 |
| 4.4 GitLab webhook | ⚠️ | 1/3 | 🟡 |
| 4.5 CSV/PDF export | ❌ | 0/3 | ❌ |
...

### Critical Issues
- 🔴 P1: User.is_system migration mismatch → tests fail
- 🟡 P2: Telegram bot not implemented
- 🟡 P2: CSV/PDF export missing

### Test Status
- Backend: 19/32 PASSED, 13 FAILED
- Reason: DB schema mismatch (is_system column)
- Action: Run db:reset or migrate:deploy

### Dependencies
- All modules: import graph clean (no circular deps)
- DB: PostgreSQL 16 (schema v23)
- Redis: v7 (cache + sessions)
```

**Guardrails:**
- ✅ Не имеет доступа к коду (только READ)
- ✅ Выход сохраняется в `.claude/snapshots/state-YYYY-MM-DD-HH.md`

---

### Stage 2: Safety Checks (Automated, Haiku)

**Что делает:** Проверяет что можно безопасно менять, что нельзя.

**Guardrails (DO NOT TOUCH без одобрения):**

```markdown
## ✅ Safe to Modify (No risks)

### Backend modules
- `src/modules/{ai,webhooks,links,releases,monitoring}/` — новые модули (Sprint 4-5)
- `src/shared/openapi.ts` — API spec
- `deploy/scripts/` — deployment scripts
- `docs/` — документация
- `.github/workflows/` — CI/CD (кроме production deploy)

### Frontend components
- `src/components/dashboard/` — dashboard компоненты
- `src/components/ai/` — AI UI
- `src/pages/*/` — page компоненты

### Database
- Новые migration files (не трогать существующие)
- Можно добавлять поля к существующим таблицам (backward compatible)

---

## ⚠️ Requires Verification (May impact existing code)

### Backend core modules
- `src/modules/{auth,users,projects,issues,sprints,time}/`
  → При изменении: должны пройти ВСЕ integration tests
  → Должна остаться backward compatibility

### Database schema
- Existing tables: `users`, `issues`, `projects`, `sprints`, `timeLogs`
  → Только добавлять поля, не удалять
  → Миграции должны быть идемпотентны

### API contracts
- `GET /api/projects/:id`, `GET /api/issues/:id` и т.д.
  → Ответ должен содержать ВСЕ существующие поля
  → Новые поля опциональны (optional в DTO)

---

## 🔴 Forbidden (Breaking changes, data loss)

- ❌ Удалять столбцы из БД (без архивирования)
- ❌ Менять тип поля (uuid → string)
- ❌ Удалять API endpoints (deprecated ok, но 404 bad)
- ❌ Изменять RBAC rules без миграции данных
- ❌ Удалять существующие roles (ADMIN, MANAGER, USER, VIEWER)
- ❌ Мудрить с seed data (fixture должны быть воспроизводимы)
- ❌ Force push в main (merge только через PR + CI)
- ❌ Отключать existing feature flags (только добавлять новые)
```

**Выход:**
```markdown
## Safety Report

✅ SAFE: AI decomposition changes
✅ SAFE: Telegram notification implementation
⚠️ NEEDS VERIFICATION: Issue status change (affects Kanban board)
🔴 FORBIDDEN: Delete TimeLog table

**Result:** Proceed with Task 4.3 (Telegram), verify Task 4.4 tests before merge
```

---

### Stage 3: Task Breakdown & Prioritization (Sonnet, 10 мин)

**Входы:**
- State snapshot (из Stage 1)
- Safety report (из Stage 2)
- Sprint backlog (из CLAUDE.md)

**Что делает:** Разбивает задачи на **независимые атомные юниты**, подходящие для параллельного выполнения.

**Выходы:**

```markdown
## Sprint 4 Task Breakdown

### Wave 1 (Independent, can run in parallel)

**Task 4.3a: Telegram Bot — Notification Service**
- Scope: Create notification service, hook into Issue events
- Files: src/modules/telegram/ (new)
- Input: TELEGRAM_BOT_TOKEN env var, Issue entity
- Output: POST /api/webhooks/telegram (receive), send notification function
- Deps: None (isolated)
- Est: 2h
- Guardrails: ✅ Safe (new module, no existing code changes)

**Task 4.5a: CSV Export Endpoint**
- Scope: POST /api/reports/export?format=csv
- Files: src/modules/reports/ (extend existing)
- Input: Project ID, filters (optional)
- Output: CSV file (streaming)
- Deps: fast-csv npm package
- Est: 1.5h
- Guardrails: ✅ Safe (new endpoint, backward compatible)

**Task 4.4a: GitLab Webhook — Admin UI**
- Scope: Form in admin panel to register webhook URL
- Files: src/components/admin/, src/api/admin.ts
- Input: GitLab project URL
- Output: UI form + API endpoint to save config
- Deps: Existing admin module
- Est: 1h
- Guardrails: ⚠️ Needs test that existing admin features still work

### Wave 2 (Can run after Wave 1)

**Task 4.1–4.2 Verification**
- Run all AI tests to ensure not regressed
- Est: 0.5h

**Task 4.3b: Telegram — Integration Tests**
- Scope: Mock Telegram API, test notification flow
- Deps: Task 4.3a complete
- Est: 1h

**Task 4.4b: GitLab Webhook — End-to-End Test**
- Scope: Test merge request → status sync
- Deps: Task 4.4a complete
- Est: 1h

### Wave 3 (Final checks)

**Final QA Checklist:**
- All tests green (unit + integration + e2e)
- Existing features still work (smoke test)
- No new warnings in TypeScript
- No new ESLint errors
- Database migrations applied
- Docker compose works
```

**Guardrail:** Каждый task должен иметь:
- ✅ Четкий scope (что делать)
- ✅ Файлы (какие трогать)
- ✅ Deps (от кого зависит)
- ✅ Safety level (✅ Safe, ⚠️ Verify, 🔴 Forbidden)

---

### Stage 4: Parallel Execution (3x Sonnet agents)

**Как запускать:**

```bash
# Запуск 3 агентов параллельно (Wave 1)
Agent 1: Task 4.3a — Telegram notification service
Agent 2: Task 4.5a — CSV export endpoint
Agent 3: Task 4.4a — GitLab webhook admin UI

# Все работают одновременно (токены распределяются)
# Результаты: 3 PR или 3 коммита

# После Wave 1 завершается:
Agent 1: Task 4.3b — Telegram integration tests
Agent 2: Task 4.4b — GitLab webhook e2e test
Agent 3: Task 4.1–4.2 verification

# После всего:
Final smoke test (Haiku agent)
```

**Инструкции для каждого агента:**

```markdown
## Agent Task Template

**Task:** 4.3a — Telegram Notification Service

**Goal:** Create notification service that sends Telegram messages when issues are created/updated.

**Scope:**
- Create `src/modules/telegram/` directory
- Implement `telegram.service.ts` with:
  - `sendNotification(userId, message): Promise<void>`
  - `notifyIssueCreated(issue): Promise<void>`
  - `notifyIssueStatusChanged(issue, oldStatus): Promise<void>`
- Create `src/modules/telegram/telegram.dto.ts` with validation
- Add routes in `src/modules/telegram/telegram.router.ts`
  - POST /api/webhooks/telegram (for Telegram callbacks)

**Guardrails:**
- ✅ This is a NEW module — zero impact on existing code
- ✅ Integration tests must pass: make test:backend
- ✅ No changes to auth/users/projects/issues modules
- ⚠️ If adding npm packages: update package.json, run npm install, commit lock file

**Safety checks BEFORE pushing:**
1. Run: npm run build (no TS errors)
2. Run: npm run test (all tests pass, including existing ones)
3. Run: npm run lint (no new warnings)
4. Check: docker compose up (containers start)

**NOT allowed:**
- ❌ Modify existing Issue/Project/User models
- ❌ Change API response structure
- ❌ Delete any files

**Output:**
- PR or commit with clear message: "feat: Telegram notification service (TTUI-XXX)"
- Include test file: tests/telegram.test.ts with ≥3 test cases
- Update MEMORY.md when done
```

---

### Stage 5: Verification & Merge (Sonnet + Haiku)

**Что делает:** Проверяет что ничего не сломалось.

**Checklist:**

```markdown
## Pre-Merge Verification

### Tests
- [ ] Backend tests: npm run test:backend (no failures)
  - Expected: 32+ PASSED (was 19/32, some failed due to migration)
- [ ] Frontend tests: npm run test:frontend (if any)
- [ ] E2E tests: npm run test:e2e (basic smoke test)

### Code Quality
- [ ] No TypeScript errors: npm run build
- [ ] No lint errors: npm run lint
- [ ] No new warnings in console

### Integration
- [ ] Docker compose works: docker compose up (wait 30s, curl http://localhost:5173)
- [ ] API endpoints respond: curl http://localhost:3000/api/health
- [ ] Database healthy: npm run db:status

### Functionality
- [ ] Existing features work:
  - [ ] Can login (POST /api/auth/login)
  - [ ] Can create project (POST /api/projects)
  - [ ] Can create issue (POST /api/projects/:id/issues)
  - [ ] Can update issue status (PATCH /api/issues/:id/status)
  - [ ] Kanban board loads (GET /api/projects/:id/board)
  - [ ] Sprints work (GET /api/projects/:id/sprints)
- [ ] New features work:
  - [ ] Telegram notification sent (if Task 4.3 complete)
  - [ ] CSV export works (if Task 4.5 complete)
  - [ ] GitLab webhook receives (if Task 4.4 complete)

### Git
- [ ] Branch name correct: claude/agent-factory-wave-N
- [ ] Commit message follows format: "feat: description (TTUI-XXX)"
- [ ] No merge conflicts with main
- [ ] All commits are atomic (logical units)

### Documentation
- [ ] MEMORY.md updated with:
  - [ ] What was done
  - [ ] Test results
  - [ ] Any blockers found
  - [ ] Recommendations for next steps

## Merge Decision

✅ **PASS:** All checks green → Merge to main via `gh pr merge --squash`

⚠️ **VERIFY:** Some checks yellow → Investigate before merge

🔴 **BLOCK:** Any checks red → DO NOT merge, file issue, request human review
```

---

## 3. Safety Guarantees (Guardrails)

### 3.1 Что защищает завод

| Риск | Guardrail | Как проверяется |
|------|-----------|-----------------|
| **Breaking API change** | All API responses validated against OpenAPI spec | Swagger UI diff, response validation in tests |
| **Data loss (DB)** | Migrations are versioned, backward compatible | `prisma/migrations/` folder audited, db:rollback tested |
| **Existing features broken** | All existing tests must pass before merge | `npm run test:backend` green light |
| **Circular dependencies** | Module imports audited | `npm run build` catches circular deps |
| **Undefined behavior** | TypeScript strict mode enforced | `npm run build` no-implicit-any errors |
| **Environment issues** | .env.example matches required vars | CI checks env var completeness |
| **Performance regression** | API response time < 200ms monitored | `/api/health` returns timing metrics |
| **Dead code commits** | Unused variables checked by linter | `npm run lint` no-unused-vars |

### 3.2 Automatic Safety Checks (CI Pipeline)

Все Pull Request'ы автоматически проходят:

```yaml
# .github/workflows/ci.yml
on: [pull_request, push]

jobs:
  test:
    - npm run lint          # ESLint + Prettier
    - npm run build         # TypeScript compilation
    - npm run test:backend  # Vitest + Supertest
    - npm run test:e2e      # Basic smoke tests

  security:
    - npm audit             # Vulnerable dependencies
    - check docker image    # No root user

  database:
    - prisma migrate deploy # Apply migrations
    - prisma introspect     # Validate schema
```

**Что случается если CI fails:**
- 🔴 PR can NOT be merged
- Требуется fixes + новый commit
- CI перезапускается automatically

---

## 4. Token Budget Management

| Этап | Модель | Бюджет | Экономия |
|------|--------|--------|----------|
| State Scan | Haiku | 2k | Использует только Grep/Glob, minimal context |
| Safety Checks | Haiku | 3k | Pre-check перед дорогой работой |
| Task Breakdown | Sonnet | 5k | Структурирует работу → экономит переделки |
| Parallel Execution | Sonnet ×3 | 120k | 3 агента параллельно, не ждут друг друга |
| Verification | Sonnet | 10k | Post-execution smoke test |
| **Total per wave** | — | **140k** | ~70% от monthly budget |

**Как оптимизируется:**
- Используется memory system (`.claude/snapshots/`) → не читаем файлы повторно
- Parallel execution → 3 агента работают одновременно (стена 1 часа, не 3 часа)
- Gradual token spend → гарантия что не переходим лимит

---

## 5. Память завода (Agent Memory)

Все результаты сохраняются в `.claude/agent-factory/`:

```
.claude/agent-factory/
├── snapshots/
│   ├── state-2026-03-19-12.md        # State scan
│   └── state-2026-03-20-10.md        # Новый scan
├── tasks/
│   ├── wave-1-breakdown.md           # Task breakdown
│   ├── task-4.3a-telegram.md         # Детали одной задачи
│   └── task-4.5a-export.md
├── results/
│   ├── wave-1-results.md             # Что получилось
│   ├── task-4.3a-results.md          # Успехи/ошибки/PR ссылки
│   └── verification-checklist.md
└── metrics/
    ├── token-spend.csv               # Расход по датам
    ├── test-coverage.csv             # Покрытие %
    └── deployment-status.csv         # Когда merged
```

**Каждый агент:**
1. Читает текущее состояние из snapshots
2. Работает на своей задаче
3. Сохраняет результаты в results/

Следующий агент видит результаты предыдущего → **no context loss**.

---

## 6. Метрики успеха завода

Отслеживаем в `.claude/agent-factory/metrics/`:

```csv
date,wave,tasks_completed,tests_passed,coverage_pct,blockers,merge_time_h
2026-03-19,1,3/3,32/32,65%,0,0.5
2026-03-20,2,2/2,32/32,68%,0,0.3
2026-03-21,3,1/1,32/32,70%,1,1.2
```

**Целевые метрики:**
- ✅ Tasks completed = 100% (не половинчатых работ)
- ✅ Tests passed = 100% (ноль регрессий)
- ✅ Coverage grows: 65% → 70% → 75%
- ✅ Blockers = 0 (все решены до merge)
- ✅ Merge time < 1h (быстрая обратная связь)

---

## 7. Как запустить завод прямо сейчас

### Step 1: Диагностика текущего состояния (5 мин, Haiku)

```bash
# Запустить State Scan агента
# Результат: .claude/agent-factory/snapshots/state-YYYY-MM-DD-HH.md
```

### Step 2: Проверить что можно менять

```markdown
# Читаем результат из Stage 1
# Видим:
# - User.is_system migration fails tests
# - Telegram bot safe to implement
# - CSV export safe to implement
# - GitLab webhook needs verification
```

### Step 3: Запустить 3 агента Wave 1

```markdown
# Agent 1: Implement Telegram bot
# Agent 2: Implement CSV export
# Agent 3: Implement GitLab webhook admin UI

# Все параллельно, результаты в .claude/agent-factory/results/
```

### Step 4: Verify & Merge

```bash
# CI automatically checks everything
# If green: gh pr merge --squash
# If red: investigate, fix, commit, rerun CI
```

---

## 8. Troubleshooting Guide

| Проблема | Причина | Решение |
|----------|---------|--------|
| **Тесты падают (P1: User.is_system)** | DB migration не применена | `npm run prisma:migrate:deploy` или `npm run db:reset` |
| **Agent timeout (>15 мин на задачу)** | Слишком большой scope | Разбить на меньшие юниты (3h max per task) |
| **Memory exhausted** | Слишком много файлов в контексте | Использовать `memory` system (snapshots) вместо re-reading |
| **Merge conflict** | Другой агент менял тот же файл | Resolve manually, test, commit, push again |
| **Feature flag not picked up** | Приложение не перезагрузилось | Перезагрузить с `npm run dev` |
| **Docker container fails** | Port already in use | `docker compose down && docker compose up` |

---

## 9. Пример: Wave 1 выполнения

**Timeline:**

```
2026-03-19 13:00 — Start State Scan (Haiku)
                → 13:05 State Snapshot ready

2026-03-19 13:10 — Safety Checks (Haiku)
                → 13:15 Safety Report ready (3 tasks safe)

2026-03-19 13:20 — Task Breakdown (Sonnet)
                → 13:30 Wave 1 breakdown ready (3 independent tasks)

2026-03-19 13:35 — PARALLEL EXECUTION START

   Agent 1 (Sonnet) [13:35–15:35]:
      Task 4.3a — Telegram notification service
      ├ Create module structure
      ├ Implement service
      ├ Write tests (3 test cases)
      ├ CI: make build + make test
      └ Result: PR opened

   Agent 2 (Sonnet) [13:35–14:50]:
      Task 4.5a — CSV export endpoint
      ├ Add fast-csv to package.json
      ├ Create export router
      ├ Write tests (2 test cases)
      ├ CI: make build + make test
      └ Result: PR opened

   Agent 3 (Sonnet) [13:35–14:35]:
      Task 4.4a — GitLab webhook admin UI
      ├ Create admin component
      ├ Add API endpoint for config
      ├ Write tests (1 test case)
      ├ CI: make build + make test
      └ Result: PR opened

2026-03-19 15:45 — All 3 agents done
                → Verify each PR (tests green) → Merge

2026-03-19 16:00 — Wave 1 Complete ✅
                → Metrics: 3/3 tasks, 8+ tests, 0 blockers, 30 min cycle time
```

---

## 10. Checklist для первого запуска завода

- [ ] Понять текущее состояние (прочитать State Snapshot)
- [ ] Проверить что можно менять (Safety Report)
- [ ] Разбить задачи на Wave'ы (Task Breakdown)
- [ ] Запустить первый Wave (3 агента параллельно)
- [ ] Дождаться когда все завершат (monitoring results)
- [ ] Проверить что ничего не сломалось (verification checklist)
- [ ] Mergeить PRs (главное условие: CI зелёный)
- [ ] Обновить MEMORY.md (что сделали, что дальше)
- [ ] Запустить второй Wave (если есть dependent tasks)
- [ ] Повторить (цикл ~4 часа на Wave)

---

## References

- **State snapshots:** `.claude/agent-factory/snapshots/`
- **Task templates:** `.claude/agent-factory/tasks/`
- **Results:** `.claude/agent-factory/results/`
- **Metrics:** `.claude/agent-factory/metrics/`
- **Project context:** `CLAUDE.md` + `docs/RU/REBUILD_PLAN_V2.md`
- **Current blockers:** `.claude/agent-factory/snapshots/state-latest.md` (P1, P2 issues)

---

**Создано:** 2026-03-19, Claude Code (Sonnet)
**Для проекта:** Flow Universe MVP (бывший TaskTime)
**Главная идея:** Агенты работают параллельно, guardrails предотвращают breaking changes, метрики показывают прогресс.
