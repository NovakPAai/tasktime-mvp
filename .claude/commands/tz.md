# Техническое задание по ключу задачи

Пользователь запросил генерацию ТЗ. Аргумент: `$ARGUMENTS`.

---

## Режимы работы

Определи режим по аргументу:

- **`create [projectKey] [title]`** — создать новую задачу на бою, сгенерировать ТЗ, записать в задачу, предложить реализацию.
- **`[KEY]`** (например `TTMP-42`) — получить существующую задачу, сгенерировать ТЗ, записать в задачу, предложить реализацию.
- **Без аргумента / непонятный аргумент** — спроси пользователя: «Введите ключ задачи (TTMP-42) или `create TTMP [название]` для новой».

---

## Переменные окружения и авторизация

```bash
API_URL="${TASKTIME_API_URL:-http://5.129.242.171/api}"

# Получить токен
TOKEN=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@tasktime.ru","password":"password123"}' | jq -r '.accessToken')
```

Сохрани `TOKEN` для всех последующих запросов в этой команде.

---

## Шаг 0 (только для режима `create`): Создание задачи на бою

### 0.1 Сбор данных для создания задачи

Если пользователь передал `create` без полного описания — запроси:
- Название задачи (краткое)
- Тип: EPIC / STORY / TASK / BUG (по умолчанию TASK)
- Приоритет: CRITICAL / HIGH / MEDIUM / LOW (по умолчанию MEDIUM)
- Ключ проекта (например TTMP)
- Родительская задача (опционально, ключ)

Если аргументы переданы (`create TTMP "Название задачи"`) — используй их, недостающее спроси.

### 0.2 Получить ID проекта

```bash
PROJECTS=$(curl -s "$API_URL/projects" -H "Authorization: Bearer $TOKEN")
PROJECT_ID=$(echo $PROJECTS | jq -r ".data[] | select(.key == \"$PROJECT_KEY\") | .id")
```

Если проект не найден — покажи список доступных проектов и попроси уточнить.

### 0.3 Получить ID родительской задачи (если указана)

```bash
PARENT=$(curl -s "$API_URL/issues/key/$PARENT_KEY" -H "Authorization: Bearer $TOKEN")
PARENT_ID=$(echo $PARENT | jq -r '.id')
```

### 0.4 Создать задачу

```bash
NEW_ISSUE=$(curl -s -X POST "$API_URL/issues" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "'"$TITLE"'",
    "type": "'"$TYPE"'",
    "priority": "'"$PRIORITY"'",
    "projectId": "'"$PROJECT_ID"'",
    "parentId": "'"$PARENT_ID"'"
  }')

ISSUE_ID=$(echo $NEW_ISSUE | jq -r '.id')
KEY=$(echo $NEW_ISSUE | jq -r '.key')
```

Сообщи пользователю: `✅ Задача создана: $KEY — "$TITLE"`

Выставь AI-флаги сразу:

```bash
curl -s -X PATCH "$API_URL/issues/$ISSUE_ID/ai-flags" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"aiEligible": true, "aiAssigneeType": "AGENT"}'
```

---

## Шаг 1: Получение задачи с боя

```bash
ISSUE=$(curl -s "$API_URL/issues/key/$KEY" -H "Authorization: Bearer $TOKEN")
ISSUE_ID=$(echo $ISSUE | jq -r '.id')

# Дочерние задачи
CHILDREN=$(curl -s "$API_URL/issues/$ISSUE_ID/children" -H "Authorization: Bearer $TOKEN")

# История изменений
HISTORY=$(curl -s "$API_URL/issues/$ISSUE_ID/history" -H "Authorization: Bearer $TOKEN")

# Комментарии
COMMENTS=$(curl -s "$API_URL/issues/$ISSUE_ID/comments" -H "Authorization: Bearer $TOKEN")
```

---

## Шаг 2: Анализ кодовой базы

На основе данных задачи определи:

**Зависимости:**
- Какие модули backend затрагиваются (auth, users, projects, issues, comments, boards, sprints, time, teams, audit, admin)
- Какие фронтенд-компоненты/страницы затрагиваются
- Какие Prisma-модели нужно изменить/добавить
- Внешние зависимости (npm-пакеты, API)

**Риски:**
- Миграции БД (влияние на прод)
- Изменения в RBAC (проверка всех ролей)
- Обратная совместимость API
- Влияние на существующие тесты
- Безопасность (ФЗ-152, OWASP)

**Особенности:**
- Специфика для Astra Linux / Red OS (если применимо)
- Требования к производительности (API < 200ms p95)
- Кэширование Redis
- Совместимость браузеров

