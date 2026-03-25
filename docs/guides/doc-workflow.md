# Documentation Workflow / Как работает документация

> Для новых контрибьюторов
> Last updated: 2026-03-25

---

## RU: Как устроена система документации

Flow Universe использует **живую** систему документации — она обновляется автоматически после каждого мержа в `main` и напоминает разработчикам обновить нужный файл.

### Что происходит автоматически (ничего делать не надо)

1. **После мержа в `main`** — GitHub Actions запускает `update-docs.yml`:
   - Обновляет `docs/CHANGELOG.md` — добавляет новые коммиты с именами авторов
   - Если изменились роуты API — регенерирует `docs/api/reference.md` из OpenAPI
   - Коммит `chore: update changelog [skip ci]` — не запускает CI повторно

2. **При создании PR** — CI-бот добавляет комментарий: список doc-файлов, которые может понадобиться обновить (на основе изменённых исходных файлов)

### Что нужно сделать один раз при клонировании

```bash
make setup    # устанавливает зависимости, в том числе для генерации доков
node --version  # убедитесь, что Node.js 20+
```

Больше ничего. Хуки Claude Code и Cursor активируются автоматически.

### Правило: каждая фича = обновление документации

| Что изменили | Обновите это |
|-------------|-------------|
| Новый/изменённый API роут | `docs/api/reference.md` |
| Изменили Prisma schema | `docs/architecture/data-model.md` |
| Новый модуль бэкенда | `docs/architecture/backend-modules.md` |
| Новая страница фронтенда | `docs/architecture/frontend-architecture.md` |
| Изменилось UX/поведение | `docs/user-manual/features/<фича>.md` |
| Новая интеграция | `docs/integrations/<название>.md` |
| Изменился деплой | `docs/guides/deployment.md` |

### Напоминания в редакторе

**Claude Code** и **Cursor** напомнят вам при редактировании:
- `*/router.ts` → «Обнови docs/api/reference.md»
- `frontend/src/pages/**` → «Обнови docs/user-manual/features/ и frontend-architecture.md»
- `prisma/schema.prisma` → «Обнови docs/architecture/data-model.md»

### При создании PR

GitHub показывает **чеклист документации** автоматически (из `.github/PULL_REQUEST_TEMPLATE.md`). Нужно отметить галочки или написать «Нет изменений, влияющих на доки».

### Генерация доков локально

```bash
make docs                                  # всё сразу
node scripts/generate-docs.js --changelog  # только CHANGELOG
node scripts/generate-docs.js --api        # только API reference из OpenAPI
node scripts/generate-docs.js --stale      # проверить что устарело
```

---

## EN: How the documentation system works

### What happens automatically

1. **On every merge to `main`** — GitHub Actions `update-docs.yml`:
   - Updates `docs/CHANGELOG.md` with new commits (grouped by author)
   - If API routes changed — regenerates `docs/api/reference.md` from OpenAPI
   - Auto-commits `chore: update changelog [skip ci]`

2. **On PR open** — CI bot comments with list of doc files that may need updating

### One-time setup on clone

```bash
make setup    # installs all deps including doc generation tools
```

Nothing else. Claude Code and Cursor hooks activate automatically.

### The rule: every feature = doc update

| Changed | Update |
|---------|--------|
| New/changed API route | `docs/api/reference.md` |
| Prisma schema change | `docs/architecture/data-model.md` |
| New backend module | `docs/architecture/backend-modules.md` |
| New frontend page | `docs/architecture/frontend-architecture.md` |
| User-visible UX change | `docs/user-manual/features/<feature>.md` |
| New integration | `docs/integrations/<name>.md` |

### Editor reminders

**Claude Code** and **Cursor** show a reminder when editing:
- `*/router.ts` → "Update docs/api/reference.md"
- `frontend/src/pages/**` → "Update docs/user-manual/ and frontend-architecture.md"
- `prisma/schema.prisma` → "Update docs/architecture/data-model.md"

### Generate docs locally

```bash
make docs                                  # everything
node scripts/generate-docs.js --changelog  # changelog only
node scripts/generate-docs.js --api        # API docs only
node scripts/generate-docs.js --stale      # staleness check only
```
