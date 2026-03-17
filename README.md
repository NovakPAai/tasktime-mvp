# TaskTime MVP

Документ для передачи коллегам: что уже реализовано в MVP, как устроена инфраструктура, как запустить систему и какая бизнес-логика работает на текущий момент.

---

## 1) Что это за проект

**TaskTime MVP** — веб-приложение для:

- постановки задач;
- назначения исполнителей;
- учёта времени по задачам (старт/стоп таймера);
- просмотра персонального отчёта по времени.

Проект состоит из:

- **Backend**: Node.js + Express + PostgreSQL (REST API + статика);
- **Frontend**: SPA без сборки (один `frontend/index.html` с JS/CSS);
- **Infra**: VPS (Ubuntu), Nginx, systemd, PostgreSQL, UFW.

---

## 2) Текущий статус MVP (по факту в коде)

### Уже реализовано

- JWT-аутентификация (`/api/auth/login`, `/api/auth/register`);
- роли `admin`, `manager`, `user`;
- CRUD по задачам;
- таймеры и журнал времени (`time_logs`);
- отчёты во фронтенде:
  - по дням;
  - по задачам;
- журнал аудита (`audit_log`) по ключевым действиям;
- опциональный webhook при создании задачи (`PIXEL_OFFICE_WEBHOOK_URL`);
- готовые скрипты для первичного деплоя на Ubuntu.

### Не в объёме текущего MVP

- проекты/пространства, релизы, burn-down/up;
- Keycloak/SSO;
- плагинная архитектура;
- отдельный штатный коннектор в SIEM/DLP (есть база событий, но не готовый транспортный модуль).

См. также: `docs/ROADMAP_TZ.md`.

---

## 3) Архитектура (сверху вниз)

1. **Клиент (браузер)** открывает веб-страницу TaskTime.
2. **Nginx** принимает HTTP/HTTPS-трафик и проксирует в Node.js.
3. **Express-приложение**:
   - отдаёт frontend-статику;
   - обрабатывает API `/api/*`;
   - пишет аудит в БД.
4. **PostgreSQL** хранит пользователей, задачи, логи времени и аудит.

Ключевой поток:

`Browser -> Nginx -> Express API -> PostgreSQL`

---

## 4) Структура репозитория

```text
.
├── backend/
│   ├── server.js           # REST API + раздача frontend
│   ├── db.js               # пул подключений PostgreSQL
│   ├── audit.js            # helper для audit_log
│   ├── schema.sql          # актуальная схема БД (idempotent)
│   ├── scripts/
│   │   ├── init-db.js      # применить schema.sql
│   │   └── seed.js         # заполнить демо и командные учётки
│   └── .env.example
├── frontend/
│   └── index.html          # SPA интерфейс (без отдельного build step)
├── docs/
│   ├── API.md
│   ├── USER_GUIDE.md
│   ├── ADMIN_GUIDE.md
│   └── ROADMAP_TZ.md
├── scripts/
│   └── setup-script.sh     # первичная настройка VPS
├── DEPLOY.md
├── DEPLOYMENT_STEPS.md
└── ACCOUNTS.md
```

---

## 5) Инфраструктура MVP

Целевой контур деплоя (по текущим скриптам/инструкциям):

- **OS**: Ubuntu (VPS, Timeweb Cloud);
- **Node.js**: 20.x (в setup-скрипте);
- **DB**: PostgreSQL;
- **Reverse proxy**: Nginx;
- **Process manager**: systemd unit `tasktime.service`;
- **Firewall**: UFW;
- **TLS tooling**: certbot (подготовлен, TLS настраивается отдельно).

Ключевые документы по инфраструктуре:

- `DEPLOY.md` — полноценная пошаговая инструкция;
- `DEPLOYMENT_STEPS.md` — краткое объяснение для отчёта/нетеха;
- `docs/ADMIN_GUIDE.md` — эксплуатация и безопасность.

---

## 6) Переменные окружения

Источник: `backend/.env.example` + эксплуатационные гайды.

| Переменная | Назначение |
|---|---|
| `PG_HOST`, `PG_PORT`, `PG_DATABASE`, `PG_USER`, `PG_PASSWORD` | подключение к PostgreSQL |
| `JWT_SECRET` | секрет подписи JWT |
| `JWT_EXPIRES_IN` | срок жизни токена (по умолчанию `7d`) |
| `PORT` | порт backend (по умолчанию `3000`) |
| `PIXEL_OFFICE_WEBHOOK_URL` | опциональный webhook на создание задачи |

---

## 7) Локальный запуск (для разработки/демо)

Требования:

- Node.js >= 18 (в `package.json`);
- PostgreSQL с созданной БД `tasktime`.

Шаги:

```bash
cd backend
cp .env.example .env
npm install
npm run init-db
npm run seed
npm start
```

Далее открыть: `http://localhost:3000`

---

## 8) Production-логика запуска и обновлений

### Первичное развёртывание

1. Подготовка VPS: `scripts/setup-script.sh`.
2. Клонирование репозитория в `/home/tasktime/app`.
3. Установка зависимостей в `backend`.
4. Применение `backend/schema.sql`.
5. Инициализация демо/командных пользователей (`/home/tasktime/init-db.sh`).
6. Запуск `tasktime.service`.

Подробно и с командами: `DEPLOY.md`.

### Обновления

