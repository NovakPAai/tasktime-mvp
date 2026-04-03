# Contributing to Flow Universe MVP

> Руководство для участников проекта. Язык разработки — TypeScript, стек описан в `CLAUDE.md`.

## Участники

| GitHub | Роль |
|--------|------|
| jackrescuer-gif | PO / Lead |
| St1tcher86 | Contributor |

---

## 1. Первоначальная настройка

### Клонирование и запуск

```bash
git clone https://github.com/<org>/tasktime-mvp.git
cd tasktime-mvp

# Запуск инфраструктуры (PostgreSQL + Redis)
make setup

# Запуск в dev-режиме (backend :3000 + frontend :5173)
make dev
```

**Тестовые аккаунты:** `admin / manager / dev / viewer @tasktime.ru`, пароль `password123`

### Требования к окружению

- Node.js 20 LTS
- Docker + Docker Compose
- GitHub CLI: `brew install gh` → `gh auth login`
- (опционально) Claude Code CLI или Cursor

---

## 2. Архитектура именования веток

```
main                        ← защищённая ветка, только через PR
  ↑
  ├── claude/jack-<описание>   jackrescuer-gif через Claude Code
  ├── cursor/jack-<описание>   jackrescuer-gif через Cursor
  ├── claude/alex-<описание>   St1tcher86 через Claude Code
  ├── cursor/alex-<описание>   St1tcher86 через Cursor
  └── fix/<описание>           хотфикс (оба)
```

**Правило:** в имени ветки всегда твой идентификатор (`jack` или `alex`). Так сразу видно в GitHub, чья ветка.

---

## 3. Стандартный флоу работы

### Шаг 1 — Синхронизация

```bash
git fetch origin
git checkout main
git rebase origin/main
```

### Шаг 2 — Создать ветку

```bash
# Для jackrescuer-gif:
git checkout -b claude/jack-add-export-csv

# Для St1tcher86:
git checkout -b claude/alex-fix-timer-bug
```

### Шаг 3 — Работа и коммиты

```bash
# Коммиты по логическим единицам, не по файлам
git add backend/src/modules/issues/
git commit -m "feat: добавить экспорт задач в CSV"
```

Формат: `<тип>: <описание>`
Типы: `feat` `fix` `chore` `docs` `refactor` `test`

### Шаг 4 — Push

```bash
git push -u origin claude/jack-add-export-csv
```

### Шаг 5 — Pull Request

```bash
gh pr create \
  --title "feat: экспорт задач в CSV" \
  --body "Добавлен endpoint GET /api/issues/export и кнопка в UI" \
  --reviewer St1tcher86   # или jackrescuer-gif
```

GitHub автоматически подставит шаблон из `.github/PULL_REQUEST_TEMPLATE.md`.

### Шаг 6 — Ожидание CI и ревью

- CI проверяет: TypeScript build + ESLint + тесты
- Ревьюер: оставляет комментарии или апрувит
- Если нужны правки — коммитишь в ту же ветку, PR обновляется автоматически

### Шаг 7 — Мёрдж

```bash
# Только после CI зелёного + аппрув
gh pr merge --squash --delete-branch
```

---

## 4. Если main ушёл вперёд (rebase)

```bash
git fetch origin
git rebase origin/main

# Если конфликты:
# 1. Открой конфликтный файл, реши конфликт
# 2. git add <файл>
# 3. git rebase --continue

git push --force-with-lease  # безопасный force-push только своей ветки
```

> `--force-with-lease` безопаснее `--force`: падает если кто-то ещё пушил в эту ветку.

---

## 5. Работа с AI-инструментами

### Claude Code

Claude Code автоматически создаёт worktree-ветки. Убедись, что в настройках CLAUDE.md прописан твой префикс.

```bash
# Проверь что ветка создаётся с правильным префиксом
git branch --show-current
# Должно быть: claude/jack-... или claude/alex-...
```

Если имя ветки не содержит твой префикс — переименуй перед push:
```bash
git branch -m claude/alex-<описание>
```

### Cursor

Перед началом работы в Cursor:
```bash
git checkout -b cursor/alex-<описание>
```
Cursor не создаёт ветки сам — нужно создать вручную.

---

## 6. Разрешение конфликтов

### Предотвращение

- Перед началом работы над модулем — сообщи в чат: «беру `backend/src/modules/issues/`»
- Ветка живёт ≤ 2 дней → меньше diverge с main
- PR ≤ 400 строк diff — легче ревьюить и меньше конфликтов

### Если конфликт случился

1. `git rebase origin/main` — конфликты появятся явно
2. Реши каждый конфликт в редакторе
3. `git add <файл> && git rebase --continue`
4. Если совсем запутался: `git rebase --abort` → обратись к коллеге

### Чьи изменения приоритетнее?

- Нет жёсткого правила — договариваемся в PR-комментариях
- `main` — истина. Что смёрджено, то и правда.

---

## 7. Защита ветки main (настройка GitHub)

> Одноразовая настройка — выполняет jackrescuer-gif как владелец репо.

**Settings → Branches → Add branch protection rule → Branch name pattern: `main`**

Включить:
- [x] Require a pull request before merging
- [x] Require approvals: **1**
- [x] Require status checks to pass before merging
  - Выбрать: `backend`, `frontend` (из CI)
- [x] Require branches to be up to date before merging
- [x] Do not allow bypassing the above settings

---

## 8. CI — что проверяется

При каждом push в `claude/*`, `cursor/*` и PR в `main`:

| Job | Что делает |
|-----|-----------|
| `backend` | TypeScript build + ESLint + Vitest + Supertest |
| `frontend` | TypeScript build + ESLint + Vitest |

Локальная проверка перед push:
```bash
# Backend
cd backend && npm run build && npm run lint && npm test

# Frontend
cd frontend && npm run build && npm run lint && npm test
```

---

## 9. Структура проекта

```
tasktime-mvp/
├── backend/
│   └── src/modules/     # auth, users, projects, issues, boards, sprints, time, teams, admin
├── frontend/
│   └── src/pages/       # основные страницы UI
├── prisma/              # схема БД + миграции
├── .github/workflows/   # CI/CD
├── CLAUDE.md            # контекст для AI-агентов
└── CONTRIBUTING.md      # этот файл
```

---

## 10. Полезные команды

```bash
make dev          # запустить всё (frontend + backend + docker)
make backend      # только backend
make frontend     # только frontend

npx prisma studio # GUI для БД (localhost:5555)
npx prisma migrate dev --name <name>  # новая миграция

gh pr list        # список открытых PR
gh pr view        # просмотр текущего PR
gh pr checks      # статус CI для текущего PR
```

---

## Вопросы?

Пиши jackrescuer-gif в Telegram или открывай issue в репо.
