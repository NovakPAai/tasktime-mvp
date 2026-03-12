# Sprints Tab Design (Global & Project)

## Goal

Показать планируемые, активные и закрытые спринты по всем проектам и в рамках одного проекта, с привязкой к трём типам команд (проектная, бизнес-функциональная, flow) и индикатором готовности спринта к запуску (по оценённым задачам).

## Domain Model Changes

- `Sprint` (Prisma):
  - Новые поля:
    - `projectTeamId String?` (проектная команда)
    - `businessTeamId String?` (бизнес-функциональная команда)
    - `flowTeamId String?` (flow-команда)
  - Новые связи:
    - `projectTeam Team? @relation("projectTeam", fields: [projectTeamId], references: [id])`
    - `businessTeam Team? @relation("businessTeam", fields: [businessTeamId], references: [id])`
    - `flowTeam Team? @relation("flowTeam", fields: [flowTeamId], references: [id])`
- `Issue` уже содержит `estimatedHours Decimal?` — используем для расчёта готовности спринта.

## Backend API

- Расширить `GET /api/projects/:projectId/sprints`:
  - `include`:
    - `project { id, name, key }`
    - `projectTeam { id, name }`
    - `businessTeam { id, name }`
    - `flowTeam { id, name }`
    - `issues { id, estimatedHours }`
  - Вернуть DTO:
    - все стандартные поля спринта
    - `project`, три команды
    - `stats`:
      - `totalIssues`
      - `estimatedIssues`
      - `planningReadiness` (процент задач с оценкой)
- Добавить глобальный endpoint `GET /api/sprints`:
  - Query-параметры: `state?`, `projectId?`, `teamId?`.
  - Возвращает такой же расширенный DTO.
- Обновить DTO:
  - `createSprintDto` / `updateSprintDto`:
    - добавить опциональные поля `projectTeamId`, `businessTeamId`, `flowTeamId` (строки/uuid, допускающие `null` для очистки).

## Frontend Types & API

- `frontend/src/types/index.ts`:
  - Расширить `Sprint`:
    - `project?: { id: string; name: string; key: string }`
    - `projectTeam?: Team`
    - `businessTeam?: Team`
    - `flowTeam?: Team`
    - `stats?: { totalIssues: number; estimatedIssues: number; planningReadiness: number }`
- `frontend/src/api/sprints.ts`:
  - Обновить сигнатуры `createSprint` / `updateSprint` для поддержки трёх `teamId`.
  - Добавить `listAllSprints(params)` → `GET /sprints` (глобальный список).

## UI: Global Sprints Tab

- Новый маршрут `/sprints` в `App.tsx` и пункт меню `Sprints` в `AppLayout`.
- Страница `GlobalSprintsPage`:
  - Фильтры:
    - Проект (Select по `Project`)
    - Состояние (Planned / Active / Closed / All)
    - Команда (по списку `Team`, опционально)
  - Три блока:
    - **Planned sprints**:
      - Карточки: проект, название спринта, три типа команд, даты, количество задач, прогресс-бар `planningReadiness`.
      - Клик открывает Drawer/панель с задачами и деталями.
    - **Active sprints**:
      - Те же данные + прогресс времени по датам.
    - **Closed sprints**:
      - Исторический список (минимум: проект, имя, даты, команды).

## UI: Project Sprints Tab

- Существующая страница `SprintsPage` (по маршруту `/projects/:id/sprints`):
  - Продолжает показывать:
    - список спринтов проекта
    - backlog задач и перенос задач в спринт.
  - Дополнительно:
    - в блоке "Sprint details" показывать:
      - три типа команд (если заданы)
      - `planningReadiness` для PLANNED спринтов (процент задач с оценкой).
    - в модалке создания/редактирования спринта:
      - Select'ы для:
        - Проектная команда
        - Бизнес-функциональная команда
        - Flow-команда

## Planning Readiness & Time Lock

- Готовность спринта к запуску:
  - `totalIssues = count(issues)`
  - `estimatedIssues = count(issues where estimatedHours != null)`
  - `planningReadiness = totalIssues === 0 ? 0 : round(estimatedIssues / totalIssues * 100)`
- Время спринта (lock / прогресс):
  - Используем существующие `startDate` / `endDate` для расчёта прогресса времени (как сейчас делается в `SprintsPage`).