**Декомпозиция на PR (обязательно):**
- Разбей работу на последовательность PR-ов размером ~400–900 строк diff.
- Для каждого PR определи: ветку (`{KEY-LOWER}/<scope>`), scope (что входит), что НЕ входит, зависимости (от каких PR ждёт merge), merge-ready check, оценку в часах.
- Построй DAG зависимостей между PR (где параллельно, где последовательно).
- Раздели PR по фазам: Foundation → Backend core → Frontend → E2E / docs / cutover (если применимо).
- Миграции Prisma — всегда отдельный PR (чтобы `migrate deploy` проверялся на staging перед follow-up кодом).
- Если задача покрывается одним PR (<900 строк, нет миграций, один слой) — опиши один PR-1 и явно пометь «Single-PR task».
- Feature flag — если задача меняет production-поведение и нужен постепенный cutover.

---

## Шаг 3: Генерация ТЗ

Создай два файла в `docs/tz/`:

### Markdown: `docs/tz/{KEY}.md`

```markdown
# ТЗ: {KEY} — {title}

**Дата:** {YYYY-MM-DD}
**Тип:** {type} | **Приоритет:** {priority} | **Статус:** {status}
**Проект:** {project.name} ({project.key})
**Автор ТЗ:** Claude Code (auto-generated)

---

## 1. Постановка задачи

{description из задачи + бизнес-контекст}

### Пользовательский сценарий
{Кто, что делает, зачем — на основе типа задачи и описания}

---

## 2. Текущее состояние
{Что уже реализовано в кодовой базе по этой теме. Ссылки на файлы.}

---

## 3. Зависимости

### Модули backend
- [ ] {module} — {почему затрагивается}

### Компоненты frontend
- [ ] {component/page} — {почему затрагивается}

### Модели данных (Prisma)
- [ ] {Model} — {новая / изменение полей / связи}

### Внешние зависимости
- [ ] {package/API} — {зачем нужен}

### Блокеры
- {Задачи, которые должны быть завершены до начала работы}

---

## 4. Риски

| # | Риск | Вероятность | Влияние | Митигация |
|---|------|-------------|---------|-----------|
| 1 | {описание} | Высокая/Средняя/Низкая | {что сломается} | {как предотвратить} |

---

## 5. Особенности реализации

### Backend
- {Endpoint: METHOD /api/...}
- {Валидация: Zod schema}
- {RBAC: какие роли имеют доступ}

### Frontend
- {Страница/компонент}
- {Стейт: Zustand store}
- {UI: Ant Design компоненты}

### База данных
- {Миграция: что меняется}
- {Индексы: нужны ли новые}

### Кэширование
- {Redis: что кэшировать, TTL}

---

## 6. Требования к реализации

### Функциональные
- [ ] {FR-1: описание}

### Нефункциональные
- [ ] API response < 200ms (p95)
- [ ] {Другие NFR}

### Безопасность
- [ ] {SEC-1: требование}

### Тестирование
- [ ] Unit-тесты: {что покрыть}
- [ ] Integration-тесты: {API endpoints}
- [ ] {Покрытие >= 60%}

---

## 7. Критерии приёмки (Definition of Done)

{Если в задаче есть acceptanceCriteria — взять оттуда}

- [ ] {AC-1: конкретный, проверяемый критерий}
- [ ] {AC-2: ...}
- [ ] Все тесты зелёные (`make test`)
- [ ] Lint проходит (`make lint`)
- [ ] Code review пройден
- [ ] Документация обновлена (если применимо)

---

## 8. Оценка трудоёмкости

| Этап | Часы (оценка) |
|------|---------------|
| Анализ и план | {N} |
| Backend | {N} |
| Frontend | {N} |
| Тесты | {N} |
| Code review + fixes | {N} |
| **Итого** | **{N}** |

---

## 9. Связанные задачи

- Родитель: {parentKey} — {parentTitle}
- Дочерние: {childKey} — {childTitle}
- Блокирует: {keys}
- Зависит от: {keys}

---

## 10. Иерархия задач

{Дерево: EPIC → STORY → TASK → SUBTASK}

---

## 11. Замечания к документации

- [ ] Обновить [docs/user-manual/](docs/user-manual/) (если затрагивает UX)
- [ ] Обновить [docs/api/reference.md](docs/api/reference.md) (если меняется API)
- [ ] Обновить [version_history.md](version_history.md) записью о {KEY} в том же коммите, что функциональный код
- [ ] {другие документы: ADR, MCP_GUIDE.html, security/*}

---

## 12. План реализации (PR / ветки / merge plan)

### 12.1 Стратегия

- **База:** все ветки создаются от свежего `main`, PR-ы мерджатся напрямую в `main`.
- **Именование веток:** `{KEY-LOWER}/<scope>` (например `ttsrh-1/parser`).
- **Имя коммита:** `{type}({module}): {KEY} — <scope>` (feat/fix/chore/docs/refactor).
- **Размер PR:** целимся 400–900 строк diff. При 1000+ — разбиваем на два.
- **CI:** каждый PR — `make lint`, `make test`, Playwright e2e (если меняется UI).
- **Миграции:** каждая Prisma-миграция — отдельный PR (чтобы `prisma migrate deploy` был проверяем на staging перед follow-up кодом).
- **Feature flag:** {имя флага} — если задача меняет production-поведение; cutover в финальном PR. Иначе раздел опустить.
- **Security review gate:** {какие PR требуют apprоv'а security-review} — если есть raw SQL, RBAC, anti-injection. Иначе раздел опустить.

### 12.2 DAG зависимостей

```
PR-1 ({scope}) ─► PR-2 ({scope}) ─► PR-3 ({scope})
                                   │
                                   ├─► PR-4 ({scope})
                                   └─► PR-5 ({scope}) ─► PR-6 ({scope})
