/**
 * Feature flags — управление включением/выключением модулей.
 * Читаются из переменных окружения при старте.
 *
 * Использование в docker-compose / .env:
 *   FEATURES_AI=true
 *   FEATURES_MCP=true
 *   FEATURES_GITLAB=true
 *   FEATURES_TELEGRAM=true
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
  aiProvider: (process.env.AI_PROVIDER ?? 'heuristic') as 'anthropic' | 'heuristic',
} as const;

export type Features = typeof features;
