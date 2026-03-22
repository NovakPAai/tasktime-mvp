# Flow Universe UI Kit 2.0 — Документация

**Статус:** Дизайн в Paper завершён ✅ | Реализация: запланирована (TTUI-6)
**Дата:** 2026-03-21
**Production:** http://5.129.242.171

---

## Обзор

UI Kit — единая дизайн-система Flow Universe. Покрывает Dark и Light темы, все экраны системы.
Принцип: **дизайн в Paper → ревью → код → деплой**. Никогда не кодируем без утверждённого дизайна.

---

## Дизайн-токены

### Цветовая палитра

#### Dark тема (основная)
```css
/* Backgrounds */
--bg:       #03050F   /* основной фон (космос) */
--bg-sb:    #0B1535   /* сайдбар */
--bg-el:    #0F1320   /* карточки / elevated */
--bg-hover: #1E2640   /* hover состояние */
--bg-input: #161E30   /* поля ввода */

/* Borders */
--b:  #1E2640
--b2: #21262D
--b3: #2D3A52

/* Text */
--t1: #E2E8F8   /* основной текст */
--t2: #8B949E   /* вторичный */
--t3: #3D4D6B   /* мутный / подписи */
--t4: #2D3A52   /* очень мутный */

/* Accent */
--acc:    #4F6EF7   /* primary blue-violet */
--acc-h:  #6B85FF   /* hover */
--acc-bg: rgba(79,110,247,0.12)
```

#### Light тема (day cosmos)
```css
--bg:    #F5F3FF
--bg-el: #FDFCFF
--bg-sb: #EDE9FE
--t1:    #2E1065
--t2:    #6D28D9
--acc:   #4F6EF7
```

### Статусные цвета

| Статус | Цвет | Использование |
|--------|------|---------------|
| Active / Done | `#22C55E` | Зелёный |
| On Hold / In Progress | `#F59E0B` | Янтарный |
| Review | `#A78BFA` | Фиолетовый |
| Cancelled / Archived | `#3D4D6B` | Мутный серо-синий |
| Error / Critical | `#EF4444` | Красный |
| Primary | `#4F6EF7` | Синий акцент |

### Типографика

| Шрифт | Использование | Начертание |
|-------|---------------|------------|
| Space Grotesk | Заголовки, числа, лого | 600, 700 |
| Inter | Тело, подписи, UI | 400, 500, 600 |

**⚠️ Self-hosted обязательно** — CDN недоступен в изолированных корпоративных сетях.
Файлы: `/public/fonts/SpaceGrotesk-*.woff2`, `/public/fonts/Inter-*.woff2`

### Spacing & Radius

```css
/* Border radius */
--r:  12px  /* карточки */
--r2: 8px   /* кнопки, инпуты */
--r3: 6px   /* теги, бейджи */
--r4: 20px  /* пилюли / badges */

/* Shadows */
--shadow-sm: 0 1px 3px rgba(0,0,0,0.3)
--shadow-md: 0 4px 12px rgba(0,0,0,0.4)
```

---

## Компоненты (`/src/components/ui/`)

### ProjectStatusBadge
Пилюля с точкой-индикатором и цветным текстом.

| Вариант | Фон | Граница | Точка | Текст |
|---------|-----|---------|-------|-------|
| Active | `rgba(34,197,94,0.12)` | `rgba(34,197,94,0.35)` | `#22C55E` | `#22C55E` |
| On Hold | `rgba(245,158,11,0.10)` | `rgba(245,158,11,0.25)` | `#F59E0B` | `#F59E0B` |
| Archived | `rgba(45,58,82,0.40)` | `#1E2640` | нет | `#3D4D6B` |

```tsx
<ProjectStatusBadge status="ACTIVE" />   // • Active
<ProjectStatusBadge status="ON_HOLD" />  // • On Hold
<ProjectStatusBadge status="ARCHIVED" /> //   Archived
```

### ProjectCard
Карточка проекта с радиальным свечением в правом верхнем углу.

**Структура:**
```
[Icon 36×36] [Name / KEY]          [StatusBadge]
[Description — цвет #4A5568, 12px Inter]
[42 / открытых задач | Sprint 4 / текущий спринт | 78% / выполнено]
[ProgressBar — gradient #4F6EF7 → #7C3AED]
[AvatarGroup]                      [2 дня назад]
[Radial glow — position:absolute top:-30px right:-30px 100×100px]
```

**Glow по вариантам:**
- Active: `rgba(99,102,241,0.22)` (фиолетовый)
- On Hold: `rgba(245,158,11,0.14)` (янтарный)
- Archived: нет glow, `opacity: 0.7`, фон `#0C1019`

### AvatarGroup
Стековые аватары, `margin-left: -6px`, `border: 2px solid var(--bg-el)`.
Максимум 3 аватара + `+N` счётчик.

