# Production To Dev Sync And My Time Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Сделать `production` источником истины для реального проекта `TTMP`, добавить безопасную синхронизацию `prod -> dev` и оформить `My Time` как гибридный отчёт по `HUMAN` и `AGENT`.

**Architecture:** Production и dev остаются на отдельных БД. `bootstrap` отвечает только за системных пользователей, `seed` остаётся dev/demo-инструментом, а реальные данные `TTMP` попадают в dev через отдельный sync-скрипт с dry-run. `My Time` продолжает строиться на `TimeLog` и `AiSession`, но получает явную summary-модель и более точный UI.

**Tech Stack:** TypeScript, Prisma 6, Express 4, React 18, Ant Design 5, Vitest, Docker/deploy shell scripts.

---

### Task 1: Разделить bootstrap, seed и production truth

**Files:**
- Modify: `backend/src/prisma/bootstrap.ts`
- Modify: `backend/src/prisma/seed.ts`
- Modify: `backend/package.json`
- Test: `backend/tests/bootstrap.test.ts`

**Step 1: Write the failing test**

Добавить проверки, что:

- `bootstrap` создаёт только системных пользователей;
- `bootstrap` не создаёт проект `TTMP`, спринты и задачи;
- `seed` остаётся отдельной командой и не участвует в production deploy path.

Минимальный тест-кейс:

```ts
it('bootstraps only default users', async () => {
  await bootstrapDefaultUsers(prisma, 'password123');

  expect(await prisma.user.count()).toBeGreaterThan(0);
  expect(await prisma.project.findUnique({ where: { key: 'TTMP' } })).toBeNull();
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/bootstrap.test.ts`

Expected: FAIL, если текущий bootstrap/seed контракт ещё не зафиксирован тестом.

**Step 3: Write minimal implementation**

