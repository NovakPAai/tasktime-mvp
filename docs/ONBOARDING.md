# Онбординг — St1tcher86

Полная инструкция для начала работы в проекте TaskTime MVP.
Выполняй шаги строго по порядку.

---

## Часть 1. Установка инструментов

### 1.1 Node.js 20 LTS

Проверь версию:
```bash
node -v
```
Должно быть `v20.x.x` или выше. Если нет — установи:

**macOS:**
```bash
brew install node@20
echo 'export PATH="/opt/homebrew/opt/node@20/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
node -v  # проверь: v20.x.x
```

**Windows (WSL2 / Ubuntu):**
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v
```

---

### 1.2 Docker Desktop

Нужен для PostgreSQL и Redis.

- **macOS / Windows:** скачай с https://www.docker.com/products/docker-desktop и установи
- После установки запусти Docker Desktop и дождись иконки в трее

Проверь:
```bash
docker --version        # Docker version 24+
docker compose version  # Docker Compose version 2+
```

---

### 1.3 GitHub CLI

```bash
# macOS:
brew install gh

# Ubuntu/WSL:
sudo apt install gh
```

Войди в аккаунт:
```bash
gh auth login
# Выбери: GitHub.com → HTTPS → Yes → Login with a web browser
# Скопируй код, нажми Enter, вставь код в браузере
```

Проверь:
```bash
gh auth status
# Должно быть: Logged in to github.com as St1tcher86
```

---

### 1.4 SSH-ключ для GitHub (если ещё не настроен)

Проверь, есть ли ключ:
```bash
ls ~/.ssh/id_ed25519.pub 2>/dev/null && echo "ключ есть" || echo "нет ключа"
```

Если нет — создай:
```bash
ssh-keygen -t ed25519 -C "твой@email.com"
# Нажимай Enter на всех вопросах (оставь дефолтные пути и без пароля)
```

Добавь в GitHub:
```bash
cat ~/.ssh/id_ed25519.pub
# Скопируй вывод
```
Перейди: **github.com → Settings → SSH and GPG keys → New SSH key** → вставь и сохрани.

Проверь:
```bash
ssh -T git@github.com
# Hi St1tcher86! You've successfully authenticated...
```

---

### 1.5 Claude Code CLI (если используешь)

```bash
npm install -g @anthropic-ai/claude-code
claude --version
```

При первом запуске выполни `claude` и войди через браузер.

---

### 1.6 Cursor (если используешь)

Скачай с https://cursor.sh и установи. Войди в аккаунт Cursor или используй API-ключ.

---

## Часть 2. Получение доступа к репозиторию

1. Убедись, что jackrescuer-gif добавил тебя как collaborator в репозиторий на GitHub
2. Прими приглашение — придёт на email или найди на https://github.com/notifications

---

## Часть 3. Клонирование и первый запуск

### 3.1 Клонировать репозиторий

```bash
git clone git@github.com:jackrescuer-gif/tasktime-mvp.git
cd tasktime-mvp
```

> Используй SSH (git@github.com:...), не HTTPS. Так работает без ввода пароля.

---

### 3.2 Первоначальная настройка (один раз)

```bash
make setup
```

Скрипт сделает автоматически:
- Запустит PostgreSQL 16 и Redis 7 в Docker
- Установит зависимости backend и frontend
- Создаст `.env` файлы из `.env.example`
- Применит все миграции БД
- Загрузит тестовые данные (seed)

Ожидаемый финальный вывод:
```
========================================
  Setup complete!
========================================
  Start dev servers:
    make dev  — backend + frontend
  Open http://localhost:5173 in your browser