```

Параллелизм: {явно указать, какие PR могут делаться параллельно после merge общего предка}.

### 12.3 PR-ы по фазам

#### Фаза 0 — Foundation (~Nч)

##### PR-1: {scope заголовок}
- **Branch:** `{KEY-LOWER}/{scope}`
- **Зависит от:** — (или `PR-X`)
- **Scope:**
  - {файл/модуль — что именно}
  - {миграция, если есть}
  - {тесты — unit/integration}
- **Не включает:** {что явно вынесено в следующие PR — чтобы reviewer не просил расширения scope}
- **Merge-ready check:** {конкретные проверки — какие тесты зелёные, что работает на staging, какие чек-листы пройдены}
- **Оценка:** ~Nч

#### Фаза 1 — {название} (~Nч)

##### PR-2: {scope заголовок}
{…аналогично…}

{…повторить для всех PR…}

### 12.4 Итого по PR

| PR | Scope | Оценка (ч) | Зависимости |
|----|-------|------------|-------------|
| PR-1 | {scope} | N | — |
| PR-2 | {scope} | N | PR-1 |
| … | … | … | … |
| **Итого** | | **N** | |

> Если задача Single-PR: указать в разделе 12.3 только PR-1 с полным scope и пометкой «Single-PR task: полная реализация в одном PR, размер ~N строк diff».
```

### JSON: `docs/tz/{KEY}.json`

```json
{
  "key": "{KEY}",
  "title": "{title}",
  "generatedAt": "{ISO datetime}",
  "generatedBy": "claude-code",
  "source": {
    "apiUrl": "{API_URL}",
    "issueId": "{id}",
    "fetchedAt": "{ISO datetime}"
  },
  "issue": {
    "type": "{type}",
    "status": "{status}",
    "priority": "{priority}",
    "project": "{project.key}",
    "assignee": "{assignee}",
    "creator": "{creator}",
    "estimatedHours": null,
    "description": "{description}",
    "acceptanceCriteria": "{acceptanceCriteria}"
  },
  "dependencies": {
    "backendModules": ["{module}"],
    "frontendComponents": ["{component}"],
    "prismaModels": ["{Model}"],
    "externalPackages": ["{package}"],
    "blockers": ["{KEY}"]
  },
  "risks": [
    {
      "id": 1,
      "description": "{risk}",
      "probability": "HIGH|MEDIUM|LOW",
      "impact": "{impact}",
      "mitigation": "{mitigation}"
    }
  ],
  "requirements": {
    "functional": ["{FR-1}"],
    "nonFunctional": ["{NFR-1}"],
    "security": ["{SEC-1}"]
  },
  "acceptanceCriteria": ["{AC-1}"],
  "estimation": {
    "analysis": 0,
    "backend": 0,
    "frontend": 0,
    "testing": 0,
    "review": 0,
    "total": 0
  },
  "relatedIssues": {
    "parent": "{parentKey}",
    "children": ["{childKey}"],
    "blocks": [],
    "dependsOn": []
  },
  "implementationPlan": {
    "strategy": {
      "branchPattern": "{key-lower}/<scope>",
      "commitPattern": "{type}({module}): {KEY} — <scope>",
      "targetBranch": "main",
      "prSizeTarget": "400-900 lines diff",
      "featureFlag": "{FLAG_NAME или null}",
      "securityReviewRequired": ["PR-X", "PR-Y"]
    },
    "singlePR": false,
    "phases": [
      {
        "name": "Foundation",
        "estimatedHours": 0,
        "prs": [
          {
            "id": "PR-1",
            "title": "{scope заголовок}",
            "branch": "{key-lower}/{scope}",
            "dependsOn": [],
            "scope": ["{что входит}"],
            "notIncluded": ["{что явно вынесено}"],
            "mergeReadyCheck": ["{проверки перед merge}"],
            "estimatedHours": 0
          }
        ]
      }
    ],
    "dag": {
      "edges": [
        {"from": "PR-1", "to": "PR-2"}
      ],
      "parallelizable": [["PR-3", "PR-4"]]
    },
    "totalHours": 0
  }
}
```

