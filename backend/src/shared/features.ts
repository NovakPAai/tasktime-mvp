/**
 * Feature flags — управление включением/выключением модулей.
 * Читаются из переменных окружения при старте.
 *
 * Использование в docker-compose / .env:
 *   FEATURES_AI=true
 *   FEATURES_MCP=true
 *   FEATURES_GITLAB=true
 *   FEATURES_TELEGRAM=true
 *   FEATURES_ADVANCED_SEARCH=false         # TTSRH-1 cutover flag (TTS-QL + страница поиска)
 *   FEATURES_CHECKPOINT_TTQL=false         # TTSRH-1 sub-flag: TTQL-ветка evaluator'а КТ
 *   FEATURES_DIRECT_ROLES_DISABLED=false   # TTSEC-2 Phase 4 cutover flag
 *   AI_PROVIDER=anthropic   # anthropic | heuristic
 */

function flag(name: string, defaultValue = true): boolean {
  const val = process.env[name];
  if (val === undefined) return defaultValue;
  return val.toLowerCase() !== 'false' && val !== '0';
}

export const features = {
  ai: flag('FEATURES_AI', true),
  mcp: flag('FEATURES_MCP', true),
  gitlab: flag('FEATURES_GITLAB', true),
  telegram: flag('FEATURES_TELEGRAM', false),
  // TTSRH-1: off by default until UAT cutover (см. §13.1 в docs/tz/TTSRH-1.md).
  advancedSearch: flag('FEATURES_ADVANCED_SEARCH', false),
  // TTSRH-1 sub-flag: TTQL-ветка evaluator'а КТ. Отдельно от advancedSearch, чтобы
  // core-поиск можно было раскатить раньше, не влияя на scheduler КТ (см. PR-16 в §13).
  checkpointTtql: flag('FEATURES_CHECKPOINT_TTQL', false),
  aiProvider: (process.env.AI_PROVIDER ?? 'heuristic') as 'anthropic' | 'heuristic',
} as const;

export type Features = typeof features;

/**
 * TTSEC-2 Phase 4 cutover flag. When `true`, new direct project-role assignments
 * (admin.service.assignProjectRole) are rejected with 403 — admins must use user groups.
 * Existing direct rows remain functional; they can be migrated out manually or left in place
 * as a break-glass escape hatch. Default: `false`.
 *
 * AI review #72 🟠 — read LAZILY at each call (NOT cached into the `features` const at import
 * time). Ops need to flip `FEATURES_DIRECT_ROLES_DISABLED=true` without a redeploy — a
 * module-load-time snapshot would require process restart to pick up the new value.
 *
 * Call at the top of any code path that creates a direct UserProjectRole row.
 */
export function isDirectRolesDisabled(): boolean {
  return flag('FEATURES_DIRECT_ROLES_DISABLED', false);
}
