---
description: Реализовать большое ТЗ по циклу с PR-ами, pre-push review, merge-кaденсом и автоматическим CI-мониторингом
---

# /implement-tz — Реализация большого ТЗ циклом PR'ов

**Триггер:** `/implement-tz <ключ-ТЗ>` или `Реализуй ТЗ <ключ>`.

Пример: `Реализуй ТЗ TTSRH-1` — прочитать `docs/tz/TTSRH-1.md`, декомпозировать на PR'ы, реализовать каждый PR в одном и том же цикле, автоматически мерджить зелёные PR-ы.

## Правила игры

- **Один PR — один атомарный кусок функциональности.** 400–900 LoC diff максимум. Если больше — делим на два PR.
- **Каждый PR проходит полный цикл**, описанный ниже. Никаких срезаний углов.
- **Статусы в ТЗ обновляются на каждом шаге:** 📋 Планируется → 🚧 В работе → ✅ Done → 🟢 Merged.
- **CI мониторится асинхронно** через `ScheduleWakeup` (780s ~ 13 мин). Не зацикливаемся на polling.
- **Pre-push review обязателен ДО push'а.** Apply 🟠/🟡-фиксы в follow-up коммит.
- **Cycle continues** пока не merged последний PR эпика.

## Декомпозиция (выполняется один раз в начале)

1. **Прочитать ТЗ** `docs/tz/<KEY>.md` полностью (через `ctx_read` / chunks если >80K).
2. **Составить план PR'ов** со всеми секциями:
   - `13.1 Стратегия` (branch naming `<key-lowercase>/<scope>`, feature flag если нужен, size budget, CI-требования, security-review gate)
   - `13.2 DAG зависимостей` (ASCII)
   - `13.3–13.N PR-ы по фазам` — каждая карточка: Branch, Scope (с файлами), Не включает, Merge-ready check, Оценка.
   - `13.N+1 Итог: таблица PR | № | Branch | Scope | Часы | Зависимости | Сабтаски | Статус |` (с легендой: 📋 Планируется · 🚧 В работе · ✅ Done · 🟢 Merged).
3. **Записать план как §13** в том же `docs/tz/<KEY>.md`.
4. **Commit** декомпозиции отдельно: `docs(tz): <KEY> — план реализации (§13)`.

## Цикл одного PR (повторить для каждой карточки §13.3+)

### 1. Подготовка ветки
- **Обновить todo-лист** через `TodoWrite`: все шаги ниже как отдельные задачи.
- **Pop stash** с `.claude/settings.json` если есть (он не должен попадать в коммит).
- **`git checkout -b <branch>`** от предыдущей PR-ветки (чтобы иметь уже реализованные абстракции) или от `main` (первый PR).
- **Обновить статус в ТЗ:** 📋 → 🚧 В работе.

### 2. Исследование
- **Прочитать** существующие файлы, которые будут затронуты (через `ctx_read`).
- **Grep** паттерны: как ранее делались похожие модули, типы Prisma, middlewares, exports.
- **Не дублировать** утилиты, которые уже есть в `shared/`.

### 3. Имплементация
- **Пишем production-код** сначала. Комментарии только про **почему**, не про **что** (см. CLAUDE.md).
- **Каждый новый файл** начинается с JSDoc-блока: TTSRH ссылка, что делает, публичный API, инварианты (never-throw, R1/R3/R15).
- **Zod-DTO** на всех HTTP-входах. `authenticate` middleware на приватных эндпоинтах.
- **Feature-flag gate** в app.ts если требуется (обновить `features.ts` + `VITE_*` зеркало).
- **После каждого файла** запускать `tsc --noEmit` для раннего обнаружения type-ошибок.

### 4. Тесты
- **Pure-unit-тесты** для каждого нового pure-модуля. Добавить в `package.json:test:parser` если работают без Postgres.
- **Property-based fuzz** для hot paths (парсер, компилятор) — seeded `mulberry32`, 500-1000 итераций, adversarial payloads включить.
- **Coverage target:** 80%+ для нового кода.
- **Integration-тесты** (требующие Postgres) пишем, но не запускаем локально — CI проверит.

