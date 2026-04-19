# ТЗ: TTUI-90 — Рефакторинг дашборда: role-aware фокусная рабочая область

**Дата:** 2026-04-18 (актуализация 2026-04-18 по факту реализации TTMP-160)
**Тип:** STORY | **Приоритет:** HIGH | **Статус:** OPEN
**Проект:** Flow Universe UI (TTUI)
**Автор ТЗ:** Claude Code (auto-generated)

**Связанный EPIC:** [TTMP-160](./TTMP-160.md) — модуль контрольных точек релизов (MVP ✅ complete, 11/12 PR merged). Предоставляет готовые API/компоненты: риск-бейдж, светофор, burndown-чарт, «мои нарушения КТ», матрица КТ. Дашборд **использует их повторно**, а не дублирует.

---

## 1. Постановка задачи

Текущий дашборд ([DashboardPage.tsx](frontend/src/pages/DashboardPage.tsx)) визуально аккуратен, но с UX-стороны выполняет роль «статической витрины метрик», а не рабочего инструмента. Нужно заменить его на **role-aware виджетную рабочую область**, которая в первом экране отвечает на четыре вопроса пользователя после логина:

1. **Что мне делать прямо сейчас?** (фокусные задачи на сегодня/просрочки/ожидающие моего ревью, **мои задачи-нарушители КТ**)
2. **Как идут мои текущие обязательства?** (активный спринт, **диаграмма сгорания ближайшего релиза**, время за неделю, блокеры)
3. **Какие релизы под угрозой срыва?** (релизы с risk-level MEDIUM+, просроченные контрольные точки)
4. **Что изменилось с тех пор, как я последний раз заходил?** (релевантный activity feed с событиями `CheckpointViolation`)

### Проблемы текущей реализации

