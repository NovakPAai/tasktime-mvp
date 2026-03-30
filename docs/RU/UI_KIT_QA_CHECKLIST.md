# UI Kit 2.0 — Visual QA Checklist (TTUI-113)

**Sprint:** Ф6 QA + деплой
**Дата:** 2026-03-22
**Версия:** UI Kit 2.0 (Ф0–Ф5 смержены в main)

---

## 1. Общее (все страницы)

| # | Проверка | Dark ✓ | Light ✓ |
|---|----------|--------|---------|
| 1.1 | Фоны используют токены `--bg`, `--bg-el`, `--bg-sb` | ☐ | ☐ |
| 1.2 | Текст использует `--t1`, `--t2`, `--t3` | ☐ | ☐ |
| 1.3 | Акцент: `--acc` `#4f6ef7` (dark) / `#4f6ef7` (light) | ☐ | ☐ |
| 1.4 | Border: `--b` / `--b2` без захардкоженных hex | ☐ | ☐ |
| 1.5 | Шрифты: Space Grotesk (заголовки) + Inter (body) | ☐ | ☐ |
| 1.6 | Border-radius: cards 12px, buttons 8px, badges 6px | ☐ | ☐ |
| 1.7 | Переключение тем: dark ↔ light без перезагрузки | ☐ | ☐ |
| 1.8 | Sidebar «Flow Universe» брендинг и навигация | ☐ | ☐ |
| 1.9 | Planning submenu: Спринты + Релизы | ☐ | ☐ |
| 1.10 | Топбар: имя пользователя, роль, тема-тоггл, logout | ☐ | ☐ |

---

## 2. Страницы

### 2.1 Login (`/login`)
| # | Проверка | ✓ |
|---|----------|---|
| 2.1.1 | Левая панель: форма входа/регистрации | ☐ |
| 2.1.2 | Правая панель: космос, орбиты, StarCanvas | ☐ |
| 2.1.3 | Footer: «Flow Universe · © 2026» | ☐ |
| 2.1.4 | `.auth-btn` использует `var(--acc)` | ☐ |
| 2.1.5 | Input focus: `var(--shadow-acc)` outline | ☐ |

### 2.2 Dashboard (`/`)
| # | Проверка | ✓ |
|---|----------|---|
| 2.2.1 | Stat-карточки: radial glow `rgba(79,110,247,0.2)` | ☐ |
| 2.2.2 | Числа в stat-карточках: Space Grotesk 700 | ☐ |
| 2.2.3 | Панели Issues by Status / Assignee: заголовок `var(--t1)` | ☐ |
| 2.2.4 | Панели: border `var(--b)` (не захардкоженный) | ☐ |

### 2.3 Projects (`/projects`)
| # | Проверка | ✓ |
|---|----------|---|
| 2.3.1 | Project Card: radial glow в правом верхнем углу | ☐ |
| 2.3.2 | Active glow: `rgba(99,102,241,0.22)` | ☐ |
| 2.3.3 | OnHold glow: `rgba(245,158,11,0.14)` | ☐ |
| 2.3.4 | Archived: opacity 0.7, без glow | ☐ |
| 2.3.5 | Фильтр-таб Archived отображается | ☐ |
| 2.3.6 | Прогресс-бар: gradient `#4f6ef7 → #7c3aed` | ☐ |

### 2.4 Board (`/projects/:id/board`)
| # | Проверка | ✓ |
|---|----------|---|
| 2.4.1 | Колонки: тёмные rgba tints, не светлые пастели | ☐ |
| 2.4.2 | DnD работает (перетаскивание карточек) | ☐ |
| 2.4.3 | Kanban-карточки: radial glow `rgba(79,110,247,0.16)` | ☐ |
| 2.4.4 | Chip статуса DONE: `rgba(79,110,247,0.18)` | ☐ |
| 2.4.5 | Hover карточки: border `rgba(79,110,247,0.7)` | ☐ |

### 2.5 Sprints — project (`/projects/:id/sprints`)
| # | Проверка | ✓ |
|---|----------|---|
| 2.5.1 | Sprint list panel: стиль `.tt-panel` с glow | ☐ |
| 2.5.2 | Пилюля «Закрыт»: `rgba(79,110,247,0.16)` синий | ☐ |
| 2.5.3 | Sprint detail: прогресс-бар, даты | ☐ |

### 2.6 Global Sprints (`/sprints`)
| # | Проверка | ✓ |
|---|----------|---|
| 2.6.1 | Sprint cards: стили `.tt-panel.tt-sprint-card` | ☐ |
| 2.6.2 | Фильтры по состоянию и проекту | ☐ |

