# Version History

Все значимые изменения в проекте. Для каждого изменения указана ссылка на задачу (если есть).

**Last version: 2.70**

---

## [2.70] [2026-04-24] fix(auth): rotate-password — clean exit + mustChangePassword=false

**PR:** [#164](https://github.com/NovakPAai/tasktime-mvp/pull/164) (merged 2026-04-24)
**Ветка:** `fix/rotate-password-cleanup`

### Что было

После первого запуска `reset-password-staging.yml` workflow дважды упал:

1. **SSH висел 5 мин + exit 255 (Broken pipe)**. Причина: `rotate-password.ts` не вызывал `process.exit(0)` — Prisma pool + Redis client (через `deleteUserSession`) держали TCP-соединения. Node-процесс внутри docker exec не завершался → SSH keep-alive таймаутился.

2. **E2E test `16-bulk-operations` упал** с `expect(getByText(/Массовые операции/i))` → not visible. Снапшот показал: admin-cleanup после логина редиректится на `/change-password` («Вам назначен временный пароль»). Причина: `rotateUserPassword` обновлял `passwordHash`, но НЕ сбрасывал `mustChangePassword`. Если флаг был true (e.g. после предыдущего `admin /reset-password`), rotation оставлял его в true → фронтенд (App.tsx:85) форсил change-password flow.

### Что теперь

- **`rotate-password.ts`** — явно `process.exit(0)` после main() + `process.exit(1)` в catch. Форсирует termination pool connections. CLI передаёт `clearMustChangePassword: true`.
- **`password-rotation.service.ts`** — новый опциональный параметр `clearMustChangePassword?: boolean` (default `false`). При `true` очищает `mustChangePassword` флаг. Default `false` preserves backward-compat для `POST /admin/users/reset-password` (admin set temp password, force user change). Плюс `deleteUserSession` теперь в try/catch через `captureError` — не throw'ит если Redis down после DB commit.
- **`password-rotation.test.ts`** — два новых теста: (1) `clearMustChangePassword: true` сбрасывает флаг + реальный login check; (2) default behavior preserves флаг (регрессия-guard для admin endpoint).

### Проверки

- `npx tsc --noEmit` (backend) → 0 errors.
- Integration-тесты (Postgres) — запускает CI.

### Связано

- TTBULK-1 epic follow-up — разблокирует автоматизированные E2E-прогоны.

---

## [2.69] [2026-04-24] feat(releases): доработка карточки релиза + fix визуального редактора воркфлоу

**PR:** [#159](https://github.com/NovakPAai/tasktime-mvp/pull/159) (merged 2026-04-24)
**Ветка:** `feat/release-card-enhancements`

### Карточка релиза

- **Порядок вкладок**: «Готовность → Контрольные точки → Диаграмма сгорания → Задачи → Спринты → История». Вкладка по умолчанию — «Готовность» (раньше «Задачи»).
- **Готовность** — две новые плитки: «Плановая дата» (`release.plannedDate`) и «Дней до релиза» (считается через `dayjs`: положит. → «N дн.», 0 → «Сегодня», отриц. → «Просрочен»). Сетка метрик `repeat(3, 1fr)` — 6 карточек в 2 ряда.
- **Редактирование релиза** — иконка-карандаш в шапке карточки (видна для `canManage` = SUPER_ADMIN / ADMIN / RELEASE_MANAGER, скрыта для релизов в категории DONE). Модалка с полями: название, описание, уровень, плановая/фактическая даты. На Save — `updateRelease` + surgical merge в `selectedRelease` (сохраняет `_count`, `_projects`, `createdBy` при partial-response от PATCH).

### Визуальный редактор воркфлоу релиза (fix багов на стейдже)

- **Переходы не отображались** в ReactFlow-канвасе — кастомный `StatusNode` не имел `<Handle>`-компонентов, xyflow не мог "приклеить" рёбра. Добавлены `Handle type="target"` (Top) и `Handle type="source"` (Bottom). Заодно починилась drag-to-connect.
- **Ошибки «400 Validation failed»** при добавлении статуса/перехода — сид создаёт release-statuses со short-slug ID (`rs-draft`, `rs-building`...), а Zod-DTO ждал `z.string().uuid()`. Ослаблено до `z.string().min(1)` для `statusId`, `fromStatusId`, `toStatusId`. Референциальная целостность сохранена (service layer + DB FK).
- **Ghost edge на Отмена** в transition-drawer'е — drag-connect добавлял оптимистичный edge, который не откатывался при клике «Отмена». Кнопка теперь вызывает `void load()` для перезагрузки графа с сервера.

### Проверки

- `tsc --noEmit` → 0 errors (frontend + backend).
- ESLint — только pre-existing unused-disable warnings, не от этих правок.
- Pre-push review (3 🟠 + 5 🟡 + 3 🔵) — все addressable-пункты закрыты (DONE-status guard, surgical merge, resetFields, 3-col grid, ghost-edge fix, form rules).

---

## [2.68] [2026-04-24] feat(search): кликабельные ключи задач + удаление правой preview-панели

**PR:** [#158](https://github.com/NovakPAai/tasktime-mvp/pull/158) (merged 2026-04-24)
**Ветка:** `feat/clickable-issue-keys`

### Что было

В `/search` результаты поиска показывали ключ задачи (`PROJ-123`) как неинтерактивный `<span>` — пользователь не мог перейти в карточку задачи прямо из таблицы. Справа была третья колонка `search-preview` (360px) — placeholder «Выберите задачу в таблице для preview», полнофункциональный drawer не реализован (отложен §13.6 Phase 2).

### Что теперь

- **`ResultsTable.tsx`** — колонка `key` теперь рендерит `<Link to={'/issues/${id}'}>` (react-router-dom). `stopPropagation` на клик — чтобы навигация не конфликтовала с rowSelection. Стиль `monospace + #4F6EF7` сохранён.
- **`SearchPage.tsx`** — grid `320px | 1fr | 360px` → `320px | 1fr`. Column 3 (aside `search-preview`) удалена. Освобождает ширину для ResultsTable.
- **`e2e/specs/20-search.spec.ts`** — убрана проверка `search-preview` testid'а (элемента больше нет).

### Проверки

- `npx tsc --noEmit` → 0 errors.
- `npm run lint` → 0 новых warnings.

### Связано

- TTSRH-1 §13.6 Phase 2 — полноценный preview drawer остаётся в бэклоге (если понадобится — открывать отдельной задачей).

---

## [2.67] [2026-04-24] feat(bulk-ops): TTBULK-1 follow-up — friendly pickers (замена UUID-вводов)

**PR:** [#157](https://github.com/NovakPAai/tasktime-mvp/pull/157) (merged 2026-04-24)
**Ветка:** `ttbulk-1/friendly-pickers`

### Что было

После cutover в PR-12 BULK_OPERATOR-пользователь при настройке операций на Step 2 должен был вводить UUID'ы руками (transitionId, assigneeId, customFieldId, sprintId) — ID-first UX, изначально отложенный в §13.6 PR-9b как «rich selectors deferred». На Step 4 confirm тоже отображались только UUID'ы — непрозрачно перед submit'ом.

### Что теперь

**Step2Configure** — человеко-понятные пикеры вместо UUID-input'ов:

- **TRANSITION** — Select целевого статуса. Фетчит `workflowEngineApi.getBatchTransitions(scope.issueIds)` на входе, агрегирует переходы по `toStatus.name` с count'ом «доступно для N/M задач». Выбор ведёт в один из `transitionId`'ов группы — executor per-issue проверяет availability (issues с недоступным переходом будут SKIPPED с `NO_TRANSITION`).
- **ASSIGN** — searchable Select из `listUsers()` (публичный endpoint `/users`), фильтр по имени и email, опция «— Снять исполнителя —» эквивалентна `assigneeId: null`.
- **EDIT_CUSTOM_FIELD** — Select кастом-полей из `issueCustomFieldsApi.getFields(firstIssueId)`. Input под значение — типизированный по `fieldType` (TEXT/TEXTAREA/NUMBER/DATE/SELECT/MULTI_SELECT/CHECKBOX/REFERENCE). Показывает warning'и про multi-schema.
- **MOVE_TO_SPRINT** — Select из `listAllSprints({ state: 'ALL' }, { limit: 500 })` сгруппированный по проекту, с меткой статуса спринта (Планируется/Активен/Завершён). Опция «— Убрать из спринта —» → `sprintId: null`.

**Step4Confirm** — PayloadSummary резолвит UUID'ы в человеко-читаемые имена через те же API (lazy-fetch per resolver-компонент). Fallback на Text code с UUID при ошибке.

### Инварианты

- JQL-скоуп (пока не в UI): fallback на UUID-ввод — сохранён как safety net.
- При multi-project выборке TRANSITION группирует по `toStatus.name`, так как transition-UUID'ы могут отличаться между проектами. EDIT_CUSTOM_FIELD использует схему первой задачи (warning'и показаны).
- Все новые API-вызовы защищены try/catch → silent fallback на UUID при ошибке (не блокирует submit).

### Проверки

- `npx tsc --noEmit` → 0 errors.
- `npm run lint` → 0 новых warnings (все existing — из других файлов).

### Связано

- TTBULK-1 — см. `docs/tz/TTBULK-1.md` §3.2, §13.6 PR-9b (deferred rich selectors).

---

## [2.66] [2026-04-24] feat(bulk-ops): TTBULK-1 PR-12 — e2e + docs + cutover (FEATURES_BULK_OPS=true)

**PR:** [#156](https://github.com/NovakPAai/tasktime-mvp/pull/156) (merged 2026-04-24)
**Ветка:** `ttbulk-1/e2e-docs-cutover`

### Что было

После PR-1..11 + PR-13 система полностью реализована, но фичефлаг `false` — фичa не активна. Не было e2e smoke, k6 load, user manual, runbook forensics, бейджа «Массовая операция» на IssueDetailPage.

### Что теперь

**Cutover:** `backend/src/shared/features.ts` `bulkOps` default `false → true`; `frontend/src/lib/features.ts` аналогично. Rollback через env override.

**IssueDetailPage badge:** `AuditEntry.bulkOperationId` тип, Tag-badge «Массовая операция» с link на `/operations/:id`.

**E2E** (`frontend/e2e/specs/16-bulk-operations.spec.ts`) — 3 сценария: /operations рендерится, USER 401/403, full API flow с idempotency replay.

**k6 load** (`backend/tests/bulk-operations-load.k6.js`) — 100 VUs × 100 items, p95 <5s (manual validation).

**Docs:** `docs/user-manual/bulk-operations.md` + `docs/OPERATIONS_RUNBOOK.md §Bulk Operations` (forensics SQL, alerts, rollback).

### Влияние на prod

Фича активна для всех BULK_OPERATOR пользователей после merge. Rollback через env.

### Проверки

- `npx tsc --noEmit` (backend + frontend) → 0 errors.
- `npm run test:parser` → 631/631 passed.

### Связано

- TTBULK-1 — см. `docs/tz/TTBULK-1.md` §10.3, §10.4, §13.7 PR-12.

---

## [2.65] [2026-04-24] feat(bulk-ops): TTBULK-1 PR-13 — Prometheus metrics + Grafana dashboard + alerts

**PR:** [#155](https://github.com/NovakPAai/tasktime-mvp/pull/155) (merged 2026-04-24)
**Ветка:** `ttbulk-1/metrics`

### Что было

Bulk operations backend работал с PR-4+: processor тикал, SSE'ил прогресс, audit'ил. Но operational visibility отсутствовала: SRE не мог видеть queue depth, operation duration distribution, processor tick rate. Никаких alert'ов для критичных условий.

### Что теперь

- **`bulk-metrics.ts`** — 5 метрик через `prom-client` Registry.
- **`bulk-metrics.router.ts`** — `GET /api/bulk-operations/metrics` (requireRole ADMIN/SUPER_ADMIN).
- **Processor instrumentation** — 4 hook-point'а.
- **Grafana dashboard** + **Prometheus alerts**.
- **Dependency**: `prom-client ^15.x`.

### Unit-тесты (+9 новых)

`bulk-metrics.unit.test.ts`: counters/gauge/histogram semantics.

### Проверки

- `npx tsc --noEmit` → 0 errors.
- `npm run test:parser` → 631/631 passed.

### Связано

- TTBULK-1 — см. `docs/tz/TTBULK-1.md` §12, §13.8 PR-13.

---

## [2.64] [2026-04-24] feat(bulk-ops): TTBULK-1 PR-11 — /operations page + retry UI + operation detail

---

## [2.64] [2026-04-24] feat(bulk-ops): TTBULK-1 PR-11 — /operations page + retry UI + operation detail

**PR:** [#154](https://github.com/NovakPAai/tasktime-mvp/pull/154) (merged 2026-04-24)
**Ветка:** `ttbulk-1/operations-page`

### Что было

После PR-9+10 wizard + progress drawer работали, но не было:
- Списка прошлых операций (куда zoom'нуться после закрытия chip'а).
- Детальной страницы операции с retry.
- Возможности dispatch'нуть retry failed извне drawer'а.

### Что теперь

- **`pages/OperationsPage.tsx`** — таблица `listMine` с фильтрами Status/Type + пагинация. Retry → `retryFailed(id, uuid)` → store addOperation + setDrawerOperationId.
- **`pages/OperationDetailPage.tsx`** — detail view `/operations/:id` с `useBulkOperationStream(id)` live-обновлениями. Descriptions + buttons (Обновить / Скачать CSV / Retry / Отменить).
- **`App.tsx`** — routes `/operations` + `/operations/:id`.
- **`Sidebar.tsx`** — nav link «Массовые операции» под `features.bulkOps`.

### Не включено (deferred в PR-12)

- IssueDetailPage AuditLog badge — требует investigation History-tab structure.
- Admin filter «Все операции» — требует backend endpoint.

### Проверки

- `npx tsc --noEmit` frontend → 0 errors.

---

## [2.63] [2026-04-24] feat(bulk-ops): TTBULK-1 PR-10 — ProgressDrawer + SSE hook + floating chips + zustand store

**PR:** [#153](https://github.com/NovakPAai/tasktime-mvp/pull/153) (merged 2026-04-24)
**Ветка:** `ttbulk-1/progress-drawer`

### Что было

После PR-9 wizard создавал операцию через `bulkOperationsApi.create`, но после submit не было **никакого** live-прогресса. SSE endpoint (`/stream` от PR-6) и `/report.csv` были готовы, но фронт их не использовал.

### Что теперь

- **`store/bulkOperations.store.ts`** (zustand) — tracked operations map + drawer state. addOperation / updateOperation / removeOperation / setDrawerOperationId / getActiveOperations.
- **`components/bulk/useBulkOperationStream.ts`** — SSE через `EventSource` (cookie-auth). События: `progress` (счётчики), `status` (finalize + disconnect). Polling fallback 2s при SSE failure.
- **`components/bulk/BulkOperationProgressDrawer.tsx`** — Ant Drawer width=420. Status Tag + Progress bar, 4 counters, Cancel / Download CSV / Скрыть buttons. Finalize → `finalStatusReason` Alert.
- **`components/bulk/BulkOperationChips.tsx`** — floating fixed bottom-right, один chip на активную операцию. Клик → open drawer. Gated под `features.bulkOps`.
- **`layout/AppLayout.tsx`** — mount chips + drawer на верхнем уровне.
- **`BulkActionsBar.tsx`** — wizard `onSubmitted(id)` → `addOperation` + `setDrawerOperationId` → drawer открывается автоматически с новой операцией.

### Влияние на prod

Gated под `VITE_FEATURES_BULK_OPS=false`. После cutover (PR-12): full flow — wizard submit → chip + drawer → SSE live progress → Download CSV.

### Проверки

- `npx tsc --noEmit` (frontend) → 0 errors.
- `npm run lint` → 0 errors, 0 новых warnings.
- Frontend unit-tests — vitest инфра отсутствует; Playwright e2e в PR-12.
- Manual smoke (post-deploy bulkOps=true): submit wizard → chip + drawer → live progress → Download.

### Связано

- TTBULK-1 — см. `docs/tz/TTBULK-1.md` §3.3, §8.3, §13.7 PR-10.

---

## [2.62] [2026-04-24] feat(bulk-ops): TTBULK-1 PR-9b — Step2 Configure + Step3 Preview (virtualized) + Step4 Confirm + submit flow

**PR:** [#152](https://github.com/NovakPAai/tasktime-mvp/pull/152) (merged 2026-04-24)
**Ветка:** `ttbulk-1/wizard-modal-b` (branched from `ttbulk-1/wizard-modal-a`)

### Что было

После PR-9a wizard отображал только Step1 (выбор типа); Step2-4 были Alert-placeholder'ами. Пользователь не мог сконфигурировать операцию, посмотреть preview или submit'нуть её из UI.

### Что теперь

- **`Step2Configure.tsx`** — per-type формы: TRANSITION (transitionId input), ASSIGN (assigneeId / null-unassign), EDIT_FIELD (field select + value input с вариантами для priority/dueDate/labels/description.append), EDIT_CUSTOM_FIELD (customFieldId + JSON value), MOVE_TO_SPRINT (sprintId / null-remove), ADD_COMMENT (textarea с maxLength=10k), DELETE (no config). **Scope PR-9b**: минимальные input'ы (ID-first UX); rich selectors deferred в PR-12 polish.
- **`Step3Preview.tsx`** — Collapsible panel'ы с 3-мя секциями (eligible/skipped/conflicts) + virtualized списки через `react-window` v2 `List` (rowHeight=40, max section height=300). Conflicts inline-resolution (INCLUDE/EXCLUDE/USE_OVERRIDE) — deferred в PR-12 polish; сейчас все conflicts автоматически исключаются.
- **`Step4Confirm.tsx`** — summary (operation + scope + eligible count), payload preview (per-type форматирование), DELETE confirm-phrase gate (Input + status=error если != 'DELETE').
- **`BulkOperationWizardModal.tsx`** — переписан: state (step, type, payload, preview, confirmPhrase, submitting), `runPreview()` автоматически при enter step 3, submit через `bulkOperationsApi.create({ previewToken, idempotencyKey: crypto.randomUUID() })` → `onSubmitted(id)` + close. Смена type / возврат на step 2 → reset preview.
- **Dependencies:** `react-window@^2.2.7` + `@types/react-window@^1.8.8`.

### Влияние на prod

Gated под `VITE_FEATURES_BULK_OPS=false` (cutover в PR-12). Full wizard flow работает.

### Проверки

- `npx tsc --noEmit` (frontend) → 0 errors.
- `npm run lint` → 0 новых warnings.
- Frontend unit-tests — vitest инфра отсутствует; Playwright e2e в PR-12.

### Связано

- TTBULK-1 — см. `docs/tz/TTBULK-1.md` §3.2, §8.1, §13.6 PR-9.

---

## [2.61] [2026-04-24] feat(bulk-ops): TTBULK-1 PR-9a — wizard skeleton + API client + types + BulkActionsBar кнопка

**PR:** [#151](https://github.com/NovakPAai/tasktime-mvp/pull/151) (merged 2026-04-24)
**Ветка:** `ttbulk-1/wizard-modal-a`

### Что было

Backend массовых операций полностью готов (PR-1..8: schema, auth, service, processor, 7 executors, SSE, runtime settings, admin-roles). Фронтенд пока не имел ни типов, ни клиента, ни UI — пользователь не мог запустить операцию из UI; всё вызывалось вручную через curl.

### Что теперь

- **`frontend/src/types/bulk.types.ts`** — зеркало backend DTO: `BulkOperationType` (7), `BulkOperationStatus` (6), `BulkScope` (ids/jql), `BulkOperationPayload` (discriminated union по type), `BulkPreviewResponse`, `BulkOperation`, `BulkOperationListResponse`, `BulkCreateResponse` + UI-хелперы `OPERATION_LABELS`, `STATUS_COLORS`, `BULK_OPS_MAX_ITEMS_HARD_LIMIT`, `isBulkOperationPayload` type-guard.
- **`frontend/src/api/bulkOperations.ts`** — typed client: `preview / create / get / cancel / listMine / retryFailed / downloadReport` + `streamUrl(id)` helper для PR-10 SSE hook. `Idempotency-Key` в HTTP-заголовке (match backend router contract).
- **`BulkOperationWizardModal.tsx`** — скелет 4-step Ant `Steps` + Modal, state reset на mount. Step1 реализован; Step2-4 — placeholder Alert.
- **`Step1PickOperation.tsx`** — Radio-список 7 типов с description'ами + DELETE warning tag.
- **Integration в `BulkActionsBar.tsx`**: кнопка «Массовые операции» gated под `features.bulkOps`. Modal close → `onCleared()`.

### Влияние на prod

Gated под `VITE_FEATURES_BULK_OPS=false` — кнопка не видна до cutover (PR-12).

### Проверки

- `npx tsc --noEmit` (frontend) → 0 errors.
- `npm run lint` — 0 новых warnings.
- Pre-push review: 🟠 2 → fixed (Idempotency-Key header drift, alreadyExisted stripped field), 🟡 3 → fixed.

### Связано

- TTBULK-1 — см. `docs/tz/TTBULK-1.md` §3.2, §8.1, §13.6 PR-9.

---

## [2.60] [2026-04-23] feat(bulk-ops): TTBULK-1 PR-8 — BULK_OPERATOR в admin-ролях + group-assign endpoints

**PR:** [#150](https://github.com/NovakPAai/tasktime-mvp/pull/150) (merged 2026-04-24)
**Ветка:** `ttbulk-1/admin-roles`

### Что было

Системная роль `BULK_OPERATOR` существовала в Prisma enum (PR-1), `UserGroupSystemRole` модель и `getEffectiveUserSystemRoles` UNION (PR-2) были готовы, но:
- В UI списке системных ролей (`AdminUsersPage.SYSTEM_ROLES`) BULK_OPERATOR отсутствовал — через прямой assign его нельзя было выдать.
- Эндпоинтов для назначения системных ролей группе не было (только DIRECT через `/admin/users/:id/system-roles`).
- `AdminGroupDetailPage` имел только 2 таба (Участники, Проектные роли); не было места назначать группе системные роли.
- Не было cross-view эндпоинта «кто имеет эту роль» (прямых + через группы).

### Что теперь

- **Backend endpoints:**
  - `POST /api/admin/user-groups/:id/system-roles` — грантит роль группе (idempotent + P2002 race-safe). Audit `system_role.granted`.
  - `DELETE /api/admin/user-groups/:id/system-roles/:role` — отзывает. Audit `system_role.revoked`.
  - `GET /api/admin/system-roles/:role/assignments` → `{ role, users, groups }` — cross-view.
- **Service** (`user-groups.service.ts`):
  - `grantSystemRoleToGroup(groupId, role, actor)` — **privilege-escalation guard** (ADMIN не может grant SUPER_ADMIN/ADMIN через группу) + idempotent upsert + P2002 catch + bulk-invalidation Redis-кэша членов.
  - `revokeSystemRoleFromGroup(groupId, role, actor)` — симметричный guard + delete + bulk-invalidation.
  - `getSystemRoleAssignments(role)` — parallel findMany по UserSystemRole + UserGroupSystemRole.
  - `detailInclude` расширен `systemRoles`.
- **DTO:** `grantGroupSystemRoleDto` с refine против `USER` (mandatory роль).
- **Frontend:**
  - `SystemRoleType` расширен `BULK_OPERATOR`.
  - `AdminUsersPage.SYSTEM_ROLES` добавил `BULK_OPERATOR`.
  - `AdminGroupDetailPage` — новый таб «Системные роли» с grant/revoke modal.
  - `api/user-groups.ts` — `grantSystemRole`, `revokeSystemRole` + типы `UserGroupSystemRole`, `SystemRoleAssignments`.

### Unit-тесты (+14 новых)

`bulk-operator-group-roles.unit.test.ts`: grant happy/idempotent/empty group/404/privilege-escalation ADMIN→SUPER_ADMIN=403/P2002 race; revoke happy/404/404-role-not-assigned/empty group; getSystemRoleAssignments two lists + empty.

### Влияние на prod

При `FEATURES_BULK_OPS=false` (текущее) — BULK_OPERATOR можно выдавать заранее перед cutover (PR-12). Кэш эффективных ролей инвалидируется — grant/revoke через группу работает в пределах 60с.

### Проверки

- `npx tsc --noEmit` → 0 errors (backend + frontend).
- `npm run test:parser` → 604/604 passed (+14 новых bulk-operator-group-roles с privilege-escalation regression).
- Pre-push review: 🟠 2 → fixed (privilege escalation + P2002 race), 🟡 2 → fixed, 🟡 1 skipped (false-positive).

### Связано

- TTBULK-1 — см. `docs/tz/TTBULK-1.md` §7.2, §13.6 PR-8.

---

## [2.59] [2026-04-23] feat(bulk-ops): TTBULK-1 PR-7 — runtime System settings для массовых операций (maxConcurrentPerUser / maxItems) + AdminSystemPage UI

**PR:** [#149](https://github.com/NovakPAai/tasktime-mvp/pull/149) (merged 2026-04-23)
**Ветка:** `ttbulk-1/system-settings`

### Что было

Лимиты `maxConcurrentPerUser` (3) и `maxItems` (10000) были захардкожены через ENV-variables (`BULK_OP_MAX_CONCURRENT_PER_USER`, `BULK_OP_MAX_ITEMS`) без возможности менять их без рестарта backend. В §11.1 ТЗ TTBULK-1 runtime-настройки заявлены как MUST-HAVE (SRE меняет кап по нагрузке, без деплоя).

### Что теперь

- **Backend `bulk-operations-settings.service.ts`** — `getBulkOpsSettings()` с in-memory (60s) + Redis (60s) кэшем; `setBulkOpsSettings(actorId, patch)` с upsert + инвалидацией обоих слоёв + audit. Clamp на read и write: `maxConcurrentPerUser ∈ [1..20]`, `maxItems ∈ [100..10000]`. Никогда не бросает (fallback на ENV при любых ошибках). Cache invalidation ДО audit — чтобы audit-failure не оставлял stale cache.
- **Admin endpoints** — `GET /api/admin/system-settings/bulk-operations` и `PATCH …` (оба `requireSuperAdmin()`). Zod-DTO `updateBulkOpsSettingsDto`.
- **Интеграция с bulk-operations.service**: `createBulkOperation`/`resolveScope` читают runtime-settings; safety-check на create (admin понизил maxItems между preview и create → 400).
- **Frontend AdminSystemPage.tsx** — секция «Массовые операции» + loadError Result fallback. Route под `AdminGate allow={canManageSystemSettings}`.

### Unit-тесты (+18 новых)

`bulk-operations-settings.unit.test.ts`: defaults, clamp, malformed JSON, cache HIT/DOWN, memo reset, partial patch, audit-failure → cache cleared, NaN edge.

### Проверки

- `npx tsc --noEmit` → 0 errors.
- `npm run test:parser` → 597/597 passed (+18 новых).

### Связано

- TTBULK-1 — см. `docs/tz/TTBULK-1.md` §11.1, §13.6 PR-7.

---

## [2.58] [2026-04-23] feat(bulk-ops): TTBULK-1 PR-6 — SSE + Redis pub/sub + report.csv + retry-failed

**PR:** [#148](https://github.com/NovakPAai/tasktime-mvp/pull/148) (merged 2026-04-23)
**Ветка:** `ttbulk-1/streaming-report`

### Что было

После PR-1..5 backend полностью работоспособен, но клиент не мог отслеживать прогресс live. Не было `/stream`, `/report.csv`, `/retry-failed`.

### Что теперь

- **Redis Pub/Sub helpers** в `shared/redis.ts`: `publishToChannel` + `createSubscriber` (duplicate-client для subscribe-mode node-redis v5).
- **Processor публикует events** после каждого batch'а: `progress` + per-item `item` + финальный `status`.
- **Router:** `GET /:id/stream` (SSE, heartbeat 20s, dedicated subscriber), `GET /:id/report.csv` (fast-csv streaming, cursor 1000/page), `POST /:id/retry-failed`.
- **`@fast-csv/format`** добавлен. **10 новых unit-тестов**.

### Проверки

- tsc ✅, lint 0 errors ✅, test:parser 589/589 (+10 новых).

### Связано

- TTBULK-1 — см. `docs/tz/TTBULK-1.md` §4.5, §6.6, §13.6 PR-6.

---

## [2.57] [2026-04-23] feat(bulk-ops): TTBULK-1 PR-5 — 6 executors (Assign / EditField / EditCustomField / MoveToSprint / AddComment / Delete)

**PR:** [#147](https://github.com/NovakPAai/tasktime-mvp/pull/147) (merged 2026-04-23)
**Ветка:** `ttbulk-1/executors`

### Что было

После PR-4 processor обрабатывал только TRANSITION (остальные 6 типов операций финализировали FAILED EXECUTOR_NOT_IMPLEMENTED). Registry `getExecutor(type)` возвращал null для остальных.

### Что теперь

Все 6 оставшихся executor'ов реализованы как `BulkExecutor<Payload>`. Registry обновлён — 7 типов работают end-to-end через processor. Каждый executor:
- **AssignExecutor** (NO_ACCESS / ALREADY_IN_TARGET_STATE / ELIGIBLE) → issues.assignIssue.
- **EditFieldExecutor** (priority / dueDate / description.append — поддерживаются; labels.* → INVALID_FIELD_SCHEMA т.к. схема не содержит поля).
- **EditCustomFieldExecutor** (INVALID_FIELD_SCHEMA через getApplicableFields).
- **MoveToSprintExecutor** (SPRINT_PROJECT_MISMATCH — cross-project в Phase 1 запрещён; null sprintId — unassign).
- **AddCommentExecutor** (comments.createComment + explicit audit — comments.service сам не пишет audit).
- **DeleteExecutor** (security gate: помимо `BULK_OPERATOR` требует проектную `ISSUES_DELETE`; audit ДО delete для forensics).

Все executor'ы пишут явный `AuditLog` с `bulkOperationId` из AsyncLocalStorage контекста (processor оборачивает execute через `runInBulkOperationContext`).

### Unit-тесты (27 новых)

`bulk-executors.unit.test.ts`: preflight-матрицы + execute-passthrough + SUPER_ADMIN bypass + audit-ordering для Delete.

### Влияние на prod

При `FEATURES_BULK_OPS=false` (default) — dormant. После активации в PR-12: все 7 операций end-to-end, forensics через `AuditLog.bulkOperationId`.

### Проверки

- `npx tsc --noEmit` → 0 errors.
- `npm run lint` → 0 errors, 0 new warnings.
- `npm run test:parser` → 575/575 passed (+27 новых).

### Связано

- TTBULK-1 (Bulk Operations) — см. `docs/tz/TTBULK-1.md` §6.1, §13.5 PR-5.

---

## [2.56] [2026-04-23] feat(bulk-ops): TTBULK-1 PR-4 — TransitionExecutor + processor (cron + recovery + retention)

**PR:** [#146](https://github.com/NovakPAai/tasktime-mvp/pull/146) (merged 2026-04-23)
**Ветка:** `ttbulk-1/processor`

### Что было

После PR-1..PR-3 созданы schema + auth effective roles + service-core (preview/create/cancel). Но **processor'а не было** — operation'ы оставались в QUEUED вечно, никто не дренил Redis-очередь `bulk-op:{id}:pending`. Не было ни реальных executor'ов, ни recovery после рестарта инстанса, ни retention cron'а.

### Что теперь

- **`shared/bulk-operation-context.ts`** — AsyncLocalStorage для `bulkOperationId`; processor оборачивает каждый `execute()` в `runInBulkOperationContext(opId, fn)`, а audit-записи в `workflow-engine.service.executeTransition` автоматически подтягивают id через `getCurrentBulkOperationId()` и проставляют колонку `audit_logs.bulk_operation_id` (§5.4). Вне bulk — контекст пуст → null (не затрагивает обычные HTTP-запросы).
- **`executors/transition.executor.ts`** — первый реальный `BulkExecutor<TransitionPayload>`:
  - **preflight-матрица:** NO_ACCESS (без SUPER/ADMIN и без UserProjectRole), NO_TRANSITION (transitionId нет в доступных), ALREADY_IN_TARGET_STATE, WORKFLOW_REQUIRED_FIELDS (CONFLICT с requiredFields, если не переданы fieldOverrides), ELIGIBLE + preview diff.
  - **execute:** вызывает существующий `executeTransition` под контекстом.
- **`executors/index.ts`** — registry с `getExecutor(type)`. PR-4 регистрирует только TRANSITION; остальные 6 — PR-5.
- **`bulk-operations.processor.ts`** — фоновый processor с 3 cron-задачами:
  - **tick** (default ~5с): Redis-lock `bulk-ops:tick` (TTL 30с) → `findFirst` QUEUED/RUNNING ORDER BY createdAt ASC → LPOP пачки 25 → per-item preflight+execute → createMany items + increment counters + heartbeat. Финализация когда `processed >= total`: SUCCEEDED (failed=0), PARTIAL (failed>0 && succeeded>0), FAILED (succeeded=0). Cancel → SKIPPED CANCELLED_BY_USER + финализация CANCELLED с дренажем queue.
  - **recovery** (default ~1 мин): stale `RUNNING` (heartbeat < now - 300с) → reset в QUEUED.
  - **retention** (default ночью): DELETE items > 30 дней + ops > 90 дней в терминальном статусе.
- **Redis helpers:** `lpopListBatch(key, count)` — `lPopCount` в node-redis v5 (Redis 6.2+).
- **`server.ts`** — запуск/стоп scheduler'а через `start/stopBulkOperationsScheduler` + drain на SIGTERM.
- **`workflow-engine.service.ts:executeTransition`** — +1 строка: `bulkOperationId: getCurrentBulkOperationId() ?? null` в auditLog.create. Обратно совместимо (NULL для не-bulk).

### Unit-тесты (21 новых)

- `bulk-operations-processor.unit.test.ts` (13 тестов): lock-skip, idle, QUEUED→RUNNING, eligible+skipped batch с finalize SUCCEEDED, CONFLICT→SKIPPED, EXECUTOR_ERROR → FAILED, deleted issue→SKIPPED DELETED, Redis-down → пропуск tick, неизвестный executor → EXECUTOR_NOT_IMPLEMENTED, cancel drain → CANCELLED, PARTIAL branch, SUCCEEDED с skipped, recovery, retention.
- `transition-executor.unit.test.ts` (8 тестов): NO_ACCESS / NO_TRANSITION / ALREADY_IN_TARGET_STATE / CONFLICT requiredFields / ELIGIBLE через override / SUPER_ADMIN bypass / preview diff shape / execute passthrough.

### Влияние на prod

- При `FEATURES_BULK_OPS=false` (default) — scheduler всё равно не запускается до PR-12; но даже если кто-то вручную выставит `BULK_OP_PROCESSOR_ENABLED=true` — без флага роут недоступен, никто не создаст операцию.
- **Memory pattern:** один lock глобальный — одна активная операция в мире за tick. Расширение до N-параллельных tick'ов по projectId — Phase 2.
- **`AuditLog.bulkOperationId`** теперь проставляется для issue.transitioned (PR-4 scope). Остальные 6 типов — PR-5 расширят, но без изменения сигнатуры функций благодаря AsyncLocalStorage.

### Проверки

- `npx tsc --noEmit` → 0 errors.
- `npm run lint` → 0 errors, 0 new warnings.
- `npm run test:parser` → 546/546 passed (21 новых в PR-4).

### Связано

- TTBULK-1 (Bulk Operations) — см. `docs/tz/TTBULK-1.md` §5.4, §6.3, §6.4, §13.5 PR-4.

---

## [2.55] [2026-04-23] feat(bulk-ops): TTBULK-1 PR-3 — service core (preview + create + cancel + list)

**PR:** [#145](https://github.com/NovakPAai/tasktime-mvp/pull/145) (merged 2026-04-23)
**Ветка:** `ttbulk-1/service-core`

### Что было

После PR-1 (schema) и PR-2 (effective roles) роутер `/api/bulk-operations/*` существовал только как stub-ping (501). Реальной бизнес-логики (dry-run, резолв scope, создание фоновой операции, pending-queue) не было.

### Что теперь

- **`bulk-operations.types.ts`** — контракт `BulkExecutor<P>` + `PreflightResult` discriminated union (ELIGIBLE/SKIPPED/CONFLICT). Реализации executor'ов — PR-4/PR-5; контракт нужен уже сейчас для типизации preflight-цикла в service'е.
- **`bulk-operations.dto.ts`** — Zod схемы: `scopeDto` (discriminated union ids|jql), `operationPayloadDto` (7 типов operation'ов), `previewBulkOperationDto`, `createBulkOperationDto`, `listQueryDto`. `MAX_ITEMS_HARD_LIMIT=10k` экспортируется как константа для service'а.
- **`bulk-operations.service.ts`** — 5 публичных функций:
  - `previewBulkOperation` — резолв scope → issueIds (для jql через `searchIssues`), silent-truncate + warning `TRUNCATED_TO_MAX_ITEMS` если total > limit, загрузка issue-metadata, per-item preflight (в PR-3 executor'ы — stubs ELIGIBLE), запись previewToken в Redis с TTL 15мин.
  - `createBulkOperation` — idempotency по `(createdById, idempotencyKey)`, owner-check previewToken'а, concurrency-quota (max 3 active/user), Redis availability check, создание `BulkOperation`, RPUSH eligibleIds в `bulk-op:{id}:pending`, audit-log, удаление previewToken (one-shot), rollback операции в FAILED если RPUSH упал после create.
  - `getBulkOperation` — 404 на чужую (не разглашаем существование).
  - `cancelBulkOperation` — idempotent (no-op в терминальном статусе), устанавливает `cancel_requested=true` + audit.
  - `listBulkOperations` — пагинированный список моих операций с фильтрами по status/type.
- **`bulk-operations.router.ts`** — 5 endpoints под `authenticate + requireRole('BULK_OPERATOR')`:
  - `POST /preview`, `POST /`, `GET /:id`, `POST /:id/cancel`, `GET /`
  - Rate-limit 30 req/min/user на preview + create.
  - `Idempotency-Key` header обязателен на POST / (UUID, 400 при отсутствии/невалидности).
  - `resolveAccessibleProjectIds` локально (консистентно с search.router.ts).
- **Redis helper `rpushList(key, values)`** в `shared/redis.ts` — RPUSH с graceful no-op при Redis-down.
- **21 pure-unit тест** в `tests/bulk-operations-service.unit.test.ts`.

### Влияние на prod

При `FEATURES_BULK_OPS=false` (default) роутер всё ещё не монтируется — код лежит dormant. Activation в PR-12 (UAT cutover). Processor (PR-4) ещё не написан, поэтому даже при включении флага operation'ы останутся в QUEUED навечно — это ожидаемо.

### Проверки

- `npx tsc --noEmit` → 0 errors.
- `npm run lint` → 0 errors, 0 new warnings.
- `npm run test:parser` → 523/523 passed (21 новых).

### Связано

- TTBULK-1 (Bulk Operations) — см. `docs/tz/TTBULK-1.md` §4, §13.4 PR-3.

---

## [2.54] [2026-04-23] feat(auth): TTBULK-1 PR-2 — effective system roles (DIRECT ∪ GROUP) + Redis TTL-cache

**PR:** [#144](https://github.com/NovakPAai/tasktime-mvp/pull/144) (merged 2026-04-23)
**Ветка:** `ttbulk-1/auth-effective-roles`

### Что было

`req.user.systemRoles` в `authenticate` middleware брались **напрямую из JWT-payload**'а. Это означает: после того как админ даёт юзеру системную роль (DIRECT), новая роль не начинает действовать до перелогина (JWT снапшотится при login). В TTBULK-1 добавлена ещё и **групповая** выдача системных ролей (`UserGroupSystemRole`), и TZ §5.5 требует, чтобы grant через группу (напр., добавили юзера в группу, которая уже имеет `BULK_OPERATOR`) срабатывал в пределах минуты без переавторизации.

### Что теперь

- **`getEffectiveUserSystemRoles(userId)`** в `shared/auth/roles.ts` — вычисляет UNION(DIRECT ∪ GROUP) через `prisma.userSystemRole` + `prisma.userGroupSystemRole { group: { members: { some: { userId } } } }`. Redis-TTL кэш 60с по ключу `user:sysroles:{userId}`.
- **`authenticate` middleware** после JWT-decode перезапрашивает эффективные роли через этот resolver. **Fail-open** паттерн: при любой ошибке (БД недоступна, Redis down) падает в JWT-роли, как в sliding-session fallback.
- **Инвалидация кэша** на всех точках изменения эффективного сета:
  - `users.service.addSystemRole` / `removeSystemRole` → `invalidateUserSystemRolesCache(targetId)`.
  - `user-groups.service.addMembers` / `removeMember` / `deleteGroup` → `invalidateUserSystemRolesCacheForUsers(affectedMembers)`.
  - (PR-8 добавит инвалидацию на `UserGroupSystemRole` grant/revoke).
- **Unit-тесты** (13 в `tests/effective-user-system-roles.unit.test.ts`): пустой сет, только DIRECT, только GROUP, UNION, dedupe (роль и в DIRECT и в GROUP, multiple group-assignments одной роли), cache-hit, cache-miss → БД + SET с TTL=60, инвалидация одиночная, bulk-инвалидация, bulk пустым массивом (no-op), формат ключа.

### Влияние на prod

- **Latency:** +1 Redis GET + (cache-miss) 2 parallel SELECT на `authenticate`. При cache-hit это ~0.5ms; при miss ~5-10ms. Фиксированный upper-bound на каждый запрос.
- **Consistency:** grant через группу срабатывает за ≤60с (TTL); revoke — сразу (инвалидация). Консистентно с TTSEC-2 TTL на проектные permissions.
- **Fallback:** при Redis/БД недоступности middleware возвращается к JWT-ролям (те же роли, что до PR-2) — zero downtime.

### Проверки

- `npx tsc --noEmit` → 0 errors.
- `npm run lint` → 0 errors, 0 new warnings.
- `npm run test:parser` → 501/501 passed (13 новых).

### Связано

- TTBULK-1 (Bulk Operations) — см. `docs/tz/TTBULK-1.md` §5.5, §13.4 PR-2.

---

## [2.53] [2026-04-23] docs(tz)+feat(bulk-ops): TTBULK-1 PR-1 — план реализации + schema foundation

**PR:** [#143](https://github.com/NovakPAai/tasktime-mvp/pull/143) (merged 2026-04-23)
**Ветка:** `ttbulk-1/schema`

### Что было

TZ TTBULK-1 (Bulk Operations) существовал как прозаический документ без детализованной декомпозиции на PR-ы: §13 содержал только табличный список из 13 пунктов без branches / scopes / merge-ready checks / security gates. Модели в схеме отсутствовали, feature-флага не было, модуля `bulk-operations` не существовало.

### Что теперь

- **Декомпозиция (§13).** Полный plan: §13.1 Стратегия (ветки, CI, pre-push review, security gates на PR-1/3/4/5), §13.2 DAG, §13.3–§13.8 карточки 13 PR-ов (branch/scope/не включает/merge-ready/оценка), §13.9 итоговая таблица (114ч ≈ 14.25 человеко-дней). Pre-push review (Opus 4.7) прогнан — 4 🟠 + 5 🟡 + 2 🔵 + 2 ⚪ применены.
- **Delta к ТЗ.** `IssueHistory` как Prisma-модели в репозитории нет — executor'ы пишут в `AuditLog`. Поэтому колонка `bulkOperationId` добавляется к `AuditLog` (а не к несуществующему `IssueHistory`). Полный sanitize §5.0/§5.4/§7.4/§14 деферен на PR-12.
- **PR-1 schema.** Миграция двухшаговая (Postgres требует `ALTER TYPE … ADD VALUE` вне транзакции):
  - `20260425000000_ttbulk_system_role_enum` — `ALTER TYPE "SystemRoleType" ADD VALUE 'BULK_OPERATOR'`.
  - `20260425000001_ttbulk_bulk_operations` — `CREATE TYPE` для `BulkOperationType / BulkOperationStatus / BulkItemOutcome`, `CREATE TABLE` для `bulk_operations / bulk_operation_items / user_group_system_roles`, `ALTER TABLE audit_logs ADD COLUMN bulk_operation_id` с FK `onDelete SetNull` + index.
- **Feature-flag.** `FEATURES_BULK_OPS=false` в `backend/src/shared/features.ts` (паттерн `advancedSearch`), `VITE_FEATURES_BULK_OPS=false` в `frontend/src/lib/features.ts`. Оба — в `.env.example`. Роутер `backend/src/modules/bulk-operations/bulk-operations.router.ts` — stub `GET /bulk-operations/ping` → 501. Mount в `app.ts` условный: `if (features.bulkOps) app.use('/api', bulkOperationsRouter)`.

### Влияние на prod

Миграция добавляет 3 новые таблицы (пустые), 1 колонку (`audit_logs.bulk_operation_id` nullable) и расширяет enum. Никакой миграции данных, обратно совместимо — существующий код не использует новые модели. При `FEATURES_BULK_OPS=false` (default) роутер не монтируется, поведение системы не меняется.

### Проверки

- `npx prisma format` → schema валидна.
- `npx prisma generate` → client генерируется без ошибок.
- `npx tsc --noEmit` → 0 errors в backend + frontend.
- `npm run lint` → 0 errors, 0 новых warnings.

### Связано

- TTBULK-1 (Bulk Operations) — см. `docs/tz/TTBULK-1.md`, PR-1/13.

---

## [2.52] [2026-04-22] docs(ttsrh-1): inline TTQL help page + Atlassian-style reference

**PR:** (to be filled after push)
**Ветка:** `docs/ttsrh-1-ttql-help-page`

### Что было

В шапке `/search` ссылка «справка» вела на `github.com/.../docs/tz/TTSRH-1.md`. Для пользователя без доступа к git / внутренней сети GitHub это был тупик — справки нет.

### Что теперь

- Новая страница `/search/help` (`SearchHelpPage.tsx`) — автономный пользовательский справочник по TTS-QL в формате Atlassian «Advanced searching reference»: TOC слева, sections сверху вниз (Введение / Структура / Приоритет / Типы данных / Операторы / Ключевые слова / Поля / Кастомные поля / Функции / ORDER BY / Сохранённые фильтры / Примеры / Ограничения).
- Для каждого типа данных и каждой функции добавлены inline-примеры вызовов (сгруппировано: пользовательские, даты и время, спринты/релизы, связи задач, контрольные точки).
- Ссылка «справка» в шапке `/search` теперь ведёт на `/search/help` и открывается в отдельной вкладке (`target="_blank"`). Внешний git-URL убран.
- Route `search/help` смонтирован под тем же feature flag `FEATURES_ADVANCED_SEARCH`, что и сама `/search`.

### Связано

- TTSRH-1 (Advanced Search) — пользовательская документация.

---

## [2.51] [2026-04-22] fix(ttsrh-1): post-release — unicode-aware autocomplete для кастомных полей

**PR:** (to be filled after push)
**Ветка:** `fix/ttsrh-1-cyrillic-cf-autocomplete`

### Что было

После деплоя v2.50 выяснилось: автокомплит не работает для кастомных полей с кириллическими / многословными именами (`"Мои задачи"`, `"工時"` и т.п.). Пользователь набирает `"Мо` — popup либо показывает весь список без фильтра, либо вставка разрушает текст типа `"Мо"Мои задачи"`.

### Корень

1. **Backend** (`search.suggest.position.ts`): токенизатор кидает `UNTERMINATED_STRING` на недописанной кавычке, `catch` возвращал `emptyField()` с пустым `prefix` — suggest-pipeline получал отрывочный ввод без контекста и отдавал весь список полей.
2. **Frontend** (`ttql-completion.ts`): `IDENT_RE = /[\w."-]*/` без флага `u`. В JavaScript `\w` = `[A-Za-z0-9_]`, кириллица не попадает → `context.matchBefore` даёт `from == cursor` (неверный диапазон вставки), а `validFor` закрывает popup при первом же не-ASCII символе.

### Что теперь

- **Backend** — `analysePosition` получил `recoverFromUnterminatedString`: режет по последней открывающей кавычке, токенизирует префикс-часть, оставляет typed suffix как `prefix` и прогоняет через `analyseAfterTokens`. Теперь `"Мои зад` → `{expected: 'field', prefix: 'Мои зад'}`.
- **Frontend** — `IDENT_RE` переписан в Unicode-aware `/[\p{L}\p{N}_."-]*/u`. `matchBefore` корректно захватывает кириллические слова; `validFor` держит popup открытым при наборе любых unicode-букв.
- **Тесты** — новый regression-case «Cyrillic multi-word custom field name in unterminated quotes → field context with prefix»; обновлён существующий `unterminated string → graceful fallback` (теперь корректно возвращает `value`-контекст с prefix'ом). 488 backend tests pass.
- **Документация** — в §13.9.2 добавлена строка #4 к таблице post-release фиксов.

### Связано

- TTSRH-1 (Advanced Search) — post-release hardening #2.

---

## [2.50] [2026-04-22] fix(ttsrh-1): post-release — reference values + suggest routing + custom-field columns

**PR:** (to be filled after push)
**Ветка:** `fix/ttsrh-1-post-release-references-suggest-columns`

### Что было

После merge эпика TTSRH-1 и включения UAT на staging всплыли три класса багов:
1. **Reference-поля возвращали пустой результат** — `project = "TTMP"`, `assignee = "alice@x.com"`, `sprint = "Sprint 1"`, `type = BUG`, `parent = "TTMP-123"` и т.д. Compiler клал строковый литерал напрямую в Prisma-фильтр на UUID-колонку; suggest при этом вставляет key / email / name / systemKey / issue-key — не UUID.
2. **Suggestions в редакторе игнорировали контекст курсора** — пользователь печатает `proj`, popup показывает `now()`, `today()`, `currentUser()` вместо полей. Backend trigger-ил Basic-builder shortcut по `prefix !== undefined` — а CM6 шлёт `prefix` на каждый keystroke для своей локальной фильтрации.
3. **Кастомные поля недоступны в ColumnConfigurator** — `AVAILABLE_COLUMNS` хардкод без schema-fetch; backend не включал `customFieldValues` в payload; добавление всех CF в список — плохой UX при большом каталоге.

### Что теперь

- **Reference resolver** — новый модуль `backend/src/modules/search/search.reference-resolver.ts`. Обходит AST, собирает литералы по reference-полям, одним батчем на каждое семейство (User / Sprint / Release / IssueTypeConfig / Issue / Project) резолвит через Prisma. Результат → `CompileContext.referenceValues`. Compiler подменяет литералы на row-id перед `wrapColumn(...)`. Неизвестные значения — scope-фильтр даёт 0 строк.
- **Suggest routing guard** — `backend/src/modules/search/search.suggest.ts` требует `ctx.field` для Basic-builder пути; только `prefix` → cursor-analysis path (editor mode).
- **Custom-field columns end-to-end**:
  - backend `searchIssues` Prisma `include` добавил `customFieldValues: { select: { customFieldId, value } }`;
  - `SearchPage.tsx` делает `getSearchSchema()` на mount и мёржит custom-имена в `AVAILABLE_COLUMNS`;
  - `ResultsTable.tsx` распаковывает `{v: ...}` envelope;
  - `ColumnConfigurator.tsx` — search-box + новый prop `primary` (при пустом вводе показываются только system, при наборе — фильтр по всему каталогу, JIRA-style).
- **Документация** — §5.2 / §5.5 / §5.8 / §5.11 обновлены; добавлен §13.9.2 «Post-release фиксы» с таблицей симптом → корень → фикс.
- **Тесты** — 7 новых в `search-compiler.unit.test.ts` (reference-value translation), 2 новых в `search-suggest.unit.test.ts` (routing guard). 487 backend tests pass.

### Связано

- TTSRH-1 (Advanced Search) — post-release hardening.

---

## [2.49] [2026-04-21] docs(ttsrh-1): PR-21 — Документация TTS-QL + feature flag cutover

**PR:** (to be filled after push)
**Ветка:** `ttsrh-1/docs-cutover`

### Что было

После PR-1..PR-20 эпика TTSRH-1 вся функциональность (TTS-QL поиск + сохранённые фильтры + экспорт + Value Suggesters + checkpoint TTQL) merged в main, но конечному пользователю негде прочитать, **как** этим пользоваться. Feature flag `FEATURES_ADVANCED_SEARCH` оставался `false` (ожидание UAT).

### Что теперь

- **`docs/user-manual/features/jql.md`** (новый, ~300L) — полный reference TTS-QL:
  - Быстрый старт + грамматика EBNF + литералы + операторы.
  - Реестр system-полей (Задача / Люди / Планирование / AI / КТ) с синонимами и операторами.
  - Раздел про кастомные поля с маппингом типов → операторов.
  - Все функции (User / Dates / Sprints / Releases / Issue-refs / Checkpoints).
  - Секция `ORDER BY` + 20+ примеров (каждодневные / сложные / КТ / custom-fields).
  - Ограничения MVP (WAS/CHANGED/FTS — Phase 2).
- **`docs/user-manual/features/search.md`** (новый, ~200L) — руководство по странице «Поиск задач»:
  - Схема 3-панельного layout'а + Basic vs Advanced сравнение.
  - Shortcut'ы (Ctrl+Enter, Ctrl+S, `/`, Esc).
  - Сохранённые фильтры: категории (Избранные / Общие / Поделены / Мои / Недавние), visibility levels, шаринг, права.
  - Колонки: конфигуратор, сохранение (per-filter / default).
  - Экспорт CSV/XLSX, bulk-actions (ADMIN/MANAGER).
  - URL-sync + горячие сценарии (standup / планирование спринта / release review / КТ pre-flight).
- **`docs/user-manual/features/checkpoints.md`** — добавлена секция «Режим условия: Structured / TTQL / Combined» (~70L):
  - Matrix-таблица сравнения режимов.
  - TTS-QL редактор в контексте КТ-variant (`releasePlannedDate()`, `checkpointDeadline()`, warning на `currentUser()`).
  - Preview-панель.
  - Структурный → TTQL конвертер (R21 manual-review).
  - Feature flag `FEATURES_CHECKPOINT_TTQL`, ошибки эвалуации (`state=ERROR`, `TTQL_ERROR`).
- **`docs/api/reference.md`** — добавлены разделы (~180L):
  - `/api/search/{issues, validate, suggest, export, schema}` — полный контракт с примерами, timeout'ами, rate-limit, error codes.
  - `/api/saved-filters/*` — CRUD + `/favorite`, `/share`, `/use`.
  - `/api/admin/checkpoint-types/preview` — dry-run with meta.ttqlSkippedByFlag / ttqlError поведение под флагом.
- **`docs/architecture/backend-modules.md`** — добавлены разделы (~60L):
  - Модуль `search` — pipeline (tokenizer → parser → validator → compiler → executor), эндпоинты, suggesters, безопасность.
  - Модуль `saved-filters` — модели, visibility, ключевые операции.
  - Checkpoint TTQL integration — трёх-ветвочный evaluator, feature flag, error handling.

### Изменения

- `docs/user-manual/features/jql.md` — **новый**.
- `docs/user-manual/features/search.md` — **новый**.
- `docs/user-manual/features/checkpoints.md` — + ~70L (секция TTQL).
- `docs/api/reference.md` — + ~180L (search + saved-filters + checkpoint preview).
- `docs/architecture/backend-modules.md` — + ~60L (модули search / saved-filters / checkpoint TTQL).
- `docs/tz/TTSRH-1.md` — §13.8 PR-20 → 🟢 Merged; PR-21 → 🚧 В работе.

### Влияние на prod

- **Документация** — zero runtime impact.
- **Feature flag cutover** (в отдельном deployment-change, не в этом PR):
  1. `FEATURES_ADVANCED_SEARCH=true` в **staging** → UAT run.
  2. После UAT signoff → `true` в **production**.
  3. `FEATURES_CHECKPOINT_TTQL=true` — отдельный UAT после стабилизации `FEATURES_ADVANCED_SEARCH`.

### Проверки

- Все ссылки между markdown-файлами проверены вручную.
- `docs/tz/TTSRH-1.md` §13.9 (итоговая таблица) — PR-20 → 🟢, PR-21 → 🚧.

### Что остаётся в follow-up

- **Phase 2 / TTSRH-23** — `WAS` / `CHANGED` с моделью `FieldChangeLog`.
- **Phase 2 / TTSRH-24** — `pg_trgm` + `unaccent` + PostgreSQL FTS.
- **TTSRH-38** (опционально) — MCP-tool `search_issues` для Agent SDK.
- **T-12** (shared-URL cross-user E2E) — wiring 2-го session-fixture.
- **Full T-19** — data-testid'ы на форму AdminReleaseCheckpointTypesPage.

---

## [2.48] [2026-04-21] feat(e2e): TTSRH-1 PR-20 — E2E smoke/axe + perf-seed harness + Lighthouse budget

**PR:** [#122](https://github.com/NovakPAai/tasktime-mvp/pull/122)
**Ветка:** `ttsrh-1/e2e-perf`

### Что было

После PR-19 весь бек/фронт `/search` и admin «КТ-TTQL» собран, но не покрыт end-to-end тестами. Нет инструментов для воспроизводимого perf-замера T-8 (p95 < 400ms на 100K) и нет бюджета bundle-size/a11y для `/search` (NFR-5 ≤ 160KB gzip initial).

### Что теперь

- **`frontend/e2e/specs/20-search.spec.ts`** — Playwright smoke + axe для `/search`:
  - Shell renders (3-панельный layout, все testid видны).
  - URL round-trip: ввод JQL через CM6 → Run → URL содержит `?jql=` → reload сохраняет state (**T-9**).
  - Save-модалка открывается из sidebar-кнопки, кнопка disabled при пустом JQL, Escape закрывает.
  - axe-core на wcag2a/aa — 0 critical/serious violations (A11Y-1..4).
  - Graceful skip если `FEATURES_ADVANCED_SEARCH` off в env.
- **`frontend/e2e/specs/21-checkpoints-ttql.spec.ts`** — Admin «Типы КТ» smoke + axe:
  - Страница `/admin/release-checkpoint-types` рендерится для ADMIN.
  - Create-type modal поднимает `checkpoint-condition-mode-control` + `condition-mode-segmented` (PR-18 wiring).
  - axe-core — 0 critical/serious violations.
  - **Полный T-19** (create TTQL → violations → COMBINED → regen → preview) отложен до wiring data-testid'ов на admin-form (next pass).
- **`backend/tests/fixtures/search-seed-100k.ts`** — seed-хелпер:
  - `seedSearchPerfFixture({ total, prisma, projectId, creatorId, seed })` — mulberry32-seeded детерминистичный генератор.
  - chunked `createMany` по 5_000 rows, idempotent-префикс `TT_PERF_SEED_` (pre-run `deleteMany`).
  - Auto-pick first Project + first non-bot User.
  - `npm run db:seed:search-100k` — opt-in (не в CI, для ops benchmark VM).
- **`.lighthouserc.json`** + **`.github/workflows/lighthouse.yml`**:
  - desktop preset, 3 runs, target `/search`.
  - assertions: performance ≥ 0.85 warn, accessibility ≥ 0.9 **error**, `resource-summary:script:size` ≤ 500KB error, uses-text-compression error.
  - workflow запускается на PR touch'ing frontend, `continue-on-error: true` (advisory) до стабилизации thresholds.

### Изменения

- `frontend/e2e/specs/20-search.spec.ts` — новый (~145L).
- `frontend/e2e/specs/21-checkpoints-ttql.spec.ts` — новый (~90L).
- `backend/tests/fixtures/search-seed-100k.ts` — новый (~130L).
- `backend/package.json` — + `db:seed:search-100k` script.
- `frontend/.lighthouserc.json` — новый.
- `.github/workflows/lighthouse.yml` — новый.
- `docs/tz/TTSRH-1.md` §13.7 PR-19 / §13.8 PR-20 / §13.9 — статусы обновлены (PR-19 → 🟢 Merged, PR-20 → 🚧 В работе).

### Влияние на prod

Нулевое. Все изменения:
- **Новые тестовые файлы** (не билдятся в prod-bundle).
- **Новый seed-скрипт** — opt-in, не запускается в CI.
- **Новый CI workflow** — advisory, `continue-on-error: true`, не блокирует merge.

### Проверки

- `npx tsc --noEmit` (frontend + backend) — 0 ошибок.
- `npm run lint` — pre-existing warnings only (не от этого PR).
- E2E локально не запускали (нужен запущенный frontend + API), гоняется в e2e-staging после merge.

### Известные ограничения / follow-ups

- **T-12** (shared-URL cross-user) — требует второго authenticated-session в `test.ts` fixtures. Follow-up.
- **Full T-19** (TTQL → violations → COMBINED → regen) — требует data-testid на `AdminReleaseCheckpointTypesPage` форму. Wiring — follow-up 30 мин.
- **Composite-индексы** по profiling (§3.3) — отдельная follow-up миграция, не в PR-20.

---

## [2.47] [2026-04-21] feat(checkpoint): TTSRH-1 PR-19 — Structured → TTQL one-way converter

**PR:** (to be filled after push)
**Ветка:** `ttsrh-1/checkpoint-converter`

### Что было

После PR-18 админы могли создавать TTQL/COMBINED checkpoints, но перевод старых STRUCTURED типов на TTQL приходилось делать вручную — читать criteria[] JSON и переписывать в TTS-QL с нуля.

### Что теперь

- **`convertCriteriaToTtql.ts`** — pure-function one-way конвертер всех 6 типов criterion (§5.12.9):
  - `STATUS_IN` → `statusCategory IN (...)` (single → `=`).
  - `DUE_BEFORE` → `due < checkpointDeadline() +/- Nd` (wire-up checkpointDeadline() в PR-17 follow-up).
  - `ASSIGNEE_SET` → `assignee IS NOT EMPTY`.
  - `CUSTOM_FIELD_VALUE` → `cf["id"] op value` (NOT_EMPTY/EQUALS/IN разные формы).
  - `ALL_SUBTASKS_DONE` / `NO_BLOCKING_LINKS` → `-- TODO` placeholder comment (нет прямого выражения без recursion, требуется manual review per R21).
  - `issueTypes` фильтр → префикс-clause `(type IN (...)) AND (body)`.
- **UI кнопка** «Сконвертировать structured-критерии в TTS-QL (draft)» в форме `AdminReleaseCheckpointTypesPage`:
  - Видна когда mode STRUCTURED или COMBINED.
  - Click → генерирует draft, переключает режим в COMBINED, вставляет в TTQL-editor.
  - `message.success` хинт «Проверьте и отредактируйте перед сохранением» — R21 requires manual review.
  - НЕ автосохраняет — save остаётся за пользователем.

### Изменения

- `frontend/src/components/releases/convertCriteriaToTtql.ts` — новый (~90L).
- `frontend/src/pages/admin/AdminReleaseCheckpointTypesPage.tsx` — + import + «Сконвертировать» button.
- `docs/tz/TTSRH-1.md` §13.7/§13.9 — статус PR-19 → ✅ Done.

### Влияние на prod

Pure-function utility — zero runtime impact. UI button виден только в admin interface (required role SUPER_ADMIN/ADMIN/RELEASE_MANAGER). Никаких новых deps, bundle unchanged.

### Проверки

- `npx tsc --noEmit` (frontend) — чисто
- `npm run lint` — 0 errors
- `npm run build` — чисто, 4.50s

---

## [2.46] [2026-04-21] feat(checkpoint): TTSRH-1 PR-18 — Checkpoint admin UI: mode-toggle + JqlEditor + preview panel

**PR:** (to be filled after push)
**Ветка:** `ttsrh-1/checkpoint-admin-ui`

### Что было

После PR-17 endpoint `/admin/checkpoint-types/preview` был готов backend-wise, но UI оставался чисто structured — пользователь не мог создать TTQL/COMBINED checkpoint type и не имел инструмента dry-run перед сохранением.

### Что теперь

- **`api/release-checkpoint-types.ts`** — + `CheckpointConditionMode` type, + optional `conditionMode`/`ttqlCondition` в `CheckpointType` / `CreateCheckpointTypeBody`, + `previewCheckpointCondition(body)` → `/admin/checkpoint-types/preview`.
- **`components/releases/CheckpointConditionModeControl.tsx`** — AntD `Segmented` (STRUCTURED/TTQL/COMBINED) + условно lazy-loaded `JqlEditor` (PR-10) для TTQL/COMBINED. Переключение режима НЕ стирает criteria/ttqlCondition state (R20). `CheckpointConditionModeIcon` — inline S/Q/S+Q иконка для таблицы с tooltip.
- **`components/releases/CheckpointPreviewPanel.tsx`** — AntD Card с Release-select + «Рассчитать». Breakdown (applicable/passed/violated) + state badge + top-10 violations. Alerts на `meta.ttqlSkippedByFlag` и `meta.ttqlError`.
- **`AdminReleaseCheckpointTypesPage.tsx`** — integration: state conditionMode/ttqlValue вне Form (мгновенный re-render toggle); openCreate/openEdit + handleSave пропагируют новые fields; форма показывает mode-toggle всегда, criteria section conditional (STRUCTURED/COMBINED), TTQL-editor внутри control (TTQL/COMBINED), preview panel всегда. Releases preloaded через `listReleasesGlobal({limit:100})` silent-fail.
- Иконка режима в таблице «Название» column.

### Изменения

- `frontend/src/api/release-checkpoint-types.ts` — + conditionMode/ttqlCondition + previewCheckpointCondition.
- `frontend/src/components/releases/CheckpointConditionModeControl.tsx` — новый.
- `frontend/src/components/releases/CheckpointPreviewPanel.tsx` — новый.
- `frontend/src/pages/admin/AdminReleaseCheckpointTypesPage.tsx` — integration + mode-icon.
- `docs/tz/TTSRH-1.md` §13.7/§13.9 — статус PR-18 → ✅ Done.

### Влияние на prod

Под `VITE_FEATURES_ADVANCED_SEARCH=false` JqlEditor chunk не грузится; mode-toggle виден, но TTQL-editor требует CodeMirror (lazy chunk), грузится by-demand. Backend gate `FEATURES_CHECKPOINT_TTQL=false` → preview ttqlSkippedByFlag=true, UI показывает баннер.

### Проверки

- `npx tsc --noEmit` (frontend) — чисто
- `npm run lint` (frontend) — 0 errors
- `npm run build` — чисто, 4.54s; JqlEditor chunk без изменений.

---

## [2.45] [2026-04-21] feat(checkpoint): TTSRH-1 PR-17 — /admin/checkpoint-types/preview + suggesters sync

**PR:** (to be filled after push)
**Ветка:** `ttsrh-1/checkpoint-search-integration`

### Что было

После PR-16 engine TTQL-ветка была реализована, но admin UI (PR-18) нужен dry-run endpoint: «как этот TTQL поведёт себя на живых данных конкретного релиза» — без сохранения и без триггеринга webhooks. Без него UI не может показать preview в форме создания/редактирования КТ.

### Что теперь

- **`checkpoint-preview.service.previewCheckpointCondition`** — новый dry-run сервис:
  - Переиспользует `evaluateCheckpoint` + `resolveTtqlMatchedIds` — zero drift между preview и production scheduler.
  - Валидирует релиз (404 если не найден, 400 если нет plannedDate).
  - Rate-limit + 5s timeout наследуются из `resolveTtqlMatchedIds` (R16).
  - Возвращает полный `CheckpointEvaluationResult` + `meta` (`totalIssuesInRelease`, `ttqlSkippedByFlag`, `ttqlError`) — UI debug panel.
  - Feature-flag gate: если `FEATURES_CHECKPOINT_TTQL=false` и caller запрашивает TTQL/COMBINED preview, meta.ttqlSkippedByFlag=true, эвалуация fall-back'ит к STRUCTURED.
- **`POST /api/admin/checkpoint-types/preview`** — новый endpoint с Zod `previewCheckpointConditionDto` (releaseId UUID, conditionMode default STRUCTURED, optional criteria/ttqlCondition ≤10K/offsetDays/warningDays). RBAC наследуется от `checkpoint-types.router` — `SUPER_ADMIN | ADMIN | RELEASE_MANAGER`.
- **Suggesters sync**: `CHECKPOINT_STATE_VALUES` в `search.suggest.static.ts` приведены в соответствие с Prisma enum `CheckpointState` = `PENDING | OK | VIOLATED | ERROR` (ERROR добавлен в PR-16). Раньше было placeholder'ом `['PENDING', 'ON_TRACK', 'WARNING', 'OVERDUE', 'ERROR', 'SATISFIED']` из design-doc.
- **`checkpointsatrisk` description**: обновлена со ссылкой на VIOLATED/ERROR (не WARNING/OVERDUE).
- **`search-suggest.unit.test.ts`**: test `by type: CHECKPOINT_STATE` обновлён — проверяет VIOLATED + ERROR, отрицательный ассерт на OVERDUE.
- **`checkpoint-dto.unit.test.ts`**: +5 unit-кейсов для `previewCheckpointConditionDto` (STRUCTURED accept, TTQL accept, non-uuid reject, 10K+ reject, mode default).

### Deferred в follow-up (не блокирует PR-18)

- Function resolvers для `violatedcheckpoints` / `violatedcheckpointsof` / `checkpointsatrisk` / `checkpointsinstate` — требуют Prisma queries через ReleaseCheckpoint + JOIN ReleaseItem + профилировки индекса `@@index([resolvedAt, releaseCheckpointId])`. Currently: default-branch в `search.function-resolver.ts` возвращает `resolve-failed` → compiler → engine state=ERROR с явным reason (loud, not silent NULL).
- Compiler-mapping для `hasCheckpointViolation` / `checkpointViolationType` / `checkpointViolationReason` system-fields — join-based query, требует отдельного raw SQL с Prisma.sql-guard.
- Suggesters уже wired в PR-6 (`CheckpointTypeSuggester` через Prisma, `CheckpointStateSuggester` через enum literal).

### Изменения

- `backend/src/modules/releases/checkpoints/checkpoint-preview.service.ts` — новый.
- `backend/src/modules/releases/checkpoints/checkpoint.dto.ts` — + `previewCheckpointConditionDto`.
- `backend/src/modules/releases/checkpoints/checkpoint-types.router.ts` — + `POST /preview`.
- `backend/src/modules/search/search.suggest.static.ts` — CHECKPOINT_STATE_VALUES sync.
- `backend/src/modules/search/search.functions.ts` — checkpointsatrisk description fix.
- `backend/tests/search-suggest.unit.test.ts` — CHECKPOINT_STATE test update.
- `backend/tests/checkpoint-dto.unit.test.ts` — +5 preview DTO tests (22 total).
- `docs/tz/TTSRH-1.md` §13.7/§13.9 — статус PR-17 → ✅ Done.

### Влияние на prod

Под `FEATURES_CHECKPOINT_TTQL=false` preview работает, но TTQL-часть evaluate'ится как STRUCTURED (meta.ttqlSkippedByFlag=true). UI получает warning-state и может показать баннер. При `=true` (UAT) — полноценный dry-run с TTQL pipeline.

### Проверки

- `npx tsc --noEmit` — чисто
- `npm run lint` — 0 errors
- `npm run test:parser` — **464/464 passing** (+5 preview DTO tests)

---

## [2.44] [2026-04-21] feat(checkpoint): TTSRH-1 PR-16 — Checkpoint engine TTQL branch + error handling

**PR:** (to be filled after push)
**Ветка:** `ttsrh-1/checkpoint-engine`

### Что было

После PR-15 foundation (схема + DTO + snapshot-пропагация) был готов, но evaluator игнорировал `conditionModeSnapshot`/`ttqlSnapshot` — работал только через structured path. TTQL/COMBINED чекпоинты создаваться могли, но оценивались как STRUCTURED. Валидация и снапшоты были inert до merge engine'а.

### Что теперь

`evaluateCheckpoint` теперь знает про три mode'а + обрабатывает TTQL compile/exec failure как ERROR-state:

- **`checkpoint-engine.service.ts`** — `CheckpointEvaluationInput` расширен: `conditionMode?` (default STRUCTURED), `ttqlMatchedIds?: ReadonlySet<string> | null`, `ttqlError?: string | null`.
  - Fast-path: `ttqlError != null` → state=`ERROR` + single synthetic `TTQL_ERROR` violation с стабильным hash (R16, FR-31).
  - STRUCTURED: existing pure behavior unchanged (backward-compat — вызовы без conditionMode работают).
  - TTQL: все issues applicable, passed iff `ttqlMatchedIds.has(id)`, violations с `criterionType='TTQL_MISMATCH'`.
  - COMBINED: structured-first (failed → short-circuit); если structured passed, доп. TTQL check. Issue fails COMBINED если хотя бы один из двух путей failed, но violation пишется только один раз.
- **`checkpoint-ttql-evaluator.service.ts`** (новый) — async Prisma-backed resolver:
  - `resolveTtqlMatchedIds(ttql, {now, applicableIssueIds, accessibleProjectIds})` → `{matchedIds, error}`.
  - Reuses полный pipeline: `parse` → `validate(variant='checkpoint')` → `resolveFunctions` → `compile` → `executeCustomFieldPredicates` → `prisma.issue.findMany({where: AND[compiled, {id: {in: applicableIds}}]})`.
  - Hard timeout 5с через `Promise.race` vs `setTimeout` — любая фаза включена в бюджет (R16).
  - Never throws: parse/validate/compile/exec errors + timeout → `{matchedIds: new Set(), error}` (caller → ERROR state).
- **Prisma migration `20260424000001_ttsrh_checkpoint_state_error`**:
  - `ALTER TYPE CheckpointState ADD VALUE IF NOT EXISTS 'ERROR'`.
  - Existing rows unchanged — только new code emits ERROR.
- **`release-checkpoints.service.recomputeForRelease`** — wire'нут TTQL path:
  - `maybeResolveTtqlIds` — helper, проверяет `features.checkpointTtql` sub-flag. Если OFF → skipped=true → caller falls back к STRUCTURED path (TZ §13.7 PR-16: «Под флагом FEATURES_CHECKPOINT_TTQL=false ветка TTQL не выполняется, conditionMode=TTQL/COMBINED саммится как NOOP до включения флага»).
  - Если ON → compiles TTQL через resolver, передаёт `{matchedIds, error}` в engine.
  - `loadAllProjectIds()` lazy helper: system-level scheduler scope через `prisma.project.findMany`. Memoized per-recompute — не fetch'ится для releases с только STRUCTURED чекпоинтами (zero-cost для 100% existing prod).
- **`checkpoint.types.ts`**: `CheckpointViolationType = CheckpointCriterionType | 'TTQL_MISMATCH' | 'TTQL_ERROR'`. `CheckpointViolation.criterionType` теперь union — hash payload остаётся uniform.
- **Unit tests `checkpoint-engine-ttql.unit.test.ts`**: 9 pure-function кейсов:
  - STRUCTURED (×2): default behavior backward-compat + ttqlMatchedIds ignored при conditionMode=STRUCTURED.
  - TTQL (×5): все applicable with match, empty set → all fail, null matched → all fail, ttqlError → ERROR state, violationsHash stability.
  - COMBINED (×2): BOTH required for pass + pending deadline override.
- Добавлен в `test:parser` script.

### Backward-compat (FR-25)

1. **Existing callers без conditionMode**: `evaluateCheckpoint({criteria, deadline, …})` без новых полей — mode default'ом STRUCTURED, behavior идентичен pre-PR-16.
2. **Existing rows в production**: `condition_mode_snapshot = 'STRUCTURED'`, `ttql_snapshot = NULL` (из PR-15 default). `maybeResolveTtqlIds` fast-path'ит как `{matchedIds: null, skipped: false}` → engine не дёргается TTQL logic, existing `violationsHash` стабилен.
3. **Feature-flag off в prod**: даже если caller создал TTQL/COMBINED чекпоинт, `features.checkpointTtql=false` → skipped=true → engine fallback к STRUCTURED. Чекпоинт НЕ попадает в VIOLATED из-за TTQL — прозрачно до UAT.

### Изменения

- `backend/src/modules/releases/checkpoints/checkpoint.types.ts` — + `CheckpointViolationType` union.
- `backend/src/modules/releases/checkpoints/checkpoint-engine.service.ts` — + conditionMode/ttqlMatchedIds/ttqlError branches + ERROR fast-path.
- `backend/src/modules/releases/checkpoints/checkpoint-ttql-evaluator.service.ts` — новый (5s timeout, never-throws).
- `backend/src/modules/releases/checkpoints/release-checkpoints.service.ts` — + maybeResolveTtqlIds + loadAllProjectIds + wiring в recomputeForRelease.
- `backend/src/prisma/schema.prisma` — + `ERROR` в `CheckpointState`.
- `backend/src/prisma/migrations/20260424000001_ttsrh_checkpoint_state_error/migration.sql` — новый.
- `backend/tests/checkpoint-engine-ttql.unit.test.ts` — новый (9 unit-кейсов).
- `backend/package.json` — `test:parser` включает новый тест.
- `docs/tz/TTSRH-1.md` §13.7/§13.9 — статус PR-16 → ✅ Done.

### Влияние на prod

Feature-flag `FEATURES_CHECKPOINT_TTQL=false` в prod → schema + engine готовы, но не выполняются для TTQL/COMBINED чекпоинтов. Зелёные CI тесты проверяют backward-compat: все existing STRUCTURED тесты продолжают проходить.

### Проверки

- `npx tsc --noEmit` — чисто
- `npm run lint` — 0 errors, 0 new warnings
- `npx prisma generate` — чисто
- `npx vitest tests/checkpoint-engine-ttql.unit.test.ts` — **9/9 passing**

---

## [2.43] [2026-04-21] feat(checkpoint): TTSRH-1 PR-15 — Checkpoint TTQL foundation (schema + DTO superRefine)

**PR:** (to be filled after push)
**Ветка:** `ttsrh-1/checkpoint-foundation`

### Что было

После PR-14 вся search-часть (§13.6) была closed, но CheckpointType продолжал evaluate'ить только через `criteria[]` (STRUCTURED mode). Бизнес-кейс §5.12.5 («КТ с гибридным условием — структурное + TTQL») был недоступен. UI (PR-18) и engine (PR-16) не могли начаться без foundation-миграции и DTO contract'а.

### Что теперь

Foundation для TTQL-ветки Checkpoint evaluator'а (engine в PR-16):

- **Prisma migration `20260424000000_ttsrh_checkpoint_ttql`**:
  - Новый enum `CheckpointConditionMode` (`STRUCTURED | TTQL | COMBINED`).
  - `checkpoint_types`: `condition_mode` (NOT NULL DEFAULT `STRUCTURED`), `ttql_condition` (TEXT, nullable).
  - `release_checkpoints`: `ttql_snapshot` (TEXT, nullable), `condition_mode_snapshot` (NOT NULL DEFAULT `STRUCTURED`). Immutable snapshot — evaluator'у нужен snapshot на момент создания ReleaseCheckpoint, потому что parent CheckpointType может быть изменён позже (FR-25 backward-compat, R21).
  - Все existing rows получают `STRUCTURED` через PostgreSQL DEFAULT при `ADD COLUMN` — zero downtime, нет явного UPDATE.
  - Миграция идемпотентна (создаёт enum + ADD COLUMN'ы, оба no-op при повторном `migrate deploy`).
- **Prisma schema**: модели `CheckpointType` и `ReleaseCheckpoint` обновлены с `conditionMode`/`ttqlCondition` и `conditionModeSnapshot`/`ttqlSnapshot` полями. Комментарии поясняют FR-25 backward-compat.
- **`checkpoint.dto.ts`** — расширен:
  - `conditionModeEnum` (Zod `z.enum(['STRUCTURED','TTQL','COMBINED'])`).
  - `ttqlConditionSchema` (`z.string().min(1).max(10_000).nullable().optional()`) — 10K лимит зеркалит `/search/issues`.
  - `checkpointTypeBase` (общее тело) + `createCheckpointTypeDto` с `superRefine` cross-field check:
    - STRUCTURED → criteria required (min 1), ttqlCondition запрещён.
    - TTQL → ttqlCondition required (non-empty after trim), criteria любые (evaluator игнорирует).
    - COMBINED → оба required.
  - `updateCheckpointTypeDto` (partial) skip'ает cross-field check если `conditionMode` absent — plain PATCH работает. Если conditionMode присутствует — validate правило для нового mode'а.
- **TTQL checkpoint-функции** — уже wired в PR-5 (`releasePlannedDate()`, `checkpointDeadline()` с `availableIn: ['checkpoint']`) и validator с `variant: 'checkpoint'` — в PR-3. Proven вместе с foundation'ом.
- **`tests/checkpoint-dto.unit.test.ts`** — 15 unit-кейсов pure-function:
  - STRUCTURED (×4): default accept, empty criteria reject, ttqlCondition reject, explicit null OK.
  - TTQL (×4): TTQL-only accept (criteria [] OK), empty reject, whitespace reject, missing reject.
  - COMBINED (×3): both required accept, empty criteria reject, empty ttqlCondition reject.
  - PATCH (×4): без conditionMode → skip, TTQL→accept с ttql, TTQL→reject без ttql, STRUCTURED→reject с ttql.
- **`backend/package.json`** — `test:parser` включает новый `checkpoint-dto.unit.test.ts`.

### Backward-compat (FR-25, R21)

- Все existing `CheckpointType` rows имеют `condition_mode = 'STRUCTURED'` и `ttql_condition = NULL` после миграции — evaluator'у в PR-16 достаточно проверить `condition_mode === 'STRUCTURED'` и fallback к existing path.
- Existing `ReleaseCheckpoint` rows имеют `condition_mode_snapshot = 'STRUCTURED'` и `ttql_snapshot = NULL` — проверка `violationsHash` стабильна (reasons-порядок не меняется).

### Изменения

- `backend/src/prisma/schema.prisma` — + enum, + 4 fields.
- `backend/src/prisma/migrations/20260424000000_ttsrh_checkpoint_ttql/migration.sql` — новый.
- `backend/src/modules/releases/checkpoints/checkpoint.dto.ts` — + conditionMode/ttqlCondition + superRefine.
- `backend/tests/checkpoint-dto.unit.test.ts` — новый (15 unit-кейсов).
- `backend/package.json` — `test:parser` включает новый тест.
- `docs/tz/TTSRH-1.md` §13.7/§13.9 — статус PR-15 → ✅ Done.

### Влияние на prod

Под feature-flag `FEATURES_CHECKPOINT_TTQL=false` (default) engine TTQL-ветки (PR-16) не будет выполняться — новые поля чисто data-only. Existing КТ evaluate через structured path unchanged. При `=true` (после merge PR-16 + UAT) TTQL/COMBINED КТ начнут evaluate'иться.

### Проверки

- `npx tsc --noEmit` — чисто
- `npm run lint` — 0 errors, 0 new warnings
- `npx prisma generate` — чисто
- `npx vitest run tests/checkpoint-dto.unit.test.ts` — **15 passing**

---

## [2.42] [2026-04-21] feat(frontend): TTSRH-1 PR-14 — ColumnConfigurator + ResultsTable + BulkActions + ExportMenu

**PR:** (to be filled after push)
**Ветка:** `ttsrh-1/results`

### Что было

После PR-13 SearchPage имел sidebar и модалки, но основная центральная панель показывала «preview до 20 строк». Не было: (a) настройки колонок, (b) сортировки, (c) bulk-операций, (d) экспорта текущего фильтра. Последний frontend-PR по §13.6 закрывает эти gaps.

### Что теперь

4 новых компонента + integration в SearchPage:

- **`frontend/src/components/search/ColumnConfigurator.tsx`** (~170L) — native HTML5 drag-n-drop между списками Available/Selected. Reorder внутри Selected drag-over-drop'ом. Без react-dnd dependency (11h эстимат не позволяет). Кнопка-стрелка на item'е в Available — быстрое добавление. Duplicate-guard: drop того же имени дважды в Selected — ignore.
- **`frontend/src/components/search/ResultsTable.tsx`** (~180L) — Ant Table:
  - `rowKey="id"` — стабильные UUID (pre-push-reviewer pattern).
  - `virtual={issues.length > 200}` + `scroll={y: 480}` для больших результатов.
  - Renderer'ы per column: priority с цветной `<Tag>` (CRITICAL red → LOW default), key monospace + blue, status Tag, даты через `toLocaleDateString`. Custom-field fallback через `String(v)`.
  - Click по sortable header → `rewriteOrderBy(jql, field, dir)` → `onJqlChange`. 3-way toggle: none → descend → ascend → none (AntD default).
  - `rowSelection.onChange` → `onSelectionChange(ids)` для BulkActionsBar.
  - Pagination через Ant Table controlled props.
- **`frontend/src/components/search/BulkActionsBar.tsx`** (~140L) — появляется при `selectedIds.length > 0`:
  - Delete через Popconfirm: `Promise.allSettled(ids.map(DELETE /issues/:id))` → aggregate `{succeeded, failed}` (R12).
  - Export CSV/XLSX selected через ad-hoc JQL `issue IN (id1, id2, …)`.
  - «Снять выделение» — очистить selectedIds.
- **`frontend/src/components/search/ExportMenu.tsx`** (~70L) — Dropdown CSV/XLSX для текущего фильтра:
  - `exportIssues(jql, format, columns)` → `Blob` → `saveAs` pattern (attach `<a>` to DOM, click, `setTimeout(0)`-revoke — PR-8 pre-push-reviewer anti-race Firefox/Safari).
  - Disabled при пустом JQL / busy.
- **`frontend/src/pages/SearchPage.tsx`** — integration:
  - Preview-список удалён.
  - `selectedRowIds` state, `displayedColumns = state.columns || DEFAULT_COLUMNS`, `AVAILABLE_COLUMNS` list.
  - Popover с ColumnConfigurator + кнопка «Колонки» (SettingOutlined).
  - ExportMenu в правой части header results.
  - BulkActionsBar рендерится над таблицей при selection.
  - `onJqlChange` от таблицы → `updateUrl({jql, page: 1}, {push: true})`.
  - `onSaved` в ColumnConfigurator → `updateUrl({columns}, {push: false})` (replace, без истории на каждый drag).
  - `state.columns` автоматически сохраняется в URL.

### Изменения

- `frontend/src/components/search/ColumnConfigurator.tsx` — новый.
- `frontend/src/components/search/ResultsTable.tsx` — новый.
- `frontend/src/components/search/BulkActionsBar.tsx` — новый.
- `frontend/src/components/search/ExportMenu.tsx` — новый.
- `frontend/src/pages/SearchPage.tsx` — integration, selectedIds state, column-config Popover.
- `docs/tz/TTSRH-1.md` §13.6/§13.9 — статус PR-14 → ✅ Done.

### Влияние на prod

Под `VITE_FEATURES_ADVANCED_SEARCH=false` — без изменений. При `=true`:
- Полноценная таблица с сортировкой, пагинацией, выбором строк.
- Колонки настраиваются через drag-n-drop и сохраняются в URL.
- Bulk-delete + bulk-export для выделенных задач.
- Общий export текущего фильтра через ExportMenu.

### Проверки

- `npx tsc --noEmit` — чисто
- `npm run lint` — 0 errors, 0 new warnings
- `npm run build` — чисто, 4.45s. Main bundle +2.5KB gzip (AntD Table/Popover/Dropdown уже в main). JqlEditor chunk без изменений.

---

## [2.41] [2026-04-21] feat(frontend): TTSRH-1 PR-13 — SavedFiltersSidebar + Save/Share modals + Zustand store

**PR:** (to be filled after push)
**Ветка:** `ttsrh-1/saved-filters-ui`

### Что было

После PR-12 SearchPage уже имел JqlEditor + BasicFilterBuilder, но backend'овые фильтры (CRUD + share из PR-7) не имели UI. Левая колонка была placeholder'ом «Список появится в PR-13». Пользователи не могли сохранять, делить и переиспользовать запросы.

### Что теперь

Полноценный UI для SavedFilters c 5 списками + 2 модалками + Ctrl+S:

- **`frontend/src/store/savedFilters.store.ts`** (~130L) — Zustand-стор:
  - 5 scope'ов: `mine / favorite / public / shared / recent` (recent — client-side compute на mine sorted by lastUsedAt DESC, top 10).
  - `load(scope)` / `loadAll()` (параллельный Promise.all).
  - `create / update / remove / toggleFavorite / share` — тонкие обёртки над `api/savedFilters`, каждая завершается `loadAll()` для синхронизации между списками (filter может переехать из mine → shared → public после изменения visibility).
  - Ошибки сохраняются в `error`, не throw'ятся — UI решает как показывать.
- **`frontend/src/components/search/SaveFilterModal.tsx`** (~170L) — Ant Design Modal с Form-validation:
  - Поля: name (required ≤200), description (≤2000), jql (readonly preview), visibility (Select PRIVATE/SHARED/PUBLIC), isFavorite (Switch).
  - Обрабатывает create и update через `initial` prop.
  - PUBLIC → Alert-warning (R11 из §5.9).
  - Favorite toggling — отдельный endpoint, вызывается только если значение изменилось.
  - `onClose` / `onCancel` / backdrop / Esc → все триггерят parent `load()` (CLAUDE.md).
- **`frontend/src/components/search/FilterShareModal.tsx`** (~160L) — управление visibility + sharing:
  - Visibility switch (PRIVATE/SHARED/PUBLIC).
  - При SHARED — multi-select пользователей из `/api/users` + permission READ/WRITE.
  - Copy-link кнопка: `${origin}/search/saved/:id` → `navigator.clipboard.writeText` + AntD `message.success`.
  - Replace-semantics: visibility → update(), затем `share({users, permission})`.
- **`frontend/src/components/search/SavedFiltersSidebar.tsx`** (~220L) — левая колонка:
  - 5 collapsible sections через native `<details>`-style buttons с `aria-expanded`.
  - Per-item actions: favorite toggle (⭐), share (если permission=WRITE), delete (Popconfirm, только для mine).
  - Active highlight: `jql === currentJql` подсвечивает текущий фильтр.
  - Tooltip на item — показывает description || jql.
- **`frontend/src/pages/SearchPage.tsx`** — integration:
  - Placeholder-секция заменена на `<SavedFiltersSidebar>` + кнопка «+ Сохранить».
  - `saveModalOpen / shareModalFilter` — local state модалок.
  - `Ctrl/Cmd+S` hotkey → openSaveModal (preventDefault на browser "Save Page"). Игнорируется на пустом JQL.
  - Select-filter из sidebar → `updateUrl` + fire-and-forget `markSavedFilterUsed`.
  - Все onClose/onSaved вызывают `loadAllSavedFilters()` — CLAUDE.md FR-18.

### Изменения

- `frontend/src/store/savedFilters.store.ts` — новый.
- `frontend/src/components/search/SaveFilterModal.tsx` — новый.
- `frontend/src/components/search/FilterShareModal.tsx` — новый.
- `frontend/src/components/search/SavedFiltersSidebar.tsx` — новый.
- `frontend/src/pages/SearchPage.tsx` — sidebar integration + modals + Ctrl+S hotkey.
- `docs/tz/TTSRH-1.md` §13.6/§13.9 — статус PR-13 → ✅ Done.

### Влияние на prod

Под `VITE_FEATURES_ADVANCED_SEARCH=false` — без изменений. При `=true`:
- Sidebar подгружает 5 списков (4 backend + 1 client-compute) при mount.
- Ctrl+S сохраняет текущий JQL.
- Share-флоу даёт copy-link и управление визиблити/members.

### Проверки

- `npx tsc --noEmit` — чисто
- `npm run lint` — 0 errors, 0 new warnings
- `npm run build` — чисто, 4.52s. Main bundle +3.9KB gzip (AntD Modal/Form/Select уже в bundle). JqlEditor chunk unchanged.

---

## [2.40] [2026-04-21] feat(frontend): TTSRH-1 PR-12 — BasicFilterBuilder + Basic↔Advanced toggle

**PR:** (to be filled after push)
**Ветка:** `ttsrh-1/basic-builder`

### Что было

После PR-11 `/search` имел только Advanced-режим (JQL-редактор). Пользователи, не знакомые с TTS-QL синтаксисом, упирались в пустой textarea без способа построить запрос визуально — большой барьер для adoption'а feature.

### Что теперь

Chip-based Basic-режим с переключателем:

- **`frontend/src/components/search/basic-filter-model.ts`** (~150L) — чистая pure-function модель:
  - `BasicChip = {id, field, op, values[]}`; op ∈ `=|!=|IN|NOT IN`.
  - `canBasicize(jql)` → `{ok, reason?}` — детектит OR / NOT / WAS / CHANGED / `~` / ORDER BY / группировку (R9) и возвращает причину для tooltip.
  - `chipsFromJql(jql)` — regex-парсер на flat AND-chain (`CLAUSE_RE`: field + op + rhs). `rhs` может быть bare-ident / number / quoted string / `(v1, v2, "v 3")`. `splitInList` корректно обрабатывает запятые внутри quoted строк и escape'ы.
  - `jqlFromChips(chips)` — сериализация обратно. Values escape: bare-identifier / number остаются без кавычек, всё остальное → `"..."` с escape `\\`/`\"`.
  - `CATEGORIES` — 5 групп полей для cascade-menu (Задача / Даты / Пользователи / Планирование / AI).
- **`frontend/src/components/search/FilterModeToggle.tsx`** (~80L) — сегмент-кнопка Basic|Advanced. `aria-pressed` на каждом, `role="group"`, `disabled` + tooltip для Basic через `title`-attribute.
- **`frontend/src/components/search/BasicFilterBuilder.tsx`** (~200L) — основной UI:
  - Chips рендерятся inline с inline-edit (field-label + `<select>` op + `<input>` values + `×`-remove).
  - Клик по chip → edit mode; blur → save; `setEditingId(null)`.
  - "+ Добавить фильтр" раскрывает cascade-menu `role="menu"` с категориями из `CATEGORIES`.
  - Sync с внешним `value` через `useEffect([value])` — меняет chips только если `jqlFromChips` отличается (избегает re-render cascade).
  - Commit helper: setChips + onChange(jqlFromChips) атомарно.
- **`frontend/src/pages/SearchPage.tsx`** — integration:
  - `filterMode: 'basic' | 'advanced'` state (default 'advanced').
  - `basicCheck = useMemo(canBasicize(jqlDraft))` — disabled state для toggle.
  - Auto-fallback: при загрузке saved filter с OR/NOT → mode forced в 'advanced'.
  - В Basic-mode рендерим `<BasicFilterBuilder>`, в Advanced — `<JqlEditor>`.
  - `setJqlDraft` общий, переключение не теряет черновик.

### Изменения

- `frontend/src/components/search/basic-filter-model.ts` — новый.
- `frontend/src/components/search/BasicFilterBuilder.tsx` — новый.
- `frontend/src/components/search/FilterModeToggle.tsx` — новый.
- `frontend/src/pages/SearchPage.tsx` — integration + mode-state.
- `docs/tz/TTSRH-1.md` §13.6/§13.9 — статус PR-12 → ✅ Done.

### Влияние на prod

Под `VITE_FEATURES_ADVANCED_SEARCH=false` — без изменений. При `=true`: по умолчанию режим Advanced (existing behavior). Toggle переключает на chip-builder. Full autocomplete значений в chip-popover'ах + кастомные поля — PR-13 (Save/Share modals + полноценные popover'ы на Ant Design).

### Проверки

- `npx tsc --noEmit` — чисто
- `npm run lint` — 0 errors, 0 new warnings
- `npm run build` — чисто, 4.49s. Main bundle вырос на ~7.5KB gzip (BasicFilterBuilder не lazy-загружается, чтобы переключение режима было мгновенным). JqlEditor chunk без изменений.

---

## [2.39] [2026-04-21] feat(frontend): TTSRH-1 PR-11 — ValueSuggester CM6 autocomplete + TTL cache

**PR:** (to be filled after push)
**Ветка:** `ttsrh-1/value-suggester`

### Что было

После PR-10 JqlEditor был статичным: user писал запрос вручную, без подсказок значений. Ключи проектов, имена статусов, email'ы assignee'ев нужно было копировать глазами из других страниц. Backend-endpoint `/search/suggest` был готов с PR-6 (13 value-providers), но frontend его не использовал.

### Что теперь

CM6 autocomplete подключён к `/search/suggest` со всеми 13 backend-провайдерами:

- **`frontend/src/components/search/suggest-cache.ts`** (~60L) — lightweight TTL Map-cache. TTL per field: Project/IssueType/Status = 60s, Sprint/Release = 30s, default = 30s (§13.6 PR-11). GC когда `cache.size > 200`. Ключ — конкатенация `jql|cursor|field|operator|prefix|variant` (stable ordering).
- **`frontend/src/components/search/ttql-completion.ts`** (~100L) — CM6 `CompletionSource` адаптер:
  - `ttqlCompletionSource(triggerChars)` возвращает async source, который (a) находит word-boundary через `context.matchBefore(/[\w."-]*/)`, (b) проверяет trigger chars (`=`, `,`, `(`, ` `) если trigger не explicit, (c) вызывает `cachedSuggest({jql, cursor, prefix})`, (d) маппит `Completion.kind` → CM6 `type` (`variable`/`operator`/`function`/`constant`/`keyword`), (e) маппит `score` (0..1) → CM6 `boost` (-99..99), (f) лениво рендерит `info` из `icon + detail`.
  - `context.aborted` guard — stale responses не попадают в UI.
  - Never throws: network/5xx → `null` (CM6 скрывает popup).
- **`frontend/src/components/search/JqlEditor.tsx`** — + `autocompletion({override: [ttqlCompletionSource(...)], activateOnTyping: true, closeOnBlur: true, maxRenderedOptions: 50, defaultKeymap: false})`. `completionKeymap` добавлен в общий keymap-merge для Ctrl+Space / Enter-to-accept / Escape-to-close.

### Изменения

- `frontend/src/components/search/suggest-cache.ts` — новый.
- `frontend/src/components/search/ttql-completion.ts` — новый.
- `frontend/src/components/search/JqlEditor.tsx` — + autocompletion extension + completionKeymap.
- `docs/tz/TTSRH-1.md` §13.6/§13.9 — статус PR-11 → ✅ Done.

### Влияние на prod

Под `VITE_FEATURES_ADVANCED_SEARCH=false` — без изменений (chunk не грузится). При включении: в JqlEditor появляется всплывающий popup с автокомплитом по мере ввода (и Ctrl+Space / после `=`/`,`/`(`). Каждая suggestion показывает type-badge (CM6 стандартный), опциональный icon + detail в info-panel.

### Проверки

- `npx tsc --noEmit` — чисто
- `npm run lint` — 0 errors, 0 new warnings
- `npm run build` — чисто, 4.53s. Chunk `JqlEditor` = **113.62KB gzip** (71% от NFR-5 160KB budget, +12KB за `@codemirror/autocomplete`).

---

## [2.38] [2026-04-21] feat: паттерны из Pulsar — asyncHandler, logger, rate-limit, security

**PR:** [#112](https://github.com/NovakPAai/tasktime-mvp/pull/112)
**Ветка:** `claude/jack-pulsar-patterns`

### Что изменилось

- **`asyncHandler` / `authHandler`** — убраны `try/catch` из 39 роутеров, ошибки проксируются в `next()` автоматически
- **`logger`** — структурированный логгер: prod → JSON, dev → pretty; `captureError` с redact секретов
- **`rate-limit`** — scoped in-memory лимитер; `authRead` (30/мин) / `authWrite` (10/мин); size cap 100k
- **`issue-access`** — централизованный Prisma WHERE для ACL: `accessibleIssueWhere(userId, systemRoles)`
- **Security**: `trust proxy = 1`, `safeClientMeta` denylist (не обрезает validatorType и др.), corrupted Redis session → 401, `console` → logger

### Файлы
- `backend/src/shared/utils/async-handler.ts`, `logger.ts`, `rate-limit.ts`, `issue-access.ts`
- `backend/src/shared/middleware/error-handler.ts`, `backend/src/app.ts`
- 39 роутеров — убраны try/catch блоки

---

## [2.37] [2026-04-21] feat(frontend): TTSRH-1 PR-10 — JqlEditor (CodeMirror 6) + inline errors + lazy-load

**PR:** (to be filled after push)
**Ветка:** `ttsrh-1/jql-editor`

### Что было

После PR-9 SearchPage использовал plain `<textarea>` для JQL — без подсветки, без автокомплита, без inline-diagnostics. Редактор из §5.7 ТЗ не существовал, а без него feature flag не мог быть включён для UAT.

### Что теперь

Полноценный CodeMirror 6 редактор TTS-QL с lazy-load'ом, подсветкой и подключенным `/search/validate`:

- **`frontend/src/components/search/ttql-language.ts`** (~100L) — `StreamLanguage` адаптер для TTS-QL. Классификатор токенов зеркалит backend `search.tokenizer.ts`: keywords (`AND/OR/NOT/IN/IS/EMPTY/NULL/ORDER/BY/ASC/DESC/TRUE/FALSE` + history-keywords), strings (с backslash-escape), numbers (int + decimal + relative-date `-7d`/`+1w`/`-1M`), operators (`!=/<=/>=/!~/=/</>/~`), custom-field prefix (`cf[`), comments (`-- …`). Function detection через lookahead на `(`. `HighlightStyle.define` — цвета в стиле One-Dark (keywords/functions/strings/numbers различимы, operators/punctuation — muted).
- **`frontend/src/components/search/JqlEditor.tsx`** (~200L) — главный компонент:
  - Extensions: `history()` (undo/redo), `bracketMatching()`, `closeBrackets()`, `indentOnInput()`, `lineWrapping`, наш `ttqlLanguage()`, error `StateField`/theme.
  - Keymap: `Mod-Enter` → submit (preventDefault), + defaultKeymap/historyKeymap/closeBracketsKeymap/searchKeymap.
  - Inline errors: `Decoration.mark({class: 'ttql-error', attributes: {title}})` через `StateField<DecorationSet>` + `StateEffect<InlineError[]>`. Squiggle = `text-decoration: underline wavy #e5484d`. `title`-attribute показывает сообщение ошибки на hover.
  - Theme: dynamic (light/dark) через `EditorView.theme` + `buildTheme(isLight)`.
  - a11y: `aria-label="JQL / TTS-QL query editor"`, `aria-describedby` к status-line в SearchPage (A11Y-1).
  - `onChange/onSubmit` через refs — стабильная идентичность extensions, ре-mount только при смене theme/a11y.
  - Sync external `value` (URL-driven) через `view.dispatch({ changes })` только если отличается (избегаем лишних ре-parse'ов).
  - Global `/` hotkey → focus editor. Respect input/textarea/contenteditable focus (чтобы слэш оставался символом).
- **`frontend/src/components/search/JqlEditor.lazy.tsx`** (~40L) — `React.lazy(() => import('./JqlEditor'))` + Suspense fallback с placeholder-высотой, чтобы избежать layout shift при подгрузке.
- **`frontend/src/pages/search/useJqlValidation.ts`** (~70L) — debounced `POST /search/validate`:
  - 300ms debounce.
  - `reqIdRef` увеличивается на каждый новый запрос; stale responses игнорируются.
  - Network errors сбрасывают `errors` в []. Пустой JQL → не триггерит запрос.
  - Cleanup корректно отменяет timer + bumps reqId.
  - Возвращает `{errors, isValidating}` для UI-banner'а.
- **`frontend/src/pages/SearchPage.tsx`** — `textarea` заменён на `<JqlEditor>` (lazy-wrapped). Добавлены:
  - Error-banner (`role="alert" aria-live="polite"`) с первыми 5 ошибками формата `[start:end] message`, остаток в виде «…ещё N ошибок».
  - Status-line обновлён: `'Проверка запроса…'` пока debounced-валидация в полёте, `'Введите запрос и нажмите Ctrl+Enter'` когда idle.
- **Новые deps**: `@codemirror/state`, `@codemirror/view`, `@codemirror/language`, `@codemirror/autocomplete`, `@codemirror/search`, `@codemirror/commands`, `@lezer/highlight`. В production bundle'е выделен отдельный chunk `JqlEditor-*.js` (309KB raw / **101KB gzip**) — грузится только при первом входе на `/search`.

### Изменения

- `frontend/src/components/search/ttql-language.ts` — новый.
- `frontend/src/components/search/JqlEditor.tsx` — новый.
- `frontend/src/components/search/JqlEditor.lazy.tsx` — новый.
- `frontend/src/pages/search/useJqlValidation.ts` — новый.
- `frontend/src/pages/SearchPage.tsx` — textarea → JqlEditor, + error-banner, + isValidating status.
- `frontend/package.json` / `package-lock.json` — + 7 CM6 deps.
- `docs/tz/TTSRH-1.md` §13.6/§13.9 — статус PR-10 → ✅ Done.

### Влияние на prod

Под `VITE_FEATURES_ADVANCED_SEARCH=false` CodeMirror не грузится вообще (route не смонтирован, chunk не реквестится). При включении: editor ленится, подхватывается за ~100ms после mount'а страницы. Main bundle unchanged по размеру (lazy-split'ин).

### Проверки

- `npx tsc --noEmit` (frontend) — чисто
- `npm run lint` (frontend) — 0 errors, 0 new warnings
- `npm run build` (Vite) — чисто, 4.57s. Chunk `JqlEditor` = **101KB gzip** (60% бюджета NFR-5 ≤ 160KB gzip).

---

## [2.36] [2026-04-21] feat(frontend): TTSRH-1 PR-9 — SearchPage shell + /search route + sidebar submenu + URL sync

**PR:** (to be filled after push)
**Ветка:** `ttsrh-1/frontend-shell`

### Что было

После PR-8 вся backend-поверхность TTS-QL была live (`/search/{issues,validate,schema,suggest,export}` + `/saved-filters/*` + `/users/me/preferences`), но frontend не имел страницы `/search` — только placeholder-stub из PR-1. Пользователь не мог протестировать запросы даже с `FEATURES_ADVANCED_SEARCH=true`.

### Что теперь

Полноценная страница `/search` + оболочка будущих PR-10..PR-14 + тонкие API-клиенты:

- **`frontend/src/api/search.ts`** — `searchIssues / validateJql / getSearchSchema / suggestCompletions / exportIssues` (blob для saveAs). Типизированные ответы: `SearchIssuesResponse`, `ValidationResponse`, `SearchSchemaResponse`, `SuggestResponse`.
- **`frontend/src/api/savedFilters.ts`** — CRUD + share + favorite + markUsed + `getMyPreferences / updateMyPreferences`. `SavedFilter` интерфейс с `permission: 'READ'|'WRITE'` и nested `shares[]`.
- **`frontend/src/pages/SearchPage.tsx`** — переписан со stub'а. 3-column CSS grid (`320px | minmax(0,1fr) | 360px`): `SidebarFilters` | `JqlEditor + ResultsArea` | `DetailPreview`. Левая/правая колонки сейчас — placeholder'ы с refs на будущие PR (13/14). Средняя колонка работает:
  - `<textarea>` с `Ctrl/Cmd+Enter` → submit (plain Enter вставляет newline для мульти-строк).
  - Run-button + `role="status" aria-live="polite"` status-line (idle/loading/ok/error — A11Y-1).
  - При `status=ok` рендерится preview-список (до 20 результатов, ключ + title + status) — PR-14 заменит полной `ResultsTable`.
- **`frontend/src/pages/search/useSearchUrlState.ts`** — bridge между URL `?jql=&view=&columns=&page=` и локальным state. `updateUrl` имеет стабильную identity (via stateRef) — без этого `/search/saved/:filterId` попадал в infinite loop. Default dropping: `view=table` и `page=1` не записываются в URL. Mount-time self-heal для invalid `page=N`.
- **`frontend/src/App.tsx`** — добавлен route `/search/saved/:filterId` под тем же gate'ом `features.advancedSearch`. Обе ветки используют `<SearchPage />` — он сам fetch'ит фильтр по `useParams().filterId` → `getSavedFilter` → replace URL state + fire-and-forget `markSavedFilterUsed`.
- **`frontend/src/components/layout/Sidebar.tsx`** — при `isActive('/search')` под пунктом разворачивается submenu «Избранные фильтры»: до 5 item'ов, fetch `listSavedFilters('favorite')`. Dep-массив сужен до boolean `isSearchActive` — intra-search URL changes не триггерят redundant fetch.

### Изменения

- `frontend/src/api/search.ts` — новый (~100L).
- `frontend/src/api/savedFilters.ts` — новый (~80L).
- `frontend/src/pages/search/useSearchUrlState.ts` — новый (~90L).
- `frontend/src/pages/SearchPage.tsx` — переписан (placeholder → 3-column shell, ~250L).
- `frontend/src/App.tsx` — + `/search/saved/:filterId` route.
- `frontend/src/components/layout/Sidebar.tsx` — + submenu fetch + render.
- `docs/tz/TTSRH-1.md` §13.6/§13.9 — статус PR-9 → ✅ Done.

### Влияние на prod

Под `VITE_FEATURES_ADVANCED_SEARCH=false` страница и submenu не рендерятся (App.tsx catch-all → `/`). При `=true`:
- `/search` открывается, URL-sync работает на пустом JQL.
- Sub-menu «Избранные фильтры» подгружается из `/api/saved-filters?scope=favorite`.
- Реальный JQL-editor (CodeMirror 6), Basic-builder, Save/Share-модалки, full-table — в PR-10..PR-14.

### Проверки

- `npx tsc --noEmit` (frontend) — чисто
- `npm run lint` (frontend) — 0 errors, 0 new warnings
- `npm run build` (Vite) — чисто, 4.5s

---

## [2.35] [2026-04-21] feat(search): TTSRH-1 PR-8 — POST /search/export CSV/XLSX streaming

**PR:** (to be filled after push)
**Ветка:** `ttsrh-1/export`

### Что было

После PR-7 `/api/search/export` возвращал 501. Из UI нельзя было выгрузить результаты search'а — ни для оффлайн-отчёта, ни для шеринга вне системы (FR-19, §5.6).

### Что теперь

`POST /api/search/export` — live с двумя форматами + streaming writers, reuse всего pipeline PR-2..PR-5.

- **`search.export.ts`** — новый модуль, publico `exportIssuesToCsv` / `exportIssuesToXlsx`:
  - **`prepareExport`** — reuses parse → validate → resolveFunctions → compile → executeCustomFieldPredicates (тот же path, что у `POST /search/issues`), гарантирует идентичную R3-семантику (`accessibleProjectIds` → AND[0]).
  - **`iterateIssues`** — async generator с cursor-based pagination (batches × 500). Избегает O(n²) на больших offset'ах (skip/take → P.K).
  - **Limits**: `MAX_ROWS=50_000` (безопасность от memory-blow), `QUERY_TIMEOUT_MS=60_000` (§5.6 NFR-8) через `AbortController`. Truncate-маркер в последней строке если hit cap.
  - **Column allow-list**: `STANDARD_COLUMNS` (19 проекций — key/summary/priority/status/assignee и т.д.) ∪ `SYSTEM_FIELDS` (канонические имена) ∪ custom-field names из `loadCustomFields()`. Unknown columns silently dropped, не раскрывают произвольные Prisma-поля. 400 если ВСЕ columns неизвестны (`NO_VALID_COLUMNS`).
  - **CSV**: inline writer (~30 LoC) с UTF-8 BOM (Excel-RU compat), escape для `,"\n\r`, null → пустая строка. `Content-Type: text/csv; charset=utf-8`.
  - **XLSX**: `exceljs.stream.xlsx.WorkbookWriter` — коммит per-row через `addRow(...).commit()` (streaming, не держит всё в памяти). `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
- **`search.router.ts`** — `POST /search/export` подключён (Zod body `{jql, format:csv|xlsx, columns?: string[]}`; columns.max=50). Авторизация + rate-limit + accessibleProjectIds. Стрим-safe error-handler: если headers уже отправлены, `res.end()` + log; иначе `next(err)` → 500 JSON.
- **`backend/package.json`** — добавлен `exceljs@^4.4.0` (~300KB node_modules, единственный new dep).

### Тесты (интеграционные, требуют Postgres)

**`tests/search-export.test.ts`** — 11 кейсов:

- **CSV** (9): default columns, subset+order columns, unknown column dropped, all-unknown → 400, CSV escape special chars (`,"\n`), parse error → 400, validation error → 400, no auth → 401, invalid format → 400.
- **XLSX** (1): content-type spreadsheetml.sheet + ZIP-signature `PK\x03\x04` в начале бинарника (буферизованный stream чтение через supertest .parse()).
- **RBAC** (1): неавторизованный на проект user → 0 data rows (только header). Scope R3 наследуется из `/search/issues` path.

### Изменения

- `backend/src/modules/search/search.export.ts` — новый.
- `backend/src/modules/search/search.router.ts` — + POST /search/export, удалён unused `notImplemented` helper (все endpoints теперь live).
- `backend/package.json` — + `exceljs@^4.4.0`.
- `backend/tests/search-export.test.ts` — новый, 11 integration-кейсов.
- `docs/tz/TTSRH-1.md` §13.5/§13.9 — статус PR-8 → ✅ Done.

### Влияние на prod

Под `FEATURES_ADVANCED_SEARCH=false` эндпоинт недоступен (mount условный). При включении: XLSX-файл стримится, frontend потребляет как blob для `saveAs` (PR-14 добавит UI). Никаких изменений на read-path'е `/search/issues`.

### Проверки

- `npx tsc --noEmit` — чисто
- `npm run lint` — 0 errors, 0 new warnings (2 pre-existing)

---

## [2.34] [2026-04-21] feat(saved-filters): TTSRH-1 PR-7 — SavedFilter CRUD + share + favorite + User preferences

**PR:** (to be filled after push)
**Ветка:** `ttsrh-1/saved-filters`

### Что было

После PR-6 `/api/saved-filters/*` возвращали 501; `/api/users/me/preferences` не существовало. Пользователь не мог сохранить JQL-запрос, передать его коллеге, отметить избранным или зафиксировать набор колонок как дефолт — ни один flow §5.6 ТЗ не работал.

### Что теперь

Полный CRUD `/api/saved-filters` с RBAC, sharing'ом через пользователей и группы, а также Zod-DTO `PATCH /api/users/me/preferences`:

- **`saved-filters.dto.ts`** — Zod схемы `listQueryDto`, `createDto`, `updateDto`, `favoriteDto`, `shareDto`, `preferencesDto`. Инварианты: `name` ≤ 200 символов, `jql` ≤ 10K (как на `/search/issues`), `columns` ≤ 50 строк, `sharedWith.users` ≤ 500 UUID, `sharedWith.groups` ≤ 100 UUID — чтобы не пропустить DoS через очень большие JSON-массивы в `User.preferences`.
- **`saved-filters.service.ts`** — весь бизнес-слой:
  - `listFilters(userId, scope)` — 4 scope'а: `mine` (owner), `favorite` (owner + isFavorite, сорт `useCount DESC, lastUsedAt DESC` — под сайдбарное submenu §5.7), `public` (все аутентифицированные), `shared` (SHARED-фильтры через прямые shares или группы пользователя, `ownerId: { not: userId }`).
  - `getFilter`, `updateFilter`, `deleteFilter` — с RBAC-проверкой (R-SF-1 read, R-SF-2 write).
  - `createFilter` — транзакционно создаёт `SavedFilter` + `SavedFilterShare[]` (если visibility=SHARED), валидирует существование shared-users/groups (400 при unknown UUID). `sharedWith` игнорируется для PRIVATE/PUBLIC, чтобы не плодить зомби-строки.
  - `shareFilter` — replace-семантика: старые shares удаляются в той же транзакции, новые создаются. При первом share auto-promote PRIVATE → SHARED. Owner-only.
  - `setFavorite` — только для owner'а (per-user favorites over shared/public filters — future).
  - `incrementUseStats` — атомарный `{ increment: 1 }` + `lastUsedAt=now()` (race-safe на конкурентных запросах).
  - `getUserFavorites(userId, limit=5)` — готовый хелпер для будущего `SavedFiltersSidebar`.
  - RBAC: `resolveAccess(userId, filterId)` единственная точка правды, читает `SavedFilter` + `shares` + `userGroupMember` и возвращает `{canRead, canWrite}`.
  - AuditLog: `savedFilter.created|updated|deleted|shared` — через `prisma.auditLog.create` с `userId/entityType/entityId/details`.
- **`saved-filters.router.ts`** — live (раньше был stub-501):
  - `GET /saved-filters?scope=` (Zod query), `POST /saved-filters` (201), `GET/PATCH/DELETE /:id` (403 на чужое, 404 на несуществующее).
  - `POST /:id/favorite {value:bool}`, `POST /:id/share {users?,groups?,permission?}`, `POST /:id/use` (204, инкремент).
  - Всё под `authenticate` middleware; 401 при `!req.user`. Gate по `features.advancedSearch` — в app.ts (без изменений).
- **`users.router.ts` + `users.service.ts`** — `GET/PATCH /api/users/me/preferences`:
  - `getPreferences` — читает `User.preferences`, возвращает `{}` если `null` (новый пользователь).
  - `updatePreferences` — shallow-merge сверху (PATCH семантика): `{searchDefaults: {columns}}` не перетирает другие top-level ключи (`checkpointDefaults`, и т.д. — паттерн TTUI-90 §5.4).
  - `me/preferences` регистрируется ПЕРЕД `/:id`, чтобы Express не greedy-match'ил `me` как UUID.
- **`tests/env.ts`** — `process.env.FEATURES_ADVANCED_SEARCH ??= 'true'` (setup-файл vitest). Без этого `createApp()` не монтирует `/api/saved-filters/*` и все integration-тесты сразу падают 404.

### Тесты (интеграционные, требуют Postgres — прогонит CI)

**`tests/saved-filters.test.ts`** — 24 кейса:

- **CRUD (10)**: create PRIVATE default, 400 на missing name, 401 без auth, list `scope=mine` фильтрует чужие, `scope=public` включает PUBLIC со всех, 403 на чужой PRIVATE, 200 для owner, PATCH owner-ok, PATCH non-owner 403, DELETE owner 204 + follow-up GET 404, DELETE non-owner 403 даже при SHARED-WRITE.
- **Sharing (6)**: share users READ по умолчанию, READ → GET ok + PATCH 403, WRITE → PATCH ok, share через группу + non-member 403, replace-семантика (старые shares заменяются), 403 для не-owner'а, 400 на nonexistent UUID.
- **Favorite + use (4)**: owner toggle favorite, non-owner PUBLIC → 400, `/use` инкрементирует useCount+lastUsedAt, `scope=favorite` сортирует по useCount.
- **Audit (1)**: create/update/share/delete пишет 4 строки в AuditLog с правильным entityType + action.
- **Preferences (5)**: GET empty object для нового user'а, PATCH searchDefaults, 400 на columns>50, 400 на empty body, 401 без auth.

### Изменения

- `backend/src/modules/saved-filters/saved-filters.dto.ts` — новый.
- `backend/src/modules/saved-filters/saved-filters.service.ts` — новый.
- `backend/src/modules/saved-filters/saved-filters.router.ts` — live (был stub).
- `backend/src/modules/users/users.dto.ts` — + `updatePreferencesDto`.
- `backend/src/modules/users/users.service.ts` — + `getPreferences`, `updatePreferences`.
- `backend/src/modules/users/users.router.ts` — + `GET/PATCH /me/preferences` (перед `/:id`).
- `backend/tests/env.ts` — `FEATURES_ADVANCED_SEARCH ??= 'true'` default в тестах.
- `backend/tests/saved-filters.test.ts` — новый, 24 integration-кейса.
- `docs/tz/TTSRH-1.md` §13.5/§13.9 — статус PR-7 → ✅ Done.

### Влияние на prod

Под `FEATURES_ADVANCED_SEARCH=false` эндпоинты недоступны (ассоциированный mount не монтируется — см. app.ts:176). При включении: фронт может создавать/редактировать/делить фильтры, хранить UI-колонки в `User.preferences`, сайдбар готов к списку избранных (getUserFavorites).

### Проверки

- `npx tsc --noEmit` — чисто
- `npm run lint` — 0 errors, 0 new warnings

---

## [2.33] [2026-04-21] feat(search): TTSRH-1 PR-6 — Value Suggesters backend + GET /search/suggest + /implement-tz playbook

**PR:** (to be filled after push)
**Ветка:** `ttsrh-1/suggesters`

### Что было

После PR-5 `GET /search/suggest` возвращал 501. Редактор TTS-QL не мог предлагать значения — пользователь писал всё руками.

### Что теперь

`GET /api/search/suggest` live. 13 провайдеров значений из §5.11 ТЗ:

- **`search.suggest.types.ts`** — `Completion { kind, label, insert, detail?, icon?, score }`, `PositionContext`, `SuggestContext`, `SuggestResponse`.
- **`search.suggest.position.ts`** — позиционный анализатор. Tokenize'ит source до cursor, применяет heuristic rules: после `AND`/`OR`/`NOT`/пусто → field; после field → operator; после op/`IN (` → value; после `ORDER BY` → field; fails open на tokenizer-ошибках. Корректно обрабатывает editing-in-progress (только для Ident/String/Number/RelativeDate/CustomField, не для delimiters).
- **`search.suggest.rank.ts`** — fuzzy-ranking: exact (1.0) → startsWith (0.75) → contains (0.5) → subsequence (0.25). Case-insensitive. Пустой prefix возвращает input-order.
- **`search.suggest.static.ts`** — static suggesters без DB: `suggestFields` (system + custom), `suggestFunctions` (filter by variant, MVP-only), `suggestEnum` (priority/statusCategory/aiStatus/aiAssigneeType/checkpointState), `suggestBool`, `suggestDateShortcuts` (now/today/startOfX/-7d), `suggestOperators` (TtqlOpKind → display label).
- **`search.suggest.providers.ts`** — 9 DB-backed провайдеров: Users (scoped по UserProjectRole), Projects, Statuses (system-keys + WorkflowStatus с color-dot), IssueTypes, Sprints (+ 3 function-shortcuts первыми), Releases (+ 4 function-shortcuts), Issues (key-based или title-substring, scoped), Labels (raw-SQL `jsonb_array_elements_text` на LABEL-type CFs), Groups, CheckpointTypes. Все scope'ятся по `accessibleProjectIds` (R3).
- **`search.suggest.ts`** — orchestrator. Два пути: Basic-builder (explicit field/op/prefix) и text-editor (analyse position). Routing по type с fallbacks: unknown field → functions, unknown type → empty.
- **`search.router.ts`** — `GET /search/suggest?jql=&cursor=&field=&operator=&prefix=&variant=` подключён. Authenticate + Zod query params + accessibleProjectIds.
- **`.claude/commands/implement-tz.md`** — новый **/implement-tz playbook**: декомпозиция ТЗ → план PR'ов → цикл (branch → implement → test → docs → commit → pre-push-reviewer → fix → check prev CI → merge → rebase → push → schedule auto-check). Пользователь пишет `Реализуй ТЗ X` — цикл запускается автоматически.

### Тесты (433 passing, +36 к PR-5)

- **`tests/search-suggest.unit.test.ts`** (36 кейсов):
  - Position analyser: 8 сценариев (пустой, after AND/NOT/(, after field, after op, IN (, dedupe picked, unterminated string, ORDER BY).
  - rankByPrefix: 7 кейсов (пустой prefix, exact/startsWith/contains/subsequence tiers, case-insensitive, no-match).
  - suggestFields: 3 (system + custom + quoted wrap).
  - suggestFunctions: 4 (variant filter, Phase-2 exclude).
  - suggestEnum: 5 (per-field mapping, dedupe picked, case-insensitive, unknown field, by type).
  - suggestBool/DateShortcuts/Operators: 3.

DB-backed провайдеры тестируются в integration layer (требуют Postgres).

### Изменения

- `backend/src/modules/search/search.suggest.types.ts` — новый.
- `backend/src/modules/search/search.suggest.position.ts` — новый.
- `backend/src/modules/search/search.suggest.rank.ts` — новый.
- `backend/src/modules/search/search.suggest.static.ts` — новый.
- `backend/src/modules/search/search.suggest.providers.ts` — новый.
- `backend/src/modules/search/search.suggest.ts` — новый (orchestrator).
- `backend/src/modules/search/search.router.ts` — `GET /search/suggest` подключён.
- `backend/tests/search-suggest.unit.test.ts` — новый.
- `backend/package.json` — `test:parser` включает suggest-тест.
- `.claude/commands/implement-tz.md` — playbook для запуска циклов.
- `docs/tz/TTSRH-1.md` §13.9 — статус PR-6 → ✅ Done.

### Влияние на prod

Под `FEATURES_ADVANCED_SEARCH=false` — эндпоинт недоступен. При включении: auto-complete в редакторе + в Basic-chip popover работают одинаково (single source of truth).

### Проверки

- `npx tsc --noEmit` — чисто
- `npm run lint` — 0 errors, 0 new warnings
- `npm run test:parser` — **433 passing**
**Last version: 2.32**

---

## [2.32] [2026-04-21] fix(ci): inject-secrets без утечки секретов в ps aux

**PR:** [#99](https://github.com/NovakPAai/tasktime-mvp/pull/99)
**Ветка:** `claude/jack-fix-issues-list-truncated`

### Что изменилось

**CI:**
- `deploy-staging.yml`: заменён positional-args подход на double-quoted heredoc — секреты передаются в stdin bash (не видны через `ps aux`), `${{ secrets.* }}` раскрывается GitHub Actions до отправки по SSH

### Файлы
- `.github/workflows/deploy-staging.yml`

---

## [2.31] [2026-04-20] feat(search): TTSRH-1 PR-5 — endpoint /search/issues + rate-limit + timeout + fuzz-harness

**PR:** (to be filled after push)
**Ветка:** `ttsrh-1/endpoints`

### Что было

После PR-4 был pure compiler, но `POST /search/issues` оставался 501. Custom-field placeholders в `where` не исполнялись.

### Что теперь

`POST /api/search/issues` live — полный pipeline `parse → validate → resolve-functions → compile → execute-CF → prisma.findMany`:

- **`search.custom-field.executor.ts`** — executor для `CustomFieldPredicate`: параллельные `$queryRaw` вызовы получают id-sets, затем recursive `substituteAliases` заменяет placeholder'ы `{ __ttql_custom_predicate__: alias }` на `{ id: { in: ids } }` (или `{ NOT: ... }` при negated). `assertNoUnresolvedPlaceholders` guard вызывается до и после substitution.
- **`search.rate-limit.ts`** — Redis-backed sliding-minute лимитер 30/min/user (§R15 ТЗ). Bucket `search:rate:<userId>:<minute>` через `INCR` + 60s TTL. При Redis outage **fails open** (не блокирует трафик). 429 с `Retry-After: 60` при превышении.
- **`search.service.ts`** — оркестрация всего pipeline. Timeout 10s через `Promise.race` (NFR-8, R16) — возвращает 504, не 500. Typed `SearchIssuesOutput = SearchIssuesResult | SearchIssuesError` — router не нуждается в try/catch для бизнес-ошибок, только для инфраструктурных. Pagination clamp: `limit ≤ 100`, `startAt ≤ 10000`.
- **`search.router.ts` / POST /search/issues** — Zod DTO на вход (`jql.max(10_000)`, startAt/limit ранжи), `searchRateLimit` middleware, resolution `accessibleProjectIds` по тому же паттерну как `issues.router.ts:requireIssueAccess` (global-read роли → всё, остальные → direct memberships). Ответ: `{total, startAt, limit, issues, warnings}` или `{error, message, parseErrors?, validationErrors?, compileErrors?}`.
- **`shared/redis.ts`** — добавлен `incrWithTtl(key, ttlSeconds)` atomic helper для counter-style use-cases. Возвращает `null` при Redis outage — caller fails open.

### Тесты (397 passing, +2 к PR-4)

- **`tests/search-pipeline-fuzz.unit.test.ts`** (T-7) — 1000 random inputs через весь pipeline parse→validate→compile. Инварианты:
  1. Никакой throw в pipeline.
  2. R3 scope filter всегда present в result.where.
  3. Все error-спаны in-bounds.
- Adversarial payloads: SQL-injection strings, `A`×10000, 500-deep parens, null-byte + RTL marks — всё safe.

### Security

Создан [docs/security/search-ttql-review.md](docs/security/search-ttql-review.md) — чек-лист для security-reviewer на каждом PR эпика TTSRH-1:
- R1 — нет `Prisma.raw()` в модуле, все `$queryRaw` через `Prisma.Sql`.
- R3 — scope filter AND[0] и во всех function-resolvers.
- R15 — rate-limit, timeout, pagination caps, MAX_DEPTH=256.
- R11 — PUBLIC SavedFilter не расширяет доступ.

### Изменения

- `backend/src/modules/search/search.custom-field.executor.ts` — новый.
- `backend/src/modules/search/search.rate-limit.ts` — новый.
- `backend/src/modules/search/search.service.ts` — новый.
- `backend/src/modules/search/search.router.ts` — подключение `POST /search/issues`.
- `backend/src/shared/redis.ts` — `incrWithTtl` helper.
- `backend/tests/search-pipeline-fuzz.unit.test.ts` — новый.
- `backend/package.json` — `test:parser` включает pipeline-fuzz.
- `docs/security/search-ttql-review.md` — новый.
- `docs/tz/TTSRH-1.md` §13.9 — статус PR-5 → ✅ Done.

### Влияние на prod

Под `FEATURES_ADVANCED_SEARCH=false` (default) — эндпоинт недоступен, 0 эффекта. При включении — все security-checklist пункты подтверждены.

### Проверки

- `npx tsc --noEmit` — чисто
- `npm run lint` — 0 errors, 0 new warnings
- `npm run test:parser` — **397 passing**
- Fuzz 1000 random + 7 adversarial payloads — 0 throws, R3 holds на всех успешных compile.

---

## [2.30] [2026-04-20] feat(search): TTSRH-1 PR-4 — compiler (AST → Prisma + custom-field raw SQL + scope R3)

**PR:** (to be filled after push)
**Ветка:** `ttsrh-1/compiler`

### Что было

После PR-3 был validator, но ничего не умело превратить AST в Prisma-запрос. `/search/issues` оставался 501.

### Что теперь

Готов pure compiler AST → `Prisma.IssueWhereInput` с полной поддержкой system-полей, custom-полей через raw SQL, pre-resolved function-ов, и scope-фильтра.

- **`search.compile-context.ts`** — `CompileContext` (accessibleProjectIds, customFields, resolved, now, variant), `FunctionCallKey` canonical serialisation, `FunctionCallValue` (scalar-id / id-list / scalar-datetime / resolve-failed). `buildFunctionCallKey(name, args)` дедупит повторяющиеся вызовы в одном AST.
- **`search.compiler.ts`** (pure, no Prisma runtime — только types) — `compile(ast, ctx) → CompileResult { where, orderBy, customPredicates, warnings, errors }`. Visitor обходит Or/And/Not/Clause, каждая clause переводится в Prisma-предикат. Scope-фильтр `projectId IN accessibleProjectIds` добавляется как `AND[0]` всегда (R3). Функции в значениях резолвятся через `ctx.resolved.calls` — компилятор сам не хитит БД. Pure date helpers (now/today/startOfX/endOfX) вычисляются через `evaluatePureDateFn`. `compile()` никогда не бросает — на внутренних ошибках возвращает `MATCH_NONE`.
- **`search.custom-field.ts`** — custom-field clauses компилируются в `Prisma.sql` фрагменты (`SELECT issue_id FROM issue_custom_field_values WHERE ...`). Диспетчеризация по `CustomFieldType`: TEXT/TEXTAREA/URL → `value->>'v'`, NUMBER/DECIMAL → `(value->>'n')::numeric`, DATE → `(value->>'d')::date`, CHECKBOX → `(value->>'b')::boolean`, LABEL/MULTI_SELECT → `value @> to_jsonb(?::text)` (array containment). **Все значения через `${...}` Prisma interpolation — 0 string-concat, R1-safe.** IS EMPTY компилируется в `NOT EXISTS` sub-query.
- **`search.function-resolver.ts`** — DB-wired layer. `collectFunctionCalls(ast)` вытаскивает уникальные вызовы по canonical-key; `resolveFunctions(ast, ctx)` queries Prisma по одному разу на уникальный вызов. Реализовано 11 DB-зависимых функций: membersOf, openSprints/closedSprints/futureSprints, unreleasedVersions/releasedVersions, earliestUnreleased/latestReleased, linkedIssues, subtasksOf, epicIssues, myOpenIssues. Ошибки резолва → `resolve-failed` с reason, компилятор эмитит `UNRESOLVED_FUNCTION` и MATCH_NONE.

### Тесты (392 passing, +50 к PR-3)

- **`tests/search-compiler.unit.test.ts`** (50 кейсов) — **T-2 per-field×per-operator матрица**:
  - Scope R3 (3 кейса): empty query, always first in AND, empty projects → match none.
  - Compare operators (4+7+2+3 = 16 кейсов): string equality/inequality, numeric compare <=, >=, >, <, =, !=, date compare с Prisma filter, text ~/!~ с `mode: 'insensitive'`.
  - IN/NOT IN (3).
  - IS EMPTY/IS NOT EMPTY/IS NULL/IS NOT NULL (4).
  - Boolean structure (5): AND, OR, NOT, precedence, parens.
  - Function values (5): currentUser mapping, pure date, relative date, pre-resolved id-list, empty id-list → MATCH_NONE, unresolved → error.
  - ORDER BY (3).
  - Custom fields (7): resolve by name/UUID, IN, NOT IN, text ~, IS EMPTY, unknown UUID.
  - Error paths (2).
  - **Property-based fuzz** (1): 500 random parseable queries compile без throw.

### Изменения

- `backend/src/modules/search/search.compile-context.ts` — новый.
- `backend/src/modules/search/search.compiler.ts` — новый.
- `backend/src/modules/search/search.custom-field.ts` — новый.
- `backend/src/modules/search/search.function-resolver.ts` — новый.
- `backend/src/modules/search/search.schema.ts` — `CustomFieldDef.fieldType` добавлен.
- `backend/src/modules/search/search.schema.loader.ts` — заполняет `fieldType` из Prisma.
- `backend/tests/search-compiler.unit.test.ts` — новый.
- `backend/package.json` — `test:parser` включает compiler-тест.
- `docs/tz/TTSRH-1.md` §13.9 — статус PR-4 → ✅ Done.

### Влияние на prod

0. Без feature-flag cutover — compiler ещё не подключен к `/search/issues` (это PR-5). Существующие эндпоинты не затронуты.

### Проверки

- `npx tsc --noEmit` — чисто
- `npm run lint` — 0 errors, 0 new warnings
- `npm run test:parser` — **392 passing** локально без Postgres
- **R1 проверен**: весь raw SQL в custom-field.ts через `Prisma.sql` template с `${...}` interpolation — 0 string concat.
- **R3 проверен**: scope-фильтр всегда `AND[0]` (тест `scope filter is always the top-level AND prefix`).
- Golden-set 63/63 parse + validate без изменений.

---

## [2.29] [2026-04-20] feat(search): TTSRH-1 PR-3 — field registry + validator + функции + /search/schema + /search/validate

**PR:** (to be filled after push)
**Ветка:** `ttsrh-1/validator`

### Что было

После PR-2 был только синтаксический парсер — любой `foo = bar AND bogus = 1` считался корректным. Эндпоинты `/search/validate` и `/search/schema` возвращали 501.

### Что теперь

Добавлен семантический слой поверх AST:

- **`search.types.ts`** — общий словарь типов для TTS-QL: `TtqlType` (16 вариантов: TEXT / NUMBER / DATE / DATETIME / USER / PROJECT / ISSUE / SPRINT / RELEASE / STATUS / STATUS_CATEGORY / PRIORITY / ISSUE_TYPE / AI_STATUS / AI_ASSIGNEE_TYPE / CHECKPOINT_STATE / CHECKPOINT_TYPE / LABEL / GROUP / JSON), `TtqlOpKind` (17 категорий операторов), `TtqlReturnType` (scalar / list), `QueryVariant` (default / checkpoint).
- **`search.schema.ts`** (pure-core) — реестр из 30+ system-полей из §5.2 ТЗ с label, synonyms, operators, sortable. Индекс для case-insensitive lookup по имени и синонимам. `CustomFieldDef`/`CustomFieldIndex` с detection ambiguous-имён (R7). Мапперы `CustomFieldType → TtqlType` и `→ allowed operators`. **Без импортов Prisma/Redis** — валидатор и тесты переносимы без БД.
- **`search.schema.loader.ts`** — Prisma+Redis loader для custom fields с 60с кэшем (ключ `search:custom-fields:enabled`). Изолирован от pure-core.
- **`search.functions.ts`** — реестр из 25 MVP-функций из §5.4 ТЗ: identity (currentUser/membersOf), time (now/today/startOfX/endOfX × 4 единицы), sprints (openSprints/closedSprints/futureSprints), releases (4 функции), relations (linkedIssues/subtasksOf/epicIssues/myOpenIssues), checkpoint-functions (violatedCheckpoints/violatedCheckpointsOf/checkpointsAtRisk/checkpointsInState), checkpoint-context-only (releasePlannedDate/checkpointDeadline). Plus 3 Phase-2 функции (watched/voted/lastLogin) с явным rejection. **Чистые date-эваулюаторы** с offset-syntax `"-7d"/"1M"/"3h"`, calendar-aware month/year арифметика, ISO-week boundaries, UTC-детерминизм.
- **`search.validator.ts`** — обход AST с накоплением ошибок (не short-circuit). Коды: UNKNOWN_FIELD, UNKNOWN_FUNCTION, OPERATOR_NOT_ALLOWED_FOR_FIELD, VALUE_TYPE_MISMATCH, ARITY_MISMATCH, PHASE_2_OPERATOR, PHASE_2_FUNCTION, FUNCTION_NOT_ALLOWED_IN_CONTEXT, AMBIGUOUS_CUSTOM_FIELD, CUSTOM_FIELD_UUID_UNKNOWN, CURRENTUSER_IN_CHECKPOINT (warning), INVALID_OFFSET_FORMAT. Разделение severity error/warning. `validate()` **никогда не бросает**.
- **`search.router.ts`** — `POST /search/validate` (Zod-валидация body: `{jql, variant?}`) и `GET /search/schema?variant=default|checkpoint` заменили stubs на реальную реализацию. `POST /search/issues`, `POST /search/export`, `GET /search/suggest` остаются 501 до PR-5/6.

### Тесты (341 passing, +148 к PR-2)

- **`tests/search-functions.unit.test.ts`** (42 кейса) — resolveFunction case-insensitive, functionsForVariant filter, parseOffset/applyOffset calendar arithmetic, start/endOf{Day,Week,Month,Year} UTC-детерминизм (тестируются с anchor 2026-04-15 Wed), evaluatePureDateFn для 10 комбинаций, null для DB-зависимых функций.
- **`tests/search-validator.unit.test.ts`** (106 кейсов) — happy path (12 запросов), unknown field/function, operator × field compatibility (4 случая), value type compatibility (4), function arity/arg-types (6), Phase-2 rejection (3), checkpoint variant (3, включая currentUser-warning), custom fields (5 — resolution by name/UUID, ambiguous, type propagation), ORDER BY sortable warning, и **golden-set round-trip — все 63 запроса парсятся И валидируются без ошибок**.

### Изменения

- `backend/src/modules/search/search.types.ts` — новый.
- `backend/src/modules/search/search.schema.ts` — новый (pure).
- `backend/src/modules/search/search.schema.loader.ts` — новый (Prisma+Redis).
- `backend/src/modules/search/search.functions.ts` — новый.
- `backend/src/modules/search/search.validator.ts` — новый.
- `backend/src/modules/search/search.router.ts` — обновлён (live `/validate` и `/schema`).
- `backend/tests/search-functions.unit.test.ts` — новый.
- `backend/tests/search-validator.unit.test.ts` — новый.
- `backend/package.json` — `test:parser` включает новые тесты.
- `docs/tz/TTSRH-1.md` §13.9 — статус PR-3 → ✅ Done.

### Влияние на prod

0. Feature flag `FEATURES_ADVANCED_SEARCH=false` по-прежнему активен — эндпоинты под флагом. При включении `POST /api/search/validate` и `GET /api/search/schema` становятся доступны с типизированными ответами для UI-подсказок.

### Проверки

- `npx tsc --noEmit` — чисто
- `npm run lint` — 0 errors, 0 new warnings
- `npm run test:parser` — **341 passing** локально без Postgres/Redis
- Golden-set 63/63 парсится и валидируется без ошибок
- Pre-push review — в отдельном коммите


---

## [2.28] [2026-04-20] feat(search): TTSRH-1 PR-2 — TTS-QL tokenizer + parser + AST + golden-set

**PR:** (to be filled after push)
**Ветка:** `ttsrh-1/parser`

### Что было

После PR-1 (foundation) в модуле `backend/src/modules/search/` были только stub-эндпоинты, возвращавшие 501. Парсер для TTS-QL отсутствовал.

### Что теперь

Добавлен полноценный parse-pipeline `source → tokens → AST` без сторонних зависимостей:

- **`search.ast.ts`** — типы AST: `QueryNode`, `OrNode`/`AndNode`/`NotNode`, `ClauseNode` с 5 вариантами `ClauseOp` (`Compare`/`In`/`InFunction`/`IsEmpty`/`History`), `FieldRef` (Ident / CustomField / QuotedField), `Expr` (String / Number / RelativeDate / Ident / Bool / Null / Empty / FunctionCall), `SortItem`, `ParseError` со стабильными кодами. Каждая нода несёт `span: {start, end}` для inline-подчёркивания ошибок в CodeMirror.
- **`search.tokenizer.ts`** — hand-written char-by-char лексер. Токены: String (с escape-последовательностями `\"` `\\` `\n` `\t` `\r` `\u{HEX}` и `\uHHHH`), Number, RelativeDate (`-?\d+[dwMyhm]`), Ident (с поддержкой `-`/`.` в середине), CustomField (`cf[UUID]`), Op (8 compare), LParen/RParen/Comma. Комментарии `-- ...` до EOL. Контрол-символы в строках запрещены (кроме `\t`). Безопасные ошибки на контрольных / null-byte / RTL символах.
- **`search.parser.ts`** — recursive descent, приоритет `( ) > NOT > AND > OR > ORDER BY`. Keywords (`AND/OR/NOT/IN/IS/EMPTY/NULL/ORDER/BY/ASC/DESC/WAS/CHANGED/FROM/TO/AFTER/BEFORE/ON/DURING/TRUE/FALSE`) распознаются case-insensitive. Поддержаны формы `IN (list)`, `IN funcCall()` (без outer-парeнов, JIRA-style), `IS [NOT] EMPTY|NULL`, history-операторы (парсятся, валидатор отклонит в PR-3). Bare function shorthand из §5.4.1 ТЗ — `myOpenIssues()`, `violatedCheckpoints()` — десугарится парсером в `issue IN funcCall()`. Публичный API — `parse(source)` возвращает `{ast, errors}` и **никогда не бросает** (контракт для fuzz-harness + suggest-pipeline).

### Тесты (186 passing)

- **`tests/search-tokenizer.unit.test.ts`** (49 кейсов) — токен-типы, спаны, escape-последовательности, unicode/RTL/emoji, edge-случаи `5days`, `cf[UUID]` валидация, контрол-символы, негативные числа, относительные даты.
- **`tests/search-parser.unit.test.ts`** (71 кейс) — все compare-ops × типы значений, IN / NOT IN / `IN funcCall()`, IS EMPTY / NOT EMPTY / IS NULL, precedence AND > OR, NOT унарный, deep nesting, ORDER BY с множеством полей и ASC/DESC, кастом-поля `cf[...]` и `"Story Points"`, history-операторы, bare function shorthand, snapshots спанов, 15+ error-cases с проверкой кодов и позиций.
- **`tests/search-parser-goldenset.unit.test.ts`** — загружает `docs/tz/TTSRH-1-goldenset.jql`, парсит каждую из 63 золотых запросов, assert zero errors.
- **`tests/search-parser-fuzz.unit.test.ts`** (T-7 §6 ТЗ) — 1000 seeded random inputs (mulberry32) + SQL-injection-style payloads + extreme nesting — assert `parse()` НИКОГДА не бросает и все error-спаны in-bounds.

### Изменения

- `backend/src/modules/search/search.ast.ts` — новый файл (AST + error-codes).
- `backend/src/modules/search/search.tokenizer.ts` — новый файл.
- `backend/src/modules/search/search.parser.ts` — новый файл.
- `backend/tests/search-tokenizer.unit.test.ts` — новый.
- `backend/tests/search-parser.unit.test.ts` — новый.
- `backend/tests/search-parser-goldenset.unit.test.ts` — новый.
- `backend/tests/search-parser-fuzz.unit.test.ts` — новый.
- `backend/vitest.parser-only.config.ts` — новый; локальный dev-конфиг для запуска чистых unit-тестов без Postgres (CI использует `vitest.config.ts` как раньше).
- `docs/tz/TTSRH-1.md` §13.9 — статус PR-2 → ✅ Done.

### Влияние на prod

0. Ни одна existing функция не затронута — новые файлы добавляются, существующие stub-роутеры остаются. Парсер не экспонируется через HTTP до PR-5.

### Проверки

- Backend `npx tsc --noEmit` — чисто.
- Backend `npm run lint` — 0 errors, 0 new warnings.
- 186 unit-тестов зелёные локально (через `vitest.parser-only.config.ts`, без Postgres).
- 63 golden-set запроса парсятся без ошибок.
- Fuzz 1000 random inputs — 0 unhandled throws.
- `npm test` в CI — использует main config с Postgres, тест-сьют сам себя бутстрапит.

---

## [2.27] [2026-04-20] feat(search): TTSRH-1 PR-1 — foundation для TTS-QL (schema + feature flags)

**PR:** [#100](https://github.com/NovakPAai/tasktime-mvp/pull/100)
**Ветка:** `ttsrh-1/foundation`

### Что было

Глобального продвинутого поиска по задачам нет — только плоский фильтр по одному проекту в `ProjectDetailPage` и 50-записный `/issues/search` для виджета связывания. JQL-совместимый язык и сохраняемые фильтры отсутствуют (см. §1 и §2 в [docs/tz/TTSRH-1.md](docs/tz/TTSRH-1.md)).

### Что теперь

Заложена инфраструктура TTSRH-1 без продуктового эффекта:

- **Prisma**: добавлены модели `SavedFilter`, `SavedFilterShare` + enums `FilterVisibility`, `FilterPermission`; поле `User.preferences Json?` для будущих UI-дефолтов (колонки, pageSize). Миграция `20260423000000_ttsrh_saved_filters` включает XOR-CHECK и два partial-unique-индекса для shares (user OR group, не оба).
- **Feature flags**: `FEATURES_ADVANCED_SEARCH` и `FEATURES_CHECKPOINT_TTQL` в [backend/src/shared/features.ts](backend/src/shared/features.ts) (оба `false` по умолчанию). Frontend-зеркало — `VITE_FEATURES_ADVANCED_SEARCH` в [frontend/src/lib/features.ts](frontend/src/lib/features.ts).
- **Backend-модули**: пустые [backend/src/modules/search/search.router.ts](backend/src/modules/search/search.router.ts) и [backend/src/modules/saved-filters/saved-filters.router.ts](backend/src/modules/saved-filters/saved-filters.router.ts) с эндпоинтами-стабами (501 Not Implemented). Монтируются в [app.ts](backend/src/app.ts) только при включённом `features.advancedSearch`.
- **Frontend**: роут `/search` + placeholder-страница [SearchPage.tsx](frontend/src/pages/SearchPage.tsx) + пункт сайдбара «Поиск задач» с `data-testid="nav-search"` (SVG-лупа, между Flow Teams и Planning-submenu). Всё под `frontendFeatures.advancedSearch`.

### Изменения

- [backend/src/prisma/schema.prisma](backend/src/prisma/schema.prisma) — модели `SavedFilter`, `SavedFilterShare`, enums, обратные связи в `User` и `UserGroup`.
- [backend/src/prisma/migrations/20260423000000_ttsrh_saved_filters/migration.sql](backend/src/prisma/migrations/20260423000000_ttsrh_saved_filters/migration.sql) — миграция SQL.
- [backend/src/shared/features.ts](backend/src/shared/features.ts) — `advancedSearch`, `checkpointTtql` флаги.
- [backend/src/modules/search/search.router.ts](backend/src/modules/search/search.router.ts), [backend/src/modules/saved-filters/saved-filters.router.ts](backend/src/modules/saved-filters/saved-filters.router.ts) — stub-роутеры.
- [backend/src/app.ts](backend/src/app.ts) — условный mount.
- [frontend/src/lib/features.ts](frontend/src/lib/features.ts), [frontend/src/pages/SearchPage.tsx](frontend/src/pages/SearchPage.tsx), [frontend/src/App.tsx](frontend/src/App.tsx), [frontend/src/components/layout/Sidebar.tsx](frontend/src/components/layout/Sidebar.tsx) — route + sidebar-item + placeholder.
- [docs/tz/TTSRH-1.md](docs/tz/TTSRH-1.md) §13 — план из 21 PR добавлен в ТЗ.
- [frontend/.env.example](frontend/.env.example) — `VITE_FEATURES_ADVANCED_SEARCH=false`.

### Влияние на prod

При штатной конфигурации (`FEATURES_ADVANCED_SEARCH=false`) — 0 эффекта. Новые таблицы создаются пустыми, эндпоинты `/api/search/*` возвращают 404 (Express fallback), пункт сайдбара не рендерится. Feature flag флипается **с перезапуском контейнера** (backend читает env на import-time; frontend — на build-time).

### Проверки

- `npx prisma validate` — schema valid.
- `npx prisma generate` — клиент генерируется.
- Backend `npm run lint` — 0 ошибок, 2 pre-existing warnings (не в новых файлах).
- Frontend `npm run lint` — 0 ошибок, pre-existing warnings (не в новых файлах).
- Backend/frontend `npx tsc --noEmit` — зелёные.
- `npm test` — не запускался локально (требует Postgres); пойдёт в CI.
- `pre-push-reviewer` — LGTM, 2 medium-фикса применены в follow-up коммите.

---

## [2.26] [2026-04-20] fix: коллизия кэша поиска + утечка фильтров при смене проекта


---

## [2.26] [2026-04-20] fix: коллизия кэша поиска + утечка фильтров при смене проекта

**PR:** [#98](https://github.com/NovakPAai/tasktime-mvp/pull/98)
**Ветка:** `claude/jack-fix-issues-list-truncated`

### Что изменилось

**Backend:**
- `issues.service.ts`: `search` обрезается до 200 символов перед передачей в Prisma-предикат — теперь совпадает с Redis-ключом (устранена коллизия кэша при длинных запросах)

**Frontend:**
- `issues.store.ts`: `filters` сбрасываются в `initialFilters` при смене проекта — устранена утечка `issueTypeConfigId`/`assigneeId` из одного проекта в другой

**CI:**
- `ai-review.yml`: убран `paths-ignore` — AI Code Review запускается на каждый PR без исключений

### Файлы
- `backend/src/modules/issues/issues.service.ts`
- `frontend/src/store/issues.store.ts`
- `.github/workflows/ai-review.yml`

---

## [2.25] [2026-04-19] feat: серверная пагинация списка задач

**PR:** [#97](https://github.com/NovakPAai/tasktime-mvp/pull/97)
**Ветка:** `claude/jack-fix-issues-list-truncated`

### Что изменилось

**Backend:**
- `GET /projects/:projectId/issues` — принимает `page` и `limit` (по умолчанию 50), возвращает `PaginatedResponse` с `meta.total`
- `parsePagination` из `shared/utils/params.ts` — статический импорт (ранее был динамический)
- Cache-ключ для списка задач включает `page` и `limit`; поле `search` кодируется через `encodeURIComponent` с обрезкой до 200 символов

**Frontend:**
- `listIssues` возвращает `PaginatedResponse<Issue>` вместо `Issue[]`
- `listAllIssues` — новая функция для пикеров (Releases, Dashboard), загружает все страницы параллельно по 500 задач за запрос через `Promise.all`
- `useIssuesStore`: серверная пагинация (50/страница), race condition guard (`fetchSeq`), сброс стора при смене проекта (`currentProjectId`), поле `error` с отображением в UI
- `ProjectDetailPage`: убран tree-mode (несовместим с серверной пагинацией), подключена пагинация таблицы, счётчик задач берётся из `total` (серверное значение)
- Пикеры в `GlobalReleasesPage`, `ReleasesPage`, `DashboardPage` переведены на `listAllIssues`

### Файлы
- `backend/src/modules/issues/issues.router.ts`
- `backend/src/modules/issues/issues.service.ts`
- `frontend/src/api/issues.ts`
- `frontend/src/store/issues.store.ts`
- `frontend/src/pages/ProjectDetailPage.tsx`
- `frontend/src/pages/GlobalReleasesPage.tsx`
- `frontend/src/pages/ReleasesPage.tsx`
- `frontend/src/pages/DashboardPage.tsx`

---

## [2.24] [2026-04-19] fix(checkpoints): TTMP-160 — КТ с будущим дедлайном больше не показывается как «Пройдено»

**PR:** (to be filled after push)
**Ветка:** `fix/ttmp-160-pending-before-deadline`

### Что было

Формула состояния КТ из §12.4 ТЗ давала `state = OK` сразу как только в релизе не оставалось нарушений, **независимо от deadline**. Это приводило к тому, что КТ со сроком через две недели показывалась релиз-менеджеру как «пройдено» — дезинформация: задачи ещё могут добавляться и переоткрываться.

### Что теперь

```ts
function computeState(violationsCount, deadline, now): CheckpointState {
  if (now.getTime() < deadline.getTime()) return 'PENDING';
  return violationsCount === 0 ? 'OK' : 'VIOLATED';
}
```

- `PENDING` — дедлайн ещё не наступил (независимо от текущего числа нарушений). КТ «в процессе».
- `OK` — дедлайн наступил, нарушений нет. Финальный успех.
- `VIOLATED` — дедлайн наступил, есть нарушения. Финальная неудача.
- `isWarning` (жёлтая подсветка поверх `PENDING`) работает как и раньше: `PENDING` + близко к дедлайну + есть нарушения.

### Изменения
- `backend/src/modules/releases/checkpoints/checkpoint-engine.service.ts` — `computeState` переписан.
- `backend/tests/checkpoint-engine.unit.test.ts` — два старых теста («empty applicable set → OK», «all pass → OK») переписаны на pre-deadline→PENDING, добавлены два зеркальных post-deadline→OK. Full unit suite 62 теста зелёные.
- Full backend suite: **518 / 518 green**.
- `docs/tz/TTMP-160.md §12.4` — формула обновлена + исторический комментарий.
- `docs/user-manual/features/checkpoints.md` — новая секция «Состояния КТ» с таблицей.

### Влияние на prod

После деплоя на первом cron-тике (в пределах 10 мин) каждая существующая КТ с `state=OK` и `deadline>now` пересчитается в `PENDING` + запишет `lastEvaluatedAt`. Никаких схема-миграций — только значения в поле `state` поменяются в `ReleaseCheckpoint`. `CheckpointViolationEvent` не затрагивается (только open/resolve-пары при реальных нарушениях).

**Контрактные уточнения:**
- Метрика `violatedCheckpoints` в снапшотах `ReleaseBurndownSnapshot` и в ответе `GET /burndown` **не меняется** — она всегда считала только `state='VIOLATED'`. Под новой семантикой это значит «пост-дедлайн нарушения», что соответствует спеке FR-29.
- `isWarning` на GET `/checkpoints` вычисляется от `new Date()` на каждом HTTP-запросе, а `state` приходит из БД (обновляется каждые 10 мин cron-ом). В окне ≤10 мин после перехода через deadline возможно кратковременное расхождение: `state='PENDING'` + `isWarning=true` для КТ, у которой дедлайн только что прошёл. Выравнивается на следующем cron-тике. Это не новое поведение — было и до фикса.
- Риск-скоринг (`computeReleaseRisk`) считает только `state='VIOLATED'` → под новой семантикой в score попадают **только пост-дедлайн нарушения**. КТ с 20 нарушениями и дедлайном завтра по-прежнему даёт score=0 (как и было до этого фикса: раньше это был `state='PENDING'` тоже не попадавший в score). Поведение score на prod не меняется.

---

## [2.23] [2026-04-19] feat(checkpoints): TTMP-160 PR-12 — E2E + axe-core a11y + documentation

**PR:** (to be filled after push)
**Ветка:** `ttmp-160/e2e-docs`

### Что изменилось
- **E2E:** `frontend/e2e/specs/15-checkpoints.spec.ts` — smoke на вкладках «Контрольные точки» / «Диаграмма сгорания» + RBAC-smoke (plain USER → 403 на `/api/releases/:id/checkpoints`). Тесты defensive — `test.skip` при отсутствии нужных surface-ов в окружении.
- **a11y:** `@axe-core/playwright@^4.11.2` добавлен как dev-dep. Axe-сканы на каждой вкладке с тегами `wcag2a` / `wcag2aa`, ассёрт «no critical / serious violations». Console-лог деталей при фейле для диагностики.
- **Docs — USER_GUIDE:** новый раздел «Контрольные точки релиза» в `docs/RU/USER_GUIDE.md` с разбивкой по ролям.
- **Docs — API reference:** в `docs/api/reference.md` добавлена отдельная секция «TTMP-160 — Release Checkpoints & Burndown (manual section)» после AUTO-GENERATED блока с полным списком эндпоинтов и RBAC-матрицей, response shape для `/burndown`.
- **Docs — architecture:** в `docs/architecture/backend-modules.md` добавлена секция «releases/checkpoints» с разбивкой по файлам сервисов + таблица cron-job + лок-ключей + заметка о cache invariants.
- **Docs — user-manual:** два новых файла:
  - `docs/user-manual/features/checkpoints.md` — полное руководство по КТ (роли, типы, шаблоны, матрица, риск-скоринг).
  - `docs/user-manual/features/release-burndown.md` — диаграмма сгорания (метрики, backfill, retention, overdue-поведение).
- **TZ:** `docs/tz/TTMP-160.md` §13.5 — PR-11 ✅ merged (#92), PR-12 🚧 → финал после мержа, 11/12 → 12/12.
- **INDEX:** 10/12 → 11/12 PR merged (перейдёт в «DONE» после мержа PR-12).
- Frontend tsc clean; e2e-spec синтаксически валиден (run требует E2E_ADMIN_PASSWORD + staging).

---

## [2.22] [2026-04-19] feat(checkpoints): TTMP-160 PR-11 — burndown frontend (recharts + вкладка BURNDOWN)

**PR:** (to be filled after push)
**Ветка:** `ttmp-160/burndown-frontend`

### Что изменилось
- **Frontend FR-29:** `api/release-burndown.ts` — `getBurndown(releaseId, { metric, from?, to? })` + `backfillBurndown(releaseId, date?)` + типы `BurndownResponse` / `BurndownPoint` / `IdealPoint` / `BurndownMetric`.
- **Frontend FR-30:** `components/releases/ReleaseBurndownChart.tsx` — recharts `<LineChart>` с двумя линиями (actual solid blue, ideal dashed grey). Переключатель метрики `Задачи / Часы / Нарушения` через Ant `Segmented`, кнопки «Обновить» и «Backfill». Пользовательский tooltip с полями `total/done` или `totalCheckpoints` (зависит от метрики). `seqRef` guard против race при быстрой смене метрики.
- **Frontend FR-31:** CTA «Backfill» виден только для `SUPER_ADMIN` / `ADMIN` (соответствие SEC-8 бэкенда) — через новый проп `canBackfillBurndown` на `DetailPanel`. RELEASE_MANAGER не видит кнопку.
- **Frontend новая вкладка:** «Диаграмма сгорания» в `DetailPanel` на `GlobalReleasesPage` (после «Контрольные точки», перед «История»).
- **Frontend dep:** `recharts@^3.8.1` добавлен в `package.json` (+ обновлён `package-lock.json`).
- **Empty-state:** при отсутствии снапшотов показывается Ant `Empty` с подсказкой «Нажмите Backfill…» (только для ADMIN/SUPER_ADMIN).
- Frontend tsc + lint + build clean.

---

## [2.21] [2026-04-18] feat(checkpoints): TTMP-160 PR-10 — burndown backend (snapshots + API + cron)

**PR:** (to be filled after push)
**Ветка:** `ttmp-160/burndown-backend`

### Что изменилось
- **Backend FR-28 snapshots:** `burndown.service.ts` — `captureSnapshot(releaseId, date?)` собирает агрегаты по `ReleaseItem` (total/done/open/cancelled + сумма `estimatedHours`) + счётчики по `ReleaseCheckpoint` (`violatedCheckpoints`, `totalCheckpoints`). Upsert по `(releaseId, snapshotDate)` — одна запись в день, многократные тики идемпотентны.
- **Backend FR-29 API:** `GET /api/releases/:releaseId/burndown?metric=issues|hours|violations&from=&to=` возвращает `{ releaseId, metric, plannedDate, releaseDate, initial, series[], idealLine[] }`. Ideal-line строится по формуле §12.4: `value = start_value * (1 − (day − start) / (end − start))` от первого снапшота до `plannedDate`. Redis-кэш `burndown:{releaseId}:{metric}:{from}:{to}` TTL 300s, инвалидация — на каждом `recomputeForRelease` + `captureSnapshot`.
- **Backend FR-31 backfill:** `POST /api/releases/:releaseId/burndown/backfill` (ADMIN/SUPER_ADMIN — SEC-8; RELEASE_MANAGER 403) с опциональным body `{ date?: YYYY-MM-DD }`. Audit `burndown.backfilled` с `meta.snapshotDate`.
- **Backend FR-32 retention:** `purgeOldSnapshots()` удаляет daily-снапшоты для релизов со статусом DONE/CANCELLED и `releaseDate ≤ now − BURNDOWN_RETENTION_DAYS_AFTER_DONE` (default 90 дней), **сохраняя самый свежий снапшот** на релиз, чтобы UI мог отрисовать финальную точку.
- **Scheduler:** `checkpoint-scheduler.service.ts` расширен двумя cron-задачами — `BURNDOWN_SNAPSHOT_CRON` (default `5 0 * * *`, лок `burndown:snapshot:lock` TTL 600s) и `BURNDOWN_RETENTION_CRON` (default `0 3 * * 0`, лок `burndown:retention:lock` TTL 600s). Публичный `runOnce('burndown-snapshot' | 'burndown-retention')` для интеграционных тестов (FR-28).
- **Router:** новый `burndown.router.ts`, смонтирован в `app.ts` на `/api` рядом с `releaseCheckpointsRouter`.
- `backend/tests/burndown.test.ts`: 10 интеграционных тестов — backfill (ADMIN 201, RELEASE_MANAGER 403, USER 403, upsert), scheduler tick (idempotent per day), retention (оставляет newest, удаляет остальные), GET (shape + initial + idealLine) с metric=issues и metric=hours, read-gate (plain USER 403, project-member USER 200).
- **Full backend suite:** 516 / 516 green (+10 новых тестов).

---

## [2.20] [2026-04-19] feat(checkpoints): TTMP-160 PR-9 — матрица «Задачи × КТ» + CSV-экспорт

**PR:** [#90](https://github.com/NovakPAai/tasktime-mvp/pull/90)
**Ветка:** `ttmp-160/matrix`

### Что изменилось
- **Backend FR-26/FR-27 matrix:** новый `GET /api/releases/:releaseId/checkpoints/matrix` с опциональным `?format=csv`. Возвращает `{ releaseId, issues[], checkpoints[], cells[][] }` где `cells[i][j]` — `{ state: 'passed' | 'violated' | 'pending' | 'na', reason? }`. Состояние выводится из снапшотов `applicableIssueIds` / `passedIssueIds` / `violations` на каждой `ReleaseCheckpoint`. Read-gate тот же, что у `/checkpoints` (RELEASES_VIEW + global-role bypass).
- **Backend CSV:** `checkpointsMatrixToCsv(matrix)` — одна строка на задачу (`issue_key, issue_title, <cp1_name>, <cp2_name>, ...`), ячейки `OK / VIOLATED (<reason>) / PENDING / —`. UTF-8 BOM + CRLF (совместимость с Excel Cyrillic + RFC 4180).
- **Frontend FR-26:** `components/releases/CheckpointsMatrix.tsx` — Ant Table с sticky первой колонкой, цветными иконками (CheckCircle/CloseCircle/ClockCircle/MinusCircle) + Tooltip с reason, легендой, кнопками «Обновить» и «Экспорт CSV». Переключатель «Список / Матрица» в вкладке «Контрольные точки» на `GlobalReleasesPage` / `DetailPanel`.
- **Frontend API:** `getCheckpointsMatrix(releaseId)` + `downloadCheckpointsMatrixCsv(releaseId)` (Blob) в `api/release-checkpoints.ts`, типы `CheckpointsMatrixResponse` / `MatrixCell` / `MatrixCellState`.
- `backend/tests/checkpoints-matrix.test.ts`: 4 интеграционных теста — JSON shape с passed/violated/na ячейками (проверяется `issueTypes` фильтр), CSV с BOM+CRLF и правильными символами, RBAC 403 / 200 для USER без/с членством в проекте.

---

## [2.19] [2026-04-18] feat(checkpoints): TTMP-160 PR-8 — bulk-apply + webhook + audit page

**PR:** [#88](https://github.com/NovakPAai/tasktime-mvp/pull/88)
**Ветка:** `ttmp-160/bulk-webhook-audit`

### Что изменилось
- **Backend FR-21 bulk-apply:** `POST /api/admin/checkpoint-templates/:id/apply-bulk` — по списку `releaseIds` применяет шаблон к каждому релизу с per-release RBAC (SEC-5). Возвращает 200 если все успешно, 207 Multi-Status при смешанных исходах: `{ successful, forbidden, failed }`. Audit action `checkpoint_template.applied_bulk`.
- **Backend FR-17 webhook:** `webhook-notifier.service.ts` — `notifyViolation()` отправляет POST на `CheckpointType.webhookUrl` при переходе в VIOLATED. Debounce по `lastWebhookSentAt` + `minStableSeconds` для защиты от flapping. Таймаут через `CHECKPOINT_WEBHOOK_TIMEOUT_MS`. Hook в `recomputeForRelease` вызывается после commit'а транзакции.
- **Backend FR-23 audit page:** `audit.service.ts` + `audit.router.ts`. `GET /api/admin/checkpoint-audit` с фильтрами (dateRange / project / release / checkpointType / onlyOpen / limit) + `GET /api/admin/checkpoint-audit/csv` (SEC-9 минимальный payload: event_id, occurred_at, resolved_at, project_key, release_name, checkpoint_name, issue_key, criterion_type, reason). SEC-6 gate: `SUPER_ADMIN / ADMIN / AUDITOR`.
- **Frontend FR-21:** `BulkApplyTemplateModal.tsx` с 2-step flow (выбор шаблона → apply → Result view с `Применено / Запрещено / Ошибка`). Чекбоксы в таблице `GlobalReleasesPage` + toolbar с кнопкой «Применить шаблон» появляется при выборе релизов (canManage only). CLAUDE.md: refresh на любом закрытии модалки.
- **Frontend FR-23:** `pages/admin/AdminCheckpointAuditPage.tsx` — таблица событий с фильтрами (date range + project/release/type UUID + onlyOpen switch), кнопка «Экспорт CSV». Route `/admin/checkpoint-audit` обёрнут в `<AdminGate allow={canViewCheckpointAudit}>`. Новая запись в Sidebar группе «Релизы».
- **Frontend API:** `api/checkpoint-audit.ts` (listAuditEvents + downloadAuditCsv с blob), `applyBulkCheckpointTemplate` в `api/release-checkpoint-templates.ts`.
- `frontend/src/lib/roles.ts`: `canViewCheckpointAudit(roles)` — зеркалит backend-гейт.
- `backend/tests/checkpoints-bulk-webhook-audit.test.ts`: 11 интеграционных тестов — bulk-apply (ADMIN/RM/USER 403/non-existent/401), audit list (AUDITOR 200, USER 403, onlyOpen filter, projectId filter, CSV format), webhook debounce (с vi.spyOn(fetch) — flapping OK→VIOLATED→OK→VIOLATED внутри minStableSeconds не вызывает повторный POST).

---

## [2.18] [2026-04-18] feat(checkpoints): TTMP-160 PR-7 — board indicators + TopBar badge + Dashboard filter

**PR:** [#87](https://github.com/NovakPAai/tasktime-mvp/pull/87)
**Ветка:** `ttmp-160/board-topbar`

### Что изменилось
- `frontend/src/components/issues/IssueCheckpointIndicator.tsx`: мини-индикатор FR-11 (красная полоска + иконка + счётчик + Tooltip со списком нарушенных КТ), вариант `stripe` (по умолчанию, для карточки задачи) и `compact` (для тесных мест). `role="status"` + `aria-label`.
- `frontend/src/hooks/useMyCheckpointViolationsCount.ts`: polling-хук на 60 с, использует `setTimeout`-каскад (не `setInterval`) чтобы не накапливались запросы при медленном бэкенде.
- `frontend/src/components/layout/TopBar.tsx`: бейдж с иконкой + счётчиком + Tooltip + переход на `/dashboard?filter=my-checkpoint-violations` (FR-12). Отображается только при `count > 0`.
- `frontend/src/pages/BoardPage.tsx`: загрузка `getViolatingIssuesForProject(projectId)` после основного load, карта `violatingMap`, рендер `IssueCheckpointIndicator` на каждой карточке задачи между title и custom fields.
- `frontend/src/pages/DashboardPage.tsx`: реагирует на `?filter=my-checkpoint-violations`, рендерит список из `getMyCheckpointViolations()` вместо «Мои задачи»; toggle-chip для переключения режима.
- `frontend/src/api/release-checkpoints.ts`: `getViolatingIssuesForProject`, `getMyCheckpointViolations`, `getMyCheckpointViolationsCount` + тип `IssueViolationSummary`.
- `backend/src/modules/releases/checkpoints/release-checkpoints.{service,router}.ts`: 
  - `listViolatingIssuesForProject(projectId)` — дедупликация по issueId, инкл. INTEGRATION-релизы с items из проекта (FR-11).
  - `listMyViolations(userId, systemRoles)` — SEC-7 фильтр по `assigneeId === userId` + scope по проектам-членам (прямой `UserProjectRole` + через группы); global read-роли bypass'ятся.
  - `countMyViolations(userId)` — Postgres `$queryRaw` aggregate (`jsonb_array_elements` + issue-assignee join) для дешёвого 60-секундного polling'а бейджа.
  - Три новых endpoint: `GET /api/projects/:projectId/checkpoint-violating-issues` (ISSUES_VIEW gate), `GET /api/my-checkpoint-violations`, `GET /api/my-checkpoint-violations/count`.
- `backend/tests/checkpoints-board-topbar.test.ts`: 9 интеграционных тестов — FR-11 happy-path, project-membership 403, SEC-7 assignee-only, ADMIN bypass, count endpoint + 401.

---

## [2.17] [2026-04-18] feat(checkpoints): TTMP-160 PR-6 — release / issue UI (traffic light, risk badge, breakdown, preview)

**PR:** [#86](https://github.com/NovakPAai/tasktime-mvp/pull/86)
**Ветка:** `ttmp-160/release-issue-ui`

### Что изменилось
- `frontend/src/components/releases/`: новые компоненты — `CheckpointTrafficLight` (FR-18: цвет+иконка+текст+aria), `ReleaseRiskBadge` (LOW/MEDIUM/HIGH/CRITICAL), `CheckpointsBlock` (разбивка N/M/K + раскрывающиеся списки + inline-actions Пересчитать/Удалить), `ApplyCheckpointTemplateModal` (FR-14 двухшаговый предпросмотр), `CheckpointRiskFilter` (FR-13), `IssueCheckpointsSection` (FR-20 группировка по релизу + FR-22 история нарушений)
- `frontend/src/api/release-checkpoints.ts`: API-клиент — getReleaseCheckpoints, previewTemplate, applyTemplate, addCheckpoints, recomputeRelease, deleteReleaseCheckpoint, getIssueCheckpoints, getIssueCheckpointEvents
- `frontend/src/pages/GlobalReleasesPage.tsx`: новая вкладка «Контрольные точки» в DetailPanel, риск-колонка в таблице релизов, CheckpointRiskFilter в фильтр-баре; per-release risk fetch параллельно после loadReleases с race-guard через loadSeqRef; clear state при смене release; checkpointsError + Alert
- `frontend/src/pages/IssueDetailPage.tsx`: `IssueCheckpointsSection` между Links и Comments; `onCancel` edit-модалки теперь вызывает `load()` (CLAUDE.md)
- `backend/src/modules/releases/checkpoints/release-checkpoints.{router,service}.ts`: новый `GET /api/issues/:id/checkpoint-events` (cap 200, joined с releaseName + checkpointName + releaseId), функция `listEventsForIssue`, gated через `assertIssueRead`

---

## [2.16] [2026-04-18] feat(checkpoints): TTMP-160 PR-5 — admin UI (types, templates, sync-instances)

**PR:** [#85](https://github.com/NovakPAai/tasktime-mvp/pull/85)
**Ветка:** `ttmp-160/admin-ui`

### Что изменилось
- `frontend/src/pages/admin/`: новые страницы `AdminReleaseCheckpointTypesPage` (CRUD + визуальный конструктор 6 типов критериев), `AdminReleaseCheckpointTemplatesPage` (CRUD + clone + drag-n-drop через @hello-pangea/dnd), `SyncInstancesModal` (FR-15 с default none-selected + чекбоксами релизов)
- `frontend/src/api/`: новые клиенты `release-checkpoint-types.ts` и `release-checkpoint-templates.ts`
- `frontend/src/App.tsx`: роуты `/admin/release-checkpoint-types` и `/admin/release-checkpoint-templates`, обернуты в `<AdminGate allow={canManageCheckpoints}>`
- `frontend/src/components/layout/Sidebar.tsx`: две записи в группе «Релизы»
- `frontend/src/lib/roles.ts`: `canManageCheckpoints(roles)` — зеркалит backend-гейт
- `backend/src/modules/releases/checkpoints/checkpoint-types.{service,router}.ts`: `listActiveInstances(id)` + `GET /:id/instances` для питания sync-модалки (cap 200, все состояния, gated)
- `backend/tests/checkpoints.test.ts`: 2 новых теста для `/instances` (happy-path + USER 403)

---

## [2.15] [2026-04-18] feat(checkpoints): TTMP-160 PR-4 — triggers (cron + event hooks + plannedDate sync)

**PR:** [#84](https://github.com/NovakPAai/tasktime-mvp/pull/84)
**Ветка:** `ttmp-160/triggers`

### Что изменилось
- `backend/src/shared/middleware/request-context.ts`: AsyncLocalStorage-контекст с per-request dedup (Set<releaseId> + Set<issueId>), flush на `res.on('finish')`, fire-and-forget с логированием ошибок
- `backend/src/modules/releases/checkpoints/checkpoint-triggers.service.ts`: `scheduleRecomputeForIssue/Issues/Release` — внутри request-context кладут в pending-set, иначе синхронный recompute с дедупом по releaseId
- `backend/src/modules/releases/checkpoints/checkpoint-scheduler.service.ts`: `node-cron` шедулер, `runOnce(job)` для тестов, Redis-lock `checkpoints:scheduler` TTL 540 с, graceful SIGTERM-drain с ожиданием in-flight тика
- Event-хуки: `issues.service.ts` (updateIssue, updateStatus, assignIssue, bulkUpdateIssues, bulkTransitionIssues, deleteIssue, bulkDeleteIssues — резолв releaseIds до delete), `issue-custom-fields.service.ts` (upsertIssueCustomFields), `workflow-engine.service.ts` (executeTransition — единая точка), `releases.service.ts` (addReleaseItems, removeReleaseItems, updateRelease с пересчётом deadline при смене plannedDate)
- `backend/src/config.ts`: `CHECKPOINTS_SCHEDULER_*`, `CHECKPOINTS_EVAL_WINDOW_DAYS`, `CHECKPOINT_WEBHOOK_TIMEOUT_MS`, `BURNDOWN_*` (placeholders для PR-10)
- `backend/src/app.ts`: `checkpointContextMiddleware` до всех route-handler-ов (до metrics/express.json для защиты ALS-контекста)
- `backend/src/server.ts`: `startCheckpointScheduler()` после listen, async SIGTERM/SIGINT с await `stopCheckpointScheduler()`
- `backend/package.json`: `node-cron` + `@types/node-cron`
- `backend/tests/checkpoints-triggers.test.ts`: 5 интеграционных тестов (status-hook, assignee-hook, release-items-hook, plannedDate shift, scheduler.runOnce)

---

## [2.14] [2026-04-18] feat(checkpoints): TTMP-160 PR-3 — release binding + breakdown + preview + inline-include

**PR:** [#82](https://github.com/NovakPAai/tasktime-mvp/pull/82)
**Ветка:** `ttmp-160/release-binding`

### Что изменилось
- `backend/src/modules/releases/checkpoints/evaluation-loader.service.ts`: batch-loader (4 запроса, без N+1) release → `EvaluationIssue[]` + `EvaluationContext` с canonical-сортировкой MULTI_SELECT массивов
- `backend/src/modules/releases/checkpoints/release-checkpoints.service.ts`: `applyTemplate` с FR-15 snapshot, `previewTemplate` (FR-14 dry-run), `addCheckpoints`, `removeCheckpoint` (закрывает open events до delete), `recomputeForRelease` (идемпотентно через hash+state+lastEvaluatedAt), `reconcileViolationEvents` (open/close lifecycle в одной транзакции), `syncInstances`, `listForIssue`, `listForRelease` с breakdown + passedIssues + violatedIssues
- `backend/src/modules/releases/checkpoints/release-checkpoints.router.ts`: GET/POST/DELETE `/api/releases/:id/checkpoints[/apply-template|/preview-template|/recompute|/:checkpointId]`, GET `/api/issues/:id/checkpoints`, POST `/api/admin/checkpoint-types/:id/sync-instances`; `assertReleaseMutate` (RELEASES_EDIT + global-role bypass) и `assertReleaseRead` (RELEASES_VIEW)
- `backend/src/modules/issues/issues.router.ts`: `GET /api/issues/:id?include=checkpoints` inline (FR-19)
- `backend/src/modules/releases/checkpoints/release-checkpoint.dto.ts`: Zod схемы (applyTemplate, previewTemplate, addCheckpoints, syncInstances)
- Redis-кэш `release:{id}:checkpoints` TTL 60 с, инвалидация через plain DEL
- `backend/tests/checkpoints-release-binding.test.ts`: 17 интеграционных тестов (apply/add/remove/preview/list/recompute idempotency/sync/FR-19/FR-15 snapshot/RBAC/event closure)

---

## [2.13] [2026-04-18] feat(checkpoints): TTMP-160 PR-2 — engine + evaluateCriterion

**PR:** [#81](https://github.com/NovakPAai/tasktime-mvp/pull/81)
**Ветка:** `ttmp-160/engine`

### Что изменилось
- `backend/src/modules/releases/checkpoints/evaluate-criterion.ts`: pure-function evaluator 6 типов критериев (STATUS_IN, DUE_BEFORE, ASSIGNEE_SET, CUSTOM_FIELD_VALUE с NOT_EMPTY/EQUALS/IN, ALL_SUBTASKS_DONE, NO_BLOCKING_LINKS), Russian reason-строки (FR-16)
- `backend/src/modules/releases/checkpoints/checkpoint-engine.service.ts`: `evaluateCheckpoint` (state machine OK/PENDING/VIOLATED + isWarning с `Math.ceil` + breakdown + violationsHash SHA-1), `computeReleaseRisk` (веса 8/4/2/1, бэнды LOW/MEDIUM/HIGH/CRITICAL), `computeViolationsHash` (детерминированный, без issueKey/issueTitle чтобы не триггерить писать в БД при ренейме задачи)
- `backend/tests/checkpoint-engine.unit.test.ts`: 60 unit-тестов — каждый тип критерия (applicable + passed + failed + edge), state transitions, isWarning window, hash stability, все 4 риск-бэнда + границы 0.01/0.30/0.70

---

## [2.12] [2026-04-18] feat(checkpoints): TTMP-160 PR-1 — schema + CRUD types/templates

**PR:** [#79](https://github.com/NovakPAai/tasktime-mvp/pull/79)
**Ветка:** `ttmp-160/foundation`

### Что изменилось
- `backend/src/prisma/schema.prisma`: enum `CheckpointWeight` (CRITICAL/HIGH/MEDIUM/LOW), `CheckpointState` (PENDING/OK/VIOLATED), модели `CheckpointType`, `CheckpointTemplate`, `CheckpointTemplateItem`, `ReleaseCheckpoint` (с `criteriaSnapshot`/`offsetDaysSnapshot`/`applicableIssueIds`/`passedIssueIds`/`violations`/`violationsHash`), `CheckpointViolationEvent`, `ReleaseBurndownSnapshot`
- `backend/src/prisma/migrations/20260422000000_release_checkpoints/migration.sql`: миграция (append-only, после последней применённой)
- `backend/src/modules/releases/checkpoints/`: DTO (`checkpoint.dto.ts` с Zod + discriminated union критериев, `StatusCategory` через `z.nativeEnum`), сервисы и роутеры CRUD `/api/admin/checkpoint-types` и `/api/admin/checkpoint-templates`
- `backend/src/shared/utils/prisma-errors.ts`: общие helper'ы `isUniqueViolation` + `isForeignKeyViolation`
- `/api/admin/checkpoint-types` DELETE — 409 CHECKPOINT_TYPE_IN_USE с `activeInstances` + P2003 TOCTOU-guard
- `/api/admin/checkpoint-templates/:id/clone` — автосуффикс «(копия)»
- RBAC: `requireRole('SUPER_ADMIN','ADMIN','RELEASE_MANAGER')` на все endpoint-ы
- Audit actions: `checkpoint_type.created/updated/deleted`, `checkpoint_template.created/updated/deleted/cloned`
- Backend mount в `app.ts`
- `backend/tests/checkpoints{,-dto.unit}.test.ts`: 19 DTO unit + 23 интеграционных теста (RBAC, CRUD, 409 на duplicate name / in-use, clone, cascade delete, audit log)

---

## [2.11] [2026-04-18] fix(deploy): down --remove-orphans перед up, fix port conflict

**PR:** [#78](https://github.com/NovakPAai/tasktime-mvp/pull/78)
**Ветка:** `claude/jack-fix-port-conflict`

### Что изменилось
- `deploy/scripts/deploy.sh`: перед `docker compose up` добавлен `docker compose down --remove-orphans` — гарантирует освобождение портов docker-proxy от старых контейнеров (фикс `port 3002 already allocated` для MCP)

---

## [2.10] [2026-04-14] feat(rbac): multi-role RBAC — junction table UserSystemRole

**PR:** [#33](https://github.com/NovakPAai/tasktime-mvp/pull/33)
**Ветка:** `claude/alex-rbac-multi-role`

### Что изменилось
- `backend/src/prisma/schema.prisma`: новый enum `SystemRoleType` (SUPER_ADMIN, ADMIN, RELEASE_MANAGER, USER, AUDITOR), новая модель `UserSystemRole` (junction table), поле `role: UserRole` удалено из User; добавлена Prisma-миграция
- `backend/src/shared/auth/roles.ts`: полная перезапись — `hasSystemRole()`, `hasAnySystemRole()`, `isSuperAdmin()`, `hasGlobalProjectReadAccess()` работают с массивами ролей
- `backend/src/shared/types/index.ts`, `jwt.ts`, `auth.ts`, `rbac.ts`, `redis.ts`: везде `role: UserRole` → `systemRoles: SystemRoleType[]`
- `backend/src/modules/admin/admin.router.ts`: 4 новых эндпоинта для управления системными ролями (`GET/POST/DELETE /users/:id/system-roles`, `PUT /users/:id/system-roles`)
- `backend/src/modules/users/`, `bootstrap.ts`, `seed.ts`, `prod-sync.*`, `rotate-password.*`: все ссылки на `role` обновлены до `systemRoles`
- Модульные сервисы (`issues`, `comments`, `releases`, `gitlab`, `links`, `ai`, `teams`): `actorRole: UserRole` → `actorRoles: SystemRoleType[]`, проверки через `.some()`/`.includes()`
- `frontend/src/types/auth.types.ts`, `types/index.ts`: `User.role: UserRole` → `User.systemRoles: SystemRoleType[]`, добавлен `SystemRoleType`
- `frontend/src/lib/roles.ts`: `hasSystemRole()`, `hasAnySystemRole()`, `hasGlobalProjectReadAccess()` работают с массивами
- `frontend/src/api/admin.ts`: `AdminUser.role` → `AdminUser.systemRoles[]`, новые методы `getSystemRoles`, `addSystemRole`, `removeSystemRole`, `setSystemRoles`
- `frontend/src/pages/admin/AdminUsersPage.tsx`: multi-select для системных ролей вместо одиночного select
- `frontend/src/pages/admin/AdminRolesPage.tsx`: RELEASE_MANAGER убран из project-role dropdown
- Все остальные страницы и компоненты: массовая замена проверок ролей
- `backend/tests/users.test.ts`, `auth.test.ts`, `super-admin-bootstrap.test.ts`: обновлены под новый API

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
