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
  const cached = await getCachedJson<CustomFieldDef[]>(CACHE_KEY);
  if (cached) return cached;

  const rows = await prisma.customField.findMany({
    where: { isEnabled: true },
    select: { id: true, name: true, fieldType: true, options: true },
  });
  const defs: CustomFieldDef[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: customFieldTypeToTtql(r.fieldType),
    operators: operatorsForCustomField(r.fieldType),
    options: r.options,
  }));
  await setCachedJson(CACHE_KEY, defs, CACHE_TTL_SECONDS);
  return defs;
}
