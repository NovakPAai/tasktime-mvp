/**
 * TTSRH-1: Frontend feature flags for staged UI cutover.
 *
 * Pattern mirrors backend/src/shared/features.ts but reads Vite env vars, since
 * frontend runs in the browser and can't read process.env. Keep names in sync with
 * backend: `FEATURES_ADVANCED_SEARCH` ↔ `VITE_FEATURES_ADVANCED_SEARCH`.
 *
 * Env-vars are snapshotted at build time. Ops flip the flag by rebuilding/redeploying
 * the frontend bundle — same workflow as VITE_API_URL.
 */
function flag(name: string, defaultValue = false): boolean {
  const val = (import.meta.env as Record<string, string | undefined>)[name];
  if (val === undefined) return defaultValue;
  return val.toLowerCase() !== 'false' && val !== '0';
}

export const features = {
  advancedSearch: flag('VITE_FEATURES_ADVANCED_SEARCH', false),
  // TTBULK-1: cutover-флаг для массовых операций (wizard + /operations + floating chip).
  // Keep in sync with backend `FEATURES_BULK_OPS` (docs/tz/TTBULK-1.md §13.1).
  bulkOps: flag('VITE_FEATURES_BULK_OPS', false),
} as const;
