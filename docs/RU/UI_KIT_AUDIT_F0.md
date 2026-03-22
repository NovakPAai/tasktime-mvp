# Ф0: Pre-flight Audit — UI Kit 2.0

**Дата:** 2026-03-22
**Ветка:** `claude/jack-ui-kit-f0-preflight`
**Задачи:** TTUI-88, TTUI-89, TTUI-90

---

## 1. Синхронизация с репо ✅

Ветка создана от актуального `origin/main` (коммит `ae5c147`).

---

## 2. Дельта: Production vs UI Kit 2.0 Paper

### CSS-переменные (`frontend/src/styles.css`)

| Токен | Сейчас (production) | UI Kit 2.0 цель |
|-------|---------------------|-----------------|
| `--bg` | `#111117` | `#03050F` |
| `--bg-sb` | `#08080b` | `#0B1535` |
| `--bg-el` | `#181821` | `#0F1320` |
| `--bg-hover` | `rgba(255,255,255,0.04)` | `#1E2640` |
| `--bg-input` | `#1e1e28` | `#161E30` |
| `--b` | `rgba(255,255,255,0.07)` | `#1E2640` |
| `--b2` | `rgba(255,255,255,0.1)` | `#21262D` |
| `--b3` | `rgba(255,255,255,0.14)` | `#2D3A52` |
| `--t1` | `#e2e2e8` | `#E2E8F8` |
| `--t2` | `#8c8c9e` | `#8B949E` |
| `--t3` | `#6e6e82` | `#3D4D6B` |
| `--acc` | `#7b86ff` | `#4F6EF7` |
| `--acc-h` | `#9aa4ff` | `#6B85FF` |
| `--acc-bg` | `rgba(123,134,255,0.22)` | `rgba(79,110,247,0.12)` |
| `--r` | `10px` | `12px` |
| `--r2` | `6px` | `8px` |
| `--r3` | `4px` | `6px` |
| Light `--bg` | `#f5f5f7` | `#F5F3FF` |
| Light `--bg-el` | `#ffffff` | `#FDFCFF` |
| Light `--bg-sb` | `#eaeaed` | `#EDE9FE` |
| Light `--t1` | `#1a1a2e` | `#2E1065` |
| Light `--t2` | `#5a5a72` | `#6D28D9` |
| Light `--acc` | `#5e6ad2` | `#4F6EF7` |

### Ant Design ConfigProvider (`frontend/src/App.tsx`)

| Токен | Сейчас | UI Kit 2.0 цель |
|-------|--------|-----------------|
| `colorPrimary` dark | `#7b86ff` | `#4F6EF7` |
| `colorPrimary` light | `#5e6ad2` | `#4F6EF7` |
| `colorPrimaryHover` dark | `#9aa4ff` | `#6B85FF` |
| `colorSuccess` | `#4caf7d` | `#22C55E` |
| `borderRadius` | `6` | `12` |
| `borderRadiusSM` | `4` | `8` |
| `borderRadiusLG` | `10` | `20` |
| `fontFamily` | Inter only | Space Grotesk + Inter |

### Шрифты

- **Space Grotesk** — не подключён. Нет файлов в `frontend/public/fonts/`
- **Inter** — подключён через `--font-sans` CSS var (нужно проверить self-hosting)
- **`frontend/public/`** — директория не существует, нужно создать

### Компоненты

- **`frontend/src/components/ui/`** — директория не существует, создать в Ф2

### Навигация (`AppLayout.tsx`)

- `Sprints` — standalone пункт меню
- `Releases` — страница существует (`ReleasesPage.tsx`), в навигацию не вынесена
- **Решение (TTUI-127):** заменить `Sprints` на `Planning` (submenu: Sprints + Releases) — реализовать в Ф2.7

---

## 3. Frozen страницы ✅ (TTUI-90)

Страницы, которые **не трогаем** (логика остаётся as-is, токены обновятся автоматически через ConfigProvider):

| Файл | Причина freeze |
|------|---------------|
| `UatTestsPage.tsx` | Тестовый инструмент, нет артборда |
| `AdminMonitoringPage.tsx` | Нет артборда в UI Kit |
| `AdminDashboardPage.tsx` | Нет артборда в UI Kit |
| `AdminIssueTypeConfigsPage.tsx` | Нет артборда в UI Kit |
| `AdminIssueTypeSchemesPage.tsx` | Нет артборда в UI Kit |
| `AdminLinkTypesPage.tsx` | Нет артборда в UI Kit |

---

## 4. Дополнительные риски, выявленные при аудите

1. **Два источника правды:** CSS vars в `styles.css` + ConfigProvider в `App.tsx` — консолидировать в Ф1 (TTUI-118)
2. **`@hello-pangea/dnd` в `BoardPage.tsx`** — DnD логика: стилизовать только внешние wrapper'ы, не трогать DnD-специфичные атрибуты
3. **Space Grotesk self-hosting** — P1 для корпоративных сетей (Astra Linux, Red OS), решить в Ф1 (TTUI-119)
4. **`AppLayout.tsx` — монолит:** содержит сайдбар + топбар + тему + роли в одном файле (500+ строк). Рефакторинг запланирован в TTUI-121, но НЕ в этом этапе — только стилизация
5. **AI модуль не в навигации (TTUI-128):** `AiPage` не существует, `/ai` не в сайдбаре. Бэкенд и логика в `IssueDetailPage` реализованы — нужна страница + навигация. Добавить в Ф5.

---

## 5. Статус задач Ф0

- [x] TTUI-88: git sync — ветка от актуального `origin/main`
- [x] TTUI-89: аудит Production vs Paper — дельты задокументированы
- [x] TTUI-90: список frozen страниц — 6 страниц подтверждено

---

**Вывод:** кодовая база готова к Ф1. Ни CI, ни тесты не затронуты. Следующий шаг — `claude/jack-ui-kit-f1-tokens`.