```

Если setup упал — смотри раздел «Устранение проблем» в конце документа.

---

### 3.3 Запуск в dev-режиме

```bash
make dev
```

Откроется два сервера:
| Адрес | Что |
|-------|-----|
| http://localhost:5173 | Frontend (React) |
| http://localhost:3000 | Backend API |

---

### 3.4 Проверить что всё работает

Открой http://localhost:5173 в браузере.

Войди с тестовым аккаунтом:
| Email | Пароль | Роль |
|-------|--------|------|
| admin@tasktime.ru | password123 | Admin |
| manager@tasktime.ru | password123 | Manager |
| dev@tasktime.ru | password123 | Developer |
| viewer@tasktime.ru | password123 | Viewer |

Если видишь дашборд с проектами — всё готово.

---

## Часть 4. Ежедневный рабочий флоу

### 4.1 Перед началом любой работы — синхронизация

```bash
git checkout main
git fetch origin
git rebase origin/main
```

Это обязательно. Без синхронизации рискуешь работать на устаревшей базе.

---

### 4.2 Создать ветку

**Твой префикс — всегда `claude/alex-` или `cursor/alex-`.**

```bash
# Для работы через Claude Code:
git checkout -b claude/alex-<краткое-описание>

# Для работы через Cursor:
git checkout -b cursor/alex-<краткое-описание>
```

Примеры хороших имён:
```bash
git checkout -b claude/alex-fix-timer-display
git checkout -b claude/alex-add-issue-export
git checkout -b cursor/alex-update-kanban-ui
```

> **Важно для Claude Code:** Claude автоматически создаёт ветки со случайными именами вроде `claude/sharp-elbakyan`. Это не твой префикс. Сразу переименуй:
> ```bash
> git branch -m claude/alex-<описание>
> ```

---

### 4.3 Работа и коммиты

Коммить по логическим единицам, не по файлам:

```bash
# Хорошо — одна логическая единица:
git add backend/src/modules/time/
git commit -m "fix: исправить расчёт времени при смене таймзоны"

# Плохо — вперемешку:
git add .
git commit -m "changes"
```

Формат коммита: `<тип>: <описание>`

| Тип | Когда |
|-----|-------|
| `feat` | новая функциональность |
| `fix` | исправление бага |
| `refactor` | рефакторинг без изменения поведения |
| `test` | тесты |
| `chore` | зависимости, конфиги |
| `docs` | документация |

---

### 4.4 Push ветки

```bash
git push -u origin claude/alex-fix-timer-display
```

Флаг `-u` нужен только при первом push этой ветки. Последующие — просто `git push`.

---

### 4.5 Создать Pull Request

```bash
gh pr create \
  --title "fix: исправить расчёт времени при смене таймзоны" \
  --body "Опиши что сделал и зачем" \
  --reviewer jackrescuer-gif
```

После создания GitHub пришлёт ссылку на PR. Отправь её jackrescuer-gif в чат.

GitHub автоматически добавит чеклист из `.github/PULL_REQUEST_TEMPLATE.md` — заполни его.

---

### 4.6 CI проверки

После создания PR автоматически запустятся:
- `backend` — TypeScript build + ESLint + тесты
- `frontend` — TypeScript build + ESLint + тесты

Посмотреть статус:
```bash
gh pr checks
```

Если CI упал — читай логи:
```bash
gh pr checks --watch  # ждёт завершения и показывает результат
# или открой ссылку на GitHub Actions в браузере
```

---

### 4.7 После аппрува — мёрдж

Когда jackrescuer-gif апрувит PR:

```bash
gh pr merge --squash --delete-branch
```

`--squash` — все коммиты ветки сложатся в один коммит в main
`--delete-branch` — ветка удалится после мёрджа

---

## Часть 5. Ревью чужих PR

Когда jackrescuer-gif просит тебя апрувить его PR:

```bash
gh pr list  # список открытых PR
gh pr view <номер>  # посмотреть PR
```

Или открой ссылку в браузере.

Если всё нормально:
```bash
gh pr review <номер> --approve
```

Если есть замечания:
```bash
gh pr review <номер> --comment --body "Комментарий к PR"
# или оставляй комментарии в браузере на конкретных строках кода
```

---

## Часть 6. Когда main ушёл вперёд

Если после создания ветки кто-то смёрджил другой PR в main — нужен rebase:

```bash
git fetch origin
git rebase origin/main
```

Если появились конфликты, git покажет какие файлы:
```
CONFLICT (content): Merge conflict in backend/src/modules/issues/issues.service.ts
```

Открой файл в редакторе. Найди маркеры:
```
<<<<<<< HEAD
  // твой код
=======
  // код из main
