# Pipeline Deploy Flow — План реализации

> Документ описывает AS-IS состояние CI/CD, целевой TO-BE флоу с управлением батчами,
> стейт-машину StagingBatch, компонентную схему и GAP-анализ с фазами реализации.

---

## 1. Текущее состояние (AS-IS)

### Что происходит сейчас

```
Developer merges PR to main
        │
        ▼
CI workflow (ci.yml)
  • TypeScript build
  • ESLint
  • Vitest tests
  • Redis service container
        │ (on success, only main branch)
        ▼
Build and Publish (build-and-publish.yml)
  • Triggered via workflow_run: ["CI"] completed
  • Builds Docker images: tasktime-backend, tasktime-web
  • Tags: <sha>, main (+ optional custom tag via workflow_dispatch)
  • Pushes to ghcr.io
        │
        ▼
Deploy Production (deploy-production.yml)
  • ТОЛЬКО workflow_dispatch — ручной запуск
  • Requires: image_tag input
  • SSH → rsync deploy/ assets → docker login → inject secrets → run deploy.sh
```

### Ключевые наблюдения

- **`deploy-staging.yml` не существует** — workflow файл отсутствует в репозитории.
- Deploy Production — только ручной запуск через `workflow_dispatch` с явным `image_tag`.
- Нет автоматического деплоя на staging при merge в main.
- Pipeline Service уже существует (`pipeline-service/`) с моделью батчей и роутерами.
- Frontend `PipelineDashboardPage` уже рендерит батчи и кнопку "→ Deploy Staging",
  но кнопка только переводит батч в состояние `DEPLOYING` в БД — реального деплоя
  на staging-сервер **не происходит**.
- `pipelineApi.transitionState()` вызывает `PATCH /api/batches/:id/state` — это чисто
  локальная операция в Pipeline Service DB. GitHub Actions не вызывается.

---

## 2. Целевой флоу (TO-BE)

### Полная диаграмма