### ProgressBar
`height: 3px`, `border-radius: 99px`
- Active: `linear-gradient(90deg, #4F6EF7 0%, #7C3AED 100%)`
- On Hold: `linear-gradient(90deg, #FCD34D 0%, #F59E0B 100%)`
- Archived: `background-color: #2D3A52`

### IssuePriorityTag
| Приоритет | Цвет |
|-----------|------|
| CRITICAL | `#EF4444` |
| HIGH | `#F59E0B` |
| MEDIUM | `#6366F1` |
| LOW | `#3D4D6B` |

### IssueTypeTag
Бейджи из Paper Components артборда: EPIC / STORY / TASK / SUBTASK / BUG.

---

## Артборды в Paper (33 шт)

Раскладка: парные ряды, Dark слева (x=0), Light справа (x=1520), gap 80px по вертикали.

| Ряд | Dark | Light |
|-----|------|-------|
| 0 | Design Tokens | Components | (+ Sidebar) |
| 1 | Login Dark | Login Light |
| 2 | Dashboard Dark | Dashboard Light |
| 3 | Board Dark | Board Light |
| 4 | Sprints Dark | Sprints Light |
| 5 | Global Sprints Dark | Global Sprints Light |
| 6 | Time Tracking Dark | Time Tracking Light |
| 7 | Issue Detail Dark | Issue Detail Light |
| 8 | Teams Dark | Teams Light |
| 9 | Business Teams Dark | Business Teams Light |
| 10 | Flow Teams Dark | Flow Teams Light |
| 11 | Admin Dark | Admin Light |
| 12 | Releases Dark | Releases Light |
| 13 | Settings Dark | Settings Light |

### Login — особенности
- **Dark:** SVG космическая заставка: фон `#03050F`, планета cx=470 cy=385, 4 орбиты, 9 спутников, звёзды
- **Light (Day cosmos):** лавандовый фон `#F5F3FF`, та же структура но пастельные тона, планета с белым highlight
- Убрано: «или» divider, «Запросить доступ» ссылка
- Бренд: «Flow Universe» Space Grotesk 64px внизу панели
- Футер: «Flow Universe · © 2026»

---

## Frozen страницы (без дизайна в UI Kit)

Токены из Design Tokens фазы подтянутся автоматом через ConfigProvider.
Логику и структуру этих страниц **не менять**.

- `UatTestsPage.tsx`
- `AdminMonitoringPage.tsx`
- `AdminDashboardPage.tsx`
- `AdminIssueTypeConfigsPage.tsx`
- `AdminIssueTypeSchemesPage.tsx`
- `AdminLinkTypesPage.tsx`

**Техдолг TTUI-122:** добавить артборды для этих страниц в Paper в следующей итерации.

---

## План реализации

