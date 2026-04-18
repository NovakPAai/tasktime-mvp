# ТЗ: TTMP-160 — Модуль контрольных точек релизов

**Дата:** 2026-04-18
**Тип:** EPIC | **Приоритет:** HIGH | **Статус:** IN_PROGRESS (2/12 PR merged) — см. §13.5
**Проект:** TaskTime MVP (TTMP)
**Автор ТЗ:** Claude Code (auto-generated)

---

## 1. Постановка задачи

Необходимо реализовать модуль «Контрольные точки» (далее **КТ**) для контроля соответствия задач в релизе заданным критериям. Модуль решает задачу оперативного мониторинга риска срыва релиза: релиз-менеджер заранее определяет, в какие даты и по каким критериям должны находиться задачи, включённые в релиз, а система автоматически отмечает нарушения и агрегирует их в риск-скоринг.

Функционально модуль содержит:

1. **Типы контрольных точек** (`CheckpointType`) — управляемый релиз-менеджером справочник. Каждый тип задаёт:
   - название, цвет, вес (для расчёта риска);
   - смещение в днях от плановой даты релиза (`offsetDays`, может быть отрицательным — «за N дней до релиза» или положительным — «через N дней после»);
   - набор критериев (reuse формата `ValidatorRule` с расширениями) — допускаются как системные поля (статус задачи, исполнитель, срок, связи), так и кастомные поля (`CustomField`) и их значения.
2. **Шаблоны наборов КТ** (`CheckpointTemplate`) — именованный набор типов, применяемый к релизу одним действием. Релиз-менеджер может создавать, клонировать и применять шаблоны.
3. **Экземпляры КТ на релизе** (`ReleaseCheckpoint`) — материализованные из типа/шаблона точки, привязанные к конкретному релизу. Для каждой хранится deadline (= `release.plannedDate + offsetDays`), состояние (`PENDING | OK | VIOLATED`), список задач-нарушителей с причинами.
4. **Отображение на релизе и в задачах** — светофор на карточке релиза, секция «Контрольные точки» в деталях релиза, релевантные КТ в деталях каждой задачи.
5. **Риск-скоринг релиза** — агрегат по всем КТ с учётом веса, бейдж уровня риска (`LOW | MEDIUM | HIGH | CRITICAL`) на списке и в деталях релиза.
6. **Расчёт состояния КТ** — два триггера:
   - **По расписанию** (регламентная операция) — cron каждые N минут, пересчёт всех активных релизов в окне.
   - **По событию обновления задачи** — хук в `issuesService.updateIssue` / `bulkUpdate` / `updateIssueCustomFieldValue`, который точечно пересчитывает только затронутые релизы.

### Пользовательский сценарий

**RELEASE_MANAGER** создаёт релиз `2.0.0` с `plannedDate = 2026-05-30`. В справочнике типов КТ у него заведён шаблон «Стандартный релиз» из трёх точек: «Код заморожен за 7 дней» (все задачи типа STORY/TASK в статусе ≥ REVIEW), «Все баги закрыты за 3 дня» (задачи типа BUG в DONE/CANCELLED), «Регресс пройден в день релиза» (custom field `Regression Status` = `PASSED`). Релиз-менеджер одним кликом применяет шаблон — создаются 3 экземпляра `ReleaseCheckpoint` с дедлайнами `2026-05-23`, `2026-05-27`, `2026-05-30`.

По мере приближения к дедлайнам система каждые N минут (или немедленно при изменении задачи) пересчитывает статус КТ. Пока все критерии выполнены — светофор зелёный. Если дедлайн прошёл и критерий не выполнен — КТ становится VIOLATED, светофор красный, риск релиза пересчитывается.

**DEV** открывает задачу `TTMP-205`, включённую в релиз `2.0.0`, и видит блок «Контрольные точки релиза 2.0.0»: «Код заморожен — до 2026-05-23 — 🔴 нарушена (задача не в статусе REVIEW)». Исправляет статус — в audit trail фиксируется изменение, hook пересчитывает КТ, светофор обновляется.

---

## 2. Текущее состояние

### Что уже реализовано

