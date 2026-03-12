# TaskTime MVP — Контекст проекта

## Что это

TaskTime — импортозамещение Jira для российского финансового сектора.
Конкуренты: Т1 Сфера, EVA, Diasoft.

## Текущее состояние (2026-03-11)

**Фаза:** Пересборка с нуля (v2). Старый прототип удалён.
**План:** утверждён в `docs/RU/REBUILD_PLAN_V2.md`
**Статус:** Sprints 1–3 ЗАВЕРШЕНЫ. В работе Sprint 4.

### Sprint 1 — DONE (2026-03-10)

Реализовано всё из плана (задачи 1.1–1.20):
- Backend skeleton: Express + TypeScript + Prisma 6
- Prisma schema: User, Project, Issue, Comment, AuditLog
- Auth module: register, login, refresh, logout, me (JWT + refresh tokens)
- Users module: CRUD, role management (RBAC)
- Projects module: CRUD с ключами (DEMO, BACK)
- Issues module: CRUD + иерархия (EPIC→STORY→TASK→SUBTASK, BUG) + статусы
- RBAC middleware (ADMIN, MANAGER, USER, VIEWER)
- Audit logging middleware
- Validation (Zod DTOs)
- Error handling middleware
- Frontend: Vite + React 18 + Ant Design 5 + React Router
- Login page, Dashboard, Projects list, Project detail + issues list
- Issue create/edit form
- Seed script (demo data: 4 пользователя, 2 проекта, 5 задач)
- Docker Compose (PostgreSQL 16 + Redis 7)
- Makefile: setup, dev, backend, frontend

**Запуск:** `make setup && make dev` → http://localhost:5173
**Аккаунты:** admin/manager/dev/viewer @tasktime.ru, пароль: password123

### Sprint 2 — DONE (2026-03-10)

Реализовано всё из плана Sprint 2 (2.1–2.10):
- Kanban Board API/UI: колонки по статусам, drag-n-drop, сохранение порядка и статуса задач.
- Sprints module API + UI: создание спринтов, старт/закрытие, перенос задач между бэклогом и спринтом, один ACTIVE спринт на проект.
- Time tracking API + UI: старт/стоп таймера, ручной ввод времени, страница `My Time`, логирование по задачам и пользователю.
- Comments API + UI: CRUD комментариев к задаче с проверкой прав, блок комментариев на странице задачи.
- Issue detail page: полная карточка задачи (поля, иерархия, связи, время, комментарии).
- Issue history: история изменений задачи из `audit_log` с привязкой к пользователю и действию.

## Решения из интервью (8 блоков)

### Блок 1: Продукт
- Jira Cut — минимальная замена Jira для финтеха
- 50-200 пользователей на старте, масштаб до 5000-6000

### Блок 2: Пользователи
- PM, тимлиды, разработчики, аналитики, CIO (viewer)

### Блок 3: Функциональность
- Задачи с иерархией: EPIC -> STORY -> TASK -> SUBTASK, BUG
- Kanban-доски, спринты (Scrum + Kanban)
- Учёт времени (таймер + ручной ввод)
- Отчёты и аналитика
- Комментарии к задачам

### Блок 4: Интеграции
- GitLab (webhook, автообновление статусов)
- Confluence (база знаний)
- Telegram-бот (нотификации)

### Блок 5: Безопасность
- RBAC: Admin, Manager, User, Viewer
- Audit log для всех мутаций
- ФЗ-152 (персональные данные)
- HTTPS + TLS 1.2+
- JWT с refresh tokens
- Будущее: KeyCloak / ALD Pro SSO, SIEM, DLP интеграция

### Блок 6: Техническая стратегия
- AI-агент (Claude/Cursor) как основной разработчик
- PO выступает как валидатор
- Тесты закладываем с нуля (Vitest + Supertest, 60%+ coverage)

### Блок 7: Deployment
- Текущее: VPS Ubuntu
- MVP: облако в изолированной среде (если ИБ допустит)
- Целевое: on-premise
- Целевые ОС: Astra Linux SE 1.7+, Red OS 7.3+
- БД: PostgreSQL 14+ (целевой 16) на Linux

### Блок 8: Приоритеты
- ТОП-3 для MVP: управление проектами/задачами, аналитика, AI-модуль
- Главные боли: юридические риски, legacy-кастом, разные флоу в командах
- Это определяет: гибкие workflow, конфигурируемые поля (в будущем)