```
┌──────────────────────────────────────────────────────────────────────────┐
│  DEVELOPER                                                                │
│  1. Создаёт ветку, пишет код                                             │
│  2. Открывает PR → CI запускается автоматически                          │
│  3. Получает code review + аппрув                                        │
│  4. Мёрджит PR в main                                                    │
└───────────────────────────┬──────────────────────────────────────────────┘
                            │ merge to main
                            ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  GITHUB ACTIONS — CI (ci.yml)                                            │
│  • tsc + eslint + vitest                                                 │
│  При успехе → Build and Publish                                          │
└───────────────────────────┬──────────────────────────────────────────────┘
                            │ workflow_run trigger (CI success, main)
                            ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  GITHUB ACTIONS — Build and Publish (build-and-publish.yml)             │
│  • Сборка Docker образов backend + web                                  │
│  • Тэг: <sha>, main                                                      │
│  • Push в ghcr.io                                                        │
└───────────────────────────┬──────────────────────────────────────────────┘
                            │ (после успешной сборки)
                            │ GitHub → webhook / polling
                            ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  PIPELINE SERVICE — АВТОМАТИЧЕСКАЯ СИНХРОНИЗАЦИЯ                        │
│  POST /api/github/sync (по расписанию или webhook)                      │
│  • Находит новые merged PRs через GitHub API                            │
│  • Upsert → PullRequestSnapshot в БД                                    │
│  • Автоматически добавляет в активный COLLECTING батч                   │
│  (если COLLECTING батча нет — создаёт новый)                            │
└───────────────────────────┬──────────────────────────────────────────────┘
                            │ PR попадает в батч
                            ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  PIPELINE DASHBOARD — PM видит батч в статусе COLLECTING                │
│                                                                          │
│  Батч "2026-04-01" [COLLECTING]                                         │
│  ┌─────────────────────────────────────────────────────────┐            │
│  │  #142  feat: новый дашборд          ✓ CI   ✓ Approved  │            │
│  │  #143  fix: исправить таймер        ✓ CI   ✓ Approved  │            │
│  │  #144  chore: обновить зависимости  ⟳ CI   — Pending   │            │
│  └─────────────────────────────────────────────────────────┘            │
│                                                                          │
│  PM проверяет: все ли PR готовы к деплою?                               │
│  • CI зелёный у всех?                                                   │
│  • Все заапрувлены?                                                     │
│  • Нет конфликтов?                                                      │
└───────────────────────────┬──────────────────────────────────────────────┘
                            │ PM нажимает "→ Deploy Staging"
                            ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  PIPELINE SERVICE — DEPLOYING                                            │
│  PATCH /api/batches/:id/state → { state: "DEPLOYING" }                 │
│  + POST /api/batches/:id/deploy-staging                                 │
│    → GitHub API: POST /repos/.../actions/workflows/deploy-staging.yml/  │
│                        dispatches { ref: "main", inputs: { batch_id,    │
│                        image_tag: <sha> } }                              │
│  + Создаёт DeployEvent { target: STAGING, status: RUNNING }            │
└───────────────────────────┬──────────────────────────────────────────────┘
                            │ GitHub Actions запускается
                            ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  GITHUB ACTIONS — Deploy Staging (deploy-staging.yml) [НОВЫЙ]           │
│  Trigger: workflow_dispatch                                              │
│    inputs: image_tag (required), batch_id (optional)                   │
│  Steps:                                                                  │
│  • SSH prepare                                                           │
│  • rsync deploy/ assets                                                 │
│  • docker login on staging server                                       │
│  • inject secrets                                                        │
│  • run deploy.sh staging <image_tag>                                    │
│  • health check (retry 12×5s)                                           │
│  • POST /api/batches/:batch_id/deploy-callback                          │
│    { status: "SUCCESS"|"FAILURE", workflowRunId, workflowRunUrl }       │
└───────────────────────────┬──────────────────────────────────────────────┘
                            │ деплой завершён
                            ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  PIPELINE SERVICE — получает callback / polling                         │
│  DeployEvent обновляется: status → SUCCESS / FAILURE                   │
│  StagingBatch переходит:                                                │
│    SUCCESS → TESTING                                                    │
│    FAILURE → FAILED                                                     │
└───────────────────────────┬──────────┬───────────────────────────────────┘
                            │ TESTING  │ FAILED
                            ▼          ▼
              ┌─────────────┐    ┌─────────────┐
              │  PM проводит│    │  PM видит   │
              │  ручное QA  │    │  лог ошибки │
              │  на staging │    │  и нажимает │
              └──────┬──────┘    │  ↩ Restart  │
                     │           └──────┬───────┘
          ┌──────────┴────┐             │
          │               │             ▼
          ▼               ▼     [COLLECTING снова]
      [✓ Passed]      [✗ Failed]  (фикс → новый PR)
          │               │
          ▼               ▼
      PASSED           FAILED
          │
          │  PM нажимает "🚀 Deploy to Production"
          ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  PIPELINE SERVICE — инициирует деплой в Production                      │
│  POST /api/batches/:id/deploy-production                                │
│  → GitHub API: workflow_dispatch deploy-production.yml                  │
│    { image_tag: <sha_from_batch> }                                      │
│  + Создаёт DeployEvent { target: PRODUCTION, status: RUNNING }         │
└───────────────────────────┬──────────────────────────────────────────────┘
                            │ GitHub Actions запускается
                            ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  GITHUB ACTIONS — Deploy Production (deploy-production.yml)             │
│  (существующий, без изменений)                                          │
│  • SSH → deploy.sh production <image_tag>                               │
│  • callback → Pipeline Service                                          │
└───────────────────────────┬──────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  PIPELINE SERVICE — финализация                                         │
│  StagingBatch.state → RELEASED                                          │
│  DeployEvent.status → SUCCESS                                           │
│  Dashboard показывает релиз с тэгом, SHA, временем                     │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Стейт-машина StagingBatch

### Схема переходов

```
                    ┌─────────────┐
                    │  COLLECTING │ ◄──────────────────────────────┐
                    └──────┬──────┘                                │
                           │                                       │
                    PM нажимает                                     │
                  "→ Deploy Staging"                               │
                  + GitHub dispatch                                │
                           │                                       │
                           ▼                                       │
                    ┌─────────────┐                                │
                    │   MERGING   │ (зарезервировано для будущего) │
                    └──────┬──────┘                                │
                           │ (опционально, сейчас пропускается)    │
                           ▼                                       │
                    ┌─────────────┐       deploy failure           │
                    │  DEPLOYING  │ ─────────────────────────────► │
                    └──────┬──────┘                                │
                           │ deploy success                        │
                           ▼                                       │
                    ┌─────────────┐       testing fails            │
                    │   TESTING   │ ─────────────────────────────► │
                    └──────┬──────┘                                │
                           │ PM подтверждает QA                    │
                           ▼                              ┌────────┴──────┐
                    ┌─────────────┐                       │    FAILED     │
                    │   PASSED    │                       └───────────────┘
                    └──────┬──────┘
                           │ PM нажимает
                      "🚀 Deploy to Production"
                           │
                           ▼
                    ┌─────────────┐
                    │  RELEASED   │  (терминальный, без выхода)
                    └─────────────┘