| Компонент | Файл | Состояние |
|-----------|------|-----------|
| Модель `Release` с `plannedDate`, `statusId`, `workflowId` | [schema.prisma:468](../../backend/src/prisma/schema.prisma#L468) | ✅ Готова, менять не нужно |
| `ReleaseItem` и прямой `Issue.releaseId` | [schema.prisma:451](../../backend/src/prisma/schema.prisma#L451) | ✅ Достаточно для выборки задач |
| `CustomField` + `IssueCustomFieldValue` (JSON value, 13 типов) | [schema.prisma:657](../../backend/src/prisma/schema.prisma#L657) | ✅ Источник значений кастом-полей |
| `ValidatorRule` — формат правил (REQUIRED_FIELDS, ALL_SUBTASKS_DONE, FIELD_VALUE…) | [workflow-engine/types.ts](../../backend/src/modules/workflow-engine/types.ts) | ✅ Переиспользуем как базу, расширим типами STATUS_IN / DUE_BEFORE / ASSIGNEE_SET |
| RBAC с ролью `RELEASE_MANAGER` и `ProjectPermission` | [shared/auth/roles.ts](../../backend/src/shared/auth/roles.ts) | ✅ Используем напрямую |
| Redis: `acquireLock` / `releaseLock`, кэш релизов | [shared/redis.ts](../../backend/src/shared/redis.ts) | ✅ Используем для cron-локинга |
| Audit `logAudit` и PATCH `/issues/:id` | [issues.router.ts:180](../../backend/src/modules/issues/issues.router.ts#L180) | ✅ Точка подключения event-хука |
| Страница релизов `GlobalReleasesPage` c `DetailPanel` | [GlobalReleasesPage.tsx](../../frontend/src/pages/GlobalReleasesPage.tsx) | ✅ Расширяем блоком КТ и светофором |
| Админка релиз-воркфлоу | [AdminReleaseWorkflowsPage.tsx](../../frontend/src/pages/admin/AdminReleaseWorkflowsPage.tsx) | ✅ Добавим рядом `AdminReleaseCheckpointTypesPage` и `AdminReleaseCheckpointTemplatesPage` |

### Чего ещё нет

- Нет **cron-инфраструктуры** в backend. Ни `node-cron`, ни `BullMQ`, ни `setInterval`-шедулеров в `server.ts`. Это первый модуль, вводящий регламентные операции, — нужно добавить аккуратно (Redis-lock, отключаемый в `config`, e2e-совместимый).
- Нет доменных моделей `CheckpointType` / `CheckpointTemplate` / `ReleaseCheckpoint`.
- Нет контракта «критерий КТ» (расширенный `ValidatorRule` для работы по множеству задач релиза).
- Нет UI-компонентов светофора (`TrafficLight`), бейджа риска и блока КТ на релизе/задаче.
- Нет «рисковых» индикаторов на уровне карточек задач (`BoardPage`, `ProjectDetailPage`) и глобального счётчика в `TopBar`.
- Нет превью-расчёта перед применением шаблона, нет snapshot-механики для критериев типа КТ.
- Нет отдельного журнала нарушений КТ (audit есть, но без выделенной выборки).
- **Нет per-checkpoint разбивки** «применимо N / прошли M / нарушают K задач»: `violations` содержит только нарушителей, отсутствует понятие «прошедших» задач и «не ещё не проверенных, но применимых».
- **Нет матрицы «Задачи × Контрольные точки»** для просмотра всего релиза одним экраном (полезно для RM при подготовке к релизу).
- **Нет диаграммы сгорания (burndown) релиза** — ни по количеству задач, ни по часам, ни по числу нарушенных КТ. Нет снапшотов ежедневного состояния релиза.
- **Нет charting-библиотеки** во фронтенде (`frontend/package.json`) — потребуется добавить `recharts`.

---

## 3. Зависимости

### Модули backend
- [ ] `releases` — новый подмодуль `checkpoints/` (router, service, engine, scheduler).
- [ ] `issues` — добавить hook в `updateIssue`, `bulkUpdate*`, `updateIssueCustomFieldValue` → вызывает `checkpointEngine.recomputeForIssue(issueId)`.
- [ ] `custom-fields` — нужны только для чтения метаданных при валидации критериев.
- [ ] `workflow-engine` — переиспользовать сериализацию `ValidatorRule`, расширить новыми типами для задачного скоупа.
- [ ] `shared/redis` — использовать `acquireLock` для идемпотентности cron-тика.
- [ ] `shared/config` — добавить `CHECKPOINTS_SCHEDULER_ENABLED`, `CHECKPOINTS_SCHEDULER_CRON` (дефолт `*/10 * * * *`), `CHECKPOINTS_EVAL_WINDOW_DAYS` (сколько дней до/после плановой даты держать релиз «активным»).

### Компоненты frontend
- [ ] `GlobalReleasesPage.tsx` — бейдж риска в колонке списка, блок «Контрольные точки» в `DetailPanel`, фильтр по риску (FR-13), массовое применение шаблона через чекбоксы (FR-21).
- [ ] `ReleasesPage.tsx` (project-scoped) — то же.
- [ ] `IssueDetailPage.tsx` — блок «КТ релиза(ов)» с группировкой по релизу (FR-20), inline-действия (FR-16) и история нарушений (FR-22).
- [ ] `BoardPage.tsx`, `ProjectDetailPage.tsx` — мини-индикатор нарушения КТ на карточках задач (FR-11).
- [ ] `DashboardPage.tsx`, `TimePage.tsx` — фильтр «Мои задачи в релизах с риском» (FR-11).
- [ ] `layout/TopBar.tsx` — badge «N моих задач нарушает КТ» с переходом в фильтрованный список (FR-12).
- [ ] `pages/admin/AdminReleaseCheckpointTypesPage.tsx` — CRUD типов (новая) с предупреждением о ретроспективном влиянии при редактировании и кнопкой «Обновить активные экземпляры» (FR-15).
- [ ] `pages/admin/AdminReleaseCheckpointTemplatesPage.tsx` — CRUD шаблонов (новая).
- [ ] `pages/admin/AdminCheckpointAuditPage.tsx` — журнал нарушений КТ для AUDITOR (FR-23).
- [ ] `components/releases/CheckpointTrafficLight.tsx` — светофор GREEN/YELLOW/RED + иконка + текст (FR-18) + Popover с детальными причинами.
- [ ] `components/releases/ReleaseRiskBadge.tsx` — LOW/MEDIUM/HIGH/CRITICAL бейдж.
- [ ] `components/releases/CheckpointsBlock.tsx` — блок на странице релиза / задачи с аккордеоном для mobile. **Для каждой КТ показывает разбивку `applicable N / passed M / violated K` (FR-25); раскрывающиеся списки «Прошли» и «Нарушают» с issueKey и человекочитаемой причиной.**
- [ ] `components/releases/CheckpointsMatrix.tsx` — матричное представление «Задачи × КТ» (FR-26), переключатель вида «Список / Матрица» в `DetailPanel`. Ячейка: 🟢/🟡/🔴/— (not applicable). Экспорт CSV.
- [ ] `components/releases/ReleaseBurndownChart.tsx` — диаграмма сгорания на Recharts (FR-29). Переключатель метрики (количество задач / часы / нарушенные КТ), ideal line (линейная от initial → 0 к plannedDate), actual line (точки из `ReleaseBurndownSnapshot`). Tooltip с деталями по дню.
- [ ] `components/releases/ApplyCheckpointTemplateModal.tsx` — выбор шаблона + **превью** «будет X нарушенных из Y задач» (FR-14).
- [ ] `components/releases/CheckpointRiskFilter.tsx` — фильтр списка релизов по уровню риска (FR-13).
- [ ] `components/issues/IssueCheckpointIndicator.tsx` — мини-индикатор на карточке задачи (FR-11).
- [ ] `api/release-checkpoints.ts`, `api/release-checkpoint-types.ts`, `api/release-checkpoint-templates.ts`, `api/release-burndown.ts` — API-клиенты.
- [ ] `types/release.types.ts` — расширить типами `Checkpoint*`, `BurndownSnapshot`, `BurndownSeries`.
- [ ] В `DetailPanel` (`GlobalReleasesPage.tsx`, `ReleasesPage.tsx`) — новая вкладка `DetailTab.BURNDOWN` (рядом с существующими Items/Sprints/History), доступна всем, кто видит релиз; по умолчанию выбрана для RM.

### Модели данных (Prisma) — новые
- [ ] `CheckpointType` — id, name, color, weight (CRITICAL/HIGH/MEDIUM/LOW), offsetDays (Int), warningDays (Int, default 3), criteria (Json — массив `CheckpointCriterion`, логика AND — все критерии должны пройти), isActive, createdAt, updatedAt.
- [ ] `CheckpointTemplate` — id, name, description, createdById, createdAt, updatedAt.
- [ ] `CheckpointTemplateItem` — templateId, checkpointTypeId, orderIndex, @@unique([templateId, checkpointTypeId]).
- [ ] `ReleaseCheckpoint` — id, releaseId, checkpointTypeId, **criteriaSnapshot (Json — копия criteria типа на момент применения, FR-15)**, **offsetDaysSnapshot (Int, FR-15)**, deadline (Date), state (`PENDING | OK | VIOLATED`), lastEvaluatedAt, violations (Json — массив `{ issueId, issueKey, issueTitle, reason, criterionType }`), violationsHash (String — для FR-7 skip write без diff), createdAt, updatedAt, @@unique([releaseId, checkpointTypeId]), @@index([releaseId]), @@index([deadline]), @@index([state]).
- [ ] `CheckpointViolationEvent` — id, releaseCheckpointId, issueId, issueKey, reason, criterionType, occurredAt, resolvedAt (nullable), @@index([releaseCheckpointId]), @@index([issueId]), @@index([occurredAt]). **Журнал для FR-22/FR-23.** Пишется при переходе в VIOLATED и закрывается при возврате в OK.
- [ ] `ReleaseBurndownSnapshot` (новая модель для FR-28/FR-29) — id, releaseId, snapshotDate (Date, day precision), totalIssues (Int), doneIssues (Int), openIssues (Int), cancelledIssues (Int), totalEstimatedHours (Decimal 8,2), doneEstimatedHours (Decimal 8,2), openEstimatedHours (Decimal 8,2), violatedCheckpoints (Int), totalCheckpoints (Int), capturedAt (DateTime). @@unique([releaseId, snapshotDate]), @@index([releaseId]), @@index([snapshotDate]). Ежедневный снапшот состояния релиза для расчёта диаграммы сгорания.
- [ ] Расширение `ReleaseCheckpoint`: поля `applicableIssueIds (Json — string[])`, `passedIssueIds (Json — string[])` рассчитываются вместе с `violations` при каждом `recomputeForRelease`. Позволяет отображать per-checkpoint разбивку (FR-25) и матрицу (FR-26) без дополнительных запросов.

### Внешние зависимости
- [ ] `node-cron` (MIT, ~100 KB) — планировщик. Альтернатива: чистый `setInterval` + Redis-lock (проще, не добавляет зависимость). **Решение:** в v1 появляется уже ДВЕ регламентные задачи (пересчёт КТ + ежедневный снапшот burndown), поэтому **добавляем `node-cron`** сразу — разные cron-выражения (`*/10 * * * *` для КТ, `5 0 * * *` для burndown) работают чище через cron-строки.
- [ ] `recharts` (MIT, ~90 KB gzipped) — диаграмма сгорания и, потенциально, другие графики (матрица КТ через heatmap). Во фронтенд `package.json` добавляется впервые.

### Блокеры
- Нет.

---

## 4. Риски

| # | Риск | Вероятность | Влияние | Митигация |
|---|------|-------------|---------|-----------|
| 1 | Пересчёт по событию создаёт N+1 при массовых обновлениях (`bulkTransition`, `/issues/bulk-update`) | Высокая | Долгие запросы, таймауты | Агрегировать по `releaseId` внутри одной транзакции, пересчитывать каждый релиз ровно один раз на запрос. Тесты с ≥50 задач в bulk. |
| 2 | Несколько инстансов backend могут одновременно запустить cron-тик | Средняя | Дублирование audit-записей, гонки по `violations` | `acquireLock('checkpoints:scheduler', ttl=300)` в начале тика; если не удалось — тик пропускается. Метрика `scheduler.skipped`. |
| 3 | Изменение `release.plannedDate` делает все дедлайны КТ устаревшими | Средняя | КТ становятся некорректными | В `updateRelease` при изменении `plannedDate` — перевычислить deadlines всех связанных `ReleaseCheckpoint` + запустить немедленный пересчёт. |
| 4 | Задача удалена из релиза, но `violations` всё ещё ссылается на неё | Низкая | Мусор в tooltip светофора | При `removeReleaseItems` / смене `releaseId` — запустить пересчёт релиза. Plus: валидация `issueId` при рендере. |
| 5 | Критерий ссылается на удалённое кастомное поле | Низкая | Правило не может быть вычислено, ошибка в engine | Помечать КТ со сломанным критерием как `VIOLATED` с причиной «criterion_broken: field deleted»; UI показывает ошибку админу типа. Cascading cleanup при `CustomField` delete — запрет удаления, если поле используется в активных КТ. |
| 6 | Перегрузка cron при большом числе релизов | Низкая | Долгий тик | Фильтровать на уровне SQL: `plannedDate BETWEEN now() - 30d AND now() + 30d` и `statusCategory IN ('PLANNING','IN_PROGRESS')`. Пагинация по 50 релизов на тик. |
| 7 | Race: cron пересчитал → сразу прилетело событие → повторный пересчёт тем же результатом | Средняя | Лишние writes | Сравнить итог с `lastEvaluatedAt` / хэшем `violations`, пропустить write при отсутствии diff. |
| 8 | Расширение `ValidatorRule` ломает контракт обычных workflow-переходов | Низкая | Падают переходы статуса | Новые типы правил (`STATUS_IN`, `DUE_BEFORE`, `ASSIGNEE_SET`, `CUSTOM_FIELD_VALUE`) вводятся как отдельный union `CheckpointCriterion`, не меняя `ValidatorRule`. Для переиспользуемых правил — общий helper в `shared/rule-evaluator`. |
| 9 | Редактирование типа КТ (criteria / offsetDays) ретроспективно ломает уже созданные `ReleaseCheckpoint` | Высокая | RM меняет критерий → все активные релизы внезапно меняют светофор без явного действия | **FR-15**: `criteriaSnapshot` + `offsetDaysSnapshot` в `ReleaseCheckpoint` — пересчёт идёт ТОЛЬКО по снапшоту. В UI редактирования типа — модалка «Применить обновление к N активным экземплярам?» с чекбоксами по релизам. По умолчанию — не применять. |
| 10 | Блок КТ на `IssueDetailPage` делает лишний запрос `GET /api/issues/:id/checkpoints` на каждое открытие задачи | Средняя | +1 HTTP roundtrip, лаг UI | **FR-19**: inline `checkpoints` в `GET /api/issues/:id` (опционально через `?include=checkpoints`). Отдельный endpoint остаётся для полных деталей и polling. |
| 11 | Webhook post-function при VIOLATED может спамить внешние системы при flapping (задача то нарушает, то нет) | Средняя | Шум в Slack/Telegram, усталость RM | Debounce: webhook срабатывает только если состояние устойчиво ≥ 5 мин (сравнение `lastEvaluatedAt` + `state`). Конфиг webhook — `minStableSeconds` (default 300). |
| 12 | Цветовой светофор без иконки/текста недоступен дальтоникам | Средняя | Нарушение a11y | **FR-18**: светофор = цвет + иконка (`CheckCircleFilled`/`ExclamationCircleFilled`/`CloseCircleFilled`) + текстовая метка (OK / Внимание / Нарушено). Ant Design Tag с `aria-label`. |
| 13 | Неограниченный рост `ReleaseBurndownSnapshot` (365 записей × N релизов × время) | Средняя | Раздувание БД, медленные запросы | Политика чистки: снапшоты активных релизов храним полностью; для релизов в DONE/CANCELLED — держим 90 дней после `releaseDate`, затем удаляем (cron). Кап 365 записей на релиз (старше — агрегировать по неделям). |
| 14 | Burndown без достоверной стартовой точки (релиз создан давно, первый снапшот — сегодня) | Средняя | Ideal line строится от неизвестного initial scope | При первом снапшоте фиксируем `initial` состояние на дату `max(release.createdAt, today - 30d)` — для старых релизов берём 30 дней назад, для свежих — дату создания. Ideal line: линейная от `initial` на старт до `0` на `plannedDate`. В UI рядом с графиком — пометка «Снапшоты начаты YYYY-MM-DD». |
| 15 | Перечёт `applicableIssueIds`/`passedIssueIds` для больших релизов (500+ задач × 10 КТ) — O(N×M) | Низкая | Замедление `recomputeForRelease` | Храним только ID (не issue snapshot). UI подтягивает `title`/`status` пачкой через `GET /api/issues?ids=...`. Пересчитанные списки кэшируются в Redis на 60 сек вместе с `ReleaseCheckpoint`. |

---

## 5. Особенности реализации

### Backend

**Новый подмодуль `backend/src/modules/releases/checkpoints/`:**

- `checkpoint-types.router.ts` — CRUD для `CheckpointType` (только `RELEASE_MANAGER` / `ADMIN` / `SUPER_ADMIN`):
  - `GET  /api/checkpoint-types`
  - `POST /api/checkpoint-types`
  - `PATCH /api/checkpoint-types/:id`
  - `DELETE /api/checkpoint-types/:id` (запрет, если используется в активных `ReleaseCheckpoint`)
- `checkpoint-templates.router.ts` — CRUD шаблонов и items:
  - `GET /api/checkpoint-templates`
  - `POST /api/checkpoint-templates` (name, items: `{ checkpointTypeId, orderIndex }[]`)
  - `PATCH /api/checkpoint-templates/:id`
  - `DELETE /api/checkpoint-templates/:id`
  - `POST /api/checkpoint-templates/:id/clone`
- `release-checkpoints.router.ts` — привязка к релизу:
  - `GET  /api/releases/:releaseId/checkpoints` — список с состоянием, `breakdown` и `passedIssues`/`violatedIssues` (FR-25, FR-27)
  - `GET  /api/releases/:releaseId/checkpoints/matrix` — матричный вид (FR-26), body: `{ issues: [{ id, key, title }], checkpoints: [{ id, name, deadline }], cells: [[state, reason?]] }`. CSV-версия — через `?format=csv`.
  - `POST /api/releases/:releaseId/checkpoints/apply-template` body `{ templateId }` (RELEASE_MANAGER или MANAGER в проекте)
  - `POST /api/releases/:releaseId/checkpoints/preview-template` body `{ templateId }` — FR-14
  - `POST /api/releases/:releaseId/checkpoints` body `{ checkpointTypeIds: string[] }`
  - `DELETE /api/releases/:releaseId/checkpoints/:id`
  - `POST /api/releases/:releaseId/checkpoints/recompute` — ручной пересчёт (для отладки)
  - `GET  /api/issues/:issueId/checkpoints` — все активные КТ релизов, в которые входит задача (для UI задачи)
- `burndown.router.ts`:
  - `GET  /api/releases/:releaseId/burndown?metric=issues|hours|violations&from=&to=` — FR-29
  - `POST /api/releases/:releaseId/burndown/backfill` — FR-31 (ADMIN/SUPER_ADMIN). Body: `{ date?: ISO }` (default — сегодня).
- `checkpoint-engine.service.ts`:
  - `recomputeForRelease(releaseId: string): Promise<void>` — выбирает все задачи релиза (через `ReleaseItem` + `Issue.releaseId`), для каждой КТ прогоняет критерии, собирает violations, считает state = `deadline < now() && violations.length > 0 ? VIOLATED : OK`, состояние `PENDING` пока `deadline >= now()` и нет нарушений.
  - `recomputeForIssue(issueId: string): Promise<void>` — находит все релизы с этой задачей, вызывает `recomputeForRelease` (дедуплицируя).
  - `computeReleaseRisk(releaseId: string): Promise<{ level, score }>` — агрегат по `ReleaseCheckpoint`: `score = sum(weight_of_violated) / sum(weight_of_all)`, mapping: 0% = LOW, 1-30% = MEDIUM, 31-70% = HIGH, >70% = CRITICAL.
  - `evaluateCriterion(criterion, issue, customFieldValues): { passed, reason? }` — pure function, unit-testable.
- `checkpoint-scheduler.service.ts`:
  - `startScheduler()` — вызывается в `app.ts` после `createApp`. Использует `node-cron` с двумя cron-выражениями:
    - `CHECKPOINTS_SCHEDULER_CRON` (default `*/10 * * * *`) — тик пересчёта КТ.
    - `BURNDOWN_SNAPSHOT_CRON` (default `5 0 * * *`) — ежедневный снапшот.
    - `BURNDOWN_RETENTION_CRON` (default `0 3 * * 0`) — еженедельная чистка.
  - `tickCheckpoints()` — `acquireLock('checkpoints:scheduler', 300)` → выборка активных релизов (`plannedDate BETWEEN now-30d AND now+30d`, statusCategory ∈ PLANNING/IN_PROGRESS) пачками по 50 → `recomputeForRelease` для каждого → `releaseLock`.
  - `tickBurndownSnapshot()` — `acquireLock('burndown:snapshot', 600)` → активные релизы + релизы с `releaseDate >= now - 90d` → `burndownService.captureSnapshot(releaseId)` → upsert по `(releaseId, snapshotDate)`.
  - `tickBurndownRetention()` — удаление/агрегация согласно FR-32.
  - В `NODE_ENV === 'test'` все крон-задания выключены (чтобы не мешать интеграционным тестам); есть публичный метод `runOnce(job: 'checkpoints'|'burndown-snapshot'|'burndown-retention')` для вызова из тестов.
- `burndown.service.ts`:
  - `captureSnapshot(releaseId): Promise<ReleaseBurndownSnapshot>` — собирает метрики одним SQL-агрегатом (`SELECT COUNT(*) FILTER (WHERE status=...)`, `SUM(estimatedHours) FILTER (...)`), добавляет данные по `ReleaseCheckpoint` (`violatedCheckpoints`, `totalCheckpoints`). Upsert по `(releaseId, snapshotDate)`.
  - `getBurndown(releaseId, from, to, metric): Promise<BurndownResponse>` — возвращает series + `idealLine`. Initial = снапшот за `max(firstSnapshotDate)`. Кэш в Redis 5 мин по ключу `burndown:{releaseId}:{metric}:{from}:{to}`. Инвалидируется при `captureSnapshot` и `recomputeForRelease` (меняется `violatedCheckpoints`).
  - `backfillSnapshot(releaseId, date?): Promise<ReleaseBurndownSnapshot>` — синхронный захват для FR-31, без Redis-lock.
  - `purgeOldSnapshots(): Promise<{ deleted, aggregated }>` — FR-32.
- `checkpoint.dto.ts` — Zod-схемы + типы `CheckpointCriterion`:
  ```ts
  export type CheckpointCriterion =
    | { type: 'STATUS_IN'; categories: StatusCategory[]; issueTypes?: string[] }
    | { type: 'DUE_BEFORE'; days: number; issueTypes?: string[] }  // dueDate <= release.plannedDate + days
    | { type: 'ASSIGNEE_SET'; issueTypes?: string[] }
    | { type: 'CUSTOM_FIELD_VALUE'; customFieldId: string; operator: 'EQUALS' | 'NOT_EMPTY' | 'IN'; value?: unknown; issueTypes?: string[] }
    | { type: 'ALL_SUBTASKS_DONE'; issueTypes?: string[] }
    | { type: 'NO_BLOCKING_LINKS'; linkTypeKeys?: string[] };
  ```

**Event-hook в issues:**

В `backend/src/modules/issues/issues.service.ts` модифицировать:
- `updateIssue`
- `updateIssueStatus`
- `bulkUpdateIssues`
- `bulkTransitionIssues`

После успешной транзакции вызывать `await checkpointEngine.recomputeForIssue(issueId)` (или агрегированно для bulk). Исключение в хуке не должно падать основной запрос — оборачиваем в try/catch и `console.error`. Аналогично — хук в `issue-custom-fields.service.ts` (`setIssueCustomFieldValue`) и в `releases.service.ts` (`addReleaseItems`, `removeReleaseItems`, `updateRelease` при смене `plannedDate`).

**RBAC:**
- Справочник типов КТ и шаблонов — `requireRole('SUPER_ADMIN', 'ADMIN', 'RELEASE_MANAGER')`.
- Применение шаблона к релизу / создание КТ на релизе — `ProjectPermission.RELEASE_MANAGE` (уже есть) + глобальный `RELEASE_MANAGER` для интеграционных релизов.
- Просмотр КТ и риска — читается всеми, кто видит сам релиз.

### Frontend

**Новые компоненты в `frontend/src/components/releases/`:**

- `CheckpointTrafficLight.tsx` — пропы `{ state: 'PENDING' | 'OK' | 'VIOLATED'; isWarning?: boolean; violations?: Violation[] }`. Рендерит цветной кружок (green/yellow/red/gray) + Ant Design `Popover` с таблицей задач-нарушителей.
- `ReleaseRiskBadge.tsx` — пропы `{ level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; score: number }`. Ant `Tag` с цветом и tooltip.
- `CheckpointsBlock.tsx` — используется в `DetailPanel` и `IssueDetailPage`. Получает `ReleaseCheckpoint[]`, показывает таблицу (Имя, Дедлайн, Светофор, **Разбивка N/M/K**, Причины, действия «Пересчитать» / «Удалить» для RM). Раскрывающиеся секции «Прошли» / «Нарушают» с issueKey + title + reason.
- `ApplyCheckpointTemplateModal.tsx` — модалка выбора шаблона для применения к релизу с превью эффекта (FR-14).
- `CheckpointsMatrix.tsx` — матрица «Задачи × КТ» (FR-26). `<Table>` с заголовками столбцов-КТ и строками-задачами; виртуализация для релизов >100 задач; экспорт CSV; переключатель «Список / Матрица» над блоком.
- `ReleaseBurndownChart.tsx` — диаграмма сгорания (FR-29, FR-30). Recharts `<LineChart>` с двумя линиями (actual solid, ideal dashed), легендой, tooltip с дельтой к предыдущему дню, переключателем метрики (задачи/часы/нарушенные КТ). Пустое состояние + CTA «Выполнить backfill» для SUPER_ADMIN.

**Новые страницы в `frontend/src/pages/admin/`:**

- `AdminReleaseCheckpointTypesPage.tsx` — Ant `Table` + drawer с редактором критериев (визуальный конструктор: добавить правило → выбрать тип → параметры).
- `AdminReleaseCheckpointTemplatesPage.tsx` — CRUD шаблонов, drag-n-drop порядка types.

Обе страницы ДОЛЖНЫ соблюдать правило «Modal/Drawer close must refresh parent page» из `CLAUDE.md` — `onCancel` и `onClose` вызывают `load()` родителя.

### База данных

Миграция `20260418000000_release_checkpoints/migration.sql`:

- `checkpoint_types` + индекс по `is_active`.
- `checkpoint_templates` + `checkpoint_template_items` (composite unique).
- `release_checkpoints` + индексы по `release_id`, `deadline`, `state`.
- enum `CheckpointWeight` (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`) и `CheckpointState` (`PENDING`, `OK`, `VIOLATED`).

### Кэширование

- Redis: кэш `release:<id>:checkpoints` TTL 60 сек — чтобы UI релиза при pollинге (если будет) не бил в БД каждый раз. Инвалидировать в `recomputeForRelease`.
- Риск релиза кэшировать в той же записи (агрегат).

### Cron/планировщик

- Один inline-шедулер в `checkpoint-scheduler.service.ts`, стартующий из `app.ts` (после инициализации Prisma).
- Настройки через `config`: `CHECKPOINTS_SCHEDULER_ENABLED=true`, `CHECKPOINTS_SCHEDULER_INTERVAL_MS=600000` (10 мин).
- Graceful shutdown: сохранить handle `setInterval`, в `server.ts` на `SIGTERM` — `clearInterval`.

---

## 6. Требования к реализации

### Функциональные

- [ ] FR-1: `RELEASE_MANAGER` может создавать, редактировать, удалять типы КТ (название, цвет, вес, offsetDays, warningDays, набор критериев).
- [ ] FR-2: `RELEASE_MANAGER` может создавать, клонировать, удалять шаблоны КТ и управлять их составом (добавить/удалить типы, задать порядок).
- [ ] FR-3: На странице релиза релиз-менеджер может применить шаблон (создать за раз N экземпляров КТ), добавить отдельный тип КТ, удалить КТ с релиза, вручную запустить пересчёт.
- [ ] FR-4: Для каждого экземпляра `ReleaseCheckpoint` система рассчитывает: state (PENDING / OK / VIOLATED), deadline (`release.plannedDate + offsetDays`), violations (массив `{ issueId, issueKey, issueTitle, reason }`), lastEvaluatedAt.
- [ ] FR-5: Карточка релиза в списке и детали показывают: бейдж риска (LOW/MEDIUM/HIGH/CRITICAL), список КТ со светофором, tooltip с причинами для VIOLATED.
- [ ] FR-6: Страница задачи показывает все активные КТ релизов, в которые задача включена, со светофором на уровне «применима ли именно эта задача к критерию» (если задача входит в violations — RED; если ещё нет — GREEN/YELLOW; если критерий задачу не затрагивает — КТ не показывается для этой задачи).
- [ ] FR-7: Расчёт КТ запускается автоматически: (a) по расписанию каждые 10 минут (настраивается), (b) по событию обновления задачи (статус, поля, custom fields, assignee, связи, включение/исключение из релиза), (c) при изменении `release.plannedDate`.
- [ ] FR-8: Риск релиза рассчитывается как `sum(weight_of_violated) / sum(weight_of_all)`; маппинг: 0% = LOW, 1-30% = MEDIUM, 31-70% = HIGH, >70% = CRITICAL.
- [ ] FR-9: Типы критериев (минимум на v1): `STATUS_IN`, `DUE_BEFORE`, `ASSIGNEE_SET`, `CUSTOM_FIELD_VALUE`, `ALL_SUBTASKS_DONE`, `NO_BLOCKING_LINKS`. Каждый с опциональным фильтром `issueTypes` (по systemKey типа задачи).
- [ ] FR-10: Аудит — действия `checkpoint_type.created/updated/deleted`, `checkpoint_template.*`, `release_checkpoint.applied/removed/state_changed` пишутся через `logAudit`.
- [ ] FR-11: Мини-индикатор «🔴 нарушает КТ» на карточке задачи в `BoardPage`, `ProjectDetailPage` (красная полоска + иконка + tooltip с названием КТ и причиной). Отображается, только если задача находится в violations хотя бы одного `ReleaseCheckpoint` со state = VIOLATED.
- [ ] FR-12: Badge в `TopBar` (верхняя навигация) с количеством задач текущего пользователя (как `assigneeId`), которые нарушают КТ. Клик по badge → `DashboardPage` с применённым фильтром «Только нарушающие КТ». Badge обновляется раз в 60 сек (polling) или через websocket, если он будет.
- [ ] FR-13: Фильтр «По уровню риска» на `GlobalReleasesPage` и `ReleasesPage` (LOW / MEDIUM / HIGH / CRITICAL, multi-select). Пресеты: «Все», «HIGH+», «Только CRITICAL». Сортировка списка по убыванию `riskScore`.
- [ ] FR-14: Превью при применении шаблона к релизу. Endpoint `POST /api/releases/:releaseId/checkpoints/preview-template` body `{ templateId }` возвращает `{ checkpoints: [{ typeName, deadline, wouldBeState, wouldBeViolations: [...] }] }`. UI — модалка со списком будущих КТ и счётчиком «X из Y типов уже нарушены текущим состоянием задач». Применение — отдельный endpoint после подтверждения.
- [ ] FR-15: Snapshot критериев и `offsetDays` сохраняется в `ReleaseCheckpoint.criteriaSnapshot` и `offsetDaysSnapshot` при создании. Пересчёт ведётся только по snapshot, не по `CheckpointType.criteria`. При редактировании типа — модалка «Применить к N активным экземплярам?» с выбором релизов, по умолчанию **не** применять. Отдельный endpoint `POST /api/checkpoint-types/:id/sync-instances` body `{ releaseIds: string[] }`.
- [ ] FR-16: Детализация причины нарушения — `violations[i].reason` содержит human-readable строку («Статус должен быть ≥ REVIEW, сейчас IN_PROGRESS»; «Поле "Regression Status" пустое, ожидается PASSED»). В UI каждой записи violations — ссылка на задачу `[KEY](/issues/:id)` и, если применимо, inline-кнопка quick-действия (смена статуса, переход в задачу для заполнения поля).
- [ ] FR-17: Post-function `CHECKPOINT_WEBHOOK` — вызывает HTTP POST на указанный URL при переходе `ReleaseCheckpoint.state` в VIOLATED. Конфигурируется на уровне `CheckpointType` (поле `webhookUrl: string | null`, `minStableSeconds: number = 300`). Переиспользует логику `workflow-engine/post-functions/webhook.fn.ts`. Debounce по `minStableSeconds` — защита от flapping.
- [ ] FR-18: Accessibility — светофор = **цвет + иконка + текстовая метка**. Цвет не единственный сигнал. Все компоненты с `aria-label`, `role="status"` для динамических частей. Тест `a11y.spec.ts` в Playwright (axe-core).
- [ ] FR-19: `GET /api/issues/:id` возвращает `checkpoints: [...]` (inline, опционально через `?include=checkpoints`). Без этого флага — не возвращает, чтобы не раздувать общий ответ. `IssueDetailPage` запрашивает с include.
- [ ] FR-20: Если задача входит в несколько релизов (ATOMIC-релиз проекта + INTEGRATION-релиз), блок КТ на задаче группирует КТ по релизу с заголовком `Release 2.0.0` / `Integration Release Q2-2026`. Каждая группа сворачивается.
- [ ] FR-21: Массовое применение шаблона. На `GlobalReleasesPage` — чекбоксы рядом с релизами + кнопка «Применить шаблон к выбранным» (только для `RELEASE_MANAGER` / `ADMIN`). Endpoint `POST /api/checkpoint-templates/:id/apply-bulk` body `{ releaseIds: string[] }`. Валидация: пользователь должен иметь право на каждый из релизов; при отсутствии прав — 403 с перечислением заблокированных ID.
- [ ] FR-22: История нарушений задачи — блок «История КТ» в `IssueDetailPage` с записями из `CheckpointViolationEvent` для задачи: «2026-05-23 18:42 — нарушена КТ "Код заморожен" (Статус не ≥ REVIEW); 2026-05-24 10:15 — исправлена».
- [ ] FR-23: Для роли `AUDITOR` — страница `/admin/checkpoint-audit` со списком всех `CheckpointViolationEvent` за период (фильтры: релиз, проект, тип КТ, даты, «только неисправленные»). Экспорт CSV.
- [ ] FR-24: Логика между критериями одного `CheckpointType` — **AND** (все должны пройти). OR/вложенные группы — вне v1 (roadmap v2).
- [ ] FR-25: Для каждой `ReleaseCheckpoint` рассчитываются и хранятся три списка ID задач: `applicableIssueIds` (к каким задачам релиза критерий применим после фильтра `issueTypes`), `passedIssueIds` (прошли все критерии), `violatedIssueIds` (не прошли — это текущее `violations`). В `CheckpointsBlock` отображается разбивка `N применимо / M прошли / K нарушают` (в виде бейджей) с раскрывающимися списками «Прошли» и «Нарушают». RM видит не только нарушителей, но и задачи, выполнившие требование.
- [ ] FR-26: **Матричный вид** «Задачи × Контрольные точки» для релиза. Переключатель вида «Список КТ / Матрица» в `DetailPanel`. Rows = задачи релиза, columns = КТ релиза. Ячейка: 🟢 (passed) / 🔴 (violated) / 🟡 (pending) / — (not applicable). Заголовки строк кликабельны (переход на задачу), заголовки столбцов — на детали КТ. Экспорт CSV/PNG. Доступ: все, кто видит релиз (для RM — основной инструмент подготовки к релизу).
- [ ] FR-27: Endpoint `GET /api/releases/:id/checkpoints` возвращает расширенный shape: для каждой `ReleaseCheckpoint` — `{ ..., breakdown: { applicable: N, passed: M, violated: K }, passedIssues: [{ issueId, issueKey, issueTitle }], violatedIssues: [{ issueId, issueKey, issueTitle, reason }] }`. Подробные `title/status` подтягиваются одним JOIN в service, без N+1.
- [ ] FR-28: **Ежедневный снапшот** состояния релиза в `ReleaseBurndownSnapshot`. Cron `5 0 * * *` (00:05 каждый день, server TZ) пишет для всех активных релизов (`statusCategory IN ('PLANNING','IN_PROGRESS')` или `releaseDate BETWEEN now - 90d AND now`): `totalIssues`, `doneIssues`, `openIssues`, `cancelledIssues`, `totalEstimatedHours`, `doneEstimatedHours`, `openEstimatedHours`, `violatedCheckpoints`, `totalCheckpoints`. Идемпотентен: `@@unique([releaseId, snapshotDate])` — повтор в тот же день обновляет запись. Redis-lock `burndown:snapshot` TTL=600. В `NODE_ENV=test` отключён; запускается вручную через endpoint для тестов.
- [ ] FR-29: Endpoint `GET /api/releases/:id/burndown?metric=issues|hours|violations&from=&to=` возвращает `{ initial: {...}, plannedDate, releaseDate, series: [{ date, total, done, open, cancelled, violatedCheckpoints, totalCheckpoints }], idealLine: [{ date, value }] }`. Параметры `from`/`to` опциональны (default: `min(snapshotDate) … max(plannedDate, today)`). Кэш 5 минут. Доступ: все, кто видит релиз.
- [ ] FR-30: **UI burndown-диаграммы** — новая вкладка `BURNDOWN` в `DetailPanel` (рядом с Items/Sprints/History). Компонент `ReleaseBurndownChart` на Recharts:
  - Переключатель метрики: «Задачи (шт.)» / «Часы (оценка)» / «Нарушенные КТ (шт.)».
  - Actual line (сплошная) — из `series`, точки по дням.
  - Ideal line (пунктир) — линейная от `initial` на дату первого снапшота до `0` на `plannedDate`.
  - Вертикальные маркеры: `releaseDate` (если есть), «сегодня».
  - Tooltip при hover: дата + значение + дельта к вчера.
  - Legend + экспорт PNG через Recharts/html2canvas.
  - Пустое состояние: «Снапшоты начнут записываться с завтрашнего дня (00:05). Для старых релизов можно заполнить вручную из админки (SUPER_ADMIN).»
- [ ] FR-31: `POST /api/releases/:id/burndown/backfill` (ADMIN/SUPER_ADMIN) — ручной захват снапшота «сейчас». Нужен для релизов, созданных до внедрения модуля, и для интеграционных тестов.
- [ ] FR-32: Политика хранения снапшотов (cron `0 3 * * 0`, еженедельно ночью): удалять записи `ReleaseBurndownSnapshot` для релизов в статусе DONE/CANCELLED, где `releaseDate < now() - 90d`. Для активных релизов старше года — агрегировать по неделям (оставлять 1 снапшот на неделю, удалять остальные). Конфиг: `BURNDOWN_RETENTION_DAYS_AFTER_DONE=90`, `BURNDOWN_WEEKLY_AGG_AFTER_DAYS=365`.

### Нефункциональные

- [ ] API response < 200ms (p95) для всех CRUD-эндпоинтов.
- [ ] Пересчёт релиза (`recomputeForRelease`) — < 500ms для релиза из 200 задач и 10 КТ.
- [ ] Cron-тик не блокирует основной event loop дольше 100 мс подряд (чанки по 50 релизов).
- [ ] Event-хук на `updateIssue` не увеличивает p95 `PATCH /issues/:id` больше, чем на 20 мс (async fire-and-forget допустим, но с логированием).

### Безопасность

- [ ] SEC-1: Управление типами и шаблонами — строго `SUPER_ADMIN` / `ADMIN` / `RELEASE_MANAGER`.
- [ ] SEC-2: Применение/удаление КТ на конкретном релизе — либо `RELEASE_MANAGER`, либо пользователь с `ProjectPermission.RELEASE_MANAGE` в проекте релиза (для ATOMIC-релизов). Для INTEGRATION — только `RELEASE_MANAGER`/`ADMIN`.
- [ ] SEC-3: `violations` json не должен содержать данных за пределами минимума (issueKey, issueTitle, reason). Никаких `description`, assignee email и т. п.
- [ ] SEC-4: Удаление `CustomField`, используемого в критерии активного КТ, запрещено (409 + список активных КТ в ответе).
- [ ] SEC-5: Массовое применение шаблона (FR-21) проверяет права на КАЖДЫЙ релиз отдельно; нельзя применить к релизу, где пользователь не имеет `RELEASE_MANAGE`.
- [ ] SEC-6: Endpoint журнала аудита (FR-23) доступен только `AUDITOR` / `ADMIN` / `SUPER_ADMIN`. CSV-экспорт фильтруется по правам: `AUDITOR` видит все проекты (роль «только чтение»), `MANAGER` — только свои.
- [ ] SEC-7: Badge в `TopBar` (FR-12) показывает счётчик ТОЛЬКО своих задач (`assigneeId === userId`) — не раскрывает чужие.
- [ ] SEC-8: Endpoint `POST /api/releases/:id/burndown/backfill` (FR-31) — только `SUPER_ADMIN` / `ADMIN`. `RELEASE_MANAGER` не может вручную переписывать историю.
- [ ] SEC-9: CSV-экспорт матрицы (FR-26) и burndown-данных содержит только `issueKey`, `issueTitle`, `status` — без описаний, assignee, кастомных полей (чтобы не утекали за пределы UI).

### Тестирование

- [ ] Unit: `evaluateCriterion` — по одному тесту на каждый тип критерия + edge cases (пустое значение, удалённое поле).
- [ ] Unit: `computeReleaseRisk` — 0 КТ, все OK, все VIOLATED, смешанные веса.
- [ ] Integration (`tests/checkpoints.test.ts`): создать релиз, тип КТ, применить шаблон, сменить статус задачи → убедиться, что пересчёт произошёл, state и violations корректны, риск обновился.
- [ ] Integration: bulk-update 50 задач → ровно 1 пересчёт на релиз, а не 50.
- [ ] Integration: cron-тик в тестах — вручную вызываем `checkpointScheduler.tick()` (не `setInterval`), проверяем идемпотентность и Redis-lock.
- [ ] Integration: RBAC — все ролевые сценарии (403 для `MEMBER` на создание типа, 200 для `RELEASE_MANAGER`).
- [ ] E2E (Playwright): RM создаёт тип → создаёт шаблон → применяет к релизу → меняет статус задачи → видит обновлённый светофор на странице релиза и в задаче.
- [ ] E2E: DEV видит красную полоску на карточке задачи на борде (FR-11) и badge в TopBar (FR-12); после исправления статуса — индикаторы пропадают.
- [ ] E2E: при применении шаблона отображается модалка превью с корректным числом нарушений (FR-14).
- [ ] E2E (axe-core): все новые компоненты проходят a11y-проверку без critical violations (FR-18).
- [ ] Unit: FR-15 snapshot — создание `ReleaseCheckpoint` копирует criteria и offsetDays; последующее редактирование `CheckpointType` не меняет пересчёт (пока не вызван `sync-instances`).
- [ ] Unit: FR-17 debounce webhook — переход OK → VIOLATED → OK за 60 сек не выстреливает webhook.
- [ ] Покрытие новых файлов ≥ 70%.

---

## 7. Критерии приёмки (Definition of Done)

- [ ] Миграция Prisma применяется на staging без ошибок, откат чистый.
- [ ] UI: релиз-менеджер в `/admin/release-checkpoint-types` создаёт тип с 2+ критериями, сохраняет.
- [ ] UI: релиз-менеджер создаёт шаблон из 3 типов, применяет его к релизу через модалку с превью (видит «2 из 3 будут нарушены»), подтверждает → в деталях релиза появляются 3 `ReleaseCheckpoint`.
- [ ] Редактирование критерия типа КТ **не меняет** состояние уже созданных экземпляров, пока RM не нажал «Применить к активным» (FR-15).
- [ ] При изменении статуса задачи через PATCH `/issues/:id/status` — в `violations` отражается новое состояние не позднее чем через 2 секунды; записывается `CheckpointViolationEvent` (при переходе в VIOLATED) либо закрывается (при возврате в OK).
- [ ] Cron-тик каждые 10 минут проставляет `lastEvaluatedAt` и обновляет state (проверено логом за 30 минут).
- [ ] На списке релизов видны бейджи риска; есть фильтр по уровню риска; сортировка по убыванию `riskScore` работает (FR-13).
- [ ] На `DetailPanel` — блок КТ со светофором (цвет + иконка + текст), tooltip с violations и ссылками на задачи (FR-18, FR-16).
- [ ] На странице задачи видны применимые КТ, сгруппированные по релизу (FR-20); есть блок «История КТ» (FR-22).
- [ ] Карточка задачи на борде/в бэклоге показывает красную полоску при нарушении (FR-11).
- [ ] Badge в TopBar отображает счётчик своих задач, нарушающих КТ; клик ведёт на отфильтрованный Dashboard (FR-12).
- [ ] Массовое применение шаблона к нескольким релизам работает с корректной RBAC-проверкой каждого (FR-21, SEC-5).
- [ ] Webhook post-function на переход в VIOLATED отправляет POST не чаще, чем раз в `minStableSeconds` (FR-17).
- [ ] Страница `/admin/checkpoint-audit` доступна AUDITOR и показывает все события нарушений с CSV-экспортом (FR-23).
- [ ] В `CheckpointsBlock` для каждой КТ отображается разбивка `N применимо / M прошли / K нарушают`; списки «Прошли» и «Нарушают» раскрываются с подробностями (FR-25).
- [ ] Переключатель «Список / Матрица» на `DetailPanel` показывает полный матричный вид «Задачи × КТ» с корректными цветами ячеек, экспорт CSV работает (FR-26).
- [ ] Ежедневный cron `5 0 * * *` записывает снапшоты для всех активных релизов; `@@unique([releaseId, snapshotDate])` выдерживает повторный вызов за те же сутки (FR-28).
- [ ] На вкладке `BURNDOWN` в `DetailPanel` для релиза с ≥ 2 снапшотами отображается график с actual и ideal линиями; переключатель метрики (задачи/часы/нарушенные КТ) корректно меняет шкалу (FR-29, FR-30).
- [ ] `POST /api/releases/:id/burndown/backfill` доступен только ADMIN/SUPER_ADMIN; создаёт снапшот на указанную дату (FR-31).
- [ ] Cron `0 3 * * 0` удаляет снапшоты релизов в DONE/CANCELLED старше 90 дней; агрегирует снапшоты активных релизов старше 365 дней по неделям (FR-32).
- [ ] Все тесты зелёные (`make test`), включая axe-core a11y-тесты.
- [ ] Lint проходит (`make lint`).
- [ ] Code review пройден.
- [ ] Документация обновлена: `docs/RU/USER_GUIDE.md` (раздел «Контрольные точки релизов» для RM, DEV, PM), `docs/architecture/backend-modules.md` (модуль `releases/checkpoints`), `docs/api/reference.md` (новые эндпоинты), `docs/user-manual/features/` — отдельная страница `checkpoints.md`.

---

## 8. Декомпозиция на истории (story под эпик)

| Story | Название | Содержание | Оценка |
|-------|----------|------------|--------|
| S-1 | DB-модели + CRUD типов/шаблонов | Prisma schema (с `criteriaSnapshot`, `offsetDaysSnapshot`, `CheckpointViolationEvent`), миграция, router/service CRUD `CheckpointType`, `CheckpointTemplate`. Zod DTO. RBAC. Unit-тесты DTO. | 10ч |
| S-2 | Движок расчёта критериев | `checkpoint-engine.service.ts` + `evaluateCriterion`. 6 типов критериев. Human-readable `reason` (FR-16). Unit-тесты. | 10ч |
| S-3 | Привязка КТ к релизу + риск + превью + snapshot | `release-checkpoints.router/service`, `apply-template` с snapshot (FR-15), `preview-template` (FR-14), `recomputeForRelease`, `computeReleaseRisk`, inline `GET /api/issues/:id?include=checkpoints` (FR-19), `CheckpointViolationEvent` lifecycle. Integration-тесты. | 14ч |
| S-4 | Триггеры (cron + event hook) | `checkpoint-scheduler`, хуки в `issues.service`, `issue-custom-fields.service`, `releases.service` (включая смену `plannedDate`). Redis-lock. Debounce для webhook. Тесты идемпотентности. | 8ч |
| S-5 | Админ-UI (типы + шаблоны + sync-instances) | `AdminReleaseCheckpointTypesPage`, `AdminReleaseCheckpointTemplatesPage`, конструктор критериев, модалки, **превью применения шаблона (FR-14)**, модалка «Применить к активным экземплярам» (FR-15). | 15ч |
| S-6 | UI в релизе и задаче (КТ) | `CheckpointTrafficLight` (цвет+иконка+текст, FR-18), `ReleaseRiskBadge`, `CheckpointsBlock` с **разбивкой N/M/K (FR-25)**, группировкой по релизу (FR-20) и историей (FR-22), детализация reason + inline-действия (FR-16), фильтр по риску + сортировка (FR-13), интеграция в `GlobalReleasesPage` / `ReleasesPage` / `IssueDetailPage`. | 16ч |
| S-7 | Индикаторы в задачах и TopBar | `IssueCheckpointIndicator` на карточках задач в `BoardPage` / `ProjectDetailPage` (FR-11), badge в `TopBar` + фильтр «Мои задачи в риске» на `DashboardPage` / `TimePage` (FR-12). | 8ч |
| S-8 | Массовое применение + webhook + аудит | `POST /api/checkpoint-templates/:id/apply-bulk` (FR-21), `CHECKPOINT_WEBHOOK` post-function с debounce (FR-17), `AdminCheckpointAuditPage` + CSV (FR-23). | 10ч |
| S-9 | Матрица «Задачи × КТ» | `GET /api/releases/:id/checkpoints/matrix`, `CheckpointsMatrix.tsx` с виртуализацией + переключатель вида «Список/Матрица» в `DetailPanel`, экспорт CSV (FR-26, FR-27). | 8ч |
| S-10 | Burndown-диаграмма | Модель `ReleaseBurndownSnapshot` + миграция, `burndown.service.ts` (captureSnapshot, getBurndown, backfill, purge), cron для снапшотов и чистки (FR-28, FR-32), `burndown.router.ts` (FR-29, FR-31), `ReleaseBurndownChart.tsx` на Recharts + вкладка BURNDOWN в `DetailPanel` (FR-30), unit + integration тесты. Добавить `recharts` + `node-cron` в `package.json`. | 16ч |
| S-11 | E2E + a11y + документация | Playwright-сценарии (RM / DEV / PM / AUDITOR), axe-core a11y (FR-18), USER_GUIDE с разделами по ролям, api reference, backend-modules, `user-manual/features/checkpoints.md`, отдельная страница `features/release-burndown.md`. | 11ч |

---

## 9. Оценка трудоёмкости

| Этап | Часы (оценка) |
|------|---------------|
| Анализ и план | 4 |
| Backend (S-1…S-4 + burndown в S-10) | 56 |
| Frontend (S-5, S-6, S-7, S-8, S-9, S-10) | 56 |
| Тесты (юниты + интеграция + E2E + a11y) | 14 |
| Code review + fixes | 8 |
| Документация | 4 |
| **Итого** | **~126ч** |

Суммы по историям (S-1…S-11): 10 + 10 + 14 + 8 + 15 + 16 + 8 + 10 + 8 + 16 + 11 = **126ч**.

Рекомендация по поставке: эпик разбит на 2 фазы:
- **Фаза 1 (MVP, ~79ч)** — S-1…S-6 + S-11 базовый: ядро модуля, админка, UI на релизе и задаче с разбивкой `N/M/K`, базовая документация. Релиз-менеджер получает видимость задач, прошедших и нарушивших КТ.
- **Фаза 2 (~47ч)** — S-7 + S-8 + S-9 + S-10: карточные индикаторы, TopBar, массовое применение, webhook, аудит, матрица задач × КТ, burndown-диаграмма. S-11 завершение (a11y + доп. документация).

---

## 10. Связанные задачи

- Родитель: нет.
- Связанные: [TTMP-140](./TTMP-140.md) (Доработка функционала релизов), [TTMP-223](./TTMP-223.md) (Исправление несоответствий Release Mgmt спеке) — оба должны быть в DONE или учтены как pre-req перед стартом.
- Зависит от: существующей RBAC-модели (TTSEC-2), `CustomField`/`IssueCustomFieldValue` (готово), `ReleaseWorkflow` (готово).
- Блокирует: дашборд релиз-менеджера «Риски по всем релизам» (будет следующим эпиком после этого).

---

## 11. Иерархия задач

```
TTMP-160 (EPIC) — Модуль контрольных точек релизов
├── Фаза 1 (MVP, ~79ч)
│   ├── TTMP-160/S-1 (STORY) — DB + CRUD типов/шаблонов (snapshot, violation events)
│   ├── TTMP-160/S-2 (STORY) — Движок расчёта критериев (+ human reason, + breakdown N/M/K)
│   ├── TTMP-160/S-3 (STORY) — Привязка к релизу + риск + превью + inline-include + breakdown API
│   ├── TTMP-160/S-4 (STORY) — Триггеры (cron + event-hooks + debounce)
│   ├── TTMP-160/S-5 (STORY) — Админ-UI (типы, шаблоны, превью, sync-instances)
│   ├── TTMP-160/S-6 (STORY) — UI в релизе и задаче (светофор, риск, разбивка N/M/K, группировка, история)
│   └── TTMP-160/S-11 (STORY, частично) — E2E базовые + базовая документация
└── Фаза 2 (расширение UX и аналитики, ~47ч)
    ├── TTMP-160/S-7 (STORY) — Индикаторы на карточках + TopBar badge + фильтры DashboardPage
    ├── TTMP-160/S-8 (STORY) — Bulk-apply + webhook + аудит-страница + CSV
    ├── TTMP-160/S-9 (STORY) — Матрица «Задачи × КТ» + CSV-экспорт
    ├── TTMP-160/S-10 (STORY) — Burndown (модель, cron, API, chart) 🔥 RM-приоритет
    └── TTMP-160/S-11 (STORY, завершение) — a11y-тесты, сценарии по ролям, `features/checkpoints.md` + `features/release-burndown.md`
```

### UX по ролям (карта)

| Роль | Основные экраны | Что может | Что видит |
|------|-----------------|-----------|-----------|
| `SUPER_ADMIN`, `ADMIN` | `/admin/release-checkpoint-types`, `/admin/release-checkpoint-templates`, `/admin/checkpoint-audit` | Всё: CRUD типов, шаблонов, sync-instances, ручной recompute, просмотр аудита, **backfill burndown-снапшотов** | Все КТ всех релизов, полная burndown-история |
| `RELEASE_MANAGER` | То же + `GlobalReleasesPage` (вкладки Items / Sprints / Checkpoints / **Burndown**) | CRUD типов/шаблонов, применение (одиночное и массовое) к любым релизам, sync-instances, ручной recompute | Все КТ всех релизов, риск-дашборд в списке релизов, **разбивка `N применимо / M прошли / K нарушают`**, **матрица «Задачи × КТ»**, **burndown-диаграмма (задачи / часы / нарушенные КТ)** |
| `MANAGER` (проектный) | `ReleasesPage` своего проекта, `ProjectDetailPage` | Применить готовый шаблон к своему ATOMIC-релизу, удалить КТ со своего релиза, ручной recompute. **Не** может создавать типы/шаблоны | КТ релизов своего проекта, бейджи риска, индикаторы на задачах проекта, burndown своих релизов |
| `MEMBER` / `USER` (исполнитель) | `BoardPage`, `IssueDetailPage`, `DashboardPage` | Исправлять свои задачи по подсказкам; видеть свои нарушения | Блок КТ на своих задачах (с reason и inline-действиями), красная полоска на карточке, badge в TopBar, фильтр «Мои в риске». Burndown релиза — read-only через `DetailPanel` |
| `AUDITOR` | `/admin/checkpoint-audit` | Только чтение и экспорт CSV | Все события нарушений + burndown всех релизов (read-only) с фильтрами по периоду, проекту, типу, релизу |

(Подзадачи заводятся после утверждения ТЗ. Фазирование — рекомендация, не обязательство.)

---

## 12. Технические детали реализации (для zero-context реализации)

### 12.1 Prisma-модели (полный DDL)

Добавить в `backend/src/prisma/schema.prisma` (после блока `Release`-моделей):

```prisma
enum CheckpointWeight {
  CRITICAL
  HIGH
  MEDIUM
  LOW
}

enum CheckpointState {
  PENDING
  OK
  VIOLATED
}

model CheckpointType {
  id               String           @id @default(uuid())
  name             String           @unique
  description      String?
  color            String           @default("#888888")
  weight           CheckpointWeight @default(MEDIUM)
  offsetDays       Int              @map("offset_days")          // <0 = до релиза, >0 = после
  warningDays      Int              @default(3) @map("warning_days") // окно YELLOW перед deadline
  criteria         Json             // массив CheckpointCriterion — см. 12.3
  webhookUrl       String?          @map("webhook_url")
  minStableSeconds Int              @default(300) @map("min_stable_seconds") // debounce для webhook
  isActive         Boolean          @default(true) @map("is_active")
  createdAt        DateTime         @default(now()) @map("created_at")
  updatedAt        DateTime         @updatedAt      @map("updated_at")

  templateItems    CheckpointTemplateItem[]
  releaseCheckpoints ReleaseCheckpoint[]

  @@index([isActive])
  @@map("checkpoint_types")
}

model CheckpointTemplate {
  id          String   @id @default(uuid())
  name        String   @unique
  description String?
  createdById String?  @map("created_by_id")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt      @map("updated_at")

  createdBy User?                    @relation("checkpointTemplateCreator", fields: [createdById], references: [id])
  items     CheckpointTemplateItem[]

  @@map("checkpoint_templates")
}

model CheckpointTemplateItem {
  id               String @id @default(uuid())
  templateId       String @map("template_id")
  checkpointTypeId String @map("checkpoint_type_id")
  orderIndex       Int    @default(0) @map("order_index")

  template       CheckpointTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)
  checkpointType CheckpointType     @relation(fields: [checkpointTypeId], references: [id], onDelete: Restrict)

  @@unique([templateId, checkpointTypeId])
  @@index([templateId])
  @@map("checkpoint_template_items")
}

model ReleaseCheckpoint {
  id                   String          @id @default(uuid())
  releaseId            String          @map("release_id")
  checkpointTypeId     String          @map("checkpoint_type_id")
  criteriaSnapshot     Json            @map("criteria_snapshot")     // FR-15
  offsetDaysSnapshot   Int             @map("offset_days_snapshot")  // FR-15
  deadline             DateTime        @db.Date
  state                CheckpointState @default(PENDING)
  lastEvaluatedAt      DateTime?       @map("last_evaluated_at")
  applicableIssueIds   Json            @default("[]") @map("applicable_issue_ids") // FR-25: string[]
  passedIssueIds       Json            @default("[]") @map("passed_issue_ids")     // FR-25: string[]
  violations           Json            @default("[]")                                // [{ issueId, issueKey, issueTitle, reason, criterionType }]
  violationsHash       String          @default("") @map("violations_hash")         // для skip write без diff
  lastWebhookSentAt    DateTime?       @map("last_webhook_sent_at")                 // FR-17 debounce
  createdAt            DateTime        @default(now()) @map("created_at")
  updatedAt            DateTime        @updatedAt      @map("updated_at")

  release         Release        @relation(fields: [releaseId], references: [id], onDelete: Cascade)
  checkpointType  CheckpointType @relation(fields: [checkpointTypeId], references: [id], onDelete: Restrict)
  violationEvents CheckpointViolationEvent[]

  @@unique([releaseId, checkpointTypeId])
  @@index([releaseId])
  @@index([deadline])
  @@index([state])
  @@map("release_checkpoints")
}

model CheckpointViolationEvent {
  id                  String    @id @default(uuid())
  releaseCheckpointId String    @map("release_checkpoint_id")
  issueId             String    @map("issue_id")
  issueKey            String    @map("issue_key")
  reason              String
  criterionType       String    @map("criterion_type")
  occurredAt          DateTime  @default(now()) @map("occurred_at")
  resolvedAt          DateTime? @map("resolved_at")

  releaseCheckpoint ReleaseCheckpoint @relation(fields: [releaseCheckpointId], references: [id], onDelete: Cascade)

  @@index([releaseCheckpointId])
  @@index([issueId])
  @@index([occurredAt])
  @@index([resolvedAt])
  @@map("checkpoint_violation_events")
}

model ReleaseBurndownSnapshot {
  id                    String   @id @default(uuid())
  releaseId             String   @map("release_id")
  snapshotDate          DateTime @db.Date @map("snapshot_date")
  totalIssues           Int      @map("total_issues")
  doneIssues            Int      @map("done_issues")
  openIssues            Int      @map("open_issues")
  cancelledIssues       Int      @map("cancelled_issues")
  totalEstimatedHours   Decimal  @db.Decimal(8,2) @map("total_estimated_hours")
  doneEstimatedHours    Decimal  @db.Decimal(8,2) @map("done_estimated_hours")
  openEstimatedHours    Decimal  @db.Decimal(8,2) @map("open_estimated_hours")
  violatedCheckpoints   Int      @default(0) @map("violated_checkpoints")
  totalCheckpoints      Int      @default(0) @map("total_checkpoints")
  capturedAt            DateTime @default(now()) @map("captured_at")

  release Release @relation(fields: [releaseId], references: [id], onDelete: Cascade)

  @@unique([releaseId, snapshotDate])
  @@index([releaseId])
  @@index([snapshotDate])
  @@map("release_burndown_snapshots")
}
```

В `model Release` добавить обратные связи: `checkpoints ReleaseCheckpoint[]`, `burndownSnapshots ReleaseBurndownSnapshot[]`.
В `model User` добавить: `checkpointTemplatesCreated CheckpointTemplate[] @relation("checkpointTemplateCreator")`.

**Миграция** — `backend/src/prisma/migrations/20260419000000_release_checkpoints/migration.sql` — генерируется автоматически через `prisma migrate dev --name release_checkpoints`. Проверить, что миграция содержит `ON DELETE CASCADE` для зависимостей от `Release` и `ON DELETE RESTRICT` для `CheckpointType` (иначе удалится тип, используемый в активном КТ).

### 12.2 TypeScript-типы (backend/src/modules/releases/checkpoints/checkpoint.types.ts)

```typescript
import type { StatusCategory } from '@prisma/client';

export type CheckpointCriterion =
  | { type: 'STATUS_IN'; categories: StatusCategory[]; issueTypes?: string[] }
  | { type: 'DUE_BEFORE'; days: number; issueTypes?: string[] }
  | { type: 'ASSIGNEE_SET'; issueTypes?: string[] }
  | { type: 'CUSTOM_FIELD_VALUE'; customFieldId: string; operator: 'EQUALS' | 'NOT_EMPTY' | 'IN'; value?: unknown; issueTypes?: string[] }
  | { type: 'ALL_SUBTASKS_DONE'; issueTypes?: string[] }
  | { type: 'NO_BLOCKING_LINKS'; linkTypeKeys?: string[]; issueTypes?: string[] };

export interface CheckpointViolation {
  issueId: string;
  issueKey: string;
  issueTitle: string;
  reason: string;
  criterionType: CheckpointCriterion['type'];
}

export interface CheckpointBreakdown {
  applicable: number;
  passed: number;
  violated: number;
}

export interface ReleaseRisk {
  score: number;                                        // 0..1
  level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface EvaluatedCheckpoint {
  id: string;
  checkpointType: { id: string; name: string; color: string; weight: string };
  deadline: string;                                     // ISO date
  state: 'PENDING' | 'OK' | 'VIOLATED';
  isWarning: boolean;                                   // YELLOW: state=PENDING && deadline-now <= warningDays && violations.length > 0
  breakdown: CheckpointBreakdown;
  passedIssues: Array<{ issueId: string; issueKey: string; issueTitle: string }>;
  violatedIssues: CheckpointViolation[];
  lastEvaluatedAt: string | null;
}
```

### 12.3 Zod DTO (checkpoint.dto.ts)

```typescript
import { z } from 'zod';

const criterionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('STATUS_IN'),
             categories: z.array(z.enum(['TODO','IN_PROGRESS','DONE','CANCELLED'])).min(1),
             issueTypes: z.array(z.string()).optional() }),
  z.object({ type: z.literal('DUE_BEFORE'),
             days: z.number().int(),
             issueTypes: z.array(z.string()).optional() }),
  z.object({ type: z.literal('ASSIGNEE_SET'),
             issueTypes: z.array(z.string()).optional() }),
  z.object({ type: z.literal('CUSTOM_FIELD_VALUE'),
             customFieldId: z.string().uuid(),
             operator: z.enum(['EQUALS','NOT_EMPTY','IN']),
             value: z.unknown().optional(),
             issueTypes: z.array(z.string()).optional() }),
  z.object({ type: z.literal('ALL_SUBTASKS_DONE'),
             issueTypes: z.array(z.string()).optional() }),
  z.object({ type: z.literal('NO_BLOCKING_LINKS'),
             linkTypeKeys: z.array(z.string()).optional(),
             issueTypes: z.array(z.string()).optional() }),
]);

export const createCheckpointTypeDto = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  weight: z.enum(['CRITICAL','HIGH','MEDIUM','LOW']).default('MEDIUM'),
  offsetDays: z.number().int().min(-365).max(365),
  warningDays: z.number().int().min(0).max(30).default(3),
  criteria: z.array(criterionSchema).min(1).max(10),
  webhookUrl: z.string().url().nullable().optional(),
  minStableSeconds: z.number().int().min(0).max(3600).default(300),
});