- В `bootstrap.ts` оставить только пользователей и технический старт.
- В `seed.ts` явно пометить файл как dev/demo seed, а не production source of truth.
- В `backend/package.json` добавить отдельный script для будущего sync, не смешивая его с `db:seed`.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/bootstrap.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add backend/src/prisma/bootstrap.ts backend/src/prisma/seed.ts backend/package.json backend/tests/bootstrap.test.ts
git commit -m "refactor: separate bootstrap and demo seed responsibilities"
```

### Task 2: Добавить безопасный sync `prod -> dev`

**Files:**
- Create: `backend/src/prisma/prod-sync.ts`
- Create: `backend/src/prisma/prod-sync.domain.ts`
- Modify: `backend/package.json`
- Modify: `deploy/env/.env.staging.example`
- Modify: `deploy/env/backend.staging.env.example`
- Test: `backend/tests/prod-sync.test.ts`

**Step 1: Write the failing test**

Добавить тесты на чистую sync-логику:

- построение плана изменений (`create`, `update`, `skip`, `delete/deactivate`);
- стабильное сопоставление `Project`, `Sprint`, `Issue`;
- dry-run не пишет в target БД.

Минимальный тест-кейс:

```ts
it('builds deterministic upsert plan for TTMP issues', () => {
  const plan = buildIssueSyncPlan({
    source: [{ projectKey: 'TTMP', number: 81, title: 'Prod title' }],
    target: [{ projectKey: 'TTMP', number: 81, title: 'Old dev title' }],
  });

  expect(plan.toUpdate).toHaveLength(1);
  expect(plan.toCreate).toHaveLength(0);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/prod-sync.test.ts`

Expected: FAIL because sync planner and script do not exist yet.

**Step 3: Write minimal implementation**

- В `prod-sync.domain.ts` вынести pure-логику сопоставления и отчёта.
- В `prod-sync.ts` реализовать CLI-скрипт:
  - читает `SOURCE_DATABASE_URL` и `DATABASE_URL`;
  - поддерживает `--dry-run`;
  - синхронизирует `TTMP`-связанные `Project`, `Sprint`, `Issue`, `TimeLog`, `AiSession`;
  - пишет отчёт в stdout.
- В `backend/package.json` добавить команду вида `db:sync:prod-to-dev`.
- В example env добавить переменные только для read-only подключения к source БД.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/prod-sync.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add backend/src/prisma/prod-sync.ts backend/src/prisma/prod-sync.domain.ts backend/package.json deploy/env/.env.staging.example deploy/env/backend.staging.env.example backend/tests/prod-sync.test.ts
git commit -m "feat: add production to dev sync workflow"
```

### Task 3: Подключить sync к ops-документации и safe-run scripts

**Files:**
- Create: `deploy/scripts/sync-prod-to-dev.sh`
- Modify: `deploy/scripts/deploy.sh`
- Modify: `docs/DEPLOY.md`
- Modify: `deploy/env/backend.production.env.example`
- Test: `backend/tests/health.test.ts`

**Step 1: Write the failing test**

Добавить хотя бы один guard-level test или script assertion expectation:

- production deploy path не вызывает `db:seed`;
- sync запускается отдельной командой и не встроен в deploy автоматически.

Если shell-скрипты неудобно unit-тестировать, зафиксировать это в docs и использовать smoke verification вместо unit-слоя.

Минимальный псевдо-кейс:

```ts
it('keeps production deploy independent from seed and sync', () => {
  expect(true).toBe(true);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/health.test.ts`

Expected: FAIL or no coverage for the new operational contract yet.

**Step 3: Write minimal implementation**

- Создать `sync-prod-to-dev.sh`, который:
  - валидирует переменные окружения;
  - сначала делает dry-run;
  - затем запускает реальный import по подтверждённому флагу.
- В `deploy.sh` не добавлять auto-sync; только явное сообщение, что sync — отдельная операция.
- В `docs/DEPLOY.md` описать:
  - bootstrap;
  - production deploy;
  - prod-to-dev sync;
  - rollback expectations.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/health.test.ts`

Expected: PASS for any updated assertions, plus manual review of script behavior.

**Step 5: Commit**

```bash
git add deploy/scripts/sync-prod-to-dev.sh deploy/scripts/deploy.sh docs/DEPLOY.md deploy/env/backend.production.env.example backend/tests/health.test.ts
git commit -m "docs: separate deploy and prod-to-dev sync operations"
```

### Task 4: Добавить backend summary для `My Time`

**Files:**
- Create: `backend/src/modules/time/time.domain.ts`
- Modify: `backend/src/modules/time/time.service.ts`
- Modify: `backend/src/modules/time/time.router.ts`
- Test: `backend/tests/sprints-time-comments.test.ts`

**Step 1: Write the failing test**

Добавить тест на summary-контракт:

- `humanHours`;
- `agentHours`;
- `totalHours`;
- `agentCost`;
- `unallocatedAgentHours` или запрет неразнесённых AI-сессий, если это выбранный MVP-rule.

Минимальный тест-кейс:

```ts
it('returns separated human and agent totals for user logs', async () => {
  const response = await request(app)
    .get(`/api/users/${userId}/time/summary`)
    .set('Authorization', `Bearer ${token}`);

  expect(response.status).toBe(200);
  expect(response.body.humanHours).toBeDefined();
  expect(response.body.agentHours).toBeDefined();
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/sprints-time-comments.test.ts`

Expected: FAIL because summary endpoint does not exist yet.

**Step 3: Write minimal implementation**

- В `time.domain.ts` вынести pure aggregate helpers.
- В `time.service.ts` добавить summary-метод поверх `TimeLog` и `AiSession`.
- В `time.router.ts` добавить `GET /users/:userId/time/summary`.
- Явно разделить реальные логи и summary-агрегаты.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/sprints-time-comments.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add backend/src/modules/time/time.domain.ts backend/src/modules/time/time.service.ts backend/src/modules/time/time.router.ts backend/tests/sprints-time-comments.test.ts
git commit -m "feat: add my time summary aggregates"
```

### Task 5: Обновить frontend `My Time`

**Files:**
- Modify: `frontend/src/api/time.ts`
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/pages/TimePage.tsx`
- Test: `frontend/e2e/main-flows.spec.ts`

**Step 1: Write the failing test**

Добавить e2e или UI-level expectation:

- `My Time` показывает отдельные значения `Human`, `AI`, `AI cost`, `Total`;
- фактический список логов остаётся видимым;
- AI-логи не маскируются под человеческие.

Минимальный тест-кейс:

```ts
await expect(page.getByText('Human:')).toBeVisible();
await expect(page.getByText('AI:')).toBeVisible();
await expect(page.getByText('AI cost:')).toBeVisible();
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix frontend exec playwright test e2e/main-flows.spec.ts`

Expected: FAIL because the new summary contract/UI is not wired yet.

**Step 3: Write minimal implementation**

- В `frontend/src/api/time.ts` добавить `getUserTimeSummary`.
- В `frontend/src/types/index.ts` описать summary DTO.
- В `frontend/src/pages/TimePage.tsx`:
  - загрузить summary отдельно от списка логов;
  - показать `Human`, `AI`, `AI cost`, `Total`;
  - при необходимости добавить предупреждение для `Unallocated AI time`.

**Step 4: Run test to verify it passes**

Run: `npm --prefix frontend exec playwright test e2e/main-flows.spec.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/api/time.ts frontend/src/types/index.ts frontend/src/pages/TimePage.tsx frontend/e2e/main-flows.spec.ts
git commit -m "feat: clarify my time human and ai accounting"
```

### Task 6: End-to-end verification and regression pass

**Files:**
- Modify: `docs/DEPLOY.md`
- Modify: `docs/plans/2026-03-13-prod-to-dev-sync-and-my-time-design.md`
- Test: `backend/tests/auth.test.ts`
- Test: `backend/tests/projects.test.ts`
- Test: `backend/tests/sprints-time-comments.test.ts`
- Test: `frontend/e2e/main-flows.spec.ts`

**Step 1: Write the failing test**

Здесь отдельный новый тест не обязателен; задача верификационная.

**Step 2: Run test to verify current state**

Run: `npm test -- tests/auth.test.ts tests/projects.test.ts tests/sprints-time-comments.test.ts`

Run: `npm --prefix frontend exec playwright test e2e/main-flows.spec.ts`

Expected: all green.

**Step 3: Write minimal implementation**

- Доточить docs и naming.
- Убедиться, что UAT для sync и `My Time` описан.

**Step 4: Run test to verify it passes**

Run: `npm --prefix backend test`

Run: `npm --prefix frontend exec playwright test e2e/main-flows.spec.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add docs/DEPLOY.md docs/plans/2026-03-13-prod-to-dev-sync-and-my-time-design.md
git commit -m "chore: verify production sync and my time flow"
```

## UAT / Приёмочные тесты

### Сценарий 1: Production не зависит от demo seed

Предусловия:

- production БД поднята;
- deploy выполнен без ручного запуска `db:seed`.

Шаги:

1. Выполнить production deploy.
2. Проверить наличие bootstrap-пользователей.
3. Проверить, что demo-данные не появились автоматически из `seed`.

Ожидаемый результат:

- пользователи доступны;
- данные `TTMP` берутся не из demo-seed;
- deploy не запускает sync автоматически.

### Сценарий 2: Sync `prod -> dev`

Предусловия:

- в production есть актуальные задачи `TTMP`;
- у dev есть доступ к read-only source connection string.

Шаги:

1. Запустить sync в dry-run.
2. Проверить отчёт по `create/update/skip`.
3. Запустить реальный sync.
4. Открыть `dev` и проверить `TTMP`, спринты, задачи, `My Time`.

Ожидаемый результат:

- dev совпадает с production по синхронизируемым сущностям;
- дубли не создаются;
- повторный sync даёт стабильный результат.

### Сценарий 3: My Time hybrid accounting

Предусловия:

- у пользователя есть `HUMAN` и `AGENT` time logs.

Шаги:

1. Открыть `My Time`.
2. Проверить блок summary.
3. Проверить, что в таблице логи разделены по `Human` и `AI`.
4. Проверить, что `AI cost` показывается только для `AGENT`.

Ожидаемый результат:

- summary показывает отдельные `Human`, `AI`, `AI cost`, `Total`;
- таблица остаётся журналом фактических логов;
- данные совпадают с backend summary.
