# TTS-QL — язык запросов задач

> Обновлено: 2026-04-21 (TTSRH-1 PR-21)
> Реализация: [backend/src/modules/search/](../../../backend/src/modules/search/), [frontend/src/pages/SearchPage.tsx](../../../frontend/src/pages/SearchPage.tsx)
> Полная спецификация: [docs/tz/TTSRH-1.md §5.1–5.4](../../tz/TTSRH-1.md)

TTS-QL — декларативный язык для поиска и фильтрации задач. Синтаксис совместим с JIRA JQL для ≥95% выражений — команды, знакомые по JIRA, работают «из коробки».

Страница поиска — **Главное меню → Поиск задач** (`/search`). Feature flag `FEATURES_ADVANCED_SEARCH` должен быть включён.

---

## Быстрый старт

```
# Мои открытые задачи
assignee = currentUser() AND statusCategory != DONE

# HIGH-задачи, которые горят на этой неделе
priority = HIGH AND due <= "7d"

# Задачи в активных спринтах двух проектов
project IN (TTMP, TTSRH) AND sprint IN openSprints()

# Тексточный поиск по названию
summary ~ "payment" OR description ~ "payment"

# Задачи с нарушенной КТ
hasCheckpointViolation = true
```

---

## Грамматика

```ebnf
query      ::= or_expr [ "ORDER BY" sort_list ]
or_expr    ::= and_expr { "OR" and_expr }
and_expr   ::= not_expr { "AND" not_expr }
not_expr   ::= [ "NOT" ] atom
atom       ::= "(" query ")" | clause
clause     ::= field op value
             | field "IN" "(" value_list ")"
             | field "IS" [ "NOT" ] ("EMPTY" | "NULL")

op         ::= "=" | "!=" | ">" | ">=" | "<" | "<=" | "~" | "!~"
```

**Приоритет:** `( ) > NOT > AND > OR > ORDER BY` (строгий, как в математике).
**Регистр:** ключевые слова (AND, OR, IN, IS, EMPTY) и имена полей — **не важны**. `assignee = currentUser()` и `ASSIGNEE = CURRENTUSER()` эквивалентны.
**Комментарии:** `-- …` до конца строки. Полезно в больших сохранённых фильтрах.

---

## Типы литералов

| Тип | Примеры | Прим. |
|-----|---------|-------|
| STRING | `"Design"`, `'Design'` | поддерживает `\"`, `\\`, `\n`, `\t`, `\u{HEX}` |
| NUMBER | `3`, `-1.5`, `100` | |
| DATE | `"2026-04-21"`, `"2026-04-21 14:30"` | ISO-8601 |
| RELATIVE_DATE | `"-7d"`, `"1w"`, `"2M"`, `"1y"`, `"8h"` | от `now()` |
| BOOL | `true`, `false` | без кавычек |
| IDENT | `OPEN`, `HIGH`, `TTMP` | системные keys, статусы, проекты |
| FUNCTION | `currentUser()`, `openSprints()` | см. раздел «Функции» |

---

## Операторы

| Оператор | Типы | Семантика |
|----------|------|-----------|
| `=`, `!=` | все | равенство / неравенство |
| `>`, `>=`, `<`, `<=` | NUMBER, DATE | сравнение |
| `IN (...)` | все перечислимые | вхождение в список |
| `NOT IN (...)` | все перечислимые | отсутствие в списке |
| `~` | TEXT | ILIKE substring match (`~ "bug"` ↔ `%bug%`) |
| `!~` | TEXT | отрицание ILIKE |
| `IS EMPTY` / `IS NULL` | nullable | поле пустое |
| `IS NOT EMPTY` / `IS NOT NULL` | nullable | поле заполнено |

---

## Поля (system)

### Задача

| Поле | Синонимы | Тип | Операторы | Прим. |
|------|----------|-----|-----------|-------|
| `project` | `proj` | Project-ref | `=` `!=` `IN` `NOT IN` `IS [NOT] EMPTY` | `key` (TTMP) или id |
| `key`, `issuekey` | — | Issue-ref | `=` `!=` `IN` `NOT IN` | `TTMP-123` |
| `summary` | `title` | TEXT | `~` `!~` `=` `!=` `IS [NOT] EMPTY` | ILIKE |
| `description` | — | TEXT | `~` `!~` `IS [NOT] EMPTY` | |
| `status` | — | Status-ref | `=` `!=` `IN` `NOT IN` | имя `WorkflowStatus` или systemKey |
| `statusCategory` | `category` | Enum | `=` `!=` `IN` `NOT IN` | `TODO` / `IN_PROGRESS` / `DONE` |
| `priority` | — | Enum | `=` `!=` `IN` `NOT IN` | `CRITICAL` / `HIGH` / `MEDIUM` / `LOW` |
| `type`, `issuetype` | — | Type-ref | `=` `!=` `IN` `NOT IN` | systemKey (TASK/EPIC/…) или id |
| `parent` | — | Issue-ref | `=` `!=` `IN` `NOT IN` `IS [NOT] EMPTY` | |
| `epic` | — | Issue-ref | `=` `IN` | parent, если `type=EPIC` |
| `labels`, `label` | — | LIST | `=` `!=` `IN` `NOT IN` `IS [NOT] EMPTY` | |
| `comment` | — | TEXT | `~` | по `Comment.content` |

