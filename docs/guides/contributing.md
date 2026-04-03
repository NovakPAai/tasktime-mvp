# Руководство контрибьютора

> Last updated: 2026-03-26

---

## Быстрый старт

```bash
git clone git@github.com:jackrescuer-gif/tasktime-mvp.git
cd tasktime-mvp
make setup          # зависимости + Docker (PostgreSQL + Redis) + seed
make dev            # backend :3000 + frontend :5173
```

Аккаунты: `admin@tasktime.ru` / `password123`

---

## Именование веток

| Участник | Инструмент | Префикс |
|---------|-----------|---------|
| jackrescuer-gif | Claude Code | `claude/jack-<описание>` |
| jackrescuer-gif | Cursor | `cursor/jack-<описание>` |
| St1tcher86 | Claude Code | `claude/alex-<описание>` |
| St1tcher86 | Cursor | `cursor/alex-<описание>` |
| Любой | — | `fix/<описание>` |

---

## Рабочий процесс

```bash
make sync                                    # fetch + rebase на origin/main
git checkout -b claude/jack-my-feature
# ... работа ...
git commit -m "feat: добавить экспорт задач в CSV"
make ship                                    # sync → lint → push → PR
# ждёшь CI зелёный + аппрув
make merge                                   # squash merge + удалить ветку
```

Или по шагам: `make pr` (без lint), `make branches` (список открытых веток).

---

## Формат коммитов

```
<тип>: <описание>
```

Типы: `feat` `fix` `refactor` `docs` `test` `chore` `perf` `ci`

---

## Правила PR

- Ветка → `main` (защищена)
- CI зелёный + 1 аппрув = можно мёрджить
- Стратегия: squash merge (`make merge`)
- Force push в `main` — запрещён

---

## Стандарты кода

- TypeScript strict, Zod-валидация на все DTO
- `authenticate` middleware на всех защищённых роутах
- `logAudit()` на всех мутациях
- Нет хардкодных секретов — только env vars
- Функции < 50 строк, файлы < 800 строк

```bash
make lint     # ESLint + Prettier
make test     # Vitest
```

---

## Документация

### Как это работает

Документация в проекте **живая** — большая часть генерируется автоматически из кода.

**Что делает GitHub Actions сразу после мёрджа в `main`:**

| Изменил в коде | Обновится само |
|----------------|---------------|
| `*.router.ts` | `docs/api/reference.md` — таблица всех эндпоинтов |
| `schema.prisma` | `docs/architecture/data-model.md` — все модели и enum |
| `backend/src/app.ts` | `docs/architecture/backend-modules.md` |
| `frontend/src/App.tsx` | `docs/architecture/frontend-architecture.md` |
| `store/*.ts` | frontend-architecture.md (секция stores) |
| `features.ts` | `docs/architecture/overview.md` |
| `.env.example` | `docs/guides/getting-started.md` |
| `Makefile` | `docs/guides/getting-started.md` |
| `docker-compose.yml` | `docs/guides/getting-started.md` |
| Любой коммит | `docs/CHANGELOG.md` |

Бот сам сделает коммит `chore: auto-update docs [skip ci]`. Ничего делать не нужно.

### Что нужно написать руками

Только то, что описывает **поведение** — это не вывести из кода:

| Изменил | Напиши сам |
|---------|-----------|
| UI-страница — изменилось поведение для пользователя | `docs/user-manual/features/<фича>.md` |
| Новый публичный UI-компонент | `docs/design-system/overview.md` |
| Интеграция GitLab / Telegram | `docs/integrations/gitlab.md` или `telegram.md` |
| CI/CD или деплой-конфиг | `docs/guides/deployment.md` |

### Как тебя напомнят

**Claude Code** скажет прямо в чате при редактировании нужного файла:
```
📋 Ремайндер: Изменена UI-страница.
   → Обнови docs/user-manual/features/ если изменилось поведение для пользователя
```

**Cursor** покажет подсказку через правило `.cursor/rules/doc-update.mdc`.

**GitHub** добавит комментарий к PR со списком файлов, которые стоит обновить.

При изменении роутеров или схемы увидишь:
```
✅ Авто-документация обновится сама после мёрджа в main
```
— значит всё хорошо, ничего делать не нужно.

### Сгенерировать доку локально

```bash
make docs                                  # всё сразу
node scripts/generate-docs.js --routes     # только API reference
node scripts/generate-docs.js --schema     # только data model
node scripts/generate-docs.js --stale      # что нужно обновить руками
```
