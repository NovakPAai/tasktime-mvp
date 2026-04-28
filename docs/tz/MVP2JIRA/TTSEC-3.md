# ТЗ: TTSEC-3 — Issue Security (Уровни видимости задач)

**Дата:** 2026-04-23
**Тип:** TASK | **Приоритет:** P0 | **Статус:** OPEN
**Проект:** TaskTime MVP (TTMP)
**Исполнитель:** TBD
**Автор ТЗ:** Claude Code (auto-generated)

---

## 1. Постановка задачи

Сейчас в проекте все участники с правом `ISSUES_VIEW` видят все задачи. Нет способа скрыть отдельную задачу (например, HR-инцидент, security-уязвимость, юридический спор) от части команды. Это блокер для enterprise-использования.

Задача вводит **3 фиксированных уровня видимости** + возможность расширенного списка доступа для `PRIVATE`:
- `PUBLIC` — как сейчас (все с `ISSUES_VIEW`).
- `TEAM` — отсекаются роли `VIEWER` (только `USER+`).
- `PRIVATE` — только creator + assignee + project `ADMIN`/`MANAGER` + extra users/groups.

Видимость проставляется при создании/редактировании задачи пользователем с новым permission `ISSUES_CHANGE_VISIBILITY`.

### Пользовательские сценарии

**HR-менеджер:**
1. Создаёт задачу «Выговор сотруднику X за нарушение». В момент создания выбирает visibility=`PRIVATE`.
2. Кликает «Добавить к списку доступа» → добавляет юриста из `UserGroup 'Legal'`.
3. Задача не видна остальным участникам проекта.

**Security-инженер:**
1. Репортит уязвимость. Ставит `PRIVATE`, в extras добавляет только группу `security-team`.
2. В поиске, Kanban, sprint'ах задача не появляется у посторонних.

**Админ:**
1. Добавляет роли pattern «может менять видимость»: `PROJECT_ADMIN` и `PROJECT_MANAGER` по умолчанию. Роль `USER` — может только если permission включён.

---

## 2. Текущее состояние

- На `Issue` нет поля visibility. Все видят всё, что не запрещено RBAC.
- RBAC middleware (`shared/middleware/rbac.ts`) проверяет роль на проекте, но на уровне task-level ничего нет.
- В `ProjectPermission` enum уже 33 флага, но нет `ISSUES_CHANGE_VISIBILITY`.
- Фильтрация запросов (list issues, TTQL search) работает через `projectId → projectRole`, дополнительная проверка на visibility нужна.

---

## 3. Зависимости

### Модули backend
- [ ] `modules/issues/issues.service.ts` — все read/list/search методы добавляют visibility-фильтр.
- [ ] `modules/issues/issues.router.ts` — create/update принимают `visibility` и `visibilityExtras`.
- [ ] `modules/comments/comments.service.ts` — list через `JOIN issues` с visibility-фильтром.
- [ ] `modules/time/time.service.ts` — то же для TimeLog.
- [ ] `modules/search/search.service.ts` — TTQL-компилятор добавляет WHERE-условие.
- [ ] `shared/middleware/rbac.ts` — новая функция `canSeeIssue(userId, issue)` для get-endpoint'ов.

### Frontend
- [ ] `components/issues/IssueVisibilityBadge.tsx` — иконка замка с цветом.
- [ ] `components/issues/IssueVisibilitySelector.tsx` — dropdown с 3 уровнями + extras-dialog.
- [ ] `components/issues/IssueDetailPage.tsx` — показывать visibility, открывать selector для уполномоченных.

### Модели данных (Prisma)
- [ ] `Issue.visibility: IssueVisibility` (enum).
- [ ] `Issue.visibilityExtras: Json?` — `{ userIds: string[], groupIds: string[] }`.
- [ ] `ProjectPermission` — новое значение `ISSUES_CHANGE_VISIBILITY`.

