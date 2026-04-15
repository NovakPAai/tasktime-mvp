import { getCachedJson, setCachedJson } from '../redis.js';
import { prisma } from '../../prisma/client.js';

export const DEFAULT_SESSION_LIFETIME_MINUTES = 60;
const SETTING_CACHE_TTL_SECONDS = 60;
const SESSION_LIFETIME_SETTING_KEY = 'session_lifetime_minutes';
export const SESSION_LIFETIME_CACHE_KEY = `settings:${SESSION_LIFETIME_SETTING_KEY}`;

export async function getSessionLifetimeMinutes(): Promise<number> {
  const cached = await getCachedJson<number>(SESSION_LIFETIME_CACHE_KEY);
  if (cached !== null) return cached;

  try {
    const setting = await prisma.systemSetting.findUnique({ where: { key: SESSION_LIFETIME_SETTING_KEY } });
    const value = setting ? parseInt(setting.value, 10) : DEFAULT_SESSION_LIFETIME_MINUTES;
    const result = isNaN(value) || value < 5 ? DEFAULT_SESSION_LIFETIME_MINUTES : value;
    await setCachedJson(SESSION_LIFETIME_CACHE_KEY, result, SETTING_CACHE_TTL_SECONDS);
    return result;
  } catch {
    return DEFAULT_SESSION_LIFETIME_MINUTES;
  }
}
