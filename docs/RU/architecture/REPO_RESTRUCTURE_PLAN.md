# Flow Universe — План реструктуризации репозитория

**Назначение:** Целевая структура репозитория и перенос существующего кода без «большого взрыва».  
**Дата:** март 2025

---

## 1. Целевая структура (по фазам)

### Фаза 1 — Один артефакт развёртывания, модули в backend

Верхний уровень не трогаем; меняется только структура под `backend/` (см. docs/ENG/architecture/REPO_RESTRUCTURE_PLAN.md для дерева каталогов). Без `/apps` и `/packages`: один репозиторий, одно Node-приложение, одна папка frontend.

### Фаза 2 (опционально) — Монорепо apps/packages

Только при появлении потребности в общих TypeScript-типах или отдельном админ-приложении. Для MVP рекомендуется оставаться на **фазе 1**.

---

## 2. Фаза 1 — Детальная цель

Целевое дерево: `backend/server.js`, `db.js`, `config.js`, `shared/` (auth.js, audit.js, errors.js), `modules/` (auth, users, projects, issues, comments, boards, sprints, time, audit, admin с api.js, service.js, repository.js в каждом). Статику по-прежнему отдаёт server.js из `frontend/`.

---

## 3. Перенос существующего кода

### 3.1 Сначала общий код

- **shared/auth.js** — Вынести из server.js проверку JWT, authMiddleware, adminMiddleware, хелперы ролей. Экспорт middleware и хелперов.
- **shared/audit.js** — Перенести текущий `backend/audit.js` в `shared/audit.js`.
- **shared/errors.js** — Конструкторы ошибок с кодами статуса; глобальный обработчик в server.js отдаёт JSON.

### 3.2 По одному модулю

Порядок: auth → users → projects → tasks (включая task-items и task-links) → time → teams → admin (+ audit для чтения активности). business-functions — в отдельный маленький модуль или снять с API и описать в API.md.

Для каждого модуля: создать api.js (Router), service.js, repository.js; перенести обработчики из server.js; SQL — в репозиторий, права и оркестрация — в сервис; в server.js только подключение роутера.

### 3.3 Тонкий server.js

После миграции server.js: загрузка config, db, shared middleware; mount маршрутов модулей; раздача статики и SPA; глобальный обработчик ошибок; listen. Вся бизнес-логика в модулях.

### 3.4 Фронтенд

Фаза 1: структуру не меняем. При желании разбить app.html на несколько JS-файлов (например по фичам), подключаемых скриптами; точка входа та же.

---

## 4. Соответствие файлов

Текущие блоки server.js (auth, users, projects, tasks+task-items+task-links, time, product-teams, dashboard/admin, business-functions) → соответствующие модули в `modules/`. audit.js → shared/audit.js. db.js без изменений.

---

## 5. Снижение рисков

- Пошагово: один модуль за коммит/PR; при необходимости временно держать старый и новый маршрут.
- Тесты: минимальные интеграционные тесты на маршрут перед переносом; прогон после каждого шага.
- Откат: каждый шаг — рефакторинг без смены контракта БД; откат коммитом.
- Документация: обновлять docs/API.md и cursorrules при переносе маршрутов; синхронизировать DEPLOYMENT_STEPS.md.

Подробная структура и дерево каталогов — в docs/ENG/architecture/REPO_RESTRUCTURE_PLAN.md.
