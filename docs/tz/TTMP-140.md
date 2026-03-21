# ТЗ: TTMP-140 — Доработка функционала релизов

**Дата:** 2026-03-21
**Тип:** EPIC | **Приоритет:** HIGH | **Статус:** OPEN
**Проект:** TaskTime MVP (vibe-code) (TTMP)
**Автор ТЗ:** Claude Code (auto-generated)

---

## 1. Постановка задачи

Текущий модуль релизов позволяет создать релиз и добавить в него задачи напрямую (через `releaseId` на модели `Issue`). Однако в Scrum-процессе единицей поставки являются **спринты**, а не отдельные задачи. Необходимо реализовать полноценную связь «Релиз → Спринты → Задачи» с бизнес-правилами:

- **Релиз не может быть запущен в работу** (`DRAFT → READY`) пока в нём нет хотя бы одного спринта с задачами.
- **Релиз не может быть закрыт** (`READY → RELEASED`) пока не закрыты все спринты и не выполнены все задачи в этих спринтах.

### Пользовательский сценарий

**PM / MANAGER** создаёт релиз `2.0.0`. Добавляет в него спринты Sprint-5 и Sprint-6. В UI видит прогресс: сколько задач открыто, сколько спринтов не закрыто. Когда все задачи в статусах DONE/CANCELLED и оба спринта CLOSED — кнопка «Выпустить» становится активной. PM нажимает «Выпустить» — релиз переходит в RELEASED.

**DEV / USER** видит на карточке задачи, к какому релизу она привязана (через спринт).

---

## 2. Текущее состояние

### Что уже реализовано

| Компонент | Файл | Состояние |
|-----------|------|-----------|
| Prisma Release model | `backend/src/prisma/schema.prisma` | DONE — поля id, projectId, name, description, level, state, releaseDate |
| Issue.releaseId FK | `backend/src/prisma/schema.prisma` | DONE — задачи можно привязывать к релизу напрямую |
| releases.service.ts | `backend/src/modules/releases/releases.service.ts` | DONE — CRUD, addIssues, removeIssues, markReady, markReleased |
| releases.router.ts | `backend/src/modules/releases/releases.router.ts` | DONE — все эндпоинты для задач |
| releases.dto.ts | `backend/src/modules/releases/releases.dto.ts` | DONE |
| ReleasesPage.tsx | `frontend/src/pages/ReleasesPage.tsx` | DONE — список, создание, добавление задач, переходы статусов |
| api/releases.ts | `frontend/src/api/releases.ts` | DONE |

### Что отсутствует

1. **Sprint → Release связь**: в модели `Sprint` нет поля `releaseId` — спринты не привязываются к релизам.
2. **Гард при запуске релиза**: `markReleaseReady` не проверяет наличие спринтов и задач в них.
3. **Гард при закрытии релиза**: `markReleaseReleased` не проверяет статусы спринтов и задач.
4. **Панель спринтов в UI**: на странице релизов нет блока управления спринтами.
5. **Индикатор готовности**: нет визуального прогресса (сколько спринтов/задач осталось).

---

## 3. Зависимости

### Модули backend
- [x] `releases` — основные изменения: новые эндпоинты, бизнес-гарды в сервисе
- [x] `sprints` — чтение данных спринтов для валидации; модель получает FK `releaseId`
- [x] `issues` — чтение статусов задач для гарда закрытия релиза
- [ ] `audit` — логирование новых операций (sprint added/removed to release)

### Компоненты frontend
- [x] `ReleasesPage.tsx` — добавить панель спринтов, индикатор прогресса, guard-tooltips
- [x] `api/releases.ts` — добавить функции управления спринтами
- [x] `types/index.ts` — обновить тип `Release` (добавить `sprints[]`)

### Модели данных (Prisma)
- [x] `Sprint` — добавить поле `releaseId String? @map("release_id")` + relation к Release
- [x] `Release` — добавить обратную relation `sprints Sprint[]`
- [ ] Миграция: ALTER TABLE sprints ADD COLUMN release_id UUID REFERENCES releases(id)

### Внешние зависимости
- Нет новых npm-пакетов

### Блокеры
- Нет

---

## 4. Риски