---

## Шаг 4: Запись ТЗ в задачу на бою

После сохранения файлов — обновить описание задачи на бою содержимым из `docs/tz/{KEY}.md`:

```bash
TZ_CONTENT=$(cat "docs/tz/$KEY.md")

curl -s -X PATCH "$API_URL/issues/$ISSUE_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg desc "$TZ_CONTENT" '{"description": $desc}')"
```

Добавить комментарий в задачу:

```bash
curl -s -X POST "$API_URL/issues/$ISSUE_ID/comments" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"body": "📋 ТЗ сгенерировано и записано в описание задачи. Файлы: docs/tz/'"$KEY"'.md, docs/tz/'"$KEY"'.json"}'
```

Сообщи пользователю: `✅ ТЗ записано в задачу $KEY на бою.`

---

## Шаг 5: Обновление индекса

Обнови `docs/tz/INDEX.md` — добавь строку в таблицу:

```
| {KEY} | {title} | {date} | {status} |
```

---

## Шаг 6: Итог и переход к реализации

Покажи пользователю краткую сводку:
- Ключ и название задачи
- Количество зависимостей и рисков
- Оценка трудоёмкости (итого часов)
- Критические блокеры (если есть)
- **План реализации:** количество PR, фазы, критический путь (самая длинная цепочка в DAG)

Затем спроси: **«ТЗ готово и записано в задачу $KEY. Приступить к реализации?»** (для multi-PR задач — рекомендовать `/implement-tz $KEY`).

- **Если да** → выполни следующий флоу (реализация по `tasktime-issues-gateway`):

  1. Выставить AI-статус `IN_PROGRESS`:
     ```bash
     curl -s -X PATCH "$API_URL/issues/$ISSUE_ID/ai-status" \
       -H "Authorization: Bearer $TOKEN" \
       -H "Content-Type: application/json" \
       -d '{"aiExecutionStatus": "IN_PROGRESS"}'
     ```

  2. Добавить служебный комментарий:
     ```bash
     curl -s -X POST "$API_URL/issues/$ISSUE_ID/comments" \
       -H "Authorization: Bearer $TOKEN" \
       -H "Content-Type: application/json" \
       -d '{"body": "🤖 Взято в работу агентом (Claude Code). Начинаю реализацию по ТЗ."}'
     ```

  3. План реализации уже в §12 ТЗ (`docs/tz/{KEY}.md`). Если multi-PR — использовать `/implement-tz {KEY}` для итеративного цикла. Если Single-PR — работать по разделу §12.3 PR-1 напрямую, доп. план в `docs/plans/` не создавать.

  4. Реализовать по флоу из `tasktime-workflow`:
     - Backend (router → service → Prisma)
     - Frontend (страницы/компоненты, Zustand, AntD)
     - Тесты (Vitest + Supertest)
     - UAT чек-лист

  5. После реализации — создать AI-сессию для учёта времени и стоимости:
     ```bash
     curl -s -X POST "$API_URL/ai-sessions" \
       -H "Authorization: Bearer $TOKEN" \
       -H "Content-Type: application/json" \
       -d '{
         "issueSplits": [{"issueId": "'"$ISSUE_ID"'", "ratio": 1}],
         "model": "claude-sonnet-4-6",
         "provider": "anthropic",
         "startedAt": "'"$START_TIME"'",
         "finishedAt": "'"$END_TIME"'",
         "notes": "Реализация '"$KEY"' по ТЗ claude-code"
       }'
     ```

  6. По завершении:
     - Выставить `aiExecutionStatus: 'DONE'`
     - Добавить финальный комментарий с резюме (что реализовано, ветка, план, UAT)

- **Если нет** → завершить. ТЗ сохранено локально и записано в задачу на бою.

---

## Режим без доступа к API

Если API недоступен (ошибка curl или нет токена):
- Попроси пользователя описать задачу текстом
- Генерируй ТЗ на основе описания + анализа кодовой базы
- Сохрани файлы локально
- Предупреди: «API недоступен — ТЗ сохранено локально, но не записано в задачу на бою. Проверь `$API_URL`.»