export const updateCheckpointTypeDto = createCheckpointTypeDto.partial();

export const createCheckpointTemplateDto = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  items: z.array(z.object({
    checkpointTypeId: z.string().uuid(),
    orderIndex: z.number().int().default(0),
  })).min(1).max(20),
});

export const applyTemplateDto = z.object({ templateId: z.string().uuid() });
export const applyBulkDto   = z.object({
  templateId: z.string().uuid(),
  releaseIds: z.array(z.string().uuid()).min(1).max(50),
});
export const addCheckpointsDto = z.object({
  checkpointTypeIds: z.array(z.string().uuid()).min(1).max(20),
});
export const syncInstancesDto = z.object({
  releaseIds: z.array(z.string().uuid()).min(1).max(100),
});
export const burndownQueryDto = z.object({
  metric: z.enum(['issues','hours','violations']).default('issues'),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type CreateCheckpointTypeDto = z.infer<typeof createCheckpointTypeDto>;
// ... остальные типы — `z.infer<typeof ...>`
```

### 12.4 Алгоритмы

**`evaluateCriterion(criterion, issue, customFieldValues, subtasks, links)`** (pure function):

```
function evaluateCriterion(c, issue, cfv, subtasks, links):
  // issueTypes filter (применимость)
  if c.issueTypes && !c.issueTypes.includes(issue.issueTypeConfig.systemKey):
    return { applicable: false }

  switch c.type:
    case 'STATUS_IN':
      passed = c.categories.includes(issue.workflowStatus.category)
      reason = passed ? null : `Статус ${issue.workflowStatus.name} не входит в ${c.categories.join('/')}`

    case 'DUE_BEFORE':
      target = release.plannedDate + c.days days
      if !issue.dueDate:
        return { applicable: true, passed: false, reason: `dueDate не задан, ожидается ≤ ${target}` }
      passed = issue.dueDate <= target
      reason = passed ? null : `dueDate ${issue.dueDate} > ${target}`

    case 'ASSIGNEE_SET':
      passed = issue.assigneeId != null
      reason = passed ? null : 'Исполнитель не назначен'

    case 'CUSTOM_FIELD_VALUE':
      val = cfv.get(c.customFieldId)
      switch c.operator:
        'NOT_EMPTY': passed = val != null && val !== '' && !(Array.isArray(val) && val.length === 0)
        'EQUALS':    passed = deepEqual(val, c.value)
        'IN':        passed = Array.isArray(c.value) && c.value.includes(val)
      reason = passed ? null : `Поле "${fieldName}" — ${describeFailure(val, c)}`

    case 'ALL_SUBTASKS_DONE':
      if subtasks.length === 0: return { applicable: true, passed: true }
      passed = subtasks.every(s => ['DONE','CANCELLED'].includes(s.workflowStatus.category))
      reason = passed ? null : `${subtasks.filter(s => !done).length} подзадач не закрыты`

    case 'NO_BLOCKING_LINKS':
      blocking = links.filter(l => l.type.direction === 'BLOCKS' && (!c.linkTypeKeys || c.linkTypeKeys.includes(l.type.key)))
      passed = blocking.every(l => ['DONE','CANCELLED'].includes(l.targetIssue.workflowStatus.category))
      reason = passed ? null : `Блокируется: ${blockedIssueKeys.join(', ')}`

  return { applicable: true, passed, reason }
```

**`evaluateCheckpoint(checkpoint, issues, now)`:**

```
for each issue in issues:
  results = criteriaSnapshot.map(c => evaluateCriterion(c, issue, ...))
  applicable = results.some(r => r.applicable)
  if !applicable: continue
  applicableIssueIds.push(issue.id)
  passed = results.filter(r => r.applicable).every(r => r.passed)
  if passed:
    passedIssueIds.push(issue.id)
  else:
    failed = results.filter(r => r.applicable && !r.passed)
    violations.push({ issueId, issueKey, issueTitle,
                      reason: failed.map(f => f.reason).join('; '),
                      criterionType: failed[0].type })

state =
  (violations.length === 0)                  ? OK
  : (now >= deadline)                        ? VIOLATED
  : PENDING

isWarning = (state === PENDING) && (deadline - now <= warningDays) && (violations.length > 0)

violationsHash = sha1(JSON.stringify(violations.sort(issueId)))
```

**Риск-скоринг** (`computeReleaseRisk`):

```
WEIGHTS = { CRITICAL: 8, HIGH: 4, MEDIUM: 2, LOW: 1 }

score = sum(WEIGHTS[rc.checkpointType.weight] for rc where rc.state === VIOLATED)
      / sum(WEIGHTS[rc.checkpointType.weight] for rc in all checkpoints)

if total === 0:         level = LOW, score = 0
else if score === 0:    level = LOW
else if score <= 0.30:  level = MEDIUM
else if score <= 0.70:  level = HIGH
else:                   level = CRITICAL
```

**Burndown ideal line** (FR-30):

```
initial = snapshots[0]  // первый записанный снапшот
start_date = initial.snapshotDate
end_date = release.plannedDate

if metric === 'issues':      start_value = initial.totalIssues - initial.doneIssues
if metric === 'hours':       start_value = initial.openEstimatedHours
if metric === 'violations':  start_value = initial.violatedCheckpoints

ideal = []
for day in [start_date .. end_date]:
  progress = (day - start_date) / (end_date - start_date)  // 0..1
  value = start_value * (1 - progress)
  ideal.push({ date: day, value: round(value, 2) })
```

### 12.5 Раскладка файлов

```
backend/src/modules/releases/checkpoints/
├── checkpoint.types.ts              # TypeScript union + response shapes
├── checkpoint.dto.ts                # Zod schemas
├── checkpoint-types.router.ts       # CRUD типов + sync-instances
├── checkpoint-types.service.ts
├── checkpoint-templates.router.ts   # CRUD шаблонов + clone
├── checkpoint-templates.service.ts
├── release-checkpoints.router.ts    # применение/удаление/пересчёт на релизе
├── release-checkpoints.service.ts
├── checkpoint-engine.service.ts     # recomputeForRelease, recomputeForIssue, computeReleaseRisk
├── evaluate-criterion.ts            # pure function
├── checkpoint-scheduler.service.ts  # node-cron: КТ + burndown + retention
├── burndown.service.ts              # captureSnapshot, getBurndown, backfill, purge
├── burndown.router.ts               # GET /burndown, POST /burndown/backfill
├── webhook-notifier.service.ts      # CHECKPOINT_WEBHOOK с debounce
├── audit.router.ts                  # GET /checkpoint-audit + CSV
└── audit.service.ts

frontend/src/
├── api/
│   ├── release-checkpoints.ts
│   ├── release-checkpoint-types.ts
│   ├── release-checkpoint-templates.ts
│   └── release-burndown.ts
├── components/releases/
│   ├── CheckpointTrafficLight.tsx
│   ├── ReleaseRiskBadge.tsx
│   ├── CheckpointsBlock.tsx
│   ├── CheckpointsMatrix.tsx
│   ├── ApplyCheckpointTemplateModal.tsx
│   ├── CheckpointRiskFilter.tsx
│   └── ReleaseBurndownChart.tsx
├── components/issues/
│   └── IssueCheckpointIndicator.tsx
├── pages/admin/
│   ├── AdminReleaseCheckpointTypesPage.tsx
│   ├── AdminReleaseCheckpointTemplatesPage.tsx
│   └── AdminCheckpointAuditPage.tsx
└── types/release.types.ts            # extend with Checkpoint* + Burndown*
```

### 12.6 Монтаж роутеров в `app.ts`

В `backend/src/app.ts` после существующих `app.use(releasesRouter)`:

```ts
import checkpointTypesRouter from './modules/releases/checkpoints/checkpoint-types.router.js';
import checkpointTemplatesRouter from './modules/releases/checkpoints/checkpoint-templates.router.js';
import releaseCheckpointsRouter from './modules/releases/checkpoints/release-checkpoints.router.js';
import burndownRouter from './modules/releases/checkpoints/burndown.router.js';
import checkpointAuditRouter from './modules/releases/checkpoints/audit.router.js';
import { startCheckpointScheduler } from './modules/releases/checkpoints/checkpoint-scheduler.service.js';

app.use('/api', checkpointTypesRouter);
app.use('/api', checkpointTemplatesRouter);
app.use('/api', releaseCheckpointsRouter);
app.use('/api', burndownRouter);
app.use('/api', checkpointAuditRouter);

if (config.CHECKPOINTS_SCHEDULER_ENABLED && config.NODE_ENV !== 'test') {
  startCheckpointScheduler();
}
```

### 12.7 Config (backend/src/config.ts)

Расширить `envSchema` и `config`:

```ts
CHECKPOINTS_SCHEDULER_ENABLED: z.coerce.boolean().default(true),
CHECKPOINTS_SCHEDULER_CRON:    z.string().default('*/10 * * * *'),
CHECKPOINTS_EVAL_WINDOW_DAYS:  z.coerce.number().default(30),
BURNDOWN_SNAPSHOT_CRON:        z.string().default('5 0 * * *'),
BURNDOWN_RETENTION_CRON:       z.string().default('0 3 * * 0'),
BURNDOWN_RETENTION_DAYS_AFTER_DONE: z.coerce.number().default(90),
BURNDOWN_WEEKLY_AGG_AFTER_DAYS:     z.coerce.number().default(365),
CHECKPOINT_WEBHOOK_TIMEOUT_MS: z.coerce.number().default(5000),
```

### 12.8 Redis-ключи (централизуем в `checkpoint-engine.service.ts`)

| Ключ | Назначение | TTL |
|------|------------|-----|
| `checkpoints:scheduler:lock` | cron-лок пересчёта | 300s |
| `burndown:snapshot:lock` | cron-лок снапшотов | 600s |
| `burndown:retention:lock` | cron-лок retention | 600s |
| `release:{id}:checkpoints` | кэш результата GET /checkpoints | 60s |
| `burndown:{releaseId}:{metric}:{from}:{to}` | кэш ответа burndown | 300s |
| `checkpoints:recompute-dedup:req:{requestId}:{releaseId}` | event-hook дедуп в одном HTTP-запросе | 10s |

### 12.9 Дедуп event-hook в рамках запроса

Проблема FR-7 / R-1: один HTTP-запрос (например, `POST /api/issues/bulk-update`) меняет 50 задач одного релиза — без дедупа получим 50 вызовов `recomputeForRelease`.

**Решение:** в `shared/middleware/request-context.ts` (новый файл) — `AsyncLocalStorage<RequestContext>` с `requestId` и `Set<releaseId>`. Middleware создаёт контекст на `req.id`. В хуке `afterUpdate` планируем recompute через `setImmediate`, внутри которого дедуплицируем по `Set`. Вызывается по окончании HTTP-запроса (events на `res.on('finish')`).

Альтернатива (проще): в начале handler'а создать `pendingReleaseIds = new Set<string>()`, передавать в service через `options`, после коммита транзакции — `await Promise.all([...pendingReleaseIds].map(recomputeForRelease))`.

Выбрать вариант на этапе реализации PR-5; простой — ОК для MVP.

### 12.10 Audit actions (каталог для `logAudit`)

```
checkpoint_type.created     (resource: 'checkpoint_type', resourceId: typeId)
checkpoint_type.updated
checkpoint_type.deleted
checkpoint_type.sync_instances_requested  (meta: { releaseIds })

checkpoint_template.created
checkpoint_template.updated
checkpoint_template.deleted
checkpoint_template.cloned    (meta: { fromTemplateId })
checkpoint_template.applied   (resource: 'release', meta: { templateId, createdCheckpointIds })
checkpoint_template.applied_bulk (meta: { templateId, releaseIds, createdCheckpointIds })

release_checkpoint.added     (resource: 'release', meta: { checkpointTypeIds })
release_checkpoint.removed
release_checkpoint.state_changed (meta: { from, to, violationsCount })
release_checkpoint.recomputed (meta: { trigger: 'manual'|'cron'|'event' })

burndown.backfilled          (resource: 'release', meta: { snapshotDate })
```

### 12.11 Ошибки (HTTP-коды)

| Ситуация | Код | Тело |
|----------|-----|------|
| Удаление `CheckpointType`, используемого в активных КТ | 409 | `{ error: 'CHECKPOINT_TYPE_IN_USE', activeInstances: [{ releaseId, releaseName }] }` |
| Удаление `CustomField`, использованного в критерии | 409 | `{ error: 'CUSTOM_FIELD_USED_IN_CHECKPOINT', types: [{ id, name }] }` |
| Применение шаблона к релизу без прав | 403 | `{ error: 'FORBIDDEN_APPLY_TEMPLATE' }` |
| Apply-bulk: часть релизов недоступна | 207 | `{ successful: [...], forbidden: [{ releaseId, reason }] }` |
| Backfill для чужого релиза без ADMIN | 403 | `{ error: 'FORBIDDEN_BACKFILL' }` |

Переиспользовать `AppError` / `asyncHandler` — см. `backend/src/shared/middleware/error-handler.ts`.

### 12.12 Тестовая инфраструктура

- Интеграционные тесты — по паттерну `backend/tests/releases-sprints.test.ts` (использует `test-database.ts`).
- Unit-тесты — `backend/tests/checkpoints.unit.test.ts` (только engine / evaluateCriterion).
- E2E — Playwright, extend `frontend/e2e/specs/` новым `19-checkpoints.spec.ts`. Использовать fixtures из `frontend/e2e/fixtures/api.fixture.ts`.
- Для тестов cron — вызывать напрямую `checkpointScheduler.runOnce('checkpoints')` / `runOnce('burndown-snapshot')` (FR-28 требует публичного метода).

---

## 13. План реализации (PR / ветки / merge plan)

### 13.1 Стратегия

- **База:** все ветки создаются от свежего `main`, PR-ы мерджатся напрямую в `main` (соответствует текущему workflow проекта — см. git log).
- **Feature flag:** не используем (по CLAUDE.md). Каждый PR оставляет `main` в рабочем состоянии. UI-часть выкатывается после того, как API готов.
- **Именование веток:** `ttmp-160/<scope>` — совместимо с существующим паттерном (`feat(rbac):`, `docs(rbac):` и т.п.).
- **Имя коммита:** `feat(checkpoints): TTMP-160 — <scope>` для основных; `chore(checkpoints): …` для вспомогательных.
- **Размер PR:** целимся в 400–800 строк diff. Большие (S-6, S-10) при необходимости разбиваем на 2 PR.
- **CI:** каждый PR проходит `make lint`, `make test`, Playwright e2e (кроме PR, не меняющих UI).
- **Staging deploy:** после каждого merged PR staging-пайплайн деплоится автоматически; ручной smoke-check по чек-листу PR.

### 13.2 DAG зависимостей

```
PR-1 (schema) ──► PR-2 (engine) ──► PR-3 (release API) ──► PR-4 (triggers) ──► PR-8 (bulk+webhook)
                                      │                       │
                                      ├─► PR-5 (admin UI)    └─► Phase 2 триггеров
                                      ├─► PR-6 (rel/issue UI) ──► PR-7 (board+topbar)
                                      └─► PR-9 (matrix)
                                      
PR-1 ──► PR-10 (burndown backend) ──► PR-11 (burndown UI)

PR-1..PR-11 ──► PR-12 (e2e+a11y+docs)
```

Параллелизм после merge PR-3: PR-5 ‖ PR-6 ‖ PR-9 ‖ PR-10 могут разрабатываться одновременно разными разработчиками.

### 13.3 PR-ы Фазы 1 (MVP, ~79ч)

#### PR-1: Schema + CRUD types/templates
- **Branch:** `ttmp-160/foundation`
- **Content:**
  - Prisma models (12.1), миграция `20260419000000_release_checkpoints`.
  - `checkpoint.types.ts`, `checkpoint.dto.ts`.
  - `checkpoint-types.router.ts`/`service.ts` — CRUD `RELEASE_MANAGER/ADMIN`.
  - `checkpoint-templates.router.ts`/`service.ts` — CRUD + clone.
  - Mount в `app.ts`.
  - Unit-тесты DTO + RBAC.
- **Не включает:** engine, применение к релизу, UI.
- **Merge-ready check:** `prisma generate`, `make lint`, `make test`, миграция применяется и откатывается на чистой БД.
- **Оценка:** ~10ч.

#### PR-2: Engine + evaluateCriterion
- **Branch:** `ttmp-160/engine` (от main после PR-1)
- **Content:**
  - `evaluate-criterion.ts` (pure) — 6 типов + reason generation (12.4).
  - `checkpoint-engine.service.ts` — `evaluateCheckpoint`, `computeReleaseRisk`, хэлперы для breakdown.
  - Unit-тесты (по 5–7 кейсов на каждый тип критерия, edge cases).
- **Не включает:** API, БД-вызовы (engine работает на предзагруженных данных).
- **Merge-ready check:** покрытие engine ≥ 90%.
- **Оценка:** ~10ч.

#### PR-3: Release binding API + breakdown + preview
- **Branch:** `ttmp-160/release-binding`
- **Content:**
  - `release-checkpoints.router.ts`/`service.ts`:
    - `GET /api/releases/:id/checkpoints` (с breakdown + passedIssues + violatedIssues).
    - `POST /api/releases/:id/checkpoints` (add by typeIds).
    - `POST /api/releases/:id/checkpoints/apply-template` (со snapshot FR-15).
    - `POST /api/releases/:id/checkpoints/preview-template` (FR-14).
    - `POST /api/releases/:id/checkpoints/recompute`.
    - `DELETE /api/releases/:id/checkpoints/:checkpointId`.
    - `GET  /api/issues/:id/checkpoints`.
    - `POST /api/checkpoint-types/:id/sync-instances`.
  - Расширение `GET /api/issues/:id?include=checkpoints` (FR-19) — правка `issues.router.ts`.
  - Recompute использует engine из PR-2, пишет `applicableIssueIds`/`passedIssueIds`/`violations`/`violationsHash`.
  - Redis-кэш `release:{id}:checkpoints` TTL 60.
  - Integration-тесты (`backend/tests/checkpoints.test.ts`).
- **Merge-ready check:** endpoints работают через curl; recompute идемпотентен (повтор не пишет, если хэш не изменился).
- **Оценка:** ~14ч.

#### PR-4: Triggers — cron + event hooks
- **Branch:** `ttmp-160/triggers`
- **Content:**
  - `checkpoint-scheduler.service.ts` с `node-cron` (два выражения: checkpoints + burndown заглушка на будущее).
  - Хуки в `issues.service.ts` (`updateIssue`, `bulkUpdateIssues`, `bulkTransitionIssues`, `updateIssueStatus`).
  - Хук в `issue-custom-fields.service.ts`.
  - Хуки в `releases.service.ts` (`addReleaseItems`, `removeReleaseItems`, `updateRelease` при смене plannedDate).
  - Дедуп per-request (12.9, простой вариант).
  - Redis-lock `checkpoints:scheduler:lock`.
  - `shared/config.ts` env vars (12.7).
  - Добавить `node-cron` в `backend/package.json`.
  - Integration-тесты: (a) event-hook на PATCH /issues/:id срабатывает, (b) bulk-update вызывает 1 recompute на релиз, (c) `scheduler.runOnce` работает.
- **Merge-ready check:** cron запускается на staging, `lastEvaluatedAt` обновляется.
- **Оценка:** ~8ч.

#### PR-5: Admin UI — types & templates
- **Branch:** `ttmp-160/admin-ui`
- **Content:**
  - `api/release-checkpoint-types.ts`, `api/release-checkpoint-templates.ts`.
  - `pages/admin/AdminReleaseCheckpointTypesPage.tsx` — Ant Table + Drawer с конструктором критериев.
  - `pages/admin/AdminReleaseCheckpointTemplatesPage.tsx` — Table + Drawer с drag-n-drop items.
  - Модалка «Применить изменения к N активным экземплярам?» для FR-15.
  - Регистрация маршрутов в `AdminPage.tsx` / `Sidebar.tsx`.
  - Правило CLAUDE.md: `onCancel`/`onClose` модалок → `load()` родителя.
- **Merge-ready check:** admin проходит e2e-сценарий «создать тип → создать шаблон → удалить».
- **Оценка:** ~15ч.

#### PR-6: Release & issue UI
- **Branch:** `ttmp-160/release-issue-ui`
- **Content:**
  - `api/release-checkpoints.ts`.
  - `components/releases/CheckpointTrafficLight.tsx` (FR-18: цвет+иконка+текст+aria-label).
  - `components/releases/ReleaseRiskBadge.tsx`.
  - `components/releases/CheckpointsBlock.tsx` — с разбивкой N/M/K (FR-25), раскрывающимися списками «Прошли» и «Нарушают» + inline-действия (FR-16).
  - `components/releases/ApplyCheckpointTemplateModal.tsx` — с превью (FR-14).
  - `components/releases/CheckpointRiskFilter.tsx` — фильтр + сортировка по риску (FR-13).
  - Интеграция в `GlobalReleasesPage.tsx`, `ReleasesPage.tsx` (бейдж + блок).
  - Интеграция в `IssueDetailPage.tsx` — блок с группировкой по релизу (FR-20) + история нарушений (FR-22).
  - Правило CLAUDE.md для всех модалок.
- **Merge-ready check:** UAT сценарий «применить шаблон → увидеть светофор → поправить статус задачи → увидеть обновление за ≤ 5 сек».
- **Оценка:** ~16ч.

### 13.4 PR-ы Фазы 2 (~47ч)

#### PR-7: Board indicators + TopBar badge
- **Branch:** `ttmp-160/board-topbar`
- **Content:**
  - `components/issues/IssueCheckpointIndicator.tsx`.
  - Интеграция в `BoardPage.tsx`, `ProjectDetailPage.tsx`.
  - `layout/TopBar.tsx`: badge с счётчиком своих задач-нарушителей + клик → Dashboard с фильтром.
  - Фильтр «Мои в риске» в `DashboardPage.tsx`, `TimePage.tsx`.
  - Polling badge раз в 60с (хук `useMyCheckpointViolationsCount`).
- **Оценка:** ~8ч.

#### PR-8: Bulk-apply + webhook + audit page
- **Branch:** `ttmp-160/bulk-webhook-audit`
- **Content:**
  - `POST /api/checkpoint-templates/:id/apply-bulk` (FR-21, SEC-5) — 207 Multi-Status при смешанных правах.
  - `webhook-notifier.service.ts` — debounce по `lastWebhookSentAt` и `minStableSeconds` (FR-17).
  - Вызов notifier из engine после state-transition → VIOLATED.
  - `audit.router.ts` + `audit.service.ts` — `GET /api/checkpoint-audit` с фильтрами.
  - `pages/admin/AdminCheckpointAuditPage.tsx` + CSV (FR-23).
  - UI для bulk-apply на `GlobalReleasesPage` (чекбоксы).
- **Оценка:** ~10ч.

#### PR-9: Matrix view
- **Branch:** `ttmp-160/matrix`
- **Content:**
  - `GET /api/releases/:id/checkpoints/matrix` (JSON + `?format=csv`).
  - `components/releases/CheckpointsMatrix.tsx` — Ant Table с виртуализацией (для релизов >100 задач используем `rc-virtual-list`).
  - Переключатель «Список / Матрица» в `DetailPanel`.
  - Экспорт CSV.
- **Оценка:** ~8ч.

#### PR-10: Burndown backend
- **Branch:** `ttmp-160/burndown-backend`
- **Content:**
  - Миграция `release_burndown_snapshots` (модель уже заложена в PR-1 — ничего не добавлять; проверить, что в PR-1 модель включена; если нет — досоздать миграцию `20260420000000_burndown_snapshots`).
  - `burndown.service.ts` — `captureSnapshot`, `getBurndown` (с ideal line по формуле 12.4), `backfillSnapshot`, `purgeOldSnapshots`.
  - `burndown.router.ts` — `GET /api/releases/:id/burndown`, `POST /api/releases/:id/burndown/backfill`.
  - Расширение `checkpoint-scheduler.service.ts`: `tickBurndownSnapshot`, `tickBurndownRetention`.
  - Redis-кэш `burndown:{releaseId}:{metric}:{from}:{to}` TTL 300.
  - Integration-тесты: cron пишет снапшоты, повторный вызов идемпотентен, retention работает.
- **Оценка:** ~10ч.

#### PR-11: Burndown UI
- **Branch:** `ttmp-160/burndown-frontend`
- **Content:**
  - Добавить `recharts` в `frontend/package.json`.
  - `api/release-burndown.ts`.
  - `components/releases/ReleaseBurndownChart.tsx` — `<LineChart>` с actual/ideal, переключатель метрики, tooltip с дельтой.
  - Вкладка `BURNDOWN` в `DetailPanel` (правка `GlobalReleasesPage.tsx` / `ReleasesPage.tsx`).
  - Empty state с CTA «Backfill» для ADMIN (FR-31).
- **Оценка:** ~6ч.

#### PR-12: E2E + a11y + documentation
- **Branch:** `ttmp-160/e2e-docs`
- **Content:**
  - Playwright `e2e/specs/19-checkpoints.spec.ts` — сценарии по ролям (RM / DEV / PM / AUDITOR).
  - axe-core интеграция (`@axe-core/playwright`) — тесты на светофор, матрицу, burndown.
  - `docs/RU/USER_GUIDE.md` — раздел «Контрольные точки» с подразделами по ролям.
  - `docs/api/reference.md` — новые эндпоинты.
  - `docs/architecture/backend-modules.md` — модуль `releases/checkpoints`.
  - `docs/user-manual/features/checkpoints.md` + `release-burndown.md`.
  - `version_history.md` — запись о фичах.
- **Оценка:** ~11ч.

### 13.5 Итог: список PR

| № | Branch | Scope | Часы | Зависит от | Статус |
|---|--------|-------|------|-----------|--------|
| 1 | `ttmp-160/foundation` | Schema + CRUD types/templates | 10 | — | ✅ merged (#79) |
| 2 | `ttmp-160/engine` | Engine + evaluateCriterion | 10 | PR-1 | ✅ merged (#81) |
| 3 | `ttmp-160/release-binding` | Release API + breakdown + preview + inline | 14 | PR-2 | 🚧 open (#82) |
| 4 | `ttmp-160/triggers` | Cron + event-hooks + node-cron | 8 | PR-3 | ⏳ next |
| 5 | `ttmp-160/admin-ui` | Admin UI (types, templates, sync) | 15 | PR-3 | ⏳ |
| 6 | `ttmp-160/release-issue-ui` | UI в релизе и задаче | 16 | PR-3 | ⏳ |
| 7 | `ttmp-160/board-topbar` | Карточки + TopBar + Dashboard | 8 | PR-4, PR-6 | ⏳ |
| 8 | `ttmp-160/bulk-webhook-audit` | Bulk-apply + webhook + аудит-страница | 10 | PR-4 | ⏳ |
| 9 | `ttmp-160/matrix` | Матрица задач × КТ | 8 | PR-3 | ⏳ |
| 10 | `ttmp-160/burndown-backend` | Burndown schema + cron + API | 10 | PR-1, PR-4 | ⏳ |
| 11 | `ttmp-160/burndown-frontend` | Burndown UI + Recharts | 6 | PR-10 | ⏳ |
| 12 | `ttmp-160/e2e-docs` | E2E + a11y + docs | 11 | PR-1..PR-11 | ⏳ |

**Итого:** 12 PR, ~126 часов. **Прогресс:** 2 / 12 merged (≈20 ч), 1 в ревью (≈14 ч), осталось 9 PR (≈92 ч).

**Обновления по мере выполнения (2026-04-18):**
- PR-1 `ttmp-160/foundation` — ✅ merged в `main` (commit `078ef57`, PR [#79](https://github.com/NovakPAai/tasktime-mvp/pull/79)). Prisma-модели + миграция `20260422000000_release_checkpoints` + CRUD `/api/admin/checkpoint-types` и `/api/admin/checkpoint-templates`.
- PR-2 `ttmp-160/engine` — ✅ merged в `main` (commit `34d6196`, PR [#81](https://github.com/NovakPAai/tasktime-mvp/pull/81)). Pure-function `evaluate-criterion.ts` + `checkpoint-engine.service.ts` (`evaluateCheckpoint`, `computeReleaseRisk`, `computeViolationsHash`). 60 unit-тестов.
- PR-3 `ttmp-160/release-binding` — 🚧 открыт как PR [#82](https://github.com/NovakPAai/tasktime-mvp/pull/82). Release API + preview + breakdown + inline `?include=checkpoints` + `sync-instances` + `CheckpointViolationEvent` lifecycle. 17 интеграционных тестов; полный backend-suite 475/475 зелёный.

### 13.6 Merge-порядок и rollback

Все PR мерджатся строго последовательно по номеру, за исключением «параллельных» PR-5/6/9/10 (могут мерджиться в любом порядке между собой).

**Rollback стратегия:**
- Каждая миграция имеет паттерн для `prisma migrate resolve --rolled-back` (drop table на проде недопустим без бэкапа — использовать `0000_drop_release_checkpoints.sql` локально для тестов).
- UI-PR откатывается обычным revert-commit.
- Если PR-4 (cron) вызывает проблемы — в `.env` выставить `CHECKPOINTS_SCHEDULER_ENABLED=false` + перезапуск сервиса, без деплоя новой версии.
- PR-8 webhook: админ может выставить `CheckpointType.webhookUrl = null` для проблемных типов через админку.

### 13.7 Post-merge smoke-чек (в каждом PR)

Минимальный набор, который автор запускает после мержа на staging:

- PR-1: `curl POST /api/checkpoint-types` — создаётся, `curl GET /api/checkpoint-types` — видит.
- PR-3: применить шаблон к тестовому релизу, `GET /api/releases/:id/checkpoints` вернуть корректный shape.
- PR-4: в логах staging видно `[checkpoints] tick` каждые 10 минут; PATCH /issues/:id/status триггерит recompute.
- PR-6: на странице релиза UI виден, светофор рисуется, модалка применения шаблона работает.
- PR-10: `POST /api/releases/:id/burndown/backfill`, `GET /api/releases/:id/burndown` возвращает series.
- PR-11: вкладка BURNDOWN рендерит график.

Failure → revert PR немедленно.
