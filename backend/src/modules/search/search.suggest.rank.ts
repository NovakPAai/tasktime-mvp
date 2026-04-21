/**
 * TTSRH-1 PR-6 — fuzzy-ranking utility for suggest completions.
 *
 * §5.11 ТЗ: priority order = exact → startsWith → contains → subsequence.
 * Stable within each tier — items in different tiers rank by score (1.0 / 0.75
 * / 0.5 / 0.25), items in the same tier keep their input order. This matches
 * Jira's autocomplete feel: the best literal match wins; ties are preserved.
 *
 * Case-insensitive. Empty prefix = return input unchanged (used for initial
 * popup-open before the user types anything).
 */

import type { Completion } from './search.suggest.types.js';

export function rankByPrefix<T extends Completion>(items: readonly T[], prefix: string): T[] {
  if (!prefix) {
    // Caller sees insertion order — no ranking needed.
    return items.map((i, idx) => ({ ...i, score: 1 - idx * 0.0001 }));
  }
  const lower = prefix.toLowerCase();
  const ranked: Array<{ item: T; tier: number; idx: number }> = [];
  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx]!;
    const label = item.label.toLowerCase();
    const insert = item.insert.toLowerCase();
    const haystack = label.length > 0 ? label : insert;
    const tier = matchTier(haystack, lower);
    if (tier >= 0) ranked.push({ item, tier, idx });
  }
  ranked.sort((a, b) => a.tier - b.tier || a.idx - b.idx);
  return ranked.map(({ item, tier }, i) => ({
    ...item,
    score: tierScore(tier) - i * 0.0001,
  }));
}

/**
 * Tier membership. Lower is better:
 *   0 — exact match
 *   1 — label starts with prefix
 *   2 — label contains prefix
 *   3 — label is a subsequence of prefix (each prefix char appears in order)
 * Returns -1 if no match.
 */
function matchTier(haystack: string, needle: string): number {
  if (haystack === needle) return 0;
  if (haystack.startsWith(needle)) return 1;
  if (haystack.includes(needle)) return 2;
  if (isSubsequence(haystack, needle)) return 3;
  return -1;
}

function isSubsequence(haystack: string, needle: string): boolean {
  let i = 0;
  for (const ch of haystack) {
    if (ch === needle[i]) i++;
    if (i === needle.length) return true;
  }
  return false;
}

function tierScore(tier: number): number {
  switch (tier) {
    case 0: return 1.0;
    case 1: return 0.75;
    case 2: return 0.5;
    case 3: return 0.25;
    default: return 0;
  }
}
