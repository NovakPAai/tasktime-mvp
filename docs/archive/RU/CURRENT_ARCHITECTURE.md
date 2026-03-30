# Flow Universe MVP — Текущая архитектура

**Назначение документа:** Снимок существующей кодовой базы для миграции и предложения по архитектуре.  
**Дата:** март 2025

---

## 1. Стек (сводка)

| Слой | Технология | Примечания |
|------|------------|------------|
| **Бэкенд** | Node.js (≥18) + Express 4.x | Один процесс, без фреймворка поверх Express |
| **БД** | PostgreSQL | Через драйвер `pg`, без ORM |
| **API** | REST | JSON запрос/ответ, без префикса версии |
| **Аутентификация** | JWT (Bearer + HttpOnly cookie) | bcryptjs для паролей, jsonwebtoken |
| **Фронтенд** | Vanilla HTML/CSS/JS | Без сборки, без React/Vue/Svelte |
| **Состояние (фронт)** | Нет (ad-hoc) | DOM + глобальные переменные, токен в `localStorage` |
| **Инфраструктура** | Ubuntu VPS, Nginx, systemd | Один сервер, Node отдаёт API и статику |

---

## 2. Бэкенд

- **Точка входа:** `backend/server.js` — один файл (~860 строк) со всеми маршрутами, middleware и бизнес-логикой.
- **Доступ к БД:** `backend/db.js` — `pg.Pool` с `query(text, params)` и `getClient()` для транзакций.
- **Аудит:** `backend/audit.js` — `audit({ userId, action, entityType, entityId, level, details, req })` пишет в `audit_log`.
- **Схема:** `backend/schema.sql` — идемпотентный DDL (CREATE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS); применяется через `scripts/init-db.js`.
- **Без ORM:** Только сырой SQL; нет Prisma, TypeORM, Knex, Sequelize.

**Стиль API:** REST. Все эндпоинты под `/api/*`. Авторизация обязательна кроме `/api/auth/register`, `/api/auth/login`, `/health`. Нет OpenAPI/Swagger; описание в `docs/API.md`.

---

## 3. Фронтенд

- **Точки входа:** `frontend/index.html` (вход), `frontend/app.html` (основное SPA), `frontend/admin.html` (админ-панель).
- **Основное приложение:** `app.html` — один файл (~2200 строк) с инлайн CSS и JS: маршрутизация по hash или видимости секций, `apiFetch(path, options)` для всех вызовов API, токен из `localStorage` + `Authorization: Bearer`, `credentials: 'include'` для cookie.
- **Без сборки:** Нет Vite, Webpack, npm-скриптов для фронта; статика отдаётся Express из `frontend/`.
- **Состояние:** Нет Redux/Zustand/Context; данные подгружаются по виду (например `loadTasks()`, `apiFetch('/api/dashboard/main')`) и хранятся в переменных уровня модуля; UI обновляется прямым изменением DOM.

---

## 4. База данных

- **СУБД:** PostgreSQL (16 в текущем деплое).
- **Подключение:** Пул в `db.js`; переменные: `PG_HOST`, `PG_PORT`, `PG_DATABASE`, `PG_USER`, `PG_PASSWORD`.
- **Миграции:** Нет раннера миграций; схема развивается добавлением идемпотентного SQL в `schema.sql` (например `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project_id ...`). Обратная совместимость в коде (например fallback-запросы при отсутствии колонки `project_id`).

**Таблицы (текущие):**

- `users` — id, email, password_hash, name, role, is_blocked, created_at, updated_at
- `tasks` — плоские задачи; id, title, description, type, priority, status, assignee_id, creator_id, estimated_hours, project_id, created_at, updated_at
- `time_logs` — task_id, task_item_id (опционально), user_id, started_at, ended_at, duration_minutes
- `audit_log` — user_id, action, entity_type, entity_id, level, details (JSONB), ip, user_agent, created_at
- `projects` — id, name, description, project_type, business_goal, budget, planned_revenue, owner_id, status, created_at, updated_at
- `product_teams` — id, name, description, lead_id, status, created_at
- `product_team_members` — team_id, user_id, role (PK)
- `business_functions` — id, name, description, created_at
- `task_items` — иерархия (epic/story/subtask); id, parent_id, level, order_index, title, description, acceptance_criteria, context_type, context_id, type, priority, status, story_points, estimated_hours, assignee_id, creator_id, reviewer_id, created_at, updated_at
- `task_item_links` — task_id, task_item_id, link_type (связь плоских `tasks` с `task_items`)

