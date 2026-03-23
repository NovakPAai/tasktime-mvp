/**
 * Flow Universe — Design Tokens (Source of Truth)
 * 
 * ВАЖНО: Имена ключей в объектах (dark, light, layout, typography) 
 * должны СТРОГО соответствовать именам в CSS (после kebab-case).
 */

// ─── Dark theme ───────────────────────────────────────────────────────────────
export const dark = {
  bg:             '#080B14',
  bgSb:           '#0F1320',
  bgEl:           '#161B22',
  bgInput:        '#0D1117', // --bg-input
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
  semanticError:  '#EF4444',
} as const;

// ─── Light theme ─────────────────────────────────────────────────────────────
export const light = {
  bg:             '#FFFFFF',
  bgSb:           '#F6F8FA',
  bgEl:           '#FFFFFF',
  bgInput:        '#FFFFFF',
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
  semanticError:  '#EF4444',
} as const;

// ─── Shared scales (Space, Layout, Typography) ───────────────────────────────
export const status = {
  done:       '#4ADE80',
  inProgress: '#F59E0B',
  review:     '#A78BFA',
  open:       '#8B949E',
  cancelled:  '#484F58',
} as const;

export const issueType = {
  epic:    '#A855F7',
  story:   '#3B82F6',
  task:    '#10B981',
  subtask: '#6B7280',
  bug:     '#EF4444',
} as const;

export const semantic = {
  success: '#4ADE80',
  warning: '#F59E0B',
  error:   '#EF4444',
  info:    '#4F6EF7',
} as const;

export const layout = {
  sidebarWidth:  210,
  topbarHeight:  38,
  pagePadding:   24,
  cardGap:       16,
  elementGap:    8,
  r:             12,
  r2:            8,
  r3:            6,
  rBadge:        3,
  rActive:       20,
  space1:        2,
  space2:        4,
  space3:        6,
  space4:        8,
  space5:        12,
  space6:        16,
  space7:        20,
  space8:        24,
} as const;

export const typography = {
  fontDisplay: "'Space Grotesk', 'Inter', system-ui, sans-serif",
  fontSans:    "'Inter', system-ui, sans-serif",
  fontMono:    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fsXs:        12,
  fsSm:        13,
  fsMd:        14,
  fsLg:        15,
  fsXl:        18,
  fs2xl:       24,
  lhTight:     1.3,
  lhNormal:    1.5,
  lhRelaxed:   1.6,
} as const;
