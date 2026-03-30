# Изменения Claude (сводка) — март 2026

Сводка всех изменений, внесённых Claude в репозиторий Flow Universe MVP: описание, затронутые файлы и статус готовности.

**Ветка:** `claude/mvp-project-management-hdAvd`  
**Состояние:** впереди origin на 1 коммит + неотслеживаемые файлы (новые и изменённые).

---

## 1. Backend: GitLab Webhooks

### Описание

Добавлен приём webhook-событий от GitLab для автоматического обновления статусов задач по ключам (например `DEMO-42`).

- **Push** в ветку с ключом задачи → статус **IN_PROGRESS**
- **Merge request открыт** → **REVIEW**
- **Merge request влит** → **DONE**
- **Pipeline** (опционально) — поддержка в роутере; при успешном пайплайне можно обновлять задачу и/или добавлять комментарий

Реализация: валидация payload через Zod (DTO в `webhooks.dto.ts`), проверка секрета `X-Gitlab-Token`, обновление Issue по ключу проекта и номера, запись в `audit_log` с `source: 'GITLAB'`.

### Файлы

| Файл | Статус |
|------|--------|
| `backend/src/modules/webhooks/webhooks.router.ts` | Новый |
| `backend/src/modules/webhooks/webhooks.dto.ts` | Новый |
| `backend/src/modules/webhooks/gitlab.service.ts` | Новый |
| `backend/src/modules/integrations/gitlab/gitlab.router.ts` | Новый |
| `backend/src/modules/integrations/gitlab/gitlab.service.ts` | Новый |
| `backend/src/app.ts` | Изменён (подключён только `webhooksRouter`) |
| `backend/src/config.ts` | Изменён (`GITLAB_WEBHOOK_SECRET`, `GITLAB_SYSTEM_USER_ID`) |
| `backend/.env.example` | Изменён (переменные GitLab) |
| `deploy/env/backend.production.env.example` | Изменён |
| `deploy/env/backend.staging.env.example` | Изменён |

### Эндпоинт

- В приложении зарегистрирован только **webhooks**-роутер:  
  **`POST /api/webhooks/gitlab`**  
  (роутер `integrations/gitlab` в `app.ts` не монтируется — либо мёржить с webhooks, либо добавить отдельно, если нужен URL из документации).

### Документация

- `docs/integrations/GITLAB_WEBHOOK.md` — пошаговая инструкция для настройки webhook в GitLab. В документе указан URL вида `/api/integrations/gitlab/webhook`; фактический рабочий URL при текущем подключении роутеров: **`/api/webhooks/gitlab`**. Рекомендуется либо привести документ в соответствие с кодом, либо смонтировать `integrations/gitlab` и оставить оба пути.

### Готовность

| Критерий | Статус |
|----------|--------|
| Роут зарегистрирован | ✅ `/api/webhooks/gitlab` |
| Валидация payload (Zod) | ✅ |
| Секрет (X-Gitlab-Token) | ✅ опционально через `GITLAB_WEBHOOK_SECRET` |
| Обновление статусов + audit | ✅ |
| Документация | ✅ (с расхождением URL см. выше) |
| Юнит-тесты | ❌ не добавлены |

---

## 2. Backend: Bootstrap и seed

### Описание

- **Bootstrap:** включение только при `BOOTSTRAP_ENABLED=true`; пароль из `BOOTSTRAP_DEFAULT_PASSWORD`; опциональный дополнительный админ через `BOOTSTRAP_OWNER_ADMIN_EMAIL` (добавляется как «Owner Admin»); из константы убран жёстко прописанный пользователь `novak.pavel@tasktime.ru`.
- **Seed:** доработки для демо-данных (судя по diff — расширение набора данных/сценариев).
- **Prod-sync:** добавлен скрипт `backend/src/prisma/prod-sync.ts` для синхронизации данных prod → dev (проект TTMP, issues, time logs, AI sessions и т.д.).

### Файлы

| Файл | Статус |
|------|--------|
| `backend/src/prisma/bootstrap.ts` | Изменён |
| `backend/src/prisma/seed.ts` | Изменён |
| `backend/src/prisma/prod-sync.ts` | Новый |
| `backend/tests/bootstrap.test.ts` | Изменён |
| `backend/tests/seed.test.ts` | Новый |

### Готовность

