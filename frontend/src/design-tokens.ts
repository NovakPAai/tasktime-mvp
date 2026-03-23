/**
 * Flow Universe — Design Tokens
 *
 * ЕДИНСТВЕННЫЙ ИСТОЧНИК ПРАВДЫ.
 * Имена ключей должны СТРОГО совпадать с именами переменных в CSS (после kebab-case).
 * Например: bgSb -> --bg-sb
 */

// ─── Dark theme ───────────────────────────────────────────────────────────────
export const dark = {
  bg:             '#080B14', // --bg
  bgSb:           '#0F1320', // --bg-sb
  bgEl:           '#161B22', // --bg-el
  bgHover:        'rgba(255, 255, 255, 0.04)',
  bgActive:       'rgba(255, 255, 255, 0.06)',
  b:              '#21262D', // --b
  b2:             '#30363D', // --b2
  b3:             '#30363D', // --b3
  t1:             '#E2E8F8', // --t1
  t2:             '#C9D1D9', // --t2
  t3:             '#8B949E', // --t3
  t4:             '#484F58', // --t4
  acc:            '#4F6EF7', // --acc
  accH:           '#6B85FF', // --acc-h
  accBg:          'rgba(79, 110, 247, 0.12)',
} as const;

// ─── Light theme ─────────────────────────────────────────────────────────────
export const light = {
  bg:             '#FFFFFF',
  bgSb:           '#F6F8FA',
  bgEl:           '#FFFFFF',
  bgHover:        'rgba(0, 0, 0, 0.04)',
  bgActive:       'rgba(0, 0, 0, 0.06)',
  b:              '#D0D7DE',
  b2:             '#D0D7DE',
  b3:             '#D0D7DE',
  t1:             '#1F2328',
  t2:             '#656D76',
  t3:             '#8B949E',
  t4:             '#AFB8C1',
  acc:            '#4F6EF7',
  accH:           '#3B5FFF',
  accBg:          'rgba(79, 110, 247, 0.10)',
} as const;

// ─── Status colors ────────────────────────────────────────────────────────────
export const status = {
  done:       '#4ADE80',
  inProgress: '#F59E0B',
  review:     '#A78BFA',
  open:       '#8B949E',
  cancelled:  '#484F58',
} as const;

// ─── Issue type colors ────────────────────────────────────────────────────────
export const issueType = {
  epic:    '#A855F7',
  story:   '#3B82F6',
  task:    '#10B981',
  subtask: '#6B7280',
  bug:     '#EF4444',
} as const;

// ─── Semantic ─────────────────────────────────────────────────────────────────
export const semantic = {
  success: '#4ADE80',
  warning: '#F59E0B',
  error:   '#EF4444',
  info:    '#4F6EF7',
} as const;

// ─── Layout & Spacing ────────────────────────────────────────────────────────
export const layout = {
  sidebarW:      210,  // --sidebar-w
  pageP:         24,   // --page-p
  cardGap:       16,
  elementGap:    8,
  topbarH:       38,
  r:             12,   // --r
  r2:            8,    // --r2
  r3:            6,    // --r3
  rBadge:        3,
  rActive:       20,
} as const;

// ─── Typography ─────────────────────────────────────────────────────────────
export const typography = {
  fontDisplay: "'Space Grotesk', 'Inter', -apple-system, system-ui, sans-serif",
  fontSans:    "'Inter', -apple-system, system-ui, sans-serif",
  fsLabel:     13,
  fsBody:      12,
  fsMeta:      11,
} as const;