---

## 5. Реализация аутентификации

- **Регистрация:** POST `/api/auth/register` — email, password, name [, role]; возвращает user + JWT.
- **Вход:** POST `/api/auth/login` — email, password; устанавливает HttpOnly cookie (`tasktime_token`) и возвращает user + token. Заблокированные получают 403.
- **Проверка:** Middleware читает `Authorization: Bearer <token>` или cookie; проверяет JWT; устанавливает `req.user = { id, email, role }`.
- **Роли:** admin, super-admin, manager, cio, viewer, user. RBAC: user видит только свои/назначенные задачи; admin/manager — полный CRUD; cio/viewer — только чтение; super-admin — управление учётками админов.
- **Имперсонация:** POST `/api/auth/impersonate` (только admin/super-admin) возвращает короткоживущий токен другого пользователя.

---

## 6. Предположения по инфраструктуре

- **Деплой:** Клонирование репозитория на сервер, запуск из `backend/` (например `node server.js` или `node --watch server.js`); Nginx как обратный прокси к Node; systemd-юнит для процесса.
- **Статика:** Express отдаёт `/`, `/app`, `/admin` и файлы из `frontend/` (отдельный CDN в текущих документах не описан).
- **БД:** PostgreSQL на том же хосте или доступном хосте; реплики чтения и пулер соединений (например PgBouncer) в документации не описаны.
- **Секреты:** `.env` (JWT_SECRET, PG_* и т.д.); в репозиторий не попадают.

---

## 7. Текущая архитектура (высокий уровень)

```
                    ┌─────────────────────────────────────────┐
                    │              Nginx (обратный прокси)     │
                    └─────────────────────┬───────────────────┘
                                          │
                    ┌─────────────────────▼───────────────────┐
                    │  Node.js (Express) — backend/server.js   │
                    │  • REST /api/*                          │
                    │  • Раздача frontend/* (/, /app, /admin)  │
                    │  • JWT + cookie auth                    │
                    └─────────────────────┬───────────────────┘
                                          │
         ┌───────────────────────────────┼───────────────────────────────┐
         │                               │                               │
         ▼                               ▼                               ▼
  ┌──────────────┐              ┌──────────────┐              ┌──────────────┐
  │  db.js       │              │  audit.js    │              │  frontend/    │
  │  pg.Pool     │              │  audit_log   │              │  *.html      │
  └──────┬───────┘              └──────┬───────┘              └──────────────┘
         │                             │
         ▼                             ▼
  ┌──────────────────────────────────────────┐
  │           PostgreSQL                     │
  │  users, tasks, time_logs, audit_log,     │
  │  projects, product_teams, task_items, …  │
  └──────────────────────────────────────────┘
```

**Характеристики:**

- **Монолит:** Один процесс Node; весь API и статика в одном приложении.
- **Нет границ модулей:** Маршруты, проверки прав и SQL в `server.js`; общие хелперы в `db.js` и `audit.js`.
- **Двойная модель задач:** Плоские `tasks` (с опциональным project_id) и иерархические `task_items` (epic → story → subtask), связанные через `task_item_links`; API отдаёт оба типа, часть сценариев использует оба (например «создать стори из задачи»).
- **Идемпотентная схема:** Один `schema.sql` с условным DDL; нет версионированной истории миграций.

---

## 8. Техдолг и риски (кратко)

- **Бэкенд в одном файле:** Сложно ориентироваться и тестировать; любое изменение затрагивает один большой файл.
- **Нет ORM/слоя запросов:** Сырой SQL и ручные fallback при отсутствии колонок повышают риск несогласованности и усложняют рефакторинг.
- **Монолит фронтенда:** Один большой HTML-файл; нет компонентов и общего состояния; сложно масштабировать UI и подключать AI/разработчиков.
- **Нет организаций:** Мультитенантность не заложена; все пользователи/проекты/команды в одном глобальном пространстве.
- **Нет Jira-подобных сущностей:** Нет первых граждан — досок, колонок, спринтов, комментариев, меток; статус/тип — свободная строка или enum в коде.
- **Нет версионирования API:** Ломающие изменения затронут всех клиентов.
- **Деплой:** Нет контейнеризации (Docker) и описанного CI/CD; ручные шаги в DEPLOY.md.

Этот документ — базовая линия для предложения по архитектуре и плана миграции.