### Внешние зависимости
- Нет.

### Блокеры
- Нет. Работает независимо от TTCORE-1 и TTSSO-1.

---

## 4. Риски

| # | Риск | Вероятность | Влияние | Митигация |
|---|------|-------------|---------|-----------|
| 1 | Visibility-фильтр пропущен в одном из query-путей (`JOIN`-запросы, raw SQL) → утечка PRIVATE-задач | Высокая | Security-инцидент | Единая библиотека `visibilityWhereClause(userId, projectId)`, обязательная в list/search/get. Security-review на merge |
| 2 | Производительность на больших БД: LEFT JOIN visibility_extras замедляет list | Средняя | Slow queries | Индексы: `(project_id, visibility)`, `(visibility, creator_id)`, JSONB GIN на `visibility_extras`; p99 < 200ms |
| 3 | User убран из `visibilityExtras.userIds`, но задача закеширована на фронте | Низкая | Кратковременная утечка | Invalidate client cache при изменении visibility; опционально — broadcast через WebSocket/SSE |
| 4 | Creator удалён (user.deleted=true) — задача «сиротеет» с доступом только admin/assignee | Низкая | UX-потеря | Подхват: если `creatorId` → inactive user, доступ у assignee + admin/manager остаётся; логика учитывает |
| 5 | Comments-leak: пользователь не видит issue, но знает ID и делает GET /issues/:id/comments | Высокая | Leak | Все comment-ендпоинты делают pre-check `canSeeIssue` |
| 6 | Notifications (TTNOTIF-1) шлют mention/assigned-email пользователю, у которого нет visibility на issue | Средняя | Leak в email | Notification-consumer фильтрует recipients через `canSeeIssue` перед отправкой |

---

## 5. Особенности реализации

### 5.1 Модель

```prisma
enum IssueVisibility {
  PUBLIC
  TEAM
  PRIVATE
}

// В модели Issue:
// visibility        IssueVisibility @default(PUBLIC)
// visibilityExtras  Json?  // { userIds: string[], groupIds: string[] }

// В ProjectPermission добавить:
ISSUES_CHANGE_VISIBILITY
```

### 5.2 Семантика уровней

| Уровень | Кто видит |
|---------|-----------|
| `PUBLIC` | Любой с `ISSUES_VIEW` на проекте |
| `TEAM` | Любой с project role `USER` / `MANAGER` / `ADMIN` (отсекаются `VIEWER`-подобные) |
| `PRIVATE` | creator ∪ assignee ∪ project `ADMIN`/`MANAGER` ∪ users in `extras.userIds` ∪ members of `extras.groupIds` |

### 5.3 Where-clause generator

```typescript
// shared/middleware/visibility.ts
export async function visibilityWhereClause(
  userId: string,
  projectId: string,
): Promise<Prisma.IssueWhereInput> {
  const userGroupIds = await getUserGroupIds(userId);
  const userProjectRole = await getUserProjectRole(userId, projectId);

  // Если юзер admin/manager проекта — видит всё
  if (userProjectRole && ['ADMIN', 'MANAGER'].includes(userProjectRole)) {
    return {};
  }

  const orConditions: Prisma.IssueWhereInput[] = [];

  // PUBLIC: всегда видно (при наличии ISSUES_VIEW — проверяется выше)
  orConditions.push({ visibility: 'PUBLIC' });

  // TEAM: видно USER и выше
  if (userProjectRole && userProjectRole !== 'VIEWER') {
    orConditions.push({ visibility: 'TEAM' });
  }

  // PRIVATE: creator OR assignee OR в extras
  orConditions.push({
    visibility: 'PRIVATE',
    OR: [
      { creatorId: userId },
      { assigneeId: userId },
      // JSONB-предикат: extras.userIds содержит userId
      { visibilityExtras: { path: ['userIds'], array_contains: userId } as Prisma.JsonFilter },
      // extras.groupIds пересекается с userGroupIds
      ...(userGroupIds.length > 0
        ? userGroupIds.map((gId) => ({
            visibilityExtras: { path: ['groupIds'], array_contains: gId } as Prisma.JsonFilter,
          }))
        : []),
    ],
  });

  return { OR: orConditions };
}
```

