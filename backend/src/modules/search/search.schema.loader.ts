/**
 * TTSRH-1 PR-3 — Prisma + Redis-backed loader for custom fields.
 *
 * Kept in a separate module from `search.schema.ts` so that the validator, AST,
 * and parser — all pure — can be imported without pulling in DB client code.
 * This matters for unit tests (which don't need Postgres/Redis running).
 */
import { prisma } from '../../prisma/client.js';
import { getCachedJson, setCachedJson } from '../../shared/redis.js';
import {
  type CustomFieldDef,
  customFieldTypeToTtql,
  operatorsForCustomField,
} from './search.schema.js';

const CACHE_KEY = 'search:custom-fields:enabled';
const CACHE_TTL_SECONDS = 60;

/**
 * Load enabled custom fields (cached 60s). Returns in same shape regardless of cache
 * hit/miss so validator code doesn't need to branch. When Redis is down we fall
 * straight through to Prisma — the endpoint stays functional at some latency cost.
 */
export async function loadCustomFields(): Promise<CustomFieldDef[]> {
  // Treat any Redis error (connection refused, READONLY, timeout) as a cache miss.
  // If we let the exception propagate, a failing Redis would 500 both /search/validate
  // and /search/schema — not what ops expects from a cache-layer outage.
  let cached: CustomFieldDef[] | null = null;
  try {
    cached = await getCachedJson<CustomFieldDef[]>(CACHE_KEY);
  } catch {
    cached = null;
  }
  if (cached) return cached;

  const rows = await prisma.customField.findMany({
    where: { isEnabled: true },
    select: { id: true, name: true, fieldType: true, options: true },
  });
  const defs: CustomFieldDef[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: customFieldTypeToTtql(r.fieldType),
    fieldType: r.fieldType,
    operators: operatorsForCustomField(r.fieldType),
    sortable: false, // MVP — see CustomFieldDef.sortable comment
    options: r.options,
  }));
  try {
    await setCachedJson(CACHE_KEY, defs, CACHE_TTL_SECONDS);
  } catch {
    // Redis write failure is non-fatal — we've already computed `defs`.
  }
  return defs;
}