## Утверждённый стек

| Слой | Технология |
|------|-----------|
| Language | TypeScript 5.x |
| Frontend | React 18 + Vite 6 + Ant Design 5 |
| State | Zustand |
| Backend | Node.js 20 LTS + Express 4 |
| ORM | Prisma 6 |
| Validation | Zod |
| Database | PostgreSQL 16 |
| Cache | Redis 7 |
| Auth | JWT + refresh tokens |
| Tests | Vitest + Supertest |
| Linting | ESLint + Prettier |
| CI | GitHub Actions |

## Архитектура

Модульный монолит. Backend: 11 модулей (auth, users, projects, issues, comments, boards, sprints, time, teams, audit, admin). Каждый модуль: router -> service -> Prisma. Модули НЕ импортируют repository друг у друга.

## Иерархия задач

| Тип | Родитель для | Дочерний для |
|-----|-------------|-------------|
| EPIC | STORY, TASK | — (верхний) |
| STORY | TASK, SUBTASK | EPIC |
| TASK | SUBTASK | EPIC, STORY |
| SUBTASK | — (нижний) | STORY, TASK |
| BUG | SUBTASK | EPIC, STORY |

Статусы: OPEN -> IN_PROGRESS -> REVIEW -> DONE / CANCELLED
Приоритеты: CRITICAL, HIGH, MEDIUM, LOW
Issue key: PROJECT_KEY-NUMBER (например PROJ-42)

## План спринтов

1. **Sprint 1:** Auth + Users + Projects + Issues (с иерархией) — фундамент
2. **Sprint 2:** Kanban Board + Sprints + Time tracking + Comments
3. **Sprint 3:** Teams + Admin + Reports + Redis
4. **Sprint 4:** AI (оценка трудоёмкости, декомпозиция) + Интеграции (GitLab, Telegram) + Polish

## Совместимость браузеров

Chrome 139+, Yandex Browser 25+, Edge 139+, Safari 18+

## Требования к ОС

- **Astra Linux SE 1.7+** — ФСТЭК, мандатный контроль, ЗПС
- **Red OS 7.3+** — RPM-based, в реестре РФ ПО
- **Ubuntu 22.04 LTS** — dev/staging
- Деплой: Docker или .deb/.rpm пакеты, systemd, работа за корпоративным прокси

## Очистка репо перед пересборкой

Удалить ВСЁ кроме: docs/, ТЗ_JIRA_CUT.txt, CLAUDE.md, .gitignore, .git/
Весь код создаётся заново по плану из docs/RU/REBUILD_PLAN_V2.md

## Ветка разработки

`claude/mvp-project-management-hdAvd`

## NFR

- API < 200ms (p95)
- Page load < 2s
- 2500+ concurrent sessions
- 1M+ objects in DB
- 60%+ test coverage

## Ход диалога (полный контекст чата 2026-03-09)

### Начало: Интервью по 8 блокам

PO (product owner) провёл серию вопрос-ответов по 8 блокам для уточнения scope MVP.

**Блок 1-2 (Продукт и пользователи):**
- Продукт — "Jira Cut", минимальная замена Jira для финсектора
- Целевая аудитория: PM, тимлиды, разработчики, аналитики. 50-200 человек, масштаб до 5000-6000
- Роли: admin, manager, user, viewer (CIO)

**Блок 3-4 (Функции и интеграции):**
- Иерархия задач: EPIC -> STORY -> TASK -> SUBTASK + BUG
- Kanban + Scrum (спринты)
- Учёт времени: таймер + ручной ввод
- Интеграции: GitLab webhook, Confluence, Telegram-бот
- Отчёты: задачи по статусам, по исполнителям, burn-down/burn-up

**Блок 5 (Безопасность):**
- RBAC с 4 глобальными ролями
- Audit log для всех мутаций (ФЗ-152 compliance)
- JWT + refresh tokens, HTTPS, bcrypt
- Будущее: KeyCloak/ALD Pro SSO, SIEM, DLP

**Блок 6 (Техстратегия):**
- Решение: пересборка с нуля (текущий прототип — vanilla JS монолит, ~4000 строк фронтенда)
- AI-агент как основной разработчик, PO как валидатор
- Вопрос TypeScript vs JavaScript — PO спросил "что в требованиях?" → в ТЗ JS, но рекомендация TS для нового проекта → принято