```

### Таблица допустимых переходов

| Из \ В      | COLLECTING | MERGING | DEPLOYING | TESTING | PASSED | FAILED | RELEASED |
|-------------|:----------:|:-------:|:---------:|:-------:|:------:|:------:|:--------:|
| COLLECTING  |            |         |     ✓     |         |        |   ✓    |          |
| MERGING     |            |         |     ✓     |         |        |   ✓    |          |
| DEPLOYING   |            |         |           |    ✓    |        |   ✓    |          |
| TESTING     |            |         |           |         |   ✓    |   ✓    |          |
| PASSED      |            |         |           |         |        |        |    ✓     |
| FAILED      |     ✓      |         |           |         |        |        |          |
| RELEASED    |  (нет выхода)                                                          |

> Реализовано в `batches.router.ts` → `VALID_TRANSITIONS`. Нужно добавить side-effect:
> переход COLLECTING → DEPLOYING должен тригерить GitHub workflow_dispatch.

---

## 4. Компонентная схема

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  BROWSER (React)                                                             │
│                                                                              │
│  PipelineDashboardPage                                                       │
│  ├── pipelineApi.getBatches()          GET  /pipeline/api/batches           │
│  ├── pipelineApi.transitionState()     PATCH /pipeline/api/batches/:id/state│
│  ├── pipelineApi.syncGitHub()          POST /pipeline/api/github/sync       │
│  ├── [нужно] pipelineApi.deployStat() POST /pipeline/api/batches/:id/       │
│  │                                          deploy-staging                   │
│  └── [нужно] pipelineApi.deployProd() POST /pipeline/api/batches/:id/       │
│                                             deploy-production                │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │ HTTPS (nginx proxy /pipeline/ → :3100)
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PIPELINE SERVICE (pipeline-service/, port 3100)                            │
│  Express + Prisma + PostgreSQL                                              │
│                                                                              │
│  Модули:                                                                     │
│  ├── /api/health          health.router.ts                                  │
│  ├── /api/pipelines       pipelines.router.ts                               │
│  │     GET  /prs          — список PR снапшотов                            │
│  │     GET  /deploys      — история деплоев                                │
│  │     POST /sync         — запуск синхронизации с GitHub                  │
│  │     GET  /sync-state   — статус последней синхронизации                 │
│  │     GET  /batches      — список батчей (дублирует /api/batches)         │
│  ├── /api/batches         batches.router.ts                                 │
│  │     POST /             — создать батч                                   │
│  │     GET  /             — список батчей (с фильтрацией)                  │
│  │     GET  /:id          — батч по ID                                     │
│  │     PATCH /:id/state   — переход состояния (стейт-машина)              │
│  │     POST /:id/prs      — добавить PRs в батч                           │
│  │     DELETE /:id/prs/:prId — убрать PR из батча                         │
│  │     [нужно] POST /:id/deploy-staging    — тригер staging деплоя        │
│  │     [нужно] POST /:id/deploy-production — тригер prod деплоя           │
│  │     [нужно] POST /:id/deploy-callback   — callback от GitHub Actions    │
│  └── /api/github          github.router.ts                                  │
│        POST /sync         — синхронизация merged PRs из GitHub             │
│        GET  /prs          — merged PRs с batch info                        │
└───────────────────┬───────────────────────────────────────────────────────-─┘
                    │ GitHub REST API (Bearer token)
                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  GITHUB ACTIONS                                                              │
│                                                                              │
│  ci.yml                build-and-publish.yml    deploy-production.yml       │
│  • push / PR           • workflow_run (CI ok)   • workflow_dispatch         │
│  • tsc+lint+test       • docker build+push      • SSH → deploy.sh prod      │
│                                                                              │
│  [нужно]                                                                     │
│  deploy-staging.yml                                                          │
│  • workflow_dispatch (inputs: image_tag, batch_id)                          │
│  • SSH → deploy.sh staging                                                  │
│  • POST callback → Pipeline Service                                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Модели данных (Prisma schema)

```
PullRequestSnapshot
  id, externalId (PR number), source, repo, title, author
  branch, baseBranch, hasConflicts
  ciStatus: PENDING | RUNNING | SUCCESS | FAILURE | CANCELLED
  reviewStatus: PENDING | APPROVED | CHANGES_REQUESTED
  mergedAt, mergedSha
  stagingBatchId → StagingBatch (optional, null = не в батче)