### Люди

| Поле | Синонимы | Тип | Прим. |
|------|----------|-----|-------|
| `assignee` | — | User-ref | email / id / `currentUser()` |
| `reporter`, `creator` | — | User-ref | то же |

### Планирование

| Поле | Синонимы | Тип | Прим. |
|------|----------|-----|-------|
| `sprint` | — | Sprint-ref | имя / id / функции |
| `release`, `fixVersion` | — | Release-ref | то же |
| `due`, `dueDate` | — | DATE | + relative: `due <= "7d"` |
| `created` | — | DATETIME | |
| `updated` | — | DATETIME | |
| `resolvedAt` | — | DATETIME | момент перехода в DONE-category |
| `estimatedHours`, `originalEstimate` | — | NUMBER | |
| `timeSpent`, `workLog` | — | NUMBER | `SUM(TimeLog.hours)` |
| `timeRemaining` | — | NUMBER | `estimatedHours - timeSpent` |

### AI

| Поле | Тип | Прим. |
|------|-----|-------|
| `aiEligible` | BOOL | |
| `aiStatus` | Enum | `NOT_STARTED` / `IN_PROGRESS` / `DONE` / `FAILED` |
| `aiAssigneeType` | Enum | `HUMAN` / `AGENT` / `MIXED` |

### Контрольные точки (КТ)

| Поле | Синонимы | Тип | Прим. |
|------|----------|-----|-------|
| `hasCheckpointViolation` | `hasViolation` | BOOL | `true` ↔ есть активное нарушение |
| `checkpointViolationType` | `violationType` | LIST (text) | имена типов КТ с активными нарушениями |
| `checkpointViolationReason` | — | TEXT | текст причины нарушения (только активные) |

---

## Кастомные поля

Синтаксис: `cf[UUID]` (через id) или `"Имя поля"` (через имя, регистронезависимо).

```
"Story Points" > 3
cf[8f4c2e1e-aa4b-47c3-b2da-7a9c5e3f2d11] = "Design Review"
```

Маппинг типов → операторов:

| Тип | Операторы |
|-----|-----------|
| TEXT, TEXTAREA, URL | `~` `=` `!=` `IS [NOT] EMPTY` |
| NUMBER, DECIMAL | все числовые |
| DATE, DATETIME | все временные |
| CHECKBOX | `=` (true/false) |
| SELECT | `=` `!=` `IN` `NOT IN` (по option name или id) |
| MULTI_SELECT, LABEL | `=` `!=` `IN` `NOT IN` (вхождение) |
| USER | `=` `!=` `IN` `NOT IN`, `currentUser()` |
| REFERENCE | `=` `!=` `IN` (по id связанной сущности) |

---

## Функции

### Пользователь

| Функция | Возвращает | Прим. |
|---------|-----------|-------|
| `currentUser()` | User | текущий пользователь |
| `membersOf("group")` | User[] | члены группы |

### Даты

| Функция | Возвращает | Прим. |
|---------|-----------|-------|
| `now()` | DATETIME | текущий момент |
| `today()` | DATE | сегодня (TZ пользователя) |
| `startOfDay([offset])` | DATETIME | |
| `endOfDay([offset])` | DATETIME | |
| `startOfWeek([offset])` | DATETIME | ISO-неделя |
| `endOfWeek([offset])` | DATETIME | |
| `startOfMonth([offset])` | DATETIME | |
| `endOfMonth([offset])` | DATETIME | |
| `startOfYear([offset])` | DATETIME | |
| `endOfYear([offset])` | DATETIME | |

**Offset-синтаксис:** `startOfDay("-7d")`, `endOfMonth("1M")`. Единицы: `d` / `w` / `M` / `y` / `h` / `m`.
**Относительные даты в литерале:** `due <= "7d"` ≡ `due <= now() + 7d`.

### Спринты / Релизы

| Функция | Возвращает |
|---------|-----------|
| `openSprints()` | Sprint[] — активные спринты доступных проектов |
| `closedSprints()` | Sprint[] |
| `futureSprints()` | Sprint[] |
| `unreleasedVersions([project])` | Release[] |
| `releasedVersions([project])` | Release[] |
| `earliestUnreleasedVersion([project])` | Release |
| `latestReleasedVersion([project])` | Release |

