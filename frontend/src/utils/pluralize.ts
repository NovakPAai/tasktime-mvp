/**
 * Russian noun pluralization helper.
 *
 * Rule: `1` → one, `2-4` → few (except `12-14` → many), `0` / `5+` → many.
 *
 * Example: `pluralize(3, 'нарушение', 'нарушения', 'нарушений')` → `"нарушения"`.
 *
 * Extracted from `components/profile/SecurityTab.tsx` so Dashboard, TopBar and any future
 * RU-locale surface can reuse it without copy-pasting the mod100 logic.
 */
export function pluralize(n: number, one: string, few: string, many: string): string {
  const mod100 = Math.abs(n) % 100;
  const mod10 = mod100 % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}