StagingBatch
  id, name, state: COLLECTING | MERGING | DEPLOYING | TESTING | PASSED | FAILED | RELEASED
  createdById, notes
  releaseId, releaseName        ← заполняется при RELEASED
  healthCheckResult             ← результат health-check после деплоя
  pullRequests → PullRequestSnapshot[]
  deployEvents → DeployEvent[]

DeployEvent
  id, target: STAGING | PRODUCTION
  status: PENDING | RUNNING | SUCCESS | FAILURE | ROLLED_BACK
  imageTag, gitSha
  triggeredById
  stagingBatchId → StagingBatch
  workflowRunId, workflowRunUrl ← заполняется после dispatch
  startedAt, finishedAt, durationMs
  healthCheckResult, errorMessage
```

---

## 5. GAP анализ — Что нужно построить

### 5.1 GitHub Actions — создать deploy-staging.yml

**Статус:** файл **отсутствует**. `deploy-staging.yml` не существует в `.github/workflows/`.

Нужно создать по образцу `deploy-production.yml`:

```yaml
name: Deploy Staging

on:
  workflow_dispatch:
    inputs:
      image_tag:
        description: Docker image tag to deploy
        required: true
        type: string
      batch_id:
        description: Pipeline Service batch ID (for callback)
        required: false
        type: string

permissions:
  contents: read
  packages: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v6
      - name: Prepare SSH key
        # ... (аналогично deploy-production.yml)
      - name: Sync deploy assets
        # rsync deploy/ → staging server
      - name: Docker login on server
        # ...
      - name: Inject secrets into backend env
        # ... (backend.staging.env)
      - name: Run remote deploy
        # deploy.sh staging <image_tag>
      - name: Callback to Pipeline Service (success)
        if: success()
        run: |
          curl -sf -X POST "${{ secrets.PIPELINE_SERVICE_URL }}/api/batches/${{ inputs.batch_id }}/deploy-callback" \
            -H "x-pipeline-api-key: ${{ secrets.PIPELINE_SERVICE_API_KEY }}" \
            -H "Content-Type: application/json" \
            -d '{"status":"SUCCESS","workflowRunId":${{ github.run_id }},"workflowRunUrl":"${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"}'
      - name: Callback to Pipeline Service (failure)
        if: failure()
        run: |
          curl -sf -X POST "${{ secrets.PIPELINE_SERVICE_URL }}/api/batches/${{ inputs.batch_id }}/deploy-callback" \
            -H "x-pipeline-api-key: ${{ secrets.PIPELINE_SERVICE_API_KEY }}" \
            -H "Content-Type: application/json" \
            -d '{"status":"FAILURE","workflowRunId":${{ github.run_id }},"errorMessage":"Deploy failed"}'
```

**Новые GitHub Secrets для staging environment:**
- `STAGING_DEPLOY_SSH_KEY`
- `STAGING_DEPLOY_HOST`
- `STAGING_DEPLOY_USER`
- `STAGING_DEPLOY_PATH`
- `PIPELINE_SERVICE_URL` (например `http://5.129.242.171:3100`)
- `PIPELINE_SERVICE_API_KEY`

**Изменение в deploy-production.yml:**
Добавить аналогичные callback-шаги (success/failure) для замыкания стейт-машины батча.

### 5.2 Pipeline Service — новые эндпоинты

**a) POST /api/batches/:id/deploy-staging**

Логика:
1. Найти батч, проверить state == COLLECTING или MERGING
2. Взять `imageTag` (из последнего merged PR в батче → mergedSha, либо передать явно)
3. Вызвать `github.client.ts` → `triggerWorkflowDispatch('deploy-staging.yml', { image_tag, batch_id })`
4. Создать `DeployEvent { target: STAGING, status: RUNNING, imageTag, workflowRunId? }`
5. Перевести батч в DEPLOYING
6. Вернуть `{ batch, deployEvent }`

**b) POST /api/batches/:id/deploy-production**

Логика:
1. Найти батч, проверить state == PASSED
2. Вызвать `triggerWorkflowDispatch('deploy-production.yml', { image_tag })`
3. Создать `DeployEvent { target: PRODUCTION, status: RUNNING }`
4. Вернуть `{ batch, deployEvent }` (state остаётся PASSED до callback)