### 2.7 Time (`/time`)
| # | Проверка | ✓ |
|---|----------|---|
| 2.7.1 | Активный таймер: border `var(--acc)`, bg accent tint | ☐ |
| 2.7.2 | Elapsed: Space Grotesk `var(--font-display)` | ☐ |
| 2.7.3 | Filter pills: Today / Last 7 / Last 30 / All | ☐ |

### 2.8 Issue Detail (`/issues/:id`)
| # | Проверка | ✓ |
|---|----------|---|
| 2.8.1 | Header: breadcrumb + issue key badge | ☐ |
| 2.8.2 | Aside панели: Details, AI Execution, Time Tracking | ☐ |
| 2.8.3 | Issue preview drawer: background `var(--bg-el)` | ☐ |
| 2.8.4 | Comments: `.tt-comment-bubble` стиль | ☐ |
| 2.8.5 | History timeline отображается | ☐ |

### 2.9 Teams (`/teams`)
| # | Проверка | ✓ |
|---|----------|---|
| 2.9.1 | Таблица команд с avatarами | ☐ |
| 2.9.2 | Avatar.Group: стекированные иконки членов | ☐ |

### 2.10 Releases — project (`/projects/:id/releases`)
| # | Проверка | ✓ |
|---|----------|---|
| 2.10.1 | Список релизов: `.tt-panel` стиль | ☐ |
| 2.10.2 | Readiness block: border `var(--b)` (не var(--border)) | ☐ |
| 2.10.3 | State transitions: Черновик → Готов → Выпущен | ☐ |

### 2.11 Global Releases (`/releases`)
| # | Проверка | ✓ |
|---|----------|---|
| 2.11.1 | Страница загружается | ☐ |
| 2.11.2 | Релизы сгруппированы по проекту | ☐ |
| 2.11.3 | Фильтр по состоянию работает | ☐ |

### 2.12 Settings (`/settings`)
| # | Проверка | ✓ |
|---|----------|---|
| 2.12.1 | Profile section: имя, email, роль | ☐ |
| 2.12.2 | Theme toggle работает | ☐ |
| 2.12.3 | Typography preview: Space Grotesk + Inter | ☐ |

---

## 3. Cross-browser (TTUI-114)

| Браузер | Версия | ✓ |
|---------|--------|---|
| Chrome | 139+ | ☐ |
| Yandex Browser | 25+ | ☐ |
| Edge | 139+ | ☐ |
| Safari | 18+ | ☐ |

**Специфичные проверки:**
- [ ] CSS `@font-face` загружает woff2 из `/public/fonts/`
- [ ] CSS custom properties (var(--*)) работают во всех браузерах
- [ ] DnD в BoardPage без рывков
- [ ] Анимация sound тоггл темы (class `animating` на `.tt-theme-toggle`)

---

## 4. Производительность

| Метрика | Цель | Фактическое |
|---------|------|------------|
| Page Load | < 2s | ☐ |
| API (p95) | < 200ms | ☐ |
| Font load | < 500ms (self-hosted) | ☐ |
| Bundle size | < 1.5MB gzip | ☐ |

---

## 5. Деплой checklist (TTUI-115/116)

### Staging
- [ ] `git pull origin main` на staging-сервере
- [ ] `npm run build` прошёл без ошибок
- [ ] `npx prisma migrate deploy` применил все миграции
- [ ] Health check `/api/health` отвечает 200
- [ ] Self-hosted шрифты доступны: `GET /fonts/space-grotesk-700.woff2` → 200
- [ ] Smoke test: логин → dashboard → projects → board

### Production (`http://5.129.242.171`)
- [ ] Backup БД перед деплоем
- [ ] `make deploy` или ручной деплой по `deploy.sh`
- [ ] Rollback plan готов: `rollback.sh` + предыдущий Docker image
- [ ] После деплоя: smoke test всех маршрутов
- [ ] Мониторинг: нет 500 ошибок в логах 15 минут после деплоя

---

## 6. Известные ограничения

| # | Описание | Приоритет |
|---|----------|-----------|
| 6.1 | Backend TypeScript errors (Prisma типы в admin.service.ts) — предсуществующие, не блокируют UI | LOW |
| 6.2 | Два источника правды: CSS vars + ConfigProvider токены (TTUI-118) | MEDIUM |
| 6.3 | Responsive-версия не протестирована (only desktop 1440px в scope) | LOW |
| 6.4 | UAT Tests, AdminMonitoringPage — frozen, без визуального обновления | LOW |
