# Agent Factory Summary — Flow Universe MVP

**Дата:** 2026-03-19
**Статус:** Готов к использованию (3 Wave'а на Sprint 4)

---

## 🎯 Главная идея в 30 секунд

**Вместо этого:**
```
Agent 1 делает Task A (3 часа)
                    ↓
Agent 1 делает Task B (3 часа)
                    ↓
Agent 1 делает Task C (3 часа)
━━━━━━━━━━━━━━━━━━━━━━━━━
Итого: 9 часов
```

**Делаем это:**
```
Agent 1 → Task A (Telegram)        ─┐
Agent 2 → Task B (CSV export)      ├─ Параллельно (1.5 часа)
Agent 3 → Task C (GitLab webhook)  ─┘
     ↓
Verify & Merge (15 мин)
━━━━━━━━━━━━━━━━━━━━━━━━━
Итого: 2 часа (вместо 9)
```

---

## 📊 Что завод гарантирует

| Гарантия | Как это работает |
|----------|-----------------|
| **🛡️ Ничего не сломается** | CI проверяет все тесты перед merge → если красно, не мержится |
| **📝 Не потеряем функции** | Guardrails запрещают удалять столбцы БД, менять API, рушить RBAC |
| **⚡ Работает параллельно** | 3 агента одновременно → экономим 5+ часов на цикл |
| **🧠 Помнит всё** | `.claude/agent-factory/snapshots/` сохраняют state → агенты не теряют контекст |
| **📈 Метрики видны** | Отслеживаем: tests passed, coverage %, blockers, merge time |

---

## 🚀 Как запустить Wave 1 (сейчас)

### Step 1: State Scan (5 мин, фон)
```bash
# Запустить агента (Haiku):
# "Проанализируй текущее состояние Flow Universe"
# → Результат: .claude/agent-factory/snapshots/state-XXX.md

# Тебе покажет:
# ✅ Что готово (AI estimation, AI decomposition, Swagger)
# ❌ Что не готово (Telegram bot, CSV export, GitLab webhook UI)
# 🔴 Критические проблемы (DB migration мismatch)
```

### Step 2: Запустить 3 агента Wave 1

**Agent 1:** Реализовать Telegram bot
```markdown
Task: 4.3a — Telegram notification service

Надо сделать:
- src/modules/telegram/ (новый модуль)
- sendNotification() функция
- Integration tests (3 test case)
- Guardrail: ✅ Safe (zero impact на существующий код)
```

**Agent 2:** CSV export
```markdown
Task: 4.5a — CSV export endpoint

Надо сделать:
- POST /api/reports/export?format=csv
- Использовать fast-csv npm
- Integration tests (2 test case)
- Guardrail: ✅ Safe (новый endpoint)
```

**Agent 3:** GitLab webhook UI
```markdown
Task: 4.4a — GitLab webhook admin panel

Надо сделать:
- Admin форма для регистрации webhook
- Сохранение конфига в БД
- Integration tests (1 test case)
- Guardrail: ⚠️ Verify (touches admin module, нужны тесты)
```

### Step 3: CI автоматически проверит
```bash
npm run lint        # ✅ no errors
npm run build       # ✅ TypeScript ok
npm run test        # ✅ 32+ tests pass
docker compose up   # ✅ containers start
```

### Step 4: Merge
```bash
# Если CI green:
gh pr merge --squash

# Если CI red:
# → Agent исправляет, новый commit, CI перезапускается
```

---

## 📋 Safety Checklist (встроен в workflow)

Каждый агент автоматически проверяет **перед** тем как что-то менять:

```
BEFORE CODING:
✅ Read safety report (что можно менять)
✅ Check guardrails (что запрещено)
✅ Understand API contracts (не ломать существующие endpoints)

AFTER CODING:
✅ npm run build (no TS errors)
✅ npm run test (all tests pass, including existing ones)
✅ npm run lint (no new warnings)
✅ docker compose up (containers start)
✅ curl http://localhost:5173 (app loads)

BEFORE PUSHING:
✅ Read verification checklist
✅ Ensure no breaking changes
✅ Update MEMORY.md
```

---

## 🚨 Что запрещено (FORBIDDEN)

```
❌ Удалять столбцы из БД (data loss)
❌ Менять тип поля (uuid → string)
❌ Удалять API endpoints (404 на клиенте)
❌ Изменять RBAC rules (разрушить permission model)
❌ Удалять existing roles (ADMIN, MANAGER, USER, VIEWER)
❌ Force push в main (merge только PR)
❌ Отключать existing feature flags (только добавлять новые)

→ Если агент это сделает, CI заблокирует merge
```

---

## 📊 Текущий статус Sprint 4-5

### ✅ Уже готово
- AI estimation & decomposition (полная реализация)
- Swagger/OpenAPI documentation
- GitLab webhook (merge request handling)
- Security hardening (nginx, rate-limiting)
- Production deployment scripts
- Rebranding (TaskTime → Flow Universe)
- UI redesign with design tokens

### ❌ Нужно доделать (Wave 1)
- [ ] Telegram bot (notification service)
- [ ] CSV/PDF export (endpoints)
- [ ] GitLab webhook UI (admin panel)

### ⚠️ Нужна проверка
- Issue relations (links module) — может затронуть queries
- Releases module — может повлиять на project versioning

---

## 🎬 Быстрый старт

**Прямо сейчас:**

1. Открой `.claude/agent-factory.md` (полная инструкция)
2. Прочитай Stage 1: State Scan (что делать)
3. Прочитай Stage 2: Safety Checks (что можно менять)
4. Скопируй Task Template из Stage 3
5. Запустил 3 агента с этим template'ом

**Результат:**
- 3 PR'я в GitHub (один от каждого агента)
- CI автоматически проверит каждый PR
- Если все зелёно → merge via `gh pr merge --squash`
- **Время цикла: 1.5–2 часа вместо 9 часов**

---

## 📂 Структура файлов завода

```
.claude/agent-factory/
├── agent-factory.md              # Полная документация (10 сек read)
├── snapshots/
│   └── state-2026-03-19-XX.md    # What's done vs what's not
├── tasks/
│   ├── wave-1-breakdown.md       # 3 independent tasks
│   ├── task-4.3a-telegram.md     # Details for Agent 1
│   ├── task-4.5a-export.md       # Details for Agent 2
│   └── task-4.4a-gitlab-ui.md    # Details for Agent 3
├── results/
│   ├── wave-1-results.md         # What agents completed
│   ├── task-4.3a-results.md      # PR links, test count
│   └── verification-checklist.md # Pre-merge checks
└── metrics/
    ├── token-spend.csv           # 140k tokens per wave
    ├── test-coverage.csv         # 65% → 70%
    └── deployment-status.csv     # When merged to main
```

---

## 💡 Про guardrails

**Guardrails = "что можно трогать без одобрения"**

✅ **Safe to modify** (новые модули, документация, deploy скрипты):
- `src/modules/{ai,webhooks,telegram,reports}/` → новые, ноль риска
- `docs/` → документация
- `.github/workflows/` → CI (кроме production deploy)

⚠️ **Requires verification** (могут затронуть другой код):
- `src/modules/{auth,users,projects,issues}/` → core modules
- Database schema → only add fields (no delete, no type change)
- API contracts → must stay backward compatible

🔴 **Forbidden** (breaking changes):
- Delete tables/columns
- Change field types
- Remove API endpoints
- Modify RBAC logic

---

## 📞 Support & FAQ

**Q: А что если агент ошибется?**
A: CI поймает (тесты упадут), PR не смержится. Агент/ты исправляешь, новый коммит, CI перезапускается. Max 2-3 итерации.

**Q: Сколько токенов потратится?**
A: ~140k на Wave 1 (State Scan + Breakdown + 3 agents + Verify). Это 70% от monthly budget (200k). Экономия: без завода было 9 часов человеческого времени.

**Q: Как долго цикл?**
A: State Scan (5 мин) → Task Breakdown (10 мин) → Parallel execution (1.5 часа) → Verify (15 мин) = **~2 часа total** (вместо 9).

**Q: Если что-то сломается, кто виноват?**
A: Guardrails и CI не дадут merge'ить code с breaking changes. Если merged = это не guardrail вопрос, а процесс.

---

**Создано:** 2026-03-19 16:10
**Для команды:** Flow Universe MVP developers
**Использовать:** Перед каждым Wave'ом спринта
