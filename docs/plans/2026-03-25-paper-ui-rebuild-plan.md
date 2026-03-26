# Paper UI Rebuild — Сессионный план

**Ветка активной сессии:** `UxUi/session-3-login-projectdetail`
**Последний коммит:** `c25adc5` — ProjectDetailPage (dual-theme)
**PR сессии 3:** [#143](https://github.com/jackrescuer-gif/tasktime-mvp/pull/143) — открыт
**PR сессии 2 (Sprints):** [#131](https://github.com/jackrescuer-gif/tasktime-mvp/pull/131) — смержен в main
**Preview сервер:** порт 5180 (worktree `/Users/pavelnovak/tasktime-mvp/.claude/worktrees/sweet-booth`)

---

## Принцип работы (КРИТИЧНО для каждой сессии)

> **Визуала нет. Создаём с нуля. Вся правда — в Paper.**

Каждая страница пересоздаётся полностью:
1. `get_jsx(nodeId, format: "inline-styles")` на **оба артборда** (Dark + Light) одновременно
2. Извлечь точные значения для обеих тем: цвета, отступы, типографику, градиенты
3. Написать компонент: **чистые React inline-styles** — никаких CSS классов, никаких Ant Design Layout
4. Вся логика (API вызовы, стейт, роутинг) — **сохраняется без изменений**
5. Ant Design допустим только для форм (Modal/Form/Input) и функциональных компонентов (Tooltip, Dropdown)
6. Синхронизация: после каждого изменения — `cp` из main repo в worktree, затем проверка в preview

> ⚠️ **ПРАВИЛО: обе темы реализуются за одну сессию.** Не делать страницу только в dark и оставлять light "на потом" — это создаёт незакрытый долг и требует повторного чтения Paper.

### Паттерн файла (эталон — DashboardPage.tsx / ProjectsPage.tsx)

```tsx
/**
 * PageName — rebuilt from zero using Paper as sole source.
 * Artboards: XYZ-0 (Dark) + ABC-0 (Light). Zero CSS classes, zero Ant Design layout.
 */
import { useThemeStore } from '../store/theme.store';

// ─── Tokens Dark (Paper XYZ-0) ──────────────────────────
const DARK_C = { bg: '#080B14', bgCard: '#0F1320', border: '#1E2640', ... };

// ─── Tokens Light (Paper ABC-0) ─────────────────────────
const LIGHT_C = { bg: '#F0F2FA', bgCard: '#FFFFFF', border: '#E4E7F5', ... };

const F = { display: '"Space Grotesk", system-ui, sans-serif', sans: '"Inter", ...' };
const GRAD = 'linear-gradient(in oklab 135deg, oklab(...) ...)';

// ─── Logic (preserved) ──────────────────────────────────
export default function PageName() {
  const { mode } = useThemeStore();
  const C = mode === 'light' ? LIGHT_C : DARK_C;
  // theme-aware derived config (STATUS_CFG, etc.) — здесь, не на уровне модуля
  // useStore, useEffect, API calls — без изменений

// ─── JSX — pure inline styles ───────────────────────────
  return <div style={{ ... }}> ... </div>;
}
```

---

## Глобальные токены Dark (одинаковые для всех страниц)

```ts
const DARK_C = {
  bg:       '#080B14',   // page background
  bgCard:   '#0F1320',   // card / panel background
  border:   '#1E2640',   // borders, dividers
  borderHd: '#1A2035',   // header border-bottom
  t1: '#E2E8F8',         // primary text
  t3: '#3D4D6B',         // secondary/muted text
  t4: '#4A5568',         // description text
  acc: '#4F6EF7',        // accent (blue)
  green: '#22C55E',
  amber: '#F59E0B',
};
```

## Глобальные токены Light (одинаковые для всех страниц)

```ts
const LIGHT_C = {
  bg:       '#F0F2FA',   // page background
  bgCard:   '#FFFFFF',   // card / panel background
  border:   '#E4E7F5',   // borders, dividers
  borderHd: '#E4E7F5',   // header border-bottom
  t1: '#1A1E32',         // primary text
  t3: '#B0B9D4',         // secondary/muted text
  t4: '#8490B0',         // description text
  acc: '#4F6EF7',        // accent (blue) — same
  green: '#22C55E',
  amber: '#F59E0B',
};
const F = {
  display: '"Space Grotesk", system-ui, sans-serif',
  sans:    '"Inter", system-ui, sans-serif',
};
const LOGO_GRAD = 'linear-gradient(in oklab 135deg, oklab(59.3% -0.002 -0.207) 0%, oklab(54.1% 0.096 -0.227) 100%)';
const GRADIENTS = [
  'linear-gradient(in oklab 135deg, oklab(80% -0.160 0.086) 0%, oklab(59.6% -0.122 0.037) 100%)',
  'linear-gradient(in oklab 135deg, oklab(59.3% -0.002 -0.207) 0%, oklab(54.1% 0.096 -0.227) 100%)',
  'linear-gradient(in oklab 135deg, oklab(76.9% 0.056 0.155) 0%, oklab(66.6% 0.083 0.134) 100%)',
  'linear-gradient(in oklab 135deg, oklab(62.7% 0.130 -0.193) 0%, oklab(54.1% 0.096 -0.227) 100%)',
  'linear-gradient(in oklab 135deg, oklab(70% 0.18 0.10) 0%, oklab(55% 0.15 0.08) 100%)',
];
function avatarGradient(name: string) {
  const h = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
  return GRADIENTS[h % GRADIENTS.length];
}
function initials(name: string) {
  return name.split(' ').map(n => n[0] ?? '').join('').slice(0, 2).toUpperCase();
}
```

---

## Статус страниц

| Страница | Артборд Dark | Артборд Light | Файл | Статус |
|---------|-------------|--------------|------|--------|
| **Sidebar + AppLayout** | `1HD-0` | — | `components/layout/Sidebar.tsx` + `AppLayout.tsx` | ✅ DONE |
| **Dashboard** | `1KQ-0` | `1R5-0` | `pages/DashboardPage.tsx` | ✅ DONE (dual-theme) |
| **Projects** | `1-0` | `81-0` | `pages/ProjectsPage.tsx` | ✅ DONE (dual-theme) |
| **Sprints** | `28O-0` | `2D3-0` | `pages/SprintsPage.tsx` | ✅ DONE (dual-theme) — соседняя сессия |
| **Login** | `4O8-0` | `4Q9-0` | `pages/LoginPage.tsx` | ✅ DONE (dual-theme) |
| **Project Detail** | `FW-0` | `QK-0` | `pages/ProjectDetailPage.tsx` | ✅ DONE (dual-theme) |
| **Board** | `1XE-0` | — | `pages/BoardPage.tsx` | ⏳ TODO (DnD — осторожно) |
| **Global Sprints** | `2HH-0` | — | `pages/GlobalSprintsPage.tsx` | ⏳ TODO |
| **Time Tracking** | `2RY-0` | — | `pages/TimePage.tsx` | ⏳ TODO |
| **Issue Detail** | `30S-0` | — | `pages/IssueDetailPage.tsx` | ⏳ TODO (высокий риск) |
| **Teams** | `39G-0` | — | `pages/TeamsPage.tsx` | ⏳ TODO |
| **Business Teams** | `3IE-0` | — | `pages/BusinessTeamsPage.tsx` | ⏳ TODO |
| **Flow Teams** | `3QE-0` | — | `pages/FlowTeamsPage.tsx` | ⏳ TODO |
| **Admin** | `40Y-0` | — | `pages/AdminPage.tsx` | ⏳ TODO |
| **Releases** | `4EO-0` | — | `pages/ReleasesPage.tsx` | ⏳ TODO |
| **Settings** | `4S8-0` | — | `pages/SettingsPage.tsx` | ⏳ TODO |

---

## Порядок работы для каждой сессии

### Шаг 1 — Открыть Paper и получить JSX
```
mcp__paper__get_basic_info()  →  убедиться что файл FlowUniverse открыт
mcp__paper__get_screenshot(nodeId: "<artboard-id>")  →  визуальный осмотр
mcp__paper__get_jsx(nodeId: "<artboard-id>", format: "inline-styles")  →  получить все значения
```

### Шаг 2 — Написать страницу
- Открыть существующий файл страницы (Read)
- Скопировать всю логику (хуки, API, обработчики)
- Написать заново с нуля: токены → хелперы → JSX
- Файл в main repo: `/Users/pavelnovak/tasktime-mvp/frontend/src/pages/`

### Шаг 3 — Проверка TypeScript
```bash
bash -c 'cd /Users/pavelnovak/tasktime-mvp/frontend && npx tsc --noEmit 2>&1'
```

### Шаг 4 — Синхронизация в worktree
```bash
cp /Users/pavelnovak/tasktime-mvp/frontend/src/pages/PageName.tsx \
   /Users/pavelnovak/tasktime-mvp/.claude/worktrees/sweet-booth/frontend/src/pages/PageName.tsx
```

### Шаг 5 — Preview (port 5180)
```
preview_eval: window.location.href = 'http://localhost:5180/<route>'
preview_screenshot()  →  сравнить с Paper
```

### Шаг 6 — Коммит
```bash
git add frontend/src/pages/PageName.tsx
git commit -m "feat: rebuild PageName from Paper artboard XYZ (zero legacy)"
git push
```

---

## Особые предупреждения

### BoardPage — DnD НЕ ТРОГАТЬ
- Логика `@hello-pangea/dnd` (drag-and-drop) должна быть сохранена полностью
- Стилизовать только wrapper-элементы колонок и карточек
- Не изменять `onDragEnd`, `Droppable`, `Draggable` props

### IssueDetailPage — высокий риск
- Много вложенных компонентов, кастомные поля, комментарии, история
- Сначала screenshot + get_jsx, потом поэтапная замена блоков
- Тестировать каждый блок отдельно

### Frozen страницы (токены подтянутся автоматически через ConfigProvider)
`UatTestsPage`, `AdminMonitoringPage`, `AdminDashboardPage`,
`AdminIssueTypeConfigsPage`, `AdminIssueTypeSchemesPage`, `AdminLinkTypesPage`

---

## Структура файлов после каждой сессии

После каждой страницы:
1. **Код** — коммит в `UxUi/sweet-booth`
2. **Обновить эту таблицу** — поменять `⏳ TODO` на `✅ DONE`
3. **Обновить memory** — файл `MEMORY.md` в `.claude/projects/.../memory/`

---

## Команды запуска

```bash
# Основная разработка (main repo)
cd /Users/pavelnovak/tasktime-mvp
make dev  # backend + frontend одновременно

# Preview в worktree (для Claude preview tools)
cd /Users/pavelnovak/tasktime-mvp/.claude/worktrees/sweet-booth
cd frontend && npm run dev -- --port 5180

# TypeScript check
bash -c 'cd /Users/pavelnovak/tasktime-mvp/frontend && npx tsc --noEmit'

# Git workflow
git status
git add <files>
git commit -m "feat: ..."
git push
```

---

## Рекомендуемый порядок сессий

> Каждая сессия = Dark + Light обеих страниц за один раз.

1. ~~**Сессия 1:** Dashboard + Projects (dual-theme)~~ ✅ DONE
2. ~~**Сессия 2:** Sprints (dual-theme)~~ ✅ DONE — соседняя сессия
3. ~~**Сессия 3:** Login (`4O8-0`) + ProjectDetailPage (`FW-0`)~~ ✅ DONE — PR #143
4. **Сессия 4:** Time Tracking (`2RY-0`) + Global Sprints (`2HH-0`) — низкий риск
5. **Сессия 5:** Board (`1XE-0`) — средний риск (DnD caution)
5. **Сессия 5:** Teams (`39G-0`) + Business Teams (`3IE-0`) + Flow Teams (`3QE-0`)
6. **Сессия 6:** Releases (`4EO-0`) + Settings (`4S8-0`)
7. **Сессия 7:** Issue Detail (`30S-0`) — высокий риск, отдельная сессия
8. **Сессия 8:** Admin (`40Y-0`) + финальный QA
