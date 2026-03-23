/**
 * Flow Universe — Design Tokens (Source of Truth)
 * 
 * ВАЖНО: Имена ключей в объектах (dark, light, layout, typography) 
 * должны СТРОГО соответствовать именам в CSS (после kebab-case).
 * Например: bgSb -> --bg-sb, space5 -> --space-5
 */

// ─── Dark theme (Synchronized with Paper) ───────────────────────────────────
export const dark = {
  bg:             '#080B14',
  bgSb:           '#0F1320',
  bgEl:           '#161B22',
  bgHover:        'rgba(255, 255, 255, 0.04)',
  bgActive:       'rgba(255, 255, 255, 0.06)',
  bgSel:          'rgba(79, 110, 247, 0.12)',
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

// ─── Light theme (Synchronized with Paper) ──────────────────────────────────
export const light = {
  bg:             '#FFFFFF',
  bgSb:           '#F6F8FA',
  bgEl:           '#FFFFFF',
  bgHover:        'rgba(0, 0, 0, 0.04)',
  bgActive:       'rgba(0, 0, 0, 0.06)',
  bgSel:          'rgba(79, 110, 247, 0.10)',
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

// ─── Status colors (Neutralized according to Paper) ──────────────────────────
export const status = {
  done:       '#4ADE80',
  inProgress: '#F59E0B',
  review:     '#A78BFA',
  open:       '#8B949E',
  cancelled:  '#484F58',
} as const;

// ─── Issue type colors ───────────────────────────────────────────────────────
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

// ─── Layout & Spacing (Mapping to CSS variables) ─────────────────────────────
export const layout = {
  sidebarWidth:  210,  // --sidebar-width
  topbarHeight:  38,   // --topbar-height
  pagePadding:   24,   // --page-padding
  cardGap:       16,
  elementGap:    8,
  r:             12,   // --r
  r2:            8,    // --r2
  r3:            6,    // --r3
  rBadge:        3,
  rActive:       20,
  // Шкала отступов (обязательно!)
  space1:        2,    // --space-1
  space2:        4,    // --space-2
  space3:        6,    // --space-3
  space4:        8,    // --space-4
  space5:        12,   // --space-5
  space6:        16,   // --space-6
  space7:        20,   // --space-7
  space8:        24,   // --space-8
} as const;

// ─── Typography (Mapping to CSS variables) ───────────────────────────────────
export const typography = {
  fontDisplay: "'Space Grotesk', 'Inter', -apple-system, system-ui, sans-serif",
  fontSans:    "'Inter', -apple-system, system-ui, sans-serif",
  fontMono:    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  // Шкала размеров шрифтов
  fsXs:        12,   // --fs-xs
  fsSm:        13,   // --fs-sm
  fsMd:        14,   // --fs-md
  fsLg:        15,   // --fs-lg
  fsXl:        18,   // --fs-xl
  fs2xl:       24,   // --fs-2xl
  lhTight:     1.3,  // --lh-tight
  lhNormal:    1.5,  // --lh-normal
  lhRelaxed:   1.6,  // --lh-relaxed
} as const;