### 5.4 Интеграция в читающие пути

Все методы `listIssues`, `searchIssues`, `getIssue` используют этот clause. Для get-по-ID:

```typescript
export async function getIssueById(userId: string, issueId: string): Promise<Issue> {
  const issue = await prisma.issue.findUnique({ where: { id: issueId } });
  if (!issue) throw new NotFound();

  const canSee = await canSeeIssue(userId, issue);
  if (!canSee) throw new NotFound();  // 404, не 403 — чтобы не утекать существование

  return issue;
}
```

### 5.5 Write-side: меняем visibility

```typescript
// PUT /api/issues/:id/visibility
// body: { visibility: 'PRIVATE', extras: { userIds: [...], groupIds: [...] } }
export async function changeVisibility(
  actorId: string,
  issueId: string,
  payload: VisibilityChangeDto,
): Promise<Issue> {
  const issue = await prisma.issue.findUnique({ where: { id: issueId } });
  if (!issue) throw new NotFound();

  // проверяем permission
  const hasPermission = await userHasProjectPermission(
    actorId, issue.projectId, 'ISSUES_CHANGE_VISIBILITY'
  );
  if (!hasPermission) throw new Forbidden();

  // audit
  await writeAuditLog(actorId, 'Issue', issueId, 'visibility_changed', {
    from: issue.visibility, to: payload.visibility, extras: payload.extras,
  });

  return prisma.issue.update({
    where: { id: issueId },
    data: {
      visibility: payload.visibility,
      visibilityExtras: payload.visibility === 'PRIVATE' ? payload.extras : null,
    },
  });
}
```

### 5.6 UI компоненты

**Badge:**
- PUBLIC → нет иконки / глаз
- TEAM → иконка группы (🤝) + tooltip «Видно команде»
- PRIVATE → замок (🔒) + tooltip «Приватно. Доступ: …»

**Selector:**
- Dropdown с 3 уровнями.
- При выборе `PRIVATE` — расширяется блок «Дополнительный доступ» с input'ами `Пользователи` и `Группы` (autocomplete).
- Показывается только пользователям с permission.

### 5.7 Миграция разрешения (permission enum)

Для `ProjectPermission` enum добавление значения — отдельная миграция:

```sql
-- Prisma migration
ALTER TYPE "ProjectPermission" ADD VALUE 'ISSUES_CHANGE_VISIBILITY';
```

По умолчанию permission выдаётся только ролям `ADMIN` и `MANAGER` (в seed для системных Role Schemes). Для `USER` — off по умолчанию.

### 5.8 Notifications integration

