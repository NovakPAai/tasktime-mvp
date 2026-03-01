# Учётные записи TaskTime

## Формат входа

- **Логин** — это **email** (адрес почты в латинице).
- **Пароль** — задаётся при создании учётки; можно сменить позже через функционал приложения (если будет реализован).

Имена в системе хранятся в латинице (Pavel, Olesya и т.д.) для единообразия и совместимости.

---

## Демо-пользователи (для тестов)

| Имя (в системе) | Логин (email)      | Пароль  | Роль    |
|-----------------|--------------------|--------|---------|
| Alice Johnson   | alice@demo.com     | demo123 | admin   |
| Bob Smith       | bob@demo.com       | demo123 | user    |
| Carol Williams  | carol@demo.com     | demo123 | user    |
| Dave Brown      | dave@demo.com      | demo123 | user    |
| Eve Davis       | eve@demo.com       | demo123 | manager |
| Frank Miller    | frank@demo.com     | demo123 | user    |
| Grace Wilson    | grace@demo.com     | demo123 | user    |
| Henry Moore     | henry@demo.com     | demo123 | user    |
| Iris Taylor     | iris@demo.com      | demo123 | user    |
| Jack Anderson   | jack@demo.com      | demo123 | user    |

---

## Учётки команды (Павел, Георгий, Олеся, Андрей, Антон)

| Имя (оригинал) | Имя в системе (латиница) | Логин (email)           | Пароль   | Роль  |
|----------------|--------------------------|--------------------------|----------|-------|
| Павел          | Pavel                    | pavel@tasktime.demo      | tasktime24 | admin |
| Георгий        | Georgiy                  | georgiy@tasktime.demo    | tasktime24 | user  |
| Олеся          | Olesya                   | olesya@tasktime.demo     | tasktime24 | user  |
| Андрей         | Andrey                   | andrey@tasktime.demo     | tasktime24 | cio   |
| Антон          | Anton                    | anton@tasktime.demo      | tasktime24 | user  |

**Пароль у всех учёток команды:** `tasktime24`  
(при первом входе можно сменить, если в приложении будет реализована смена пароля).

---

## Как создаются учётки

Учётные записи создаются скриптом при деплое (или вручную на сервере командой `sudo -u tasktime /home/tasktime/init-db.sh`). Список пользователей и пароли заданы в коде: `backend/scripts/seed.js`. Чтобы добавить или изменить пользователей, нужно отредактировать этот файл и заново выполнить скрипт на сервере (или добавить в приложение регистрацию/управление пользователями).

---

## Роли

- **admin** — полный доступ (по текущей схеме).
- **manager** — расширенные права (если будут разграничения).
- **user** — обычный пользователь (создание задач, учёт времени по себе и назначенным задачам).

*Детали проверки ролей в API описаны в backend/README.md.*