### Связи задач

| Функция | Возвращает |
|---------|-----------|
| `linkedIssues(key[, linkType])` | Issue[] — связанные задачи |
| `subtasksOf(key)` | Issue[] — дети |
| `epicIssues(key)` | Issue[] — задачи под эпиком |
| `myOpenIssues()` | shortcut: `assignee = currentUser() AND statusCategory != DONE` |

### Контрольные точки

| Функция | Возвращает |
|---------|-----------|
| `violatedCheckpoints([typeName])` | Issue[] — задачи с активными нарушениями КТ. Без аргумента — любые; с аргументом — по имени типа (регистр не важен). |
| `violatedCheckpointsOf(releaseKeyOrId[, typeName])` | то же, ограниченное задачами конкретного релиза |
| `checkpointsAtRisk([typeName])` | задачи в релизах с КТ в state `WARNING` / `OVERDUE` / `ERROR` |
| `checkpointsInState(state[, typeName])` | обобщённая: state ∈ `{ PENDING, ON_TRACK, WARNING, OVERDUE, ERROR, SATISFIED }` |

Три эквивалентные формы для simpler case:
```
issue IN violatedCheckpoints()
violatedCheckpoints()               -- парсер оборачивает в "issue IN (…)"
hasCheckpointViolation = true       -- булев-аналог без аргумента
```

---

## ORDER BY

```
ORDER BY priority DESC, updated DESC
ORDER BY key ASC
```

- Сортировка по нескольким полям через запятую.
- `ASC` / `DESC` (по умолчанию `ASC`).
- Только **sortable-поля** (system-поля кроме TEXT и кастомные поля с явным индексом).

---

## Примеры

### Каждодневные

```
# Мои активные задачи
assignee = currentUser() AND statusCategory != DONE ORDER BY priority DESC

# Всё, что срочно
priority IN (CRITICAL, HIGH) AND due <= "3d"

# Баги в обзоре
type = BUG AND status = REVIEW

# Задачи без исполнителя
assignee IS EMPTY AND statusCategory = TODO
```

### Сложные сценарии

```
# Задачи моего проекта в активных спринтах + без assignee
project = TTMP AND sprint IN openSprints() AND assignee IS EMPTY

# Переходящие из прошлого спринта (не закрытые)
sprint IN closedSprints() AND statusCategory != DONE

# HIGH/CRITICAL без эстимейта
priority IN (CRITICAL, HIGH) AND estimatedHours IS EMPTY

# Эпик и его задачи
key = "TTMP-42" OR parent = "TTMP-42" OR epic = "TTMP-42"

# Обновлённые на этой неделе
updated >= startOfWeek() AND updated < endOfWeek()
```

### Контрольные точки

```
# Все мои задачи с горящими КТ
assignee = currentUser() AND hasCheckpointViolation = true

# Задачи с нарушенной КТ типа «Все назначены»
checkpointViolationType = "Все назначены"

# Задачи в релизе TTMP-5.0 в state WARNING по любой КТ
violatedCheckpointsOf("TTMP-5.0") OR checkpointsAtRisk()
```

### Кастомные поля

```
"Story Points" >= 5 AND "Story Points" <= 13
"Design Review Required" = true
"Release Milestone" IN ("Beta", "GA")
```

---

## Ограничения и граничные случаи

- **Limit:** `POST /search/issues` возвращает до **100 задач за страницу** (параметр `limit`).
- **Rate-limit:** 30 запросов в минуту на пользователя.
- **Timeout:** 10 секунд на `/search/issues`, 2 на `/search/validate`, 1 на `/search/suggest`.
- **Scope (R3):** результаты всегда отфильтрованы — вы увидите задачи **только из доступных вам проектов**. Даже через чужой PUBLIC-фильтр нельзя выйти за пределы своих прав.
- **`WAS` / `CHANGED`:** зарезервированы грамматикой, но **в MVP не реализованы** — требуют модели `FieldChangeLog` (Phase 2, тикет TTSRH-23).
- **Функции `watchedIssues()`, `votedIssues()`, `lastLogin()`:** зарезервированы, но **в MVP не реализованы** (Phase 2).
- **Полнотекстовый поиск:** сейчас через ILIKE (подстрока). `pg_trgm` + `unaccent` — Phase 2 (TTSRH-24).

---

## Что дальше

- **Использование страницы поиска** — [search.md](./search.md).
- **API эндпоинты** — [docs/api/reference.md § TTS-QL Search](../../api/reference.md).
- **TTS-QL в контрольных точках** — [checkpoints.md § Режим «TTS-QL условие»](./checkpoints.md#режим-условия-структурный--ttql--combined).
- **Граничные случаи и error codes** — [docs/tz/TTSRH-1.md §5.1-5.9](../../tz/TTSRH-1.md).