| # | Проблема | Пример из кода |
|---|----------|----------------|
| P1 | Единый layout для всех ролей — админские метрики (счётчик пользователей, общее число time logs) показываются обычному пользователю, где они обнулены | [DashboardPage.tsx:218-220](frontend/src/pages/DashboardPage.tsx#L218-L220) — `adminStats` silently fails для не-админов и остаётся `null` |
| P2 | Кнопка «+ Новая задача» не создаёт задачу — делает `navigate('/projects')` | [DashboardPage.tsx:248](frontend/src/pages/DashboardPage.tsx#L248) |
| P3 | «Сегодня» — декоративный chip без действия | [DashboardPage.tsx:240-243](frontend/src/pages/DashboardPage.tsx#L240-L243) |
| P4 | «Мои задачи» сортируются по `updatedAt` (всплывают закрытые, если их только что обновили), ограничены 5 записями, без учёта приоритета/дедлайна/спринта | [DashboardPage.tsx:192-198](frontend/src/pages/DashboardPage.tsx#L192-L198) |
| P5 | **N+1 запрос** — для сбора «моих задач» фронт делает `listIssues(p.id, { assigneeId })` по каждому проекту в цикле | [DashboardPage.tsx:189-191](frontend/src/pages/DashboardPage.tsx#L189-L191) |
| P6 | Activity feed показывает сырой `action` и `entityType` без названия сущности и ссылки — «Иван создал(а) Issue» без возможности перейти | [DashboardPage.tsx:354-369](frontend/src/pages/DashboardPage.tsx#L354-L369) |
| P7 | Нет фокусных виджетов: «просрочено», «на сегодня», «в ревью ожидают меня», «прогресс спринта», «время на этой неделе», «заблокировано» | — |
| P8 | KPI-карточки не кликабельны (не переводят в отфильтрованный список) | [DashboardPage.tsx:170-178](frontend/src/pages/DashboardPage.tsx#L170-L178) (компонент `StatCard` без `onClick`) |
| P9 | **Нарушение design-system SSOT** — hardcoded палитры `DARK_C`/`LIGHT_C` прямо в файле, противоречит [frontend/DESIGN_SYSTEM.md](frontend/DESIGN_SYSTEM.md) (единственный источник — `design-tokens.ts`) | [DashboardPage.tsx:16-51](frontend/src/pages/DashboardPage.tsx#L16-L51) |
| P10 | Нет пустых состояний с CTA — первый заход в проект без задач показывает «Нет задач» текстом без призыва к действию | [DashboardPage.tsx:301-303](frontend/src/pages/DashboardPage.tsx#L301-L303) |
| P11 | Нет кастомизации — пользователь не может скрыть нерелевантные виджеты | — |
| P12 | Нет адаптивного layout — inline-padding `32px`, flex-ряды без breakpoint'ов | [DashboardPage.tsx:226](frontend/src/pages/DashboardPage.tsx#L226) |

### Пользовательские сценарии (после рефакторинга)

**Разработчик (USER) после логина:**
- Видит приветствие + 5 KPI, каждое кликабельно: «Мне назначено (12)», «Просрочено (2)», «На сегодня (3)», «Залогировано на неделе (14.5h)», **«Нарушения КТ (1)»** (красный pill при count>0, ведёт в `/my-checkpoint-violations`)
- Ниже — виджет «Мой фокус» — список задач, отсортированных по приоритету × просрочке, со ссылкой, статусом, дедлайном, sprint-tag'ом
- Виджет **«Мои нарушения контрольных точек»** — задачи-нарушители с указанием КТ, дедлайна, причины (reuse `CheckpointTrafficLight` + ссылка на задачу/релиз)
- Рядом — «Прогресс активного спринта» (scope bar + дни до конца)
- **«Диаграмма сгорания ближайшего релиза»** (если пользователь — assignee хотя бы одной задачи в активном релизе) — обёртка над готовым [ReleaseBurndownChart.tsx](frontend/src/components/releases/ReleaseBurndownChart.tsx), metric=issues по умолчанию
- Ниже — «Ожидают моего ревью» + «Недавние события» (с новым entityType `CheckpointViolation` — ссылка на задачу)
- FAB «+» открывает модалку быстрого создания задачи

**PM / лид (MANAGER):**
- Вместо «Мой фокус» доминирует виджет «Команда» — разбивка «В работе / Ревью / Открыто» по его проектам
- **«Релизы под угрозой»** — список активных релизов с `risk.level ∈ {MEDIUM, HIGH, CRITICAL}`, сортировка по risk DESC × daysLeft ASC; каждая строка — `ReleaseRiskBadge` + название + дата + счётчик нарушенных КТ; клик → `/releases/:id`
- **«Диаграмма сгорания»** — выпадающий селектор активного релиза + встроенный `ReleaseBurndownChart` с переключателем metric (issues/hours/violations)
- «Скоро дедлайн» — задачи его проектов с due_date ≤ +3 дня
- «Блокеры» — задачи со статусом BLOCKED или с `blockedBy` links
- «Прогресс спринтов» — мини-карточки всех активных спринтов

**Админ (ADMIN):**
- Дополнительно видит ряд системных KPI («Пользователей», «Проектов», «Time logs»), каждая ведёт в `/admin/*`
- **«Релизы под угрозой»** — в полном объёме по всей системе, не только по своим проектам
- Виджет «Последние действия в системе» — полный activity feed с enrichment (включая `CheckpointViolation` события)

---

## 2. Текущее состояние

### Frontend
- [DashboardPage.tsx](frontend/src/pages/DashboardPage.tsx) (399 строк) — единый монолитный компонент со встроенными токенами, helpers (`avatarGradient`, `timeAgo`, `formatAction`, `greeting`), иконками, StatCard.
- Используются 2 стора ([projects.store](frontend/src/store/projects.store), [auth.store](frontend/src/store/auth.store)) + theme.store.
- Вызовы API: `fetchProjects()`, `adminApi.getStats()`, `issuesApi.listIssues(projectId, { assigneeId })` × по одному на проект.
- Нет компонента «виджет», нет layout-grid, нет персонализации.

### Backend
- [admin.service.ts](backend/src/modules/admin/admin.service.ts) — `GET /admin/stats` возвращает глобальные счётчики + recentActivity. Эндпоинт рассчитан на ADMIN/MANAGER, не предоставляет personal-scoped данных.
- [issues.router.ts](backend/src/modules/issues/issues.router.ts) — `listIssues` требует `projectId` в path. Нет эндпоинта «все мои задачи по всем проектам одним запросом».
- [time.service.ts](backend/src/modules/time/time.service.ts) — агрегаты времени считаются per-project, нет «моё время за период глобально».
- [sprints.service.ts](backend/src/modules/sprints/sprints.service.ts) — есть `mapSprintWithStats`, но нет «активные спринты, где я участник/assignee».
- Activity log (`ActivityEntry`) — хранит `entityType` + `entityId`, но не хранит title/snapshot → для ссылки нужен дополнительный join или enrichment.

### Backend: релизы и контрольные точки (готово по TTMP-160)
- [checkpoints/release-checkpoints.service.ts](backend/src/modules/releases/checkpoints/release-checkpoints.service.ts) — **готово**:
  - `GET /api/releases/:releaseId/checkpoints` — полный список КТ с `risk: { level, score }`, `violations`, `passedCount`, `applicableCount`
  - `GET /api/my-checkpoint-violations` — список задач-нарушителей для текущего пользователя (scope по project membership)
  - `GET /api/my-checkpoint-violations/count` — лёгкий poll-эндпоинт для бейджа (`{ count: number }`)
  - `GET /api/projects/:projectId/checkpoint-violating-issues` — per-project для MANAGER
- [checkpoints/burndown.service.ts](backend/src/modules/releases/checkpoints/burndown.service.ts) — **готово**:
  - `GET /api/releases/:releaseId/burndown?metric=issues|hours|violations&from=&to=` — `{ series[], idealLine[], initial, plannedDate }`
  - Redis-кэш `burndown:{releaseId}:{metric}:{from}:{to}` TTL 300s
  - Ежедневный snapshot через `captureSnapshot` (cron по TTMP-160)
- [checkpoints/release-checkpoints.service.ts](backend/src/modules/releases/checkpoints/release-checkpoints.service.ts) — есть `buildCheckpointsMatrix` (матрица «Задачи × КТ», для будущего «drill-down» из дашборда)
- **Чего ещё нет в API:** нет «все активные релизы с риском по доступным мне проектам» одним запросом. Нужен новый `GET /api/releases/at-risk?scope=mine|all` (или включить в `/dashboard/me` секцию `releasesAtRisk`).

### Frontend: релизы и контрольные точки (готово по TTMP-160)
- [components/releases/ReleaseRiskBadge.tsx](frontend/src/components/releases/ReleaseRiskBadge.tsx) — бейдж `LOW/MEDIUM/HIGH/CRITICAL` + numeric score → **переиспользуем** в виджете «Релизы под угрозой»
- [components/releases/CheckpointTrafficLight.tsx](frontend/src/components/releases/CheckpointTrafficLight.tsx) — светофор `PENDING/OK/VIOLATED` → **переиспользуем** в виджете «Мои нарушения КТ»
- [components/releases/ReleaseBurndownChart.tsx](frontend/src/components/releases/ReleaseBurndownChart.tsx) — готовый чарт с переключателем metric, recharts → **оборачиваем** в `ReleaseBurndownWidget`, без дублирования логики
- [components/releases/CheckpointsBlock.tsx](frontend/src/components/releases/CheckpointsBlock.tsx) — блок КТ для страницы релиза (не требуется на дашборде, но используется для навигации)
- [api/release-checkpoints.ts](frontend/src/api/release-checkpoints.ts) — `getMyCheckpointViolations()`, `getMyCheckpointViolationsCount()`, `getReleaseCheckpoints()` → **используем напрямую** в dashboard widgets
- [api/release-burndown.ts](frontend/src/api/release-burndown.ts) — `getBurndown()` → **используем в** `ReleaseBurndownWidget`
- `recharts` уже в `frontend/package.json` (добавлен в TTMP-160 PR-11) — дополнительный bundle не нужен

### Design system
- [frontend/src/design-tokens.ts](frontend/src/design-tokens.ts) — SSOT токенов (`tokens.dark.*`, `tokens.light.*`, `tokens.radius.*`, `tokens.space.*`).
- [frontend/src/index.css](frontend/src/index.css) и `tokens.css` — CSS-переменные `var(--*)`.
- Правило из [DESIGN_SYSTEM.md](frontend/DESIGN_SYSTEM.md): **никаких hex-кодов и px-значений** вне `design-tokens.ts`.
- Правило из [CLAUDE.md](CLAUDE.md): modal/drawer `onCancel`/`onClose` должны триггерить refresh родителя — применимо к виджету быстрого создания задачи.

---

## 3. Зависимости

### Backend модули
- [ ] `dashboard` (новый модуль) — агрегатор `GET /api/dashboard/me` (single-call, возвращает всё для текущего пользователя) и `GET /api/dashboard/admin` (опционально, scope=system для ADMIN)
- [ ] `issues` — новый эндпоинт `GET /api/issues/assigned-to-me` (глобально по всем проектам, с фильтрами status/priority/dueDate/sprintId), индекс на `(assigneeId, status)` если отсутствует
- [ ] `activity` — enrichment: добавить `entityTitle` и `entityUrl` в `ActivityEntry` ответ, включая **entityType = `CheckpointViolation` / `ReleaseCheckpoint`** (lookup по `entityType` + `entityId`)
- [ ] `time` — эндпоинт `GET /api/time/my-summary?from=&to=` (суммы по пользователю за период)
- [ ] `sprints` — эндпоинт `GET /api/sprints/my-active` (активные спринты, где пользователь — assignee задач или участник команды)
- [ ] `releases/checkpoints` — **используем готовое API**: `getMyCheckpointViolations`, `getMyCheckpointViolationsCount`, `getReleaseCheckpoints`, `getBurndown`. **Дополнительно:** новый эндпоинт `GET /api/releases/at-risk?scope=mine|all&minLevel=MEDIUM&limit=10` — агрегирует активные релизы с риском (фильтр по project membership для `scope=mine`) для виджета «Релизы под угрозой». Альтернатива — включить в `/dashboard/me` секцию `releasesAtRisk` (предпочтительно, чтобы не плодить эндпоинты)
- [ ] `releases` — при агрегации определить «primary release» для текущего пользователя (ближайший по `plannedDate` релиз, где пользователь — assignee задач) — для `primaryReleaseBurndown` секции

### Frontend компоненты
- [ ] [DashboardPage.tsx](frontend/src/pages/DashboardPage.tsx) — полный переписан как тонкая оболочка
- [ ] `components/dashboard/` (новая директория):
  - [ ] `DashboardShell.tsx` — grid-layout + role gate
  - [ ] `widgets/FocusWidget.tsx` — «Мой фокус» (приоритизированный список задач)
  - [ ] `widgets/KpiRow.tsx` — строка кликабельных KPI (включая pill «Нарушения КТ» при count>0)
  - [ ] `widgets/SprintProgressWidget.tsx` — прогресс активного спринта
  - [ ] `widgets/AwaitingReviewWidget.tsx` — «Ожидают моего ревью»
  - [ ] `widgets/TimeWeekWidget.tsx` — «Время за неделю»
  - [ ] `widgets/ActivityFeedWidget.tsx` — enriched feed c ссылками (включая события `CheckpointViolation`)
  - [ ] `widgets/TeamStatusWidget.tsx` — для MANAGER
  - [ ] `widgets/SystemKpiWidget.tsx` — для ADMIN
  - [ ] `widgets/MyViolationsWidget.tsx` — **новый**: задачи, где пользователь — assignee, нарушающие активные КТ. Переиспользует `CheckpointTrafficLight` + `getMyCheckpointViolations()`
  - [ ] `widgets/ReleasesAtRiskWidget.tsx` — **новый** (MANAGER/ADMIN): активные релизы с `risk.level ≥ MEDIUM`. Переиспользует `ReleaseRiskBadge` + данные из `/dashboard/me` секции `releasesAtRisk`
  - [ ] `widgets/ReleaseBurndownWidget.tsx` — **новый**: тонкая обёртка над `ReleaseBurndownChart`. Принимает `releaseId` из `primaryReleaseBurndown` (USER) или из селектора активных релизов (MANAGER). Empty state «Нет активного релиза» с CTA «Перейти к релизам»
  - [ ] `widgets/QuickCreateFab.tsx` — FAB «+» с модалкой создания задачи
  - [ ] `widgets/WidgetCard.tsx` — общий wrapper (header + content + empty state + loading)
- [ ] `store/dashboard.store.ts` — один запрос `/dashboard/me`, кэш в памяти (stale-while-revalidate 60s)
- [ ] `store/user-preferences.store.ts` — расширить: `dashboardLayout: { hiddenWidgets: string[]; widgetOrder: string[] }`
- [ ] [frontend/src/types/index.ts](frontend/src/types/index.ts) — типы `DashboardMeResponse`, `WidgetId`, `DashboardLayout`

### Prisma / БД
- [ ] Поле `dashboardLayout Json?` на модели `User` (или `UserPreferences` если есть) — миграция «add column» без default, read-only при отсутствии
- [ ] Проверить/добавить индекс `Issue(assigneeId, status)` для быстрого `assigned-to-me`

### Внешние пакеты
- Используем существующие Ant Design компоненты (`Progress`, `Tag`, `Avatar`, `Empty`, `Skeleton`, `FloatButton`).
- `recharts` — **уже установлен** (добавлен в TTMP-160 PR-11 для `ReleaseBurndownChart`). Дополнительных пакетов не требуется.
- Для сеток рассматриваем `react-grid-layout` **только если** в будущем требуется drag-n-drop кастомизация. **MVP — без DnD**, порядок виджетов жёстко задан.

### Блокеры
- Нет жёстких блокеров. Миграция Prisma и новые эндпоинты выполняются независимо.

---

## 4. Риски

| # | Риск | Вероятность | Влияние | Митигация |
|---|------|-------------|---------|-----------|
| 1 | Agregation `/dashboard/me` становится «божественным эндпоинтом» и медленным — 6+ параллельных запросов внутри | HIGH | p95 > 500ms, деградация TTFB дашборда | Parallel `Promise.all`, cache Redis TTL 30s (invalidate on issue/time update events). Запросы разбиты: issues-by-me, sprint-active, time-week, activity-recent. Разрешить частичный ответ: если одна из секций упала — вернуть остальное с полем `partial: true` + `errors[]` |
| 2 | Ролевой gate в UI + в API рассинхронизируется (UI показывает, бэк возвращает 403) | MEDIUM | Пустые блоки, визуальный мусор | Единый источник — `canViewDashboardWidget(widgetId, user)` в [lib/roles.ts](frontend/src/lib/roles.ts); бэк возвращает секции только для доступных ролей, UI рендерит только те ключи, что есть в ответе |
| 3 | Activity feed enrichment требует N lookups по `entityId` → тормоза | MEDIUM | Медленный feed (>1s) | Lookup батчуется по `entityType` (одна выборка `issues.findMany({ id: { in: ids } })`); при отсутствии сущности — graceful fallback `entityTitle = '#' + entityId` |
| 4 | `dashboardLayout` JSON схема эволюционирует — старые данные пользователей ломаются | LOW | Крэш UI или сброс настроек | Версионирование (`{ version: 1, hiddenWidgets: [], widgetOrder: [] }`); при несовпадении версии — use defaults, лог предупреждение |
| 5 | Рефакторинг ломает существующие e2e-тесты | MEDIUM | Красный CI | [frontend/e2e/specs/02-navigation.spec.ts](frontend/e2e/specs/02-navigation.spec.ts) и auth spec проверяют `/dashboard` — обновить селекторы в том же PR |
| 6 | Старый дашборд содержит hardcoded токены — любой copy-paste продолжит нарушать SSOT | HIGH | Drift design system | Явное правило в новом коде + ESLint rule (если настроен) + pre-push-reviewer chekcs. Все новые компоненты используют `tokens.*` |
| 7 | `sprintActive` может отсутствовать у пользователя без назначений — виджет схлопывается | LOW | Дашборд выглядит пустым | Fallback: «Нет активного спринта» с CTA «Перейти к спринтам» |
| 8 | Новый FAB конфликтует с существующими FAB (если есть) | LOW | Двойные кнопки | Аудит `FloatButton` по проекту перед внедрением |
| 9 | `ReleaseBurndownChart` тяжёлый (recharts ~90kB gzipped) — тянуть на каждом входе в дашборд медленно | MEDIUM | FCP +200-400ms | `React.lazy()` + `Suspense` для `ReleaseBurndownWidget`. Рендерить skeleton сразу, чарт — после idle |
| 10 | Агрегация `releasesAtRisk` для MANAGER по всем его проектам может быть тяжёлой (N релизов × вычисление риска) | MEDIUM | +200ms на `/dashboard/me` | Читать готовый `risk` из `ReleaseCheckpoint` cache TTMP-160 (Redis `releaseRisk:{id}`), не пересчитывать. Лимит `limit=10` + сортировка на БД |
| 11 | «Мои нарушения КТ» полагается на актуальность `ReleaseCheckpoint.state` — если scheduler пропустил тик, данные устаревают | LOW | Бейдж показывает stale count | Использовать готовый `countMyViolations` с его TTL; opt: вызвать `recomputeForRelease` только при клике на задачу из widget, не при каждом mount |

---

## 5. Особенности реализации

### 5.1 Архитектура дашборда

```
<DashboardShell role={user.role}>
  <Header greeting, user, quickActions />
  <KpiRow widgets={role} />                     ← кликабельные карточки
  <MainGrid>
    <Column primary>
      <FocusWidget />                            ← USER
      <TeamStatusWidget />                       ← MANAGER
      <AwaitingReviewWidget />
    </Column>
    <Column secondary>
      <SprintProgressWidget />
      <TimeWeekWidget />
      <ActivityFeedWidget />
      <SystemKpiWidget />                        ← ADMIN only
    </Column>
  </MainGrid>
  <QuickCreateFab />
</DashboardShell>
```

- **Grid:** CSS Grid `grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr)`, на ширине ≤ 900px — одна колонка.
- **WidgetCard wrapper:** header (title + actions slot + «свернуть/скрыть») + content + loading skeleton + empty state + error state с retry-кнопкой.
- **Ролевой gate** в `DashboardShell`: какие widget ID рендерить — читается из `lib/roles.ts`.

### 5.2 Backend: `/dashboard/me`

Новый модуль `backend/src/modules/dashboard/`:

```ts
// dashboard.dto.ts
export type DashboardMeResponse = {
  user: { id; name; role; avatar };
  kpi: {
    assignedToMe: number;         // кол-во OPEN+IN_PROGRESS+REVIEW, assigneeId=me
    overdue: number;              // dueDate < today, не DONE/CANCELLED
    dueToday: number;             // dueDate = today
    loggedThisWeek: number;       // сумма hours за ISO week
    checkpointViolations: number; // TTMP-160: countMyViolations() — красный pill при > 0
  };
  focus: Issue[];                 // top-10 «моих» задач, сортировка: priority DESC × overdue × updatedAt DESC
  awaitingReview: Issue[];        // REVIEW, где я reviewer или author ревью
  myViolations: IssueViolationSummary[];  // TTMP-160: top-5 из listMyViolations()
  activeSprint: {
    sprint: Sprint;
    totalIssues, doneIssues, inProgressIssues;
    daysLeft: number;
  } | null;
  primaryReleaseBurndown: {       // Только если пользователь — assignee в активном релизе
    releaseId: string;
    releaseName: string;
    plannedDate: string;
    daysLeft: number;
    risk: { level: 'LOW'|'MEDIUM'|'HIGH'|'CRITICAL'; score: number };
    // Сам чарт догружается отдельно через getBurndown(releaseId) — в агрегат не кладём,
    // чтобы не раздувать ответ (снапшоты могут быть 60+ точек × 3 метрики)
  } | null;
  releasesAtRisk: {               // MANAGER/ADMIN only; USER получает [] или поля нет
    releaseId; releaseName; projectKey; plannedDate; daysLeft;
    risk: { level; score };
    violatedCheckpointsCount: number;
  }[];
  timeWeek: {
    totalHours: number;
    byDay: { date: string; hours: number }[];  // 7 элементов
  };
  recentActivity: (ActivityEntry & {
    entityTitle?: string;
    entityUrl?: string;
    // CheckpointViolation события enrich'атся: entityTitle = '{releaseName} / {checkpointName}',
    // entityUrl = `/releases/{releaseId}#checkpoint-{id}`
  })[];
  partial?: boolean;
  errors?: { section: string; message: string }[];
};
```

Эндпоинт — `GET /api/dashboard/me` без параметров. RBAC: любой аутентифицированный.

**Кэш:** Redis, ключ `dashboard:me:${userId}`, TTL 30s. Invalidate при:
- update/create Issue (assignee), TimeEntry, статус-переходе Issue, close sprint
- Событии `checkpoint.violation.opened` / `.closed` (подписка на `checkpointEngine.onViolationChange`, TTMP-160)
- Изменении `release.statusId` или `release.plannedDate` (влияет на `releasesAtRisk` / `primaryReleaseBurndown`)

**Частичный ответ:** обёрнутые в `Promise.allSettled`, rejected секции → `errors[]`, `partial: true`.

### 5.3 Backend: `/issues/assigned-to-me`

```
GET /api/issues/assigned-to-me?status=OPEN,IN_PROGRESS&limit=50&sort=priority
```

Фильтры: `status[]`, `priority[]`, `sprintId`, `dueBefore`, `dueAfter`, `limit` (max 100), `sort` (priority|dueDate|updatedAt).

Scope: `WHERE assigneeId = :userId AND project.deletedAt IS NULL`. Индекс: `CREATE INDEX issue_assignee_status_idx ON Issue(assigneeId, status)` если нет.

### 5.4 Backend: enrichment activity feed

В [admin.service.ts](backend/src/modules/admin/admin.service.ts) `getActivity()` — добавить batch lookup:

```ts
const byType = groupBy(entries, 'entityType');
const issueIds = byType['Issue']?.map(e => e.entityId) ?? [];
const issues = issueIds.length
  ? await prisma.issue.findMany({ where: { id: { in: issueIds } }, select: { id, title, number, project: { select: { key } } } })
  : [];
// + аналогично Sprint, Project, Release
// Enrich entries: entityTitle, entityUrl (например "/issues/{id}")
```

### 5.5 Frontend: виджеты

**WidgetCard** — единый API:
```tsx
<WidgetCard
  id="focus"
  title="Мой фокус"
  actions={<Button size="small">Все задачи →</Button>}
  loading={!data}
  empty={data?.length === 0 && <EmptyState cta="Создать задачу" onCta={openCreateModal} />}
  error={error && <ErrorState onRetry={refetch} />}
>
  {children}
</WidgetCard>
```

**FocusWidget** — сортировка:
```ts
const score = (i: Issue) =>
  (i.dueDate && new Date(i.dueDate) < new Date() ? 1000 : 0)    // overdue дают +1000
  + ({ CRITICAL: 400, HIGH: 300, MEDIUM: 200, LOW: 100 }[i.priority] ?? 0)
  + (i.sprintId === activeSprintId ? 50 : 0)
  - daysSinceUpdated(i.updatedAt);
```

**KpiRow** — 5 карточек, каждая — ссылка с `query-params`:
- «Мне назначено (12)» → `/search?assigneeId=me&status=OPEN,IN_PROGRESS,REVIEW`
- «Просрочено (2)» → `/search?assigneeId=me&dueBefore=today`
- «На сегодня (3)» → `/search?assigneeId=me&dueDate=today`
- «Время на неделе (14.5h)» → `/time?from=weekStart&to=weekEnd&userId=me`
- **«Нарушения КТ (1)»** — красный pill при `count > 0`, иначе скрыть/серый; клик → `/my-checkpoint-violations` (новая страница или filter view). Данные — `kpi.checkpointViolations`; дополнительно раз в 60s опрашивается `getMyCheckpointViolationsCount()` для live-обновления (уже готовый эндпоинт TTMP-160)

**MyViolationsWidget** — переиспользует готовые `getMyCheckpointViolations()` + `CheckpointTrafficLight`:
```tsx
{violations.map(v => (
  <Row onClick={() => navigate(`/issues/${v.issueId}`)}>
    <CheckpointTrafficLight state="VIOLATED" isWarning />
    <IssueKey>{v.issueKey}</IssueKey>
    <Title>{v.issueTitle}</Title>
    <Meta>{v.checkpointName} • до {formatDate(v.deadline)}</Meta>
    <ReleaseBadge>{v.releaseName}</ReleaseBadge>
  </Row>
))}
```
Empty state: «Нет нарушений контрольных точек 🎉». При наличии кастом-полей из причины — tooltip с `violationReason`.

**ReleasesAtRiskWidget** (MANAGER/ADMIN) — ролевой gate + reuse `ReleaseRiskBadge`:
```tsx
{releasesAtRisk.map(r => (
  <Row onClick={() => navigate(`/releases/${r.releaseId}`)}>
    <ReleaseRiskBadge level={r.risk.level} score={r.risk.score} />
    <Name>{r.projectKey} · {r.releaseName}</Name>
    <Deadline>{r.plannedDate} ({r.daysLeft > 0 ? `${r.daysLeft}д` : 'просрочен'})</Deadline>
    <ViolationsCount>{r.violatedCheckpointsCount} КТ нарушено</ViolationsCount>
  </Row>
))}
```
Пустое состояние: «Нет релизов под угрозой — всё по плану ✅».

**ReleaseBurndownWidget** — lazy wrapper:
```tsx
const ReleaseBurndownChart = lazy(() => import('../../releases/ReleaseBurndownChart'));

// USER: primaryReleaseBurndown из агрегата
// MANAGER: Select с активными релизами из releasesAtRisk (+ все активные), dropdown меняет releaseId
return (
  <WidgetCard title="Диаграмма сгорания" actions={<ReleaseSelector />}>
    {!releaseId ? <EmptyState cta="Перейти к релизам" /> : (
      <Suspense fallback={<Skeleton.Node active style={{ height: 280 }} />}>
        <ReleaseBurndownChart releaseId={releaseId} canBackfill={isAdmin} />
      </Suspense>
    )}
  </WidgetCard>
);
```

**QuickCreateFab** — `<FloatButton type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)} />`. Модалка закрытия должна триггерить refresh дашборда (правило из CLAUDE.md).

### 5.6 Design system compliance

- Запрещено hex-коды в новых файлах.
- Все отступы/радиусы — `tokens.space.*`, `tokens.radius.*`.
- Инлайновые `style` — через `tokens.dark[..]` / `tokens.light[..]` в зависимости от `theme.mode`, либо CSS-классы + `var(--*)`.
- Иконки — предпочтительно `@ant-design/icons` вместо inline SVG.

### 5.7 Кастомизация (MVP-lite)

- Без drag-n-drop.
- Каждый виджет имеет «⋮» меню → «Скрыть виджет».
- Скрытые виджеты хранятся в `User.dashboardLayout.hiddenWidgets: string[]`.
- Кнопка «Восстановить скрытые виджеты» в правом верхнем углу дашборда, если есть hidden > 0.
- Persistence: `PATCH /api/users/me/preferences` с `{ dashboardLayout }`.

### 5.8 Ролевой gate

В [lib/roles.ts](frontend/src/lib/roles.ts) добавить:
```ts
export const DASHBOARD_WIDGETS_BY_ROLE = {
  USER:    ['kpi', 'focus', 'myViolations', 'awaitingReview', 'sprintProgress', 'releaseBurndown', 'timeWeek', 'activity'],
  MANAGER: ['kpi', 'teamStatus', 'releasesAtRisk', 'releaseBurndown', 'sprintProgress', 'myViolations', 'awaitingReview', 'activity', 'timeWeek'],
  ADMIN:   ['kpi', 'systemKpi', 'releasesAtRisk', 'teamStatus', 'releaseBurndown', 'activity', 'sprintProgress'],
  VIEWER:  ['kpi', 'releasesAtRisk', 'activity', 'sprintProgress'],
} as const;
```

### 5.9 Feature flag

Реализовать под `FEATURES_DASHBOARD_V2` (по аналогии с существующим `FEATURES_DIRECT_ROLES_DISABLED`). Сначала — opt-in через `?dashboard=v2` query-param для QA, затем полный cutover через env.

---

## 6. Требования к реализации

### Функциональные
- [ ] FR-1: Дашборд загружается одним запросом `/dashboard/me` (не более 1 API-вызова для основного контента; `ReleaseBurndownChart` догружается отдельно по клику/mount)
- [ ] FR-2: KPI-карточки кликабельны и ведут в отфильтрованный список
- [ ] FR-3: «Мой фокус» сортирует по приоритету × просрочке × давности, top-10
- [ ] FR-4: «Ожидают моего ревью» показывает задачи REVIEW, где пользователь — reviewer/author
- [ ] FR-5: «Прогресс спринта» показывает активный спринт пользователя (scope + done + days left)
- [ ] FR-6: «Время на неделе» — сумма + разбивка по дням (spark-bar)
- [ ] FR-7: Activity feed содержит кликабельные ссылки на сущность + её название (включая `CheckpointViolation` / `ReleaseCheckpoint`)
- [ ] FR-8: MANAGER видит дополнительный «Team Status», ADMIN — «System KPI»
- [ ] FR-9: FAB «+» открывает модалку создания задачи, после закрытия — refresh дашборда
- [ ] FR-10: Пустые состояния имеют CTA (создать задачу / перейти к спринтам / залогировать время)
- [ ] FR-11: Виджеты можно скрывать, предпочтения сохраняются per-user
- [ ] FR-12: Dashboard полностью использует `tokens.*` — 0 hex-кодов
- [ ] FR-13: При частичном ответе (`partial: true`) показывается non-blocking banner «Часть данных недоступна, попробовать снова»
- [ ] FR-14: KPI «Нарушения КТ» показывается всем ролям, красный pill при `count > 0`, обновляется раз в 60s через `getMyCheckpointViolationsCount()`
- [ ] FR-15: Виджет «Мои нарушения КТ» показывает top-5 с `CheckpointTrafficLight`, дедлайном, именем КТ и релиза; клик переводит к задаче
- [ ] FR-16: Виджет «Релизы под угрозой» (MANAGER/ADMIN) сортирует по `risk.level` DESC, затем `daysLeft` ASC; показывает `ReleaseRiskBadge` + число нарушенных КТ; клик → `/releases/:id`
- [ ] FR-17: Виджет «Диаграмма сгорания» (USER/MANAGER) оборачивает готовый `ReleaseBurndownChart`; для USER — `primaryReleaseBurndown` автоматически; для MANAGER — селектор активных релизов его проектов
- [ ] FR-18: `ReleaseBurndownChart` загружается через `React.lazy`, не блокируя FCP
- [ ] FR-19: При отсутствии активных релизов виджет burndown показывает empty state с CTA «Перейти к релизам»
- [ ] FR-20: Событие `checkpoint.violation.opened/closed` инвалидирует кэш `dashboard:me:${userId}` для всех assignee затронутой задачи

### Нефункциональные
- [ ] NFR-1: TTFB `/dashboard/me` < 300ms (p95) при ≤500 задачах у пользователя
- [ ] NFR-2: First Contentful Paint дашборда ≤ 1.2s на 3G Fast
- [ ] NFR-3: Кол-во fetch-запросов при входе ≤ 2 (dashboard + profile)
- [ ] NFR-4: Layout адаптивен: ≥900px — 2 колонки, <900px — 1 колонка
- [ ] NFR-5: Совместимость: Chrome 139+, Yandex Browser 25+, Edge 139+, Safari 18+
- [ ] NFR-6: Cache-hit ratio `/dashboard/me` ≥ 60% за час (Redis TTL 30s)

### Безопасность
- [ ] SEC-1: `/dashboard/me` отдаёт только данные по проектам, к которым у пользователя есть доступ (через RBAC)
- [ ] SEC-2: Activity feed фильтруется по доступным проектам (не показывать чужие)
- [ ] SEC-3: ADMIN-секции (`systemKpi`) возвращаются только если `user.isSuperAdmin || user.role === 'ADMIN'`
- [ ] SEC-4: `dashboardLayout` валидируется Zod при сохранении (не принимать произвольный JSON)
- [ ] SEC-5: `releasesAtRisk` scope `mine` фильтруется по project membership (TTMP-160 §SEC-2 reuse); `scope=all` только для SUPER_ADMIN / RELEASE_MANAGER / AUDITOR (по `hasAnySystemRole`)
- [ ] SEC-6: `myViolations` использует готовый `service.listMyViolations(userId, systemRoles)` — scope уже обеспечен TTMP-160 (SEC-7)
- [ ] SEC-7: `primaryReleaseBurndown` возвращается только если пользователь имеет доступ к проекту релиза (reuse `assertReleaseRead` TTMP-160)

### Тестирование
- [ ] Unit: `focus-score` функция (edge cases: все одинаковые приоритеты, нет dueDate, нет activeSprint)
- [ ] Unit: enrichActivity batch lookup (missing entity fallback, `CheckpointViolation` entity)
- [ ] Unit: `selectPrimaryRelease(userId)` — edge cases (нет релизов, несколько равнозначных, просроченный)
- [ ] Integration: `/dashboard/me` для USER/MANAGER/ADMIN — ассерты на наличие/отсутствие секций (включая `releasesAtRisk`, `myViolations`, `primaryReleaseBurndown`)
- [ ] Integration: `/dashboard/me` partial degradation (один из запросов упал)
- [ ] Integration: кэш `dashboard:me:${userId}` инвалидируется при `checkpoint.violation.opened`
- [ ] E2E: [frontend/e2e/specs/02-navigation.spec.ts](frontend/e2e/specs/02-navigation.spec.ts) обновить селекторы; новый spec `dashboard-widgets.spec.ts`:
  - клик по KPI «Нарушения КТ» ведёт на страницу нарушений
  - виджет «Релизы под угрозой» показан только MANAGER/ADMIN
  - виджет «Диаграмма сгорания» рендерит chart (recharts) при наличии primary release
  - скрытие виджета persist после reload
- [ ] Покрытие >= 60%

### Доступность (a11y)
- [ ] A11Y-1: Все кликабельные KPI — `<a>` или `<button>` (не `role="button"` на div)
- [ ] A11Y-2: WidgetCard заголовки — `<h2>`, контент секций — landmark `<section aria-labelledby>`
- [ ] A11Y-3: FAB доступен с клавиатуры (Tab / Enter)
- [ ] A11Y-4: Контраст text/bg ≥ WCAG AA (уже обеспечен токенами, но верифицировать)

---

## 7. Критерии приёмки (Definition of Done)

- [ ] Новый дашборд доступен под flag `FEATURES_DASHBOARD_V2=true` в staging
- [ ] Дашборд рендерится корректно для всех ролей: USER / MANAGER / ADMIN / VIEWER
- [ ] Один API-запрос `/dashboard/me` загружает все основные секции (burndown chart догружается lazy отдельно)
- [ ] KPI кликабельны и ведут в правильные фильтрованные списки (включая KPI «Нарушения КТ»)
- [ ] FAB «+» открывает модалку создания задачи; после закрытия — refresh данных
- [ ] Activity feed показывает название сущности + ссылку (не сырой `entityType`), включая `CheckpointViolation`
- [ ] Виджет «Мои нарушения КТ» показывает top-5 с `CheckpointTrafficLight` и переходит к задаче
- [ ] Виджет «Релизы под угрозой» с `ReleaseRiskBadge` виден только MANAGER/ADMIN
- [ ] Виджет «Диаграмма сгорания» рендерится: USER — по primary release, MANAGER — с селектором релиза; recharts загружен lazy
- [ ] 0 hex-кодов в новых файлах (проверяется `grep -E "#[0-9A-Fa-f]{6}" frontend/src/components/dashboard/`)
- [ ] Виджеты можно скрыть, предпочтения сохраняются между сессиями
- [ ] Мобильный layout (≤900px) рендерится одной колонкой без горизонтального скролла
- [ ] Все тесты зелёные (`make test`, `make e2e`)
- [ ] Lint проходит (`make lint`)
- [ ] Lighthouse Performance ≥ 85, Accessibility ≥ 95 на странице дашборда
- [ ] Code review пройден

---

## 8. Оценка трудоёмкости

| Этап | Часы |
|------|------|
| Анализ, прототип (Figma / Excalidraw скетчи) | 3 |
| Backend: модуль `dashboard` + `/dashboard/me` | 6 |
| Backend: `/issues/assigned-to-me` + индекс | 2 |
| Backend: activity enrichment (+ CheckpointViolation) | 2.5 |
| Backend: `/time/my-summary`, `/sprints/my-active` | 3 |
| Backend: секции `releasesAtRisk` + `primaryReleaseBurndown` + `selectPrimaryRelease` | 3 |
| Backend: Redis-кэш + invalidation hooks (включая checkpoint.violation events) | 3 |
| Backend: миграция Prisma `User.dashboardLayout` | 1 |
| Frontend: `DashboardShell` + grid + responsive | 3 |
| Frontend: `WidgetCard` wrapper (loading/empty/error/skeleton) | 2 |
| Frontend: `KpiRow` + кликабельные ссылки (+ KPI «Нарушения КТ» с poll 60s) | 2.5 |
| Frontend: `FocusWidget` + score-функция | 3 |
| Frontend: `AwaitingReviewWidget` | 1 |
| Frontend: `SprintProgressWidget` | 2 |
| Frontend: `TimeWeekWidget` + spark-bar | 2 |
| Frontend: `ActivityFeedWidget` (enriched) | 2 |
| Frontend: `TeamStatusWidget` (MANAGER) | 2 |
| Frontend: `SystemKpiWidget` (ADMIN) | 1 |
| Frontend: `MyViolationsWidget` (reuse `CheckpointTrafficLight`) | 2 |
| Frontend: `ReleasesAtRiskWidget` (reuse `ReleaseRiskBadge`) | 2 |
| Frontend: `ReleaseBurndownWidget` (lazy wrapper + селектор релиза для MANAGER) | 2.5 |
| Frontend: `QuickCreateFab` + модалка + refresh | 2 |
| Frontend: `dashboard.store` + stale-while-revalidate | 2 |
| Frontend: кастомизация (hide/restore) + persistence | 3 |
| Frontend: role gate (`lib/roles`) — расширенный с новыми widget ids | 1 |
| Тесты: unit + integration + e2e (включая checkpoints/burndown сценарии) | 8 |
| Migration токенов: удаление `DARK_C`/`LIGHT_C` из нового кода | 1 |
| Code review + фиксы | 3 |
| **Итого** | **69.5** |

---

## 9. Связанные задачи

- **Родитель:** нет (STORY верхнего уровня)
- **Дочерние:**
  - TTUI-91 — Backend: модуль `dashboard` + эндпоинт `/dashboard/me`
  - TTUI-92 — Backend: `/issues/assigned-to-me` + индекс
  - TTUI-93 — Backend: activity feed enrichment (title + URL, включая `CheckpointViolation`)
  - TTUI-94 — Backend: миграция Prisma `User.dashboardLayout` + `PATCH /users/me/preferences`
  - TTUI-95 — Frontend: `DashboardShell` + `WidgetCard` + grid/responsive
  - TTUI-96 — Frontend: `KpiRow` виджет (включая KPI «Нарушения КТ» + poll 60s)
  - TTUI-97 — Frontend: `FocusWidget` + score-функция
  - TTUI-98 — Frontend: `SprintProgressWidget` + `TimeWeekWidget`
  - TTUI-99 — Frontend: `AwaitingReviewWidget` + `ActivityFeedWidget`
  - TTUI-100 — Frontend: `TeamStatusWidget` + `SystemKpiWidget` (role-specific)
  - TTUI-101 — Frontend: `QuickCreateFab` + модалка + refresh pattern
  - TTUI-102 — Frontend: кастомизация (hide/restore) + `dashboard.store`
  - TTUI-103 — Feature flag + cutover `FEATURES_DASHBOARD_V2`
  - TTUI-104 — E2E + unit тесты + Lighthouse budget
  - **TTUI-105** — Backend: секции `releasesAtRisk` + `primaryReleaseBurndown` в `/dashboard/me` + selectPrimaryRelease; invalidation на `checkpoint.violation.opened/closed`
  - **TTUI-106** — Frontend: `MyViolationsWidget` (reuse `CheckpointTrafficLight` + `getMyCheckpointViolations`)
  - **TTUI-107** — Frontend: `ReleasesAtRiskWidget` (reuse `ReleaseRiskBadge`)
  - **TTUI-108** — Frontend: `ReleaseBurndownWidget` (lazy-wrapper над `ReleaseBurndownChart` + селектор релиза для MANAGER)

---

## 10. Иерархия задач

```
TTUI-90 (STORY) — Рефакторинг дашборда: role-aware фокусная рабочая область
├── TTUI-91  (TASK) — Backend: dashboard module + /dashboard/me
├── TTUI-92  (TASK) — Backend: /issues/assigned-to-me + index
├── TTUI-93  (TASK) — Backend: activity enrichment (+ CheckpointViolation)
├── TTUI-94  (TASK) — Backend: User.dashboardLayout + PATCH preferences
├── TTUI-105 (TASK) — Backend: releasesAtRisk + primaryReleaseBurndown + checkpoint invalidation
├── TTUI-95  (TASK) — Frontend: DashboardShell + WidgetCard + grid
├── TTUI-96  (TASK) — Frontend: KpiRow (+ KPI «Нарушения КТ»)
├── TTUI-97  (TASK) — Frontend: FocusWidget + score
├── TTUI-98  (TASK) — Frontend: SprintProgress + TimeWeek widgets
├── TTUI-99  (TASK) — Frontend: AwaitingReview + ActivityFeed widgets
├── TTUI-100 (TASK) — Frontend: TeamStatus + SystemKpi widgets
├── TTUI-106 (TASK) — Frontend: MyViolationsWidget (reuse TTMP-160)
├── TTUI-107 (TASK) — Frontend: ReleasesAtRiskWidget (reuse ReleaseRiskBadge)
├── TTUI-108 (TASK) — Frontend: ReleaseBurndownWidget (lazy wrapper)
├── TTUI-101 (TASK) — Frontend: QuickCreateFab + modal + refresh
├── TTUI-102 (TASK) — Frontend: customization (hide/restore)
├── TTUI-103 (TASK) — Feature flag FEATURES_DASHBOARD_V2 + cutover
└── TTUI-104 (TASK) — Tests (unit + integration + e2e) + Lighthouse
```

**Рекомендуемый порядок реализации:**
1. TTUI-91 → TTUI-92 → TTUI-93 → **TTUI-105** (backend data sources first; 105 расширяет агрегат под checkpoints/burndown — не блокирует виджеты, но нужен до 106-108)
2. TTUI-94 (preferences) — можно параллельно с shell
3. TTUI-95 (shell) → TTUI-96 (KPI) → TTUI-97–100 + **TTUI-106..108** (виджеты, параллелятся)
4. TTUI-101 (FAB) → TTUI-102 (customization) → TTUI-103 (feature flag)
5. TTUI-104 (tests + perf) — финал перед cutover
