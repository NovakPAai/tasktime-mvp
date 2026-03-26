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

**Большинство обновляется автоматически** после мёрджа — не нужно ничего делать для API reference, data model, роутов фронтенда и т.д.

Подробно: [doc-workflow.md](./doc-workflow.md)

**Только это требует ручного обновления:**

| Изменил | Обнови |
|---------|--------|
| UI-страница (видимое поведение) | `docs/user-manual/features/` |
| Новый публичный UI-компонент | `docs/design-system/overview.md` |
| Интеграция GitLab / Telegram | `docs/integrations/` |
| CI/CD или деплой-конфиг | `docs/guides/deployment.md` |

Claude Code и Cursor напомнят прямо в чате при редактировании нужного файла.