| # | Риск | Вероятность | Влияние | Митигация |
|---|------|-------------|---------|-----------|
| 1 | Миграция ломает существующие спринты (поле nullable, безопасно) | Низкая | Нет данных теряется | Поле nullable, DEFAULT NULL — безопасная миграция |
| 2 | Один спринт в нескольких релизах | Средняя | Логическая ошибка | При добавлении спринта в релиз проверять, что он не в другом активном релизе |
| 3 | Релиз RELEASED с незакрытыми спринтами через прямое PATCH | Низкая | Нарушение бизнес-правил | Гарды только в специализированных эндпоинтах `POST /releases/:id/ready` и `/released` |
| 4 | Производительность: подсчёт статусов тысяч задач | Средняя | Медленный гард | Агрегация на уровне БД (`COUNT WHERE status NOT IN (DONE, CANCELLED)`) |

---

## 5. Особенности реализации

### Backend

#### Новые эндпоинты

```
POST   /releases/:id/sprints          — добавить спринты в релиз { sprintIds: string[] }
POST   /releases/:id/sprints/remove   — убрать спринты из релиза { sprintIds: string[] }
GET    /releases/:id/sprints          — список спринтов релиза с агрегацией задач
```

#### Изменения в существующих эндпоинтах

`POST /releases/:id/ready` (markReleaseReady) — добавить гард:
```
Проверить: release.sprints.length > 0
Проверить: хотя бы один спринт содержит хотя бы одну задачу
Ошибка 400: "Release must have at least one sprint with issues before marking ready"
```

`POST /releases/:id/released` (markReleaseReleased) — добавить гард:
```
Проверить: все спринты в релизе имеют state = CLOSED
Проверить: все задачи в этих спринтах имеют status IN (DONE, CANCELLED)
Ошибка 400: "Cannot release: {N} sprints are not closed" / "Cannot release: {N} issues are not done"
```

#### Гард: спринт в одном релизе

При `POST /releases/:id/sprints`:
```
Проверить: каждый sprint.releaseId === null || sprint.releaseId === releaseId
Ошибка 400: "Sprint SPRINT_NAME is already in another release"
```

#### Валидация RBAC
- Все мутации: `requireRole('ADMIN', 'MANAGER')`
- GET: authenticate only

### Frontend

#### ReleasesPage.tsx

Добавить в правую панель (aside) новый блок **«Спринты в релизе»**:
- Список спринтов: имя, статус, счётчик задач (всего / открытых)
- Кнопка «Добавить спринт» (ADMIN/MANAGER, state !== RELEASED)
- Кнопка «Убрать» у каждого спринта

**Индикатор готовности** (Progress bar или строка статистики):
```
Спринты: 2/3 закрыты · Задачи: 45/50 выполнены
```

**Guard tooltips** для кнопок:
- «Готов» — disabled + tooltip «Добавьте хотя бы один спринт с задачами»
- «Выпустить» — disabled + tooltip «Закройте все спринты и задачи»

#### api/releases.ts — новые функции

```typescript
addSprintsToRelease(releaseId: string, sprintIds: string[]): Promise<void>
removeSprintsFromRelease(releaseId: string, sprintIds: string[]): Promise<void>
getReleaseSprints(releaseId: string): Promise<SprintWithStats[]>
```

### База данных

```sql
-- Миграция
ALTER TABLE sprints ADD COLUMN release_id UUID REFERENCES releases(id) ON DELETE SET NULL;
CREATE INDEX idx_sprints_release_id ON sprints(release_id);
```

Prisma schema:
```prisma
model Sprint {
  // ... existing fields ...
  releaseId String?  @map("release_id")
  release   Release? @relation(fields: [releaseId], references: [id])
}

model Release {
  // ... existing fields ...
  sprints Sprint[]
}
```

### Кэширование
- Нет специального кэширования (данные релизов меняются редко, объём небольшой)
- При масштабировании: Redis кэш `release:{id}:readiness` с TTL 30s + инвалидация при смене статуса спринта/задачи

---

## 6. Требования к реализации