| Критерий | Статус |
|----------|--------|
| Bootstrap по флагу и паролю | ✅ |
| Owner admin через env | ✅ |
| Тесты bootstrap | ✅ обновлены |
| Тесты seed | ✅ добавлены |
| Prod-sync | ✅ код есть; запуск/документация — по необходимости |

---

## 3. Frontend: логин и стили

### Описание

- **LoginPage:** переработан UI — звёздный canvas, туманности, орбиты, отдельная визуальная система «MOEX Flow Universe» (Syne, акцент `#6b5cf6`), табы Login/Register.
- **Стили:** значительное расширение `frontend/src/styles.css` — переменные (`--bg`, `--acc`, `--t1`–`--t4`, статусы, типографика, тени, сетка отступов), оболочка приложения, сайдбар, топбар, стат-карточки, панели, пилли, аватары, экран логина.
- **index.html:** правки под новый дизайн (мета, заголовок и т.п., если менялись).

### Файлы

| Файл | Статус |
|------|--------|
| `frontend/src/pages/LoginPage.tsx` | Изменён |
| `frontend/src/styles.css` | Изменён |
| `frontend/index.html` | Изменён |

### Готовность

| Критерий | Статус |
|----------|--------|
| Логин/регистрация работают | ✅ (предполагается; при необходимости — ручная проверка) |
| Визуальная система описана | ✅ в правилах (ui-kit, frontend-layout) |
| Адаптив/доступность | ⚠️ по желанию проверить отдельно |

---

## 4. Cursor rules и планирование

### Описание

- Правила для агента: раскладка страниц (`frontend-layout.mdc`), UI-кит и визуальная система (`ui-kit.mdc`).
- Планы и дизайны в `docs/plans/`: спринт-дроэр, табы команд, юнит-тесты бэкенда, bootstrap hardening, prod-to-dev sync и My Time, превью задачи в спринте и т.д.
- Задача в очереди: смена пароля пользователя (todo в `.planning/todos/pending/`).

### Файлы

| Категория | Файлы |
|-----------|--------|
| Rules | `.cursor/rules/frontend-layout.mdc`, `.cursor/rules/ui-kit.mdc` |
| Планы | `docs/plans/2026-03-12-*.md`, `docs/plans/2026-03-13-*.md` |
| Todo | `.planning/todos/pending/2026-03-13-add-user-password-change-flow.md` |

### Готовность

| Критерий | Статус |
|----------|--------|
| Правила применимы к текущему коду | ✅ |
| Планы — основа для следующих спринтов | ✅ |
| Password change flow | 📋 в очереди, не реализован |

---

## 5. Прочее

- **CLAUDE.md:** обновлён (CI/CD, секреты, bootstrap, актуальное состояние проекта).
- **E2E/тесты:** в репозитории есть `frontend/e2e-report/`, `frontend/test-results/.last-run.json` — артефакты прогонов, к сводке изменений Claude относятся только как к среде (не к новому функционалу).

---

## 6. Сводная таблица готовности

| Область | Готовность | Замечания |
|--------|------------|-----------|
| GitLab Webhooks | Готово к использованию | Нет юнит-тестов; в доке URL `/api/integrations/gitlab/webhook` vs факт `/api/webhooks/gitlab` |
| Bootstrap/Seed/Prod-sync | Готово | Prod-sync — при необходимости описать запуск в deploy/docs |
| Логин + стили (MOEX Flow) | Готово | Проверить вручную логин/регистрацию и адаптив |
| Cursor rules и планы | Готово | Password change — отдельная задача в очереди |

---

## 7. Рекомендуемые следующие шаги

1. **Webhooks:** привести `docs/integrations/GITLAB_WEBHOOK.md` в соответствие с фактическим URL (`/api/webhooks/gitlab`) или смонтировать `integrations/gitlab` и зафиксировать в доке оба варианта.
2. **Webhooks:** добавить юнит-тесты на `webhooks.dto`, `webhooks.router` и `gitlab.service` (handlePush / handleMergeRequest / handlePipeline).
3. **Password change:** реализовать по задаче в `.planning/todos/pending/2026-03-13-add-user-password-change-flow.md`.
4. При необходимости: кратко описать в документации деплоя использование prod-sync и переменных bootstrap (BOOTSTRAP_ENABLED, BOOTSTRAP_OWNER_ADMIN_EMAIL, BOOTSTRAP_DEFAULT_PASSWORD).

---

*Документ сформирован автоматически по состоянию репозитория и просмотру изменённых/новых файлов.*
