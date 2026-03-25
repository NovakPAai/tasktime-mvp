# Contributing Guide / Руководство контрибьютора

> Last updated: 2026-03-25

---

## Branch naming / Именование веток

| Participant | Tool | Branch prefix |
|------------|------|---------------|
| jackrescuer-gif | Claude Code | `claude/jack-<description>` |
| jackrescuer-gif | Cursor | `cursor/jack-<description>` |
| St1tcher86 | Claude Code | `claude/alex-<description>` |
| St1tcher86 | Cursor | `cursor/alex-<description>` |
| Anyone | — | `fix/<description>` (hotfixes) |

Examples: `claude/jack-ai-estimation`, `cursor/alex-kanban-improvements`

---

## Workflow / Рабочий процесс

```bash
# 1. Sync with main
make sync           # = git fetch + rebase on origin/main

# 2. Create branch
git checkout -b claude/jack-your-feature

# 3. Work + commit
git commit -m "feat: add AI estimation endpoint"

# 4. Ship (lint → push → PR)
make ship           # or: make pr (skip lint)

# 5. Wait for CI green + reviewer approval

# 6. Merge
make merge          # = squash merge + delete branch
```

---

## Commit message format / Формат коммита

```
<type>: <description in English or Russian>
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`

Examples:
- `feat: add AI decomposition for issues`
- `fix: исправить расчёт времени в таймере`
- `docs: update API reference for sprints module`
- `chore: update dependencies`

---

## Documentation requirement / Требование к документации

**Every feature = documentation update.** No exceptions.

When you change code, update the corresponding doc:

| What changed | Update this doc |
|-------------|-----------------|
| New/changed API route | `docs/api/reference.md` |
| New/changed Prisma model | `docs/architecture/data-model.md` |
| New backend module | `docs/architecture/backend-modules.md` |
| New frontend page | `docs/architecture/frontend-architecture.md` |
| User-visible behavior change | `docs/user-manual/features/<feature>.md` |
| Deployment change | `docs/guides/deployment.md` |
| New integration | `docs/integrations/<name>.md` |

**Claude Code and Cursor will remind you** — hooks show a hint when you edit router files, schema, or pages.

The PR template also has a documentation checklist — fill it in.

---

## PR rules / Правила PR

- PRs go into `main` (protected branch)
- CI must be green before merge
- At least 1 approval from the other participant required
- No force push to `main`
- Squash merge only (`make merge` does this automatically)

---

## Code quality standards / Стандарты кода

- TypeScript strict mode
- Zod validation on all API request bodies (in DTOs)
- Authenticate middleware on all protected routes
- `logAudit()` on all mutations
- No hardcoded secrets (use env vars)
- No `any` types without justification
- Functions < 50 lines
- Files < 800 lines

Run before every PR:
```bash
make lint     # ESLint + Prettier check
make test     # Vitest unit + integration tests
```

---

## Documentation workflow / Как работает система документации

For the full contributor doc-update workflow, see: [doc-workflow.md](./doc-workflow.md)

---

## Making `git sync` available / Настройка git sync

The `make sync` command requires a clean working directory:
```bash
git stash          # save uncommitted changes
make sync
git stash pop      # restore
```