В `notifications-service` (TTNOTIF-1): перед включением user в recipient-список — проверка `canSeeIssue(recipientId, issue)`. Если нет — skip (с log'ом «suppressed due to visibility»).

### 5.9 TTQL-фильтрация

TTQL-compiler автоматически применяет visibility-фильтр к всем запросам (добавляется к финальному `WHERE`). Пользователь не может это обойти. Явно фильтровать по visibility — опционально, добавить field `visibility`:

```
visibility = PRIVATE
visibility in (PUBLIC, TEAM)
```

---

## 6. Требования к реализации

### Функциональные
- [ ] FR-1: На `Issue` появляются поля `visibility` и `visibilityExtras`.
- [ ] FR-2: В `ProjectPermission` добавлен `ISSUES_CHANGE_VISIBILITY`, проставлен в seed Role Schemes для ADMIN/MANAGER.
- [ ] FR-3: `POST /api/issues/:id/visibility` меняет visibility с audit-logging.
- [ ] FR-4: Все list/search endpoints (`/api/issues`, TTQL) фильтруют по visibility.
- [ ] FR-5: `GET /api/issues/:id` возвращает 404 для пользователей без доступа.
- [ ] FR-6: Comments, time-logs, custom fields — наследуют visibility parent-issue.
- [ ] FR-7: UI показывает badge visibility, selector — пользователям с permission.
- [ ] FR-8: Notifications подавляются для пользователей без visibility.
- [ ] FR-9: TTQL field `visibility` работает.

### Нефункциональные
- [ ] NFR-1: visibilityWhereClause не замедляет list-issues более чем на 20ms p99.
- [ ] NFR-2: JSONB GIN-индекс на `visibility_extras` — фильтрация по 10k task'ов < 100ms.
- [ ] NFR-3: User-group resolution (для extras) кэшируется в Redis (уже используется).

### Безопасность
- [ ] SEC-1: RBAC-тесты: 404 для не-admin/manager/creator/assignee на PRIVATE issue.
- [ ] SEC-2: API возвращает 404 (не 403) на inaccessible issue — чтобы не утекать существование.
- [ ] SEC-3: Audit-log на каждое изменение visibility.
- [ ] SEC-4: Fuzz-тест: попытки доступа через comment/time-log IDs в обход issue-фильтра.

### Тестирование
- [ ] Unit: `visibilityWhereClause` — все 12 комбинаций (4 уровня permissions × 3 visibility).
- [ ] Unit: `canSeeIssue` — те же.
- [ ] Integration: comment-endpoints с PRIVATE issue.
- [ ] Integration: TTQL-search возвращает только visible issues.
- [ ] Покрытие ≥ 80% (security-critical).

---

## 7. Критерии приёмки

- [ ] AC-1: При создании issue можно выбрать visibility.
- [ ] AC-2: PRIVATE issue с extras: `alice@corp.ru` в списке → Alice видит, другие нет.
- [ ] AC-3: `GET /api/issues/:private-id` от не-admin'а без доступа → 404.
- [ ] AC-4: TTQL-search не показывает PRIVATE без доступа.
- [ ] AC-5: Notifications не идут пользователям без visibility.
- [ ] AC-6: Audit-log содержит запись о смене visibility.
- [ ] AC-7: Permission `ISSUES_CHANGE_VISIBILITY` работает: USER не может менять без неё.
- [ ] AC-8: Тесты зелёные + security-review пройден.

---

## 8. Оценка трудоёмкости

| Этап | Часы |
|------|------|
| Prisma-миграция (enum, колонки, индексы, permission) | 3 |
| `shared/middleware/visibility.ts` — where-clause | 6 |
| Интеграция в issues.service (list/get/search) | 6 |
| Интеграция в comments / time / custom-fields | 4 |
| Router + DTO + audit для change-visibility | 3 |
| TTQL extension (field `visibility`) | 3 |
| Frontend: badge + selector + dialog | 8 |
| Integration в TTNOTIF-1 (recipient filter) | 3 |
| Tests (unit + integration + security) | 12 |
| Security-review + fixes | 4 |
| **Итого** | **52** (~1 спринт) |

---

## 9. Связанные задачи

- **Зависит от:** нет.
- **Блокирует:** (затрагивается) TTNOTIF-1 (recipient filter).
- **Связано:** TTSEC-2 (user-groups), TTSRH-1 (TTQL).

---

## 10. Иерархия задач

```
TTSEC-3 (TASK) — Issue Security
  ├─ TTSEC-3.1 — Prisma model + permission enum + indices
  ├─ TTSEC-3.2 — visibility-middleware + integration в read-paths
  ├─ TTSEC-3.3 — change-visibility API + audit
  ├─ TTSEC-3.4 — Frontend badge + selector
  ├─ TTSEC-3.5 — TTQL field
  └─ TTSEC-3.6 — Security-tests + review
```
