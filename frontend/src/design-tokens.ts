/**
 * Flow Universe — Design Tokens
 *
 * ЕДИНСТВЕННЫЙ ИСТОЧНИК ПРАВДЫ.
 * Имена ключей должны совпадать с тем, что ожидает CSS.
 */

// ─── Dark theme ───────────────────────────────────────────────────────────────
export const dark = {
  bg:             '#080B14',
  bgSb:           '#0F1320',
  bgEl:           '#161B22',
  bgHover:        'rgba(255, 255, 255, 0.04)',
  bgActive:       'rgba(255, 255, 255, 0.06)',
  b:              '#21262D',
  b2:             '#30363D',
  b3:             '#30363D',
  t1:             '#E2E8F8',
  t2:             '#C9D1D9',
  t3:             '#8B949E',
  t4:             '#484F58',
  acc:            '#4F6EF7',
  accH:           '#6B85FF',
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

// ─── Layout & Spacing (ВОЗВРАЩАЮ ПОЛНЫЕ ИМЕНА) ───────────────────────────────
export const layout = {
  sidebarWidth:  210,  // --sidebar-width
  pagePadding:   24,   // --page-padding
  cardGap:       16,
  elementGap:    8,
  topbarHeight:  38,
  radiusCard:    12,   // --radius-card
  radiusButton:  8,    // --radius-button
  radiusPill:    6,
  radiusBadge:   3,
  radiusNavActive: 20,
} as const;

// ─── Typography ─────────────────────────────────────────────────────────────
export const typography = {
  fontDisplay: "'Space Grotesk', 'Inter', -apple-system, system-ui, sans-serif",
  fontSans:    "'Inter', -apple-system, system-ui, sans-serif",
  fsLabel:     13,
  fsBody:      12,
  fsMeta:      11,
} as const;