- `git pull`
- `npm install` (в `backend`)
- при необходимости повторно применить `schema.sql`
- `systemctl restart tasktime`

---

## 9) Модель данных (текущая)

См. `backend/schema.sql`.

Основные таблицы:

1. `users`
   - email, password_hash, name, role.
2. `tasks`
   - title, description, type, priority, status;
   - assignee_id -> users;
   - creator_id -> users;
   - estimated_hours.
3. `time_logs`
   - task_id -> tasks;
   - user_id -> users;
   - started_at, ended_at, duration_minutes.
4. `audit_log`
   - user_id, action, entity_type, entity_id, level, details, ip, user_agent.

Индексы на основные поля уже созданы (`tasks`, `time_logs`, `audit_log`).

---

## 10) Текущая логика системы (MVP)

### 10.1 Аутентификация и сессия

- Логин: `POST /api/auth/login` (email + password).
- Регистрация: `POST /api/auth/register`.
- После логина фронтенд хранит `token` и профиль пользователя в `localStorage`.
- Все защищённые запросы идут с `Authorization: Bearer <JWT>`.

### 10.2 Роли и доступ к задачам

- `admin` и `manager`: полный доступ ко всем задачам.
- `user`: доступ только к задачам, где он:
  - автор (`creator_id`), или
  - исполнитель (`assignee_id`).

Проверка прав реализована на backend (в `server.js`).

### 10.3 Задачи

- Создание задачи: обязательное поле `title`.
- Поля задачи в MVP: `title`, `description`, `type`, `priority`, `status`, `assignee_id`, `estimated_hours`.
- Статусы, используемые во фронтенде:
  - `open` (к выполнению),
  - `in_progress` (в работе),
  - `done` (готово).

### 10.4 Таймер и учёт времени

- `POST /api/tasks/:id/time/start` — старт таймера;
- `POST /api/tasks/:id/time/stop` — стоп и фиксация длительности;
- `GET /api/time-logs` — записи текущего пользователя;
- `GET /api/tasks/:id/time-logs` — записи по задаче (с проверкой прав).

Фронтенд дополнительно:

- показывает активный таймер в хедере;
- сохраняет его состояние в `localStorage` между перезагрузками страницы;
- в UI одновременно ведёт один активный таймер.

### 10.5 Отчётность

В разделе "Отчёт по времени":

- агрегирование по дням;
- агрегирование по задачам;
- источник данных: `/api/time-logs` текущего пользователя.

### 10.6 Аудит и SIEM-ready часть

При ключевых событиях (логин, регистрация, CRUD задач, старт/стоп таймера) пишется запись в `audit_log`.

Это обеспечивает базу для передачи событий в SIEM:

- уже есть структура событий в БД;
- отсутствует отдельный готовый экспортёр/стример "из коробки" (делается отдельным модулем).

### 10.7 Интеграционный webhook

Если задан `PIXEL_OFFICE_WEBHOOK_URL`, при создании задачи backend отправляет POST с payload события `task.created`.

---

## 11) Аккаунты для входа

Готовые пользователи (демо + команда) заданы в:

- `backend/scripts/seed.js`
- `ACCOUNTS.md`

Быстрый вход для демо:

- `alice@demo.com / demo123` (admin)
- `eve@demo.com / demo123` (manager)
- остальные demo — `user`.

---

## 12) Наблюдаемость и эксплуатация

Полезные команды:

```bash
# статус сервиса
sudo systemctl status tasktime

# поток логов приложения
sudo journalctl -u tasktime -f

# health-check API
curl http://localhost:3000/health
```

Резервное копирование:

```bash
sudo -u postgres pg_dump -Fc tasktime > /backup/tasktime_$(date +%Y%m%d).dump
```

---

## 13) Ограничения и риски текущего MVP

1. **HTTPS/TLS** нужно обязательно довести в прод-контуре (по умолчанию в примере доступ есть по HTTP).
2. **Регистрация** принимает поле `role`; для боевого режима нужно ограничить выдачу ролей (например, только `user`).
3. **Миграции** как отдельный процесс отсутствуют — используется повторное применение `schema.sql`.
4. **Frontend** монолитный (один HTML-файл), без сборки/тестов и без разделения по модулям.
5. **SIEM/DLP интеграция** не завершена: есть только хранилище и структура событий.
6. **setup-script** даёт БД-пользователю `taskuser` права superuser — для production это стоит ужесточить.

---

## 14) Чек-лист передачи коллегам

Перед передачей убедиться, что:

- [ ] есть доступ к серверу (SSH) и репозиторию;
- [ ] передан актуальный `.env` (без публикации в git);
- [ ] известны команды деплоя/обновления (`DEPLOY.md`);
- [ ] проверены логин, создание задачи, старт/стоп таймера, отчёт;
- [ ] выполнен health-check `/health`;
- [ ] описаны контакты/процедура на случай инцидента (кто перезапускает сервис, где смотреть логи, где бэкапы).

---

## 15) Полезные ссылки внутри репозитория

- API контракт: `docs/API.md`
- Гайд пользователя: `docs/USER_GUIDE.md`
- Гайд администратора: `docs/ADMIN_GUIDE.md`
- Развёртывание: `DEPLOY.md`
- Учётные записи: `ACCOUNTS.md`
- Roadmap после MVP: `docs/ROADMAP_TZ.md`

