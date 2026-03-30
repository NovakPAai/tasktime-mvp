# TaskTime — UI Design System

**Версия:** 1.0 · Dark + Light
**Источник:** Paper / FlowUniverse (дизайн-файл)
**Статус:** Актуальный. Единственный авторитетный источник по UI.

> Все предыдущие указания на Linear, Jira, `#fafafa`, `#0052cc` и `FRONTEND_UI_ARCHITECTURE.md` — устарели и недействительны. При конфликте этот документ имеет приоритет.

---

## 1. Цветовая палитра

### Dark (основная тема)

| Переменная | Hex | Роль |
|-----------|-----|------|
| `--bg` | `#080B14` | Основной фон страницы |
| `--bg-sb` | `#0F1320` | Фон сайдбара / карточек |
| `--bg-el` | `#161B22` | Поднятые элементы (hover, elevated) |
| `--b` | `#21262D` | Граница |
| `--t1` | `#E2E8F8` | Основной текст |
| `--t2` | `#C9D1D9` | Вторичный текст |
| `--t3` | `#8B949E` | Приглушённый текст |
| `--t4` | `#484F58` | Отключённый текст |
| `--t-placeholder` | `#3D4D6B` | Placeholder |
| `--acc` | `#4F6EF7` | Акцент (кнопки, ссылки, активный элемент) |
| `--acc-links` | `#6366F1` | Ссылки / issue keys |
| `--acc-bg` | `rgba(79,110,247,0.12)` | Фон активной вкладки |
| `--acc-gradient` | `135deg, #4F6EF7, #7C3AED` | Градиент акцента |

### Light (альтернативная тема)

| Переменная | Hex | Роль |
|-----------|-----|------|
| `--bg` | `#FFFFFF` | Основной фон |
| `--bg-sb` | `#F6F8FA` | Фон сайдбара |
| `--b` | `#D0D7DE` | Граница |
| `--t1` | `#1F2328` | Основной текст |
| `--t3` | `#656D76` | Приглушённый текст |
| `--acc` | `#4F6EF7` | Акцент (тот же) |

### Статусы

| Переменная | Hex | Статус |
|-----------|-----|--------|
| `--s-done` | `#4ADE80` | DONE |
| `--s-inprog` | `#F59E0B` | IN PROGRESS / HIGH priority |
| `--s-review` | `#A78BFA` | REVIEW |
| `--s-open` | `#8B949E` | OPEN |
| `--s-cancelled` | `#484F58` | CANCELLED |

### Приоритеты и типы задач

| Переменная | Hex | Назначение |
|-----------|-----|-----------|
| `--p-critical` | `#EF4444` | CRITICAL / BUG |
| `--p-epic` | `#A855F7` | EPIC badge |
| `--p-story` | `#3B82F6` | STORY badge |
| `--p-task` | `#10B981` | TASK / DONE project |

---

## 2. Типографика

### Правила

- **Space Grotesk** — display: заголовки страниц, числа в карточках, логотип сайдбара, названия проектов/карточек, issue keys.
- **Inter** — body: кнопки, навигация, таблицы, мета-текст.

### Шкала

| Назначение | Шрифт | Размер | Вес | Letter-spacing |
|-----------|-------|--------|-----|----------------|
| Заголовок страницы | Space Grotesk | 26px | 700 | -0.03em |
| Числа в карточках (stats) | Space Grotesk | 20px | 700 | — |
| Логотип сайдбара | Space Grotesk | 16px | 700 | -0.02em |
| Название карточки/проекта | Space Grotesk | 14px | 600 | — |
| Issue key | Space Grotesk | 11px | 600 | — (цвет `--acc-links`) |
| Кнопки / nav items | Inter | 13px | 500 | — |
| Название задачи (таблица) | Inter | 12px | 500 | — |
| Вторичный body / описание | Inter | 12px | 400 | — |
| Метка / meta / timestamp | Inter | 11px | 400 | — |
| Заголовок колонки таблицы | Inter | 10px | 600 | 0.1em (uppercase) |

---

## 3. Отступы и лейаут

| Переменная | Значение | Назначение |
|-----------|----------|-----------|
| `--sidebar-w` | `220px` | Ширина сайдбара |
| `--page-pad` | `24px` | Padding страницы |
| `--card-gap` | `16px` | Gap между карточками |
| `--el-gap` | `8px` | Gap между элементами внутри группы |

---

## 4. Радиусы

| Переменная | Значение | Где |
|-----------|----------|-----|
| `--r` | `12px` | Карточки |
| `--r2` | `8px` | Кнопки / инпуты |
| `--r3` | `6px` | Filter pills |
| `--r4` | `3px` | Type badges |
| `--r-pill` | `20px` | Status / nav active pill |

