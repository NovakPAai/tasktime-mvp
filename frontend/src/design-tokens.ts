/**
 * Flow Universe — Design Tokens
 *
 * ЕДИНСТВЕННЫЙ ИСТОЧНИК ПРАВДЫ.
 * Все значения взяты непосредственно из Paper (файл FlowUniverse, артборд "Design Tokens").
 *
 * Правило: менять значения ТОЛЬКО здесь, затем синхронизировать tokens.css вручную.
 * ConfigProvider в App.tsx импортирует эти константы напрямую — никаких hex-строк там нет.
 *
 * Структура:
 *   dark     — фоны, тексты, рамки dark-темы
 *   light    — фоны, тексты, рамки light-темы
 *   status   — цвета статусов задачи (shared, одинаковые в обеих темах)
 *   type     — цвета типов задач (EPIC / STORY / TASK / SUBTASK / BUG)
 *   semantic — success / warning / error / info
 *   layout   — размеры, радиусы, отступы
 */

// ─── Dark theme ───────────────────────────────────────────────────────────────
export const dark = {
  /** Фон страницы (base canvas) */
  bgMain:         '#080b14',
  /** Фон sidebar + карточек проекта/задачи */
  bgCard:         '#0f1320',
  /** Фон модальных окон, дропдаунов, elevated-поверхностей */
  bgElevated:     '#161b22',
  /** Основная рамка */
  border:         '#21262d',
  /** Вторичная рамка (разделители внутри компонентов) */
  borderSoft:     '#2d333b',
  /** Первичный текст */
  textPrimary:    '#e2e8f8',
  /** Вторичный текст (подзаголовки, метаданные) */
  textSecondary:  '#c9d1d9',
  /** Приглушённый текст (placeholder-уровень) */
  textMuted:      '#8b949e',
  /** Отключённый текст */
  textDisabled:   '#484f58',
  /** Placeholder в полях ввода */
  textPlaceholder:'#3d4d6b',
  /** Акцентный цвет (кнопки, ссылки, активные элементы) */
  accent:         '#4f6ef7',
  /** Hover-состояние акцента */
  accentHover:    '#6b85ff',
  /** Цвет ключей задач и ссылок */
  accentLinks:    '#6366f1',
  /** Фон активной вкладки / выделения */
  accentBg:       'rgba(79,110,247,0.12)',
  /** Hover-фон строки/элемента */
  bgHover:        'rgba(255,255,255,0.04)',
  /** Фон выбранного/активного элемента */
  bgActive:       'rgba(255,255,255,0.06)',
} as const;

// ─── Light theme ─────────────────────────────────────────────────────────────
export const light = {
  bgMain:         '#ffffff',
  bgCard:         '#f6f8fa',
  bgElevated:     '#ffffff',
  border:         '#d0d7de',
  borderSoft:     '#e8ecef',
  textPrimary:    '#1f2328',
  textSecondary:  '#656d76',
  textMuted:      '#8c959f',
  textDisabled:   '#afb8c1',
  textPlaceholder:'#9198a1',
  accent:         '#4f6ef7',
  accentHover:    '#3b5fff',
  accentLinks:    '#6366f1',
  accentBg:       'rgba(79,110,247,0.10)',
  bgHover:        'rgba(0,0,0,0.04)',
  bgActive:       'rgba(0,0,0,0.06)',
} as const;

// ─── Status colors (Paper: STATUS section) ────────────────────────────────────
// Одинаковы для dark и light.
export const status = {
  done:       '#4ade80',  // DONE — зелёный
  inProgress: '#f59e0b',  // IN PROGRESS — янтарный
  review:     '#a78bfa',  // REVIEW — фиолетовый
  open:       '#8b949e',  // OPEN — серый
  cancelled:  '#484f58',  // CANCELLED — тёмно-серый
} as const;

// ─── Issue type / priority colors (Paper: PRIORITY section) ──────────────────
export const issueType = {
  epic:    '#a855f7',  // EPIC badge
  story:   '#3b82f6',  // STORY badge
  task:    '#10b981',  // TASK / DONE project
  subtask: '#6b7280',  // SUBTASK (нейтральный)
  bug:     '#ef4444',  // CRITICAL / BUG
} as const;

// ─── Semantic ─────────────────────────────────────────────────────────────────
export const semantic = {
  success: '#4ade80',
  warning: '#f59e0b',
  error:   '#ef4444',
  info:    '#4f6ef7',
} as const;

// ─── Layout & spacing (Paper: SPACING & LAYOUT section) ──────────────────────
export const layout = {
  sidebarWidth:  220,  // px
  pagePadding:   24,   // px
  cardGap:       16,   // px
  elementGap:    8,    // px
  topbarHeight:  38,   // px
  /** Border-radius карточки */
  radiusCard:    12,
  /** Border-radius кнопки / input */
  radiusButton:  8,
  /** Border-radius filter-pill */
  radiusPill:    6,
  /** Border-radius badge типа задачи */
  radiusBadge:   3,
  /** Border-radius активного пункта навигации */
  radiusNavActive: 20,
} as const;

// ─── Typography (Paper: TYPOGRAPHY section) ───────────────────────────────────
export const typography = {
  fontDisplay: "'Space Grotesk', 'Inter', -apple-system, system-ui, sans-serif",
  fontSans:    "'Inter', -apple-system, system-ui, sans-serif",
  /** Button label, nav items */
  fsLabel:     13,
  /** Table title column */
  fsTableTitle:12,
  /** Body / card description */
  fsBody:      12,
  /** Timestamps, subtitles */
  fsMeta:      11,
  /** Table column headers (uppercase) */
  fsTableHeader: 10,
} as const;
