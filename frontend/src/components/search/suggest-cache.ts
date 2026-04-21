/**
 * TTSRH-1 PR-11 — легковесный in-memory TTL-cache для `/search/suggest` запросов.
 *
 * Зачем не SWR: `/search/suggest` вызывается из CM6 CompletionSource, который
 * живёт в state extensions — не в React-дереве. SWR-хуки требуют React context,
 * а у нас контекст — EditorView. Maps + Date.now() достаточно.
 *
 * TTL из §13.6 PR-11: Project/IssueType/Status — 60с, Sprint/Release — 30с.
 * Поскольку `/search/suggest` не возвращает явный field-type в ключе, TTL
 * выбирается по полю `field` в cache-ключе. Unknown → 30с (безопасный default).
 */

import type { Completion, SuggestRequest, SuggestResponse } from '../../api/search';
import { suggestCompletions } from '../../api/search';

const DEFAULT_TTL_MS = 30_000;

// Per-field TTL (milliseconds). Missing entry → DEFAULT_TTL_MS.
const FIELD_TTL: Record<string, number> = {
  project: 60_000,
  type: 60_000,
  issuetype: 60_000,
  status: 60_000,
  sprint: 30_000,
  release: 30_000,
  fixversion: 30_000,
};

interface CacheEntry {
  completions: Completion[];
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function keyOf(req: SuggestRequest): string {
  // Stable ordering so `{jql:'x', prefix:'y'}` ≡ `{prefix:'y', jql:'x'}`.
  return [
    req.jql ?? '',
    req.cursor ?? '',
    req.field ?? '',
    req.operator ?? '',
    req.prefix ?? '',
    req.variant ?? 'default',
  ].join('|');
}

function ttlFor(field: string | undefined): number {
  if (!field) return DEFAULT_TTL_MS;
  return FIELD_TTL[field.toLowerCase()] ?? DEFAULT_TTL_MS;
}

export async function cachedSuggest(req: SuggestRequest): Promise<SuggestResponse> {
  const key = keyOf(req);
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && hit.expiresAt > now) {
    return { completions: hit.completions };
  }
  const res = await suggestCompletions(req);
  cache.set(key, {
    completions: res.completions,
    expiresAt: now + ttlFor(req.field),
  });
  // Opportunistic GC — keep cache size bounded.
  if (cache.size > 200) {
    for (const [k, v] of cache) {
      if (v.expiresAt <= now) cache.delete(k);
    }
  }
  return res;
}

export function clearSuggestCache(): void {
  cache.clear();
}