---

## 5. Таблицы

| Параметр | Значение |
|---------|----------|
| Высота строки | 35px |
| Высота заголовка | 30px |
| Вертикальный padding ячейки | 6px |

---

## 6. Компоненты

Эталонный источник — артборд **Components** в Paper-файле FlowUniverse.

### Кнопки
- Primary: `--acc` background, белый текст, `--r2` radius
- Secondary (Board): прозрачный фон, `--b` border
- Cancel: только текст, `--t2` цвет
- Disabled: `--bg-el` background, `--t4` текст

### Type Badges (Issue types)
- EPIC: `--p-epic` + `--r4`
- STORY: `--p-story` + `--r4`
- TASK: `--p-task` + `--r4`
- BUG: `--p-critical` + `--r4`
- SUBTASK: `--t3` + `--r4`

### Status Indicators
- Точка + текст, цвет точки = `--s-*` переменная
- Active pill: `--acc-bg` background, `--acc` текст, `--r-pill`

### Search / Input
- Background: `--bg-el`
- Border: `--b`
- Placeholder: `--t-placeholder`
- Focus border: `--acc`
- Radius: `--r2`

### Progress Bar
- Background: `--bg-el`
- Fill: gradient `--acc-gradient`
- Высота: 3px

### Avatars
- Маленький (стэк): 24px, инициалы, `--r-pill`
- Стандартный: 32px

---

## 7. Правила для агентов — Paper Rebuild (актуально с 2026-03-25)

> Страницы пересоздаются с нуля по артбордам Paper. Эталон — `DashboardPage.tsx`, `ProjectsPage.tsx`.

### Обязательный паттерн каждой страницы

```tsx
// ─── Tokens Dark (Paper XYZ-0) ──────────────────────────
const DARK_C = { bg: '#080B14', bgCard: '#0F1320', border: '#1E2640', ... };

// ─── Tokens Light (Paper ABC-0) ─────────────────────────
const LIGHT_C = { bg: '#F0F2FA', bgCard: '#FFFFFF', border: '#E4E7F5', ... };

export default function PageName() {
  const { mode } = useThemeStore();
  const C = mode === 'light' ? LIGHT_C : DARK_C;
  // theme-aware configs (STATUS_CFG и т.п.) — здесь, не на уровне модуля
}
```

### Правила

1. **Обе темы за одну сессию.** Dark + Light реализуются одновременно — no deferred debt.
2. **Ноль CSS классов.** Все стили — `style={{...}}` inline. Никаких `className`, никаких `tt-*`.
3. **Ноль Ant Design Layout.** `<Layout>`, `<Sider>`, `<Header>`, `<Content>` — запрещены. Ant Design — только для `Modal/Form/Input/Tooltip/Dropdown`.
4. **Источник — только Paper.** `get_jsx(nodeId, format:"inline-styles")` на оба артборда перед написанием.
5. **Логика сохраняется без изменений.** `useStore`, `useEffect`, API-вызовы, роутинг — не трогать.
6. **theme-aware объекты** (STATUS_CFG, badge-цвета) — определять внутри компонента после `const C = ...`, не на уровне модуля.
7. **Шрифты:** `'"Space Grotesk", system-ui, sans-serif'` (display, числа, ключи), `'"Inter", system-ui, sans-serif'` (body).

---

## 8. Подключение шрифтов

В `index.html` должны быть подключены оба шрифта:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
```

В `styles.css`:
```css
--font-display: 'Space Grotesk', system-ui, sans-serif;
--font-sans: 'Inter', system-ui, sans-serif;
```

---

## 9. Связанные файлы

| Файл | Роль |
|------|------|
| `docs/plans/2026-03-25-paper-ui-rebuild-plan.md` | Сессионный план: порядок страниц, артборды, статус |
| `frontend/src/pages/DashboardPage.tsx` | Эталон паттерна (dual-theme, inline styles) |
| `frontend/src/pages/ProjectsPage.tsx` | Эталон паттерна (dual-theme, STATUS_CFG внутри компонента) |
| `frontend/src/store/theme.store.ts` | `useThemeStore` — `mode: 'dark' \| 'light'`, `toggle()` |
| `frontend/src/styles.css` | CSS-переменные (legacy, не использовать в новых страницах) |
| `frontend/src/App.tsx` | `ConfigProvider` тема |
| Paper / FlowUniverse | Эталонный дизайн-файл (артборды + токены) |

**Устаревшие документы (не использовать):**
- `docs/ENG/architecture/FRONTEND_UI_ARCHITECTURE.md` — заменён этим документом
- Любые упоминания "dark Linear-like" или "Jira-like" в `docs/plans/`