Полный план с зависимостями, рисками и техдолгом: [TTUI-6](http://5.129.242.171/issues/03bea38b-f9fa-43c3-bc97-d0c43fab094a)

### Порядок выполнения (критические зависимости)

```
Ф0: Pre-flight (git sync + аудит)
  └─► Ф1: Design Tokens (CSS vars + Ant Design ConfigProvider)
         └─► Ф2: Shared Components (/src/components/ui/)
                └─► Ф3: Страницы низкий риск (Login, Projects, Settings)
                └─► Ф4: Страницы средний риск (Dashboard, Board, Sprints, Time, Teams)
                └─► Ф5: Страницы высокий риск (Issue Detail, Admin, Releases)
                       └─► Ф6: QA и деплой
```

### Правила реализации

1. **Перед стартом:** `git pull origin main` — работать только с актуальным репо
2. **Frozen страницы:** оставить as-is (токены обновятся автоматом)
3. **Board:** не трогать логику `@hello-pangea/dnd` — только wrapper стили
4. **Issue Detail:** обновлять снаружи внутрь (сначала layout, потом вложенные компоненты)
5. **Admin:** только цвета/типографика, RBAC логику не трогать
6. **API:** нельзя изменять существующие вызовы, типы данных, роуты
7. **TypeScript:** `tsc --noEmit` должен проходить после каждой страницы

### QA чеклист (на каждую страницу)

```
[ ] Dark тема — все тексты читаемы (contrast ratio > 4.5:1)
[ ] Light тема — все тексты читаемы
[ ] Hover / focus состояния работают
[ ] Loading states сохранены
[ ] Error states сохранены
[ ] Responsive: 1280 / 1440 / 1920px
[ ] API вызовы не изменились (Network tab)
[ ] RBAC роли корректны (admin / manager / user / viewer)
[ ] tsc --noEmit — без ошибок
[ ] npm run lint — чистый
```

### Браузеры
Chrome 139+, Yandex Browser 25+, Edge 139+, Safari 18+

---

## Ключевые риски

| Риск | Вероятность | Митигация |
|------|-------------|-----------|
| Merge conflict при работе на устаревшей ветке | Средняя | Ф0: git sync перед стартом |
| Space Grotesk CDN недоступен за корпоративным прокси | Средняя | Self-host в /public/fonts/ (TTUI-119) |
| CSS vars конфликтуют с Ant Design CSS-in-JS | Средняя | CSS vars только на кастомных элементах |
| DnD Board поломка при изменении layout | Низкая | Стилизовать только wrapper, DnD логику не трогать |
| Staging secrets не настроены (P1 блокер) | Высокая | Настроить GitHub Secrets до Ф6 |
| Два источника правды (CSS vars + Ant Design) | Высокая | Консолидировать в Ф1, решение в TTUI-118 |

---

## Навигация (TTUI-127) ✅ Решение принято

**Решение (2026-03-21):** заменить пункт «Sprints» на «Planning» с вложением:

```
Planning
  ├── Sprints   → SprintsPage
  └── Releases  → ReleasesPage
```

**Обоснование:** иметь два отдельных пункта (Sprints + Releases) создаёт визуальный оверхед в сайдбаре. Секция «Planning» логически объединяет оба инструмента планирования, сохраняет сайдбар компактным.

**Реализация — Ф2.7 (AppLayout update):**
- Пункт «Sprints» в сайдбаре заменяется на «Planning» с вложенным меню
- При клике на «Planning» — разворачивается подсписок Sprints / Releases
- Активный подпункт подсвечивается gradient-акцентом (как сейчас активный пункт)
- Иконки: Planning → `CalendarOutlined`, Sprints → `ThunderboltOutlined`, Releases → `TagOutlined`

**Что показывать в Releases:**
- Название версии (v1.0.0, MVP Release)
- Статус: Draft / In Progress / Released / Archived
- Целевая дата + прогресс (X из Y задач)
- Список задач в релизе
- Release notes / описание
- Для финтеха: Released = freeze, audit trail

---

## AI Модуль в навигации (TTUI-128) 🔴 Требует решения

### Текущее состояние
AI функции (оценка трудоёмкости + декомпозиция задач) реализованы в бэкенде и встроены **только в `IssueDetailPage`** как боковая панель «AI Execution». В навигации сайдбара AI-модуль отсутствует.

**Существующие API:**
- `POST /api/ai/estimate` — AI-оценка трудоёмкости задачи
- `POST /api/ai/decompose` — AI-декомпозиция задачи на подзадачи
- `POST /api/ai-sessions` — регистрация AI-сессий (ADMIN/MANAGER)

**Существующие поля задач:** `aiEligible`, `aiAssigneeType` (AGENT/HUMAN/MIXED), `aiExecutionStatus` (NOT_STARTED/IN_PROGRESS/DONE/FAILED)

### Решение (2026-03-22)

**Добавить отдельный раздел «AI» в группу «Инструменты» сайдбара** — рядом с UAT.

```
Инструменты
  ├── AI        → AiPage          (RobotOutlined)
  └── UAT       → UatTestsPage
```

**Почему не в главной навигации:** AI — вспомогательный инструмент, не основной рабочий поток. Группа «Инструменты» семантически правильнее.
**Почему не только в IssueDetail:** PM и тимлиды должны видеть сводку по всем AI-задачам без захода в каждую задачу.

### Что показывать на странице AI (`/ai`)

```
┌─────────────────────────────────────────────────────┐
│  🤖 AI Ассистент                                    │
│                                                     │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐  │
│  │  На оценке  │ │ В работе ИИ │ │  Завершено  │  │
│  │     12      │ │      5      │ │     89      │  │
│  └─────────────┘ └─────────────┘ └─────────────┘  │
│                                                     │
│  Задачи AI-агента ──────────────────────────────── │
│  [фильтр по статусу / проекту]                     │
│  Таблица: ключ | название | статус | оценка | кто  │
└─────────────────────────────────────────────────────┘
```

**Контент страницы:**
- Статистика: задачи по `aiExecutionStatus` (NOT_STARTED / IN_PROGRESS / DONE / FAILED)
- Таблица задач с `aiEligible = true` с фильтрами (проект, статус AI, исполнитель)
- Возможность запустить оценку/декомпозицию прямо из таблицы (quick action)
- История AI-сессий (для ADMIN/MANAGER)

**RBAC:** страница доступна всем ролям (VIEWER видит без кнопок действий).

### Реализация — Ф5 (Страницы высокий риск)

1. Создать `frontend/src/pages/AiPage.tsx`
2. Добавить роут `/ai` в `App.tsx`
3. Добавить пункт в `AppLayout.tsx` → группа «Инструменты» (вместе с Ф2.7)
4. Добавить API: `GET /api/ai/tasks` — задачи с `aiEligible = true` (добавить в бэкенд)

### Артборд в Paper
⏳ Нужно нарисовать: AI Dark + AI Light (добавить в TTUI-128)

---

*Документ обновлён: 2026-03-22*