### Функциональные
- [ ] FR-1: Спринт может быть добавлен в релиз (ADMIN/MANAGER)
- [ ] FR-2: Спринт может быть удалён из релиза (ADMIN/MANAGER, пока релиз не RELEASED)
- [ ] FR-3: Один спринт не может находиться в двух активных релизах одновременно
- [ ] FR-4: Релиз нельзя перевести в READY если нет спринтов или спринты пустые (нет задач)
- [ ] FR-5: Релиз нельзя перевести в RELEASED если есть незакрытые спринты (state != CLOSED)
- [ ] FR-6: Релиз нельзя перевести в RELEASED если есть задачи не в статусе DONE или CANCELLED
- [ ] FR-7: UI показывает прогресс готовности (спринты закрыты X/N, задачи выполнены X/N)
- [ ] FR-8: Кнопки перехода статуса заблокированы с объясняющим tooltip

### Нефункциональные
- [ ] API response < 200ms (p95) — гард должен использовать агрегацию на уровне БД
- [ ] Гард-запросы: не более 2 SQL-запросов (один для спринтов, один для задач)

### Безопасность
- [ ] SEC-1: Мутации только для ADMIN/MANAGER (RBAC middleware)
- [ ] SEC-2: Спринты можно добавлять только из того же проекта, что и релиз
- [ ] SEC-3: Все операции логируются в audit_log

### Тестирование
- [ ] Unit-тест: `markReleaseReady` — бросает 400 если нет спринтов
- [ ] Unit-тест: `markReleaseReady` — бросает 400 если спринты пустые
- [ ] Unit-тест: `markReleaseReleased` — бросает 400 если есть PLANNED/ACTIVE спринты
- [ ] Unit-тест: `markReleaseReleased` — бросает 400 если есть задачи OPEN/IN_PROGRESS/REVIEW
- [ ] Unit-тест: `addSprintsToRelease` — бросает 400 если спринт в другом релизе
- [ ] Integration-тест: `POST /releases/:id/sprints` — 201, 400 (другой релиз), 403 (USER)
- [ ] Integration-тест: `POST /releases/:id/ready` — 200 OK, 400 без спринтов
- [ ] Integration-тест: `POST /releases/:id/released` — 200 OK, 400 незакрытые спринты

---

## 7. Критерии приёмки (Definition of Done)

- [ ] AC-1: Добавить спринт в релиз через UI — спринт появляется в панели релиза
- [ ] AC-2: Спринт, уже в другом релизе, нельзя добавить — UI показывает ошибку
- [ ] AC-3: Кнопка «Готов» недоступна и показывает tooltip, пока нет спринтов с задачами
- [ ] AC-4: Кнопка «Выпустить» недоступна, пока не все спринты CLOSED
- [ ] AC-5: Кнопка «Выпустить» недоступна, пока не все задачи DONE/CANCELLED
- [ ] AC-6: После закрытия всех спринтов и задач — релиз можно выпустить
- [ ] AC-7: Выпущенный релиз (RELEASED) — нельзя добавить/убрать спринты
- [ ] AC-8: Все тесты зелёные (`make test`)
- [ ] AC-9: Lint проходит (`make lint`)

---

## 8. Оценка трудоёмкости

| Этап | Часы (оценка) |
|------|---------------|
| Анализ и план | 1 |
| Prisma migration + schema | 1 |
| Backend: новые эндпоинты + гарды | 3 |
| Frontend: спринты-панель + индикатор + guards | 3 |
| Тесты (unit + integration) | 2 |
| Code review + fixes | 1 |
| **Итого** | **11** |

---

## 9. Связанные задачи

- Родитель: нет (корневой EPIC)
- Дочерние: создать STORY + TASK в рамках EPIC
- Блокирует: нет
- Зависит от: Sprint 2 (спринты) — DONE ✅, Sprint 3 (релизы базовые) — DONE ✅

---

## 10. Иерархия задач

```
TTMP-140 [EPIC] Доработка функционала релизов
├── STORY: Связь Release ↔ Sprint (backend + migration)
│   ├── TASK: Prisma migration + schema update
│   ├── TASK: releases.service — addSprints, removeSprints, getReleaseSprints
│   ├── TASK: releases.router — новые эндпоинты /releases/:id/sprints
│   └── TASK: Гарды markReleaseReady + markReleaseReleased
└── STORY: UI — управление спринтами в релизе
    ├── TASK: api/releases.ts — новые функции
    ├── TASK: ReleasesPage — панель спринтов + модал добавления
    ├── TASK: ReleasesPage — индикатор прогресса готовности
    └── TASK: ReleasesPage — guard tooltips на кнопках
```