**Блок 7 (Deployment):**
- Текущее: VPS Ubuntu
- MVP: облако в изолированной среде (если ИБ допустит)
- Целевое: on-premise на Astra Linux SE 1.7+ / Red OS 7.3+
- PostgreSQL 14+ (целевой 16) на Linux

**Блок 8 (Приоритеты):**
- ТОП-3 для "готовности к использованию": управление проектами/задачами, аналитика, AI-модуль
- Главные боли заказчика: юридические риски, legacy-кастом в Jira, разные флоу в командах
- Конкуренты: Т1 Сфера, EVA, Diasoft

### Выбор стека

PO выбрал:
- ORM: **Prisma** (рекомендация принята)
- UI: **Ant Design** (рекомендация принята)
- Language: **TypeScript** (рекомендация принята, хотя в старом ТЗ был JS)
- DB: **PostgreSQL** (рекомендация принята) + **Redis** для кэша/сессий
- Frontend: **React 18 + Vite** (по аналогии с Atlassian стеком)
- State: **Zustand** (рекомендация)

Критерий выбора: "Подходящий под ТЗ Jira Cut и на базе мировых вендоров (Atlassian и пр.), также учитываем требования к импортозамещению в РФ"

### Создание плана

1. Создан `docs/RU/REBUILD_PLAN_V2.md` — 800+ строк, покрывает архитектуру, доменную модель, API, RBAC, 4 спринта, NFR
2. PO попросил "только план" (без кода) — план на ревью
3. PO попросил вывести план в чат (был не у компа)
4. PO попросил добавить Edge и Safari в браузеры — добавлено
5. PO попросил добавить требования к Astra Linux / Red OS — добавлено детально (10 пунктов + исключения для MVP)
6. PO подтвердил: в репо не должно остаться ничего от старого прототипа — обновлён раздел миграции
7. PO попросил проверить иерархию задач — проверена, соответствует ответам

### Sprint 3 — DONE (2026-03-11)

Реализовано всё из плана Sprint 3 (3.1–3.10):
- Teams module: управление командами, привязка пользователей к командам.
- Admin module: административные функции и настройки, связанные с управлением системой.
- Reports: базовые отчёты по задачам и времени (минимальный набор для MVP).
- Redis: доработка использования Redis в соответствии с планом (кэш, вспомогательные сценарии).

### Текущий статус (2026-03-11)

- Sprints 1–3 ЗАВЕРШЕНЫ и работают.
- Ветка: `claude/mvp-project-management-hdAvd`
- Старый прототип полностью удалён
- **Следующий шаг:** Sprint 4 (AI + интеграции + polish)

## Экономия токенов (Token Economy)

### Модели

| Уровень | Модель | Когда |
|---------|--------|-------|
| Lite | **Haiku 4.5** | Документация, поиск, коммиты, простые правки |
| Standard | **Sonnet 4.6** | Основная разработка, тесты, рефакторинг, code review |
| Heavy | **Opus 4.6** | Архитектура, ИБ-ревью, сложный дебаг, многомодульный рефакторинг |

**Целевое соотношение:** 70% Sonnet, 20% Haiku, 10% Opus.

### Правила для Claude Code CLI

- Точечные инструменты (Glob, Grep, Read, Edit) вместо Agent для простых задач
- Agent (Explore) — для исследования кодовой базы
- Plan mode — для задач Opus-уровня (экономит переделки)
- Параллельные tool calls — объединять независимые вызовы
- Не читать файлы повторно — запоминать ключевую информацию
- `/fast` — для итеративной работы (тот же Opus, быстрее)

### Правила для Cursor

- Tab/Inline Edit → Chat → Composer → Agent (от дешёвого к дорогому)
- `@file`/`@symbol` вместо копирования кода
- `@codebase` — только для архитектурных задач
- Максимум 5 файлов в контексте (Sonnet), 10 файлов (Opus)
- Закрывать ненужные вкладки

### Маршрутизация скиллов по моделям

Полные правила: `.cursor/rules/token-economy.mdc` и `.cursor/AGENTS.md`.

- `developer`, `tester`, `system-analyst` → **Sonnet** (default)
- `corporate-architect`, `infosec` → **Opus**
- `deploy-tasktime`, `docs-tasktime`, `tasktime-inbox` → **Haiku**