**c) POST /api/batches/:id/deploy-callback**

Используется GitHub Actions для уведомления об окончании деплоя.

Тело: `{ status: "SUCCESS"|"FAILURE", workflowRunId?: number, workflowRunUrl?: string, errorMessage?: string }`

Логика:
- Найти самый последний `DeployEvent` с `status: RUNNING` для этого батча
- Обновить DeployEvent: `status`, `finishedAt`, `durationMs`, `workflowRunId`, `workflowRunUrl`, `errorMessage`
- Автоматический переход батча:
  - DEPLOYING + SUCCESS → TESTING
  - DEPLOYING + FAILURE → FAILED
  - (PASSED батч при деплое в прод) + SUCCESS → RELEASED
  - (PASSED батч при деплое в прод) + FAILURE → FAILED

**d) Новая функция в github.client.ts**

```typescript
export async function triggerWorkflowDispatch(
  owner: string,
  repo: string,
  workflowFile: string,
  ref: string,
  inputs: Record<string, string>,
): Promise<void>
```

Вызывает `POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches`.

### 5.3 Frontend — новые вызовы API

**Текущее поведение кнопки "→ Deploy Staging"** (строка 358 PipelineDashboardPage.tsx):
```typescript
onClick={() => handleTransition(selected.id, 'DEPLOYING')}
```
Вызывает только `PATCH /api/batches/:id/state` → переводит батч в DEPLOYING локально.
**GitHub Actions не запускается.**

**Нужно заменить** на вызов нового эндпоинта:
```typescript
onClick={() => handleDeployStaging(selected.id)}

const handleDeployStaging = async (batchId: string) => {
  try {
    await pipelineApi.deployStagingBatch(batchId);  // POST /api/batches/:id/deploy-staging
    await load();
  } catch (e) {
    setError(e instanceof Error ? e.message : 'Ошибка запуска деплоя');
  }
};
```

**Кнопка "🚀 Deploy to Production"** (строка 373):
```typescript
onClick={() => handleTransition(selected.id, 'RELEASED')}
```
Аналогично заменить на `pipelineApi.deployProductionBatch(batchId)`.

**Новые методы в `frontend/src/api/pipeline.ts`:**
```typescript
deployStagingBatch: async (batchId: string): Promise<StagingBatch> => { ... }
deployProductionBatch: async (batchId: string): Promise<StagingBatch> => { ... }
```

**Дополнительно:** добавить поллинг (каждые 10с) когда батч в состоянии DEPLOYING,
чтобы PM видел обновление статуса без ручного обновления страницы.

### 5.4 Создание продакшн батчей (prod batch collection)

После того как батч получил статус `RELEASED`, следующие PR-ы мёрджатся в main и
автоматически попадают в **новый** COLLECTING батч (логика уже реализована в
`getOrCreateCollectingBatchId()` в `github.router.ts`).

Никаких изменений не требуется — логика корректная.

---

## 6. Фазы реализации

### Фаза 1 — GitHub Actions + Secrets (1-2 дня)

**Задачи:**
1. Создать `.github/workflows/deploy-staging.yml` по шаблону deploy-production.yml
   - `workflow_dispatch` с inputs: `image_tag`, `batch_id`
   - environment: `staging`
   - SSH + rsync + deploy.sh staging
   - callback step (success + failure)
2. Настроить в GitHub → Settings → Environments → `staging`:
   - `STAGING_DEPLOY_SSH_KEY`
   - `STAGING_DEPLOY_HOST`
   - `STAGING_DEPLOY_USER`
   - `STAGING_DEPLOY_PATH`
3. Добавить в оба environments (staging + production):
   - `PIPELINE_SERVICE_URL`
   - `PIPELINE_SERVICE_API_KEY`
4. Добавить callback шаги в существующий `deploy-production.yml`

**Проверка:** ручной `workflow_dispatch` deploy-staging.yml из GitHub UI успешно деплоит на staging.

---

### Фаза 2 — Pipeline Service: GitHub dispatch + callback (2-3 дня)

**Задачи:**
1. `github.client.ts` → добавить `triggerWorkflowDispatch()`
2. `batches.router.ts` → добавить:
   - `POST /api/batches/:id/deploy-staging`
   - `POST /api/batches/:id/deploy-production`
   - `POST /api/batches/:id/deploy-callback`
