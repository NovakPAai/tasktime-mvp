/**
 * Feature flags — управление включением/выключением модулей.
 * Читаются из переменных окружения при старте.
 *
 * Использование в docker-compose / .env:
 *   FEATURES_AI=true
 *   FEATURES_MCP=true
 *   FEATURES_GITLAB=true
 *   FEATURES_TELEGRAM=true
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
  /**
   * TTSEC-2 Phase 4 cutover flag. When `true`, new direct project-role assignments
   * (admin.service.assignProjectRole) are rejected with 403 — admins must use user groups.
   * Existing direct rows remain functional; they can be migrated out manually or left in place
   * as a break-glass escape hatch. Default: `false` (direct assignments still allowed).
   */
  directRolesDisabled: flag('FEATURES_DIRECT_ROLES_DISABLED', false),
  aiProvider: (process.env.AI_PROVIDER ?? 'heuristic') as 'anthropic' | 'heuristic',
} as const;

export type Features = typeof features;