### 5. Документация
- **`version_history.md`** — запись с новой версией (инкремент). Формат: «Что было → Что теперь → Изменения → Влияние на prod → Проверки».
- **`docs/tz/<KEY>.md` §13.N`** — статус PR → ✅ Done (готов к push после merge предыдущего).
- **CLAUDE.md правила** на модалки/refresh — применить если задача фронтовая.

### 6. Проверки локально
- `npx tsc --noEmit` — зелёный.
- `npm run lint` — 0 errors, 0 новых warnings.
- `npm run test:parser` (или эквивалент pure-unit) — все зелёные.
- Manual smoke если есть UI/endpoint — отметить в PR description что проверено.

### 7. Коммит локально (ещё не push!)
- **Staging целевых файлов** через `git add <path> <path>...` — **никогда** `git add .` или `-A`. Явно исключать `.claude/settings.json`, `.claude/scheduled_tasks.lock`.
- **Сообщение коммита** в heredoc → tmp-файл → `git commit -F`. Zsh ломает heredoc в inline.
- **Формат:**
  ```
  feat(<scope>): <KEY> PR-<N> — <summary>

  <body: что, почему, коротко>

  См. docs/tz/<KEY>.md §13.N PR-<N>.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  ```

### 8. Pre-push review (обязательно!)
- **`Agent(subagent_type: pre-push-reviewer, prompt: <detailed diff summary>)`**.
- Prompt агенту включает: все файлы с кратким описанием, локальные проверки, **перечисление зон риска** (R1/R3/R15/RBAC/race conditions/SQL-injection/etc).
- Агент возвращает список находок с приоритетами 🟠 🟡 🔵 ⚪.

### 9. Apply фиксы
- **🟠 + 🟡 обязательно** — это потенциальные баги.
- **🔵 оптимизация** — применяем если не больше 5 минут.
- **⚪ nitpick** — на усмотрение.
- Для каждой находки: fix + unit-тест закрывающий кейс (если применимо).
- Коммит follow-up: `chore(<scope>): <KEY> PR-<N> — pre-push review fixups`.

### 10. Мониторинг CI предыдущего PR
- **`gh pr view <prev-PR> --json state,mergeStateStatus,statusCheckRollup`** — проверить состояние.
- **Если всё зелёное** — `gh pr merge <prev-PR> --squash --delete-branch`.
- **Обновить статус в ТЗ** на 🟢 Merged. Commit: `docs(tz): <KEY> — PR-<N> merged, статус 🟢`.

### 11. Rebase на свежий main
- **Stash settings.json**: `git stash push -m "settings" -- .claude/settings.json`.
- **`git fetch origin main && git rebase origin/main`**.
- **При конфликтах на уже-squash-merged PR'ов** — `git rebase --skip` для каждого их коммита (содержимое уже upstream).
- **Reprогнать** tsc + test:parser после rebase.

### 12. Push + Open PR
- `git push -u origin <branch>`.
- **PR body в tmp-файле** (heredoc ломается в zsh).
- **Формат body:** Summary (bullets), Pre-push review counts, Test plan (чекбоксы), Зависимости, Плановая дельта.
- `gh pr create --base main --head <branch> --title "<type>(<scope>): <KEY> PR-<N> — <summary>" --body-file /tmp/<key>-pr<N>-body.md`.

### 13. Schedule auto-check
- **`ScheduleWakeup`** через 780s (~13 мин, типичное время backend CI): `"проверь состояние CI PR-<N> (#<num>), если всё зелёное — merge"`.

## Что сохранить между циклами

- **Полное покрытие §13 в ТЗ** — статусы PR'ов.
- **Тесты всех предыдущих PR** остаются зелёными. Регрессий нет.
- **`test:parser` npm-script** актуален — включает все новые unit-файлы.
- **`version_history.md`** — запись на каждый PR, инкрементальный version.

## Anti-patterns (НЕ делать)

- ❌ Push без pre-push review.
- ❌ `git add .` или `-A` — захватит settings.json.
- ❌ Merge PR без CI зелёного (даже AI Review — дождаться).
- ❌ Скипать тесты потому что «Postgres не на локали» — написать и надеяться на CI.
- ❌ Массивные PR'ы 2000+ LoC — разбивать.
- ❌ Пропускать обновление `version_history.md` — это правило в CLAUDE.md.
- ❌ Обновлять статус PR в ТЗ на Merged ДО фактического merge.
- ❌ Polling CI через `sleep` в цикле — использовать `ScheduleWakeup`.

## Что делать, когда `ScheduleWakeup` триггерит проверку

1. Проверить PR, который просит prompt (но он может быть устаревшим — один из предыдущих уже merged).
2. Проверить **актуальный открытый PR** в эпике.
3. Если CI зелёный — merge + обновить статус.
4. Если красный — прочитать логи failed job, починить, push fix, re-schedule.
5. Если pending — ScheduleWakeup ещё раз на 300s.

## Когда цикл завершён

- Все PR'ы эпика имеют статус 🟢 Merged в §13.
- Последний PR (обычно docs-cutover + feature-flag flip) включает финальный UAT.
- Итоговое сообщение пользователю: «эпик <KEY> завершён, N PR'ов merged, feature-flag flipped».

---

## Ссылки

- Пример работы цикла: эпик [TTSRH-1](docs/tz/TTSRH-1.md) — PR-1..PR-5.
- Memory-rule: `/Users/georgydubovik/.claude/projects/-Users-georgydubovik-tasktime-mvp/memory/feedback_version_history.md` — обязательное обновление `version_history.md`.
- Pre-push reviewer агент: `.claude/agents/pre-push-reviewer.md`.