3. Обновить `VALID_TRANSITIONS` если нужно (PASSED → RELEASED только через deploy-production callback)
4. Добавить `PIPELINE_GITHUB_OWNER`, `PIPELINE_GITHUB_REPO` в `config.ts`
5. Добавить тесты для новых эндпоинтов (Supertest)

**Проверка:** curl в Pipeline Service → запускается GitHub Actions job, callback получен, батч переходит в TESTING.

---

### Фаза 3 — Frontend: wire up кнопки (1 день)

**Задачи:**
1. `frontend/src/api/pipeline.ts` → добавить `deployStagingBatch()`, `deployProductionBatch()`
2. `PipelineDashboardPage.tsx`:
   - Заменить onClick "→ Deploy Staging" → `handleDeployStaging()`
   - Заменить onClick "🚀 Deploy to Production" → `handleDeployProd()`
   - Добавить поллинг `useEffect` (интервал 10с) когда batch.state === 'DEPLOYING'
   - Показывать `workflowRunUrl` как кликабельную ссылку на GitHub Actions run
3. Добавить отображение `DeployEvent` с реальным временем выполнения и статусом

**Проверка:** нажатие "→ Deploy Staging" в UI → деплой идёт на staging → статус обновляется автоматически.

---

### Фаза 4 — Polish + авто-поллинг GitHub статусов (1-2 дня)

**Задачи:**
1. Периодический sync PR статусов (CI checks, review status) — крон каждые 5 минут
   или GitHub webhook
2. Добавить `DeployEvent.workflowRunId` polling: Pipeline Service проверяет статус
   GitHub Actions run через `GET /repos/.../actions/runs/:run_id` и автоматически
   закрывает `DeployEvent` без ожидания callback (resilience против потери callback)
3. Уведомления: при переходе DEPLOYING → TESTING / FAILED отправить Telegram уведомление
   через существующий Telegram-бот
4. Добавить страницу истории деплоев с фильтрацией по target/status

---

## 7. Новые / изменённые API эндпоинты

### Pipeline Service (новые)

| Метод | Путь | Описание |
|-------|------|----------|
| `POST` | `/api/batches/:id/deploy-staging` | Запустить деплой батча на staging (GitHub dispatch + DeployEvent) |
| `POST` | `/api/batches/:id/deploy-production` | Запустить деплой батча в production |
| `POST` | `/api/batches/:id/deploy-callback` | Webhook от GitHub Actions: обновить DeployEvent и переключить состояние батча |

### Pipeline Service (изменения в существующих)

| Метод | Путь | Изменение |
|-------|------|-----------|
| `PATCH` | `/api/batches/:id/state` | Добавить side-effect: переход COLLECTING→DEPLOYING должен вызывать GitHub dispatch (альтернатива — убрать прямой вызов, использовать только `/deploy-staging`) |

### Frontend API (новые методы в `pipeline.ts`)

| Метод | Описание |
|-------|----------|
| `pipelineApi.deployStagingBatch(batchId)` | POST /api/batches/:id/deploy-staging |
| `pipelineApi.deployProductionBatch(batchId)` | POST /api/batches/:id/deploy-production |

### GitHub Actions (новый workflow)

| Workflow | Trigger | Inputs |
|----------|---------|--------|
| `deploy-staging.yml` | `workflow_dispatch` | `image_tag` (required), `batch_id` (optional) |

---

## 8. Нерешённые вопросы (открыто)

1. **image_tag для батча:** какой SHA брать если в батче несколько PR с разными `mergedSha`?
   Варианты: последний merged SHA, SHA самого последнего build-and-publish job для main.
   Рекомендация: хранить `latestMainSha` в SyncState, обновлять при каждом sync.

2. **MERGING состояние:** сейчас `VALID_TRANSITIONS` разрешает COLLECTING→DEPLOYING напрямую,
   минуя MERGING. Это корректно пока нет merge queue. В будущем MERGING потребует
   автоматической проверки merge conflicts перед деплоем.

3. **Callback надёжность:** GitHub Actions может не отправить callback при падении runner.
   Нужен fallback polling DeployEvent через GitHub API (Фаза 4).

4. **Staging secrets (P1 блокер из истории):** `STAGING_DEPLOY_SSH_KEY` и другие secrets
   для staging environment должны быть настроены в GitHub Settings до запуска Фазы 1.

5. **Авторизация callback:** `POST /api/batches/:id/deploy-callback` открыт для любого,
   кто знает `PIPELINE_SERVICE_API_KEY`. В будущем добавить проверку источника (GitHub
   Actions IP ranges или HMAC подпись).
