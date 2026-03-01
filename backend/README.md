# TaskTime Backend

API для таск-трекера: задачи (CRUD), учёт времени (старт/стоп таймер), JWT-авторизация.

## Установка

```bash
cd backend
npm install
```

## Переменные окружения

Скопируйте `.env.example` в `.env` и задайте значения:

- `PG_HOST`, `PG_PORT`, `PG_DATABASE`, `PG_USER`, `PG_PASSWORD` — подключение к PostgreSQL
- `JWT_SECRET` — секрет для подписи JWT (в продакшене обязательно свой)
- `PORT` — порт сервера (по умолчанию 3000)

## База данных

1. Создайте БД: `createdb tasktime` (или через клиент).
2. Применить схему: `npm run init-db`
3. Добавить 10 демо-пользователей: `npm run seed`

Пароль всех демо-пользователей: **demo123**

Демо-пользователи: alice@demo.com, bob@demo.com, carol@demo.com, dave@demo.com, eve@demo.com, frank@demo.com, grace@demo.com, henry@demo.com, iris@demo.com, jack@demo.com.

## Запуск

```bash
npm start          # production
npm run dev        # с автоперезапуском
```

## API

- **POST** `/api/auth/register` — регистрация (body: email, password, name[, role])
- **POST** `/api/auth/login` — вход (body: email, password) → возвращает `token`
- **GET** `/api/tasks` — список задач (query: assignee_id, status, creator_id). Заголовок: `Authorization: Bearer <token>`
- **POST** `/api/tasks` — создать задачу
- **GET** `/api/tasks/:id` — одна задача
- **PUT** `/api/tasks/:id` — обновить задачу
- **DELETE** `/api/tasks/:id` — удалить задачу
- **POST** `/api/tasks/:id/time/start` — старт таймера
- **POST** `/api/tasks/:id/time/stop` — стоп таймера
- **GET** `/api/tasks/:id/time-logs` — записи времени по задаче
- **GET** `/api/time-logs` — мои записи времени (query: task_id)

Все маршруты кроме `/api/auth/*` и `/health` требуют заголовок `Authorization: Bearer <JWT>`.
