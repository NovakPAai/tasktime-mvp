# Как работает документация в Flow Universe

> Для новых контрибьюторов · Last updated: 2026-03-26

---

## TL;DR

**Большинство документации обновляется сама.** Тебе нужно обновить вручную только то, что описывает _поведение_ (user manual, интеграции, гайды).

---

## Что обновляется автоматически

После каждого **мёрджа в `main`** GitHub Actions запускает генераторы из `scripts/generate-docs.js`:

| Изменил | Обновится само | Куда |
|---------|---------------|------|
| `*.router.ts` | Таблица всех API эндпоинтов | `docs/api/reference.md` |
| `schema.prisma` | Все модели, поля, enum | `docs/architecture/data-model.md` |
| `backend/src/app.ts` | Список модулей и префиксов | `docs/architecture/backend-modules.md` |
| `frontend/src/App.tsx` | Таблица роутов + авторизация | `docs/architecture/frontend-architecture.md` |
| `frontend/src/store/*.ts` | Zustand stores (стейт + экшены) | `docs/architecture/frontend-architecture.md` |
| `backend/src/shared/features.ts` | Feature flags | `docs/architecture/overview.md` |
| `.env.example` | Переменные окружения | `docs/guides/getting-started.md` |
| `Makefile` | Все make-команды | `docs/guides/getting-started.md` |
| `docker-compose.yml` | Сервисы, порты, образы | `docs/guides/getting-started.md` |
| Любой коммит | Changelog по авторам | `docs/CHANGELOG.md` |

Бот сделает коммит `chore: auto-update docs [skip ci]` — CI не запускается повторно.

---

## Что нужно обновить вручную

Ремайндер появится прямо в чате Claude Code / комментарии GitHub при открытии PR:

| Изменил | Обнови руками |
|---------|-------------|
| `frontend/src/pages/**` | `docs/user-manual/features/<фича>.md` |
| `frontend/src/components/ui/**` | `docs/design-system/overview.md` |
| `modules/integrations/**` или `webhooks` | `docs/integrations/gitlab.md` / `telegram.md` |
| `deploy/**`, `.github/workflows/**` | `docs/guides/deployment.md` |

Всё остальное — авто.

---

## Напоминания в редакторе

**Claude Code:** хук в `.claude/settings.json` — при редактировании нужного файла Claude скажет что обновить.

**Cursor:** правило `.cursor/rules/doc-update.mdc` — аналогично.

При изменении роутеров, схемы или App.tsx редактор покажет:
```
✅ Авто-документация обновится сама после мёрджа в main
```
Ничего делать не нужно.

---

## PR чеклист

GitHub автоматически подставляет шаблон из `.github/PULL_REQUEST_TEMPLATE.md` с галочками. Заполни или напиши «не затронуто».

---

## Сгенерировать локально

```bash
make docs                                    # всё сразу
node scripts/generate-docs.js --routes       # только API reference
node scripts/generate-docs.js --schema       # только data model
node scripts/generate-docs.js --env          # только env vars
node scripts/generate-docs.js --stale        # проверить что устарело вручную
```

---

## Добавить новый роутер / модуль в авто-генерацию

Открой `scripts/generate-docs.js`, найди `ROUTER_MODULE_MAP` и добавь строку:

```js
'my-module.router.ts': { prefix: '/api', name: 'My Module' },
```

Запусти `make docs` — появится в `docs/api/reference.md`.