>>>>>>> origin/main
```

Оставь правильный вариант, удали маркеры, затем:
```bash
git add backend/src/modules/issues/issues.service.ts
git rebase --continue
```

Повтори для каждого конфликтного файла.

После успешного rebase:
```bash
git push --force-with-lease
# --force-with-lease безопаснее --force: упадёт если кто-то ещё пушил в эту ветку
```

Если запутался — отмени rebase и позови jackrescuer-gif:
```bash
git rebase --abort
```

---

## Часть 7. Полезные команды

```bash
# Запуск
make dev              # backend + frontend + docker
make backend          # только backend (port 3000)
make frontend         # только frontend (port 5173)
make stop             # остановить всё

# База данных
make db-studio        # GUI для БД в браузере (localhost:5555)
make seed             # перезалить тестовые данные
make db-reset         # сбросить БД и залить seed заново (УДАЛЯЕТ ДАННЫЕ)

# Если добавил новое поле в Prisma schema:
cd backend && npx prisma migrate dev --name <название-миграции>

# Качество кода
make lint             # ESLint для backend + frontend
make test             # тесты backend

# GitHub
gh pr list            # список открытых PR
gh pr view            # текущий PR
gh pr checks          # статус CI
gh pr diff            # diff текущего PR
```

---

## Часть 8. Структура проекта

```
tasktime-mvp/
├── backend/
│   ├── src/
│   │   ├── modules/         # бизнес-логика по модулям
│   │   │   ├── auth/        # регистрация, логин, JWT
│   │   │   ├── users/       # управление пользователями
│   │   │   ├── projects/    # проекты
│   │   │   ├── issues/      # задачи (EPIC/STORY/TASK/SUBTASK/BUG)
│   │   │   ├── boards/      # Kanban-доски
│   │   │   ├── sprints/     # спринты
│   │   │   ├── time/        # учёт времени
│   │   │   ├── teams/       # команды
│   │   │   ├── comments/    # комментарии
│   │   │   └── admin/       # административные функции
│   │   ├── middleware/      # auth, RBAC, audit, error
│   │   └── app.ts           # точка входа Express
│   └── prisma/
│       └── schema.prisma    # схема БД — сюда смотреть для понимания модели
├── frontend/
│   └── src/
│       ├── pages/           # страницы (Board, Issues, Sprints, Time...)
│       ├── components/      # переиспользуемые компоненты
│       ├── api/             # клиент для запросов к backend
│       └── store/           # Zustand stores
├── prisma/
│   └── migrations/          # история миграций БД
├── .github/
│   └── workflows/           # CI/CD (ci.yml — основной)
├── CLAUDE.md                # контекст и правила для AI-агентов
└── CONTRIBUTING.md          # краткое описание флоу
```

**Правило модульности:** каждый модуль — `router.ts → service.ts → prisma`. Модули не импортируют друг друга напрямую.

---

## Часть 9. Устранение проблем

### `make setup` упал на Docker

```bash
# Убедись что Docker Desktop запущен (иконка в трее)
docker ps  # должен вернуть список контейнеров (пустой — это норма)
```

### `make setup` упал на миграциях

```bash
make db-reset  # сбросить и пересоздать БД
```

### Порты заняты

```bash
# Проверить что занимает порт 3000 или 5173:
lsof -i :3000
lsof -i :5173

# Убить процесс:
kill -9 <PID>
```

Или просто:
```bash
make stop  # остановит backend, frontend и docker
make dev   # запустит заново
```

### `git push` отклонён

```bash
# Сообщение: "Updates were rejected because the tip of your current branch is behind"
git pull --rebase origin claude/alex-<имя-ветки>
git push
```

### CI упал: TypeScript errors

```bash
cd backend && npm run build  # увидишь конкретные ошибки
cd frontend && npm run build
```

Исправь ошибки, закоммить, запушь — CI перезапустится автоматически.

### Claude Code создал ветку с чужим именем

```bash
git branch --show-current   # посмотреть текущее имя
git branch -m claude/alex-<описание>  # переименовать
git push -u origin claude/alex-<описание>  # запушить под новым именем
```

### Не знаю какой модуль трогать

Открой `backend/prisma/schema.prisma` — там вся модель данных. По модели понятно, какой модуль что делает.

---

## Контакты

Вопросы — jackrescuer-gif в Telegram.
Баги и задачи — issues в репозитории на GitHub.
