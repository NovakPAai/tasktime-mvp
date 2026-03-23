/**
 * Flow Universe — Design Tokens
 *
 * ЕДИНСТВЕННЫЙ ИСТОЧНИК ПРАВДЫ.
 * Все значения синхронизированы с Paper (артборд "Design Tokens").
 *
 * Эти токены используются в ConfigProvider (App.tsx) для настройки Ant Design
 * и в tokens.css для глобальных переменных.
 */

// ─── Dark theme (Synchronized with Paper) ───────────────────────────────────
export const dark = {
  bgMain:         '#080B14',
  bgCard:         '#0F1320',
  bgElevated:     '#161B22',
  border:         '#21262D',
  borderSoft:     '#30363D',
  textPrimary:    '#E2E8F8',
  textSecondary:  '#C9D1D9',
  textMuted:      '#8B949E',
  textDisabled:   '#484F58',
  textPlaceholder:'#3D4D6B',
  accent:         '#4F6EF7',
  accentHover:    '#6B85FF',
  accentLinks:    '#4F6EF7',
  accentBg:       'rgba(79, 110, 247, 0.12)',
  bgHover:        'rgba(255, 255, 255, 0.04)',
  bgActive:       'rgba(255, 255, 255, 0.06)',
} as const;

// ─── Light theme (Synchronized with Paper) ──────────────────────────────────
export const light = {
  bgMain:         '#FFFFFF',
  bgCard:         '#F6F8FA',
  bgElevated:     '#FFFFFF',
  border:         '#D0D7DE',
  borderSoft:     '#E8ECEF',
  textPrimary:    '#1F2328',
  textSecondary:  '#656D76',
  textMuted:      '#8B949E',
  textDisabled:   '#AFB8C1',
  textPlaceholder:'#9198A1',
  accent:         '#4F6EF7',
  accentHover:    '#3B5FFF',
  accentLinks:    '#4F6EF7',
  accentBg:       'rgba(79, 110, 247, 0.10)',
  bgHover:        'rgba(0, 0, 0, 0.04)',
  bgActive:       'rgba(0, 0, 0, 0.06)',
} as const;

// ─── Status colors (Neutralized according to Paper) ──────────────────────────
export const status = {
  done:       '#4ADE80',
  inProgress: '#F59E0B',
  review:     '#A78BFA',
  open:       '#8B949E',
  cancelled:  '#484F58',
} as const;

// ─── Issue type / priority colors ──────────────────────────────────────────
export const issueType = {
  epic:    '#A855F7',
  story:   '#3B82F6',
  task:    '#10B981',
  subtask: '#6B7280',
  bug:     '#EF4444',
} as const;

// ─── Semantic ────────────────────────────────────────────────────────────────
export const semantic = {
  success: '#4ADE80',
  warning: '#F59E0B',
  error:   '#EF4444',
  info:    '#4F6EF7',
} as const;

// ─── Layout & Spacing (Synchronized with Paper) ─────────────────────────────
export const layout = {
  sidebarWidth:  210,  // БЫЛО 220
  pagePadding:   24,
  cardGap:       16,
  elementGap:    8,
  topbarHeight:  38,
  radiusCard:    12,
  radiusButton:  8,
  radiusPill:    6,
  radiusBadge:   3,
  radiusNavActive: 20,
} as const;

// ─── Typography ─────────────────────────────────────────────────────────────
export const typography = {
  fontDisplay: "'Space Grotesk', 'Inter', -apple-system, system-ui, sans-serif",
  fontSans:    "'Inter', -apple-system, system-ui, sans-serif",
  fsLabel:     13,
  fsTableTitle:12,
  fsBody:      12,
  fsMeta:      11,
  fsTableHeader: 10,
} as const;
