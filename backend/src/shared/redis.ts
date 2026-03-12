import { createClient, type RedisClientType } from 'redis';
import { config } from '../config.js';

let client: RedisClientType | null = null;
let connecting: Promise<RedisClientType | null> | null = null;

// 7 days in seconds — синхронизировано с refresh-токеном
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

async function getRedisClientInternal(): Promise<RedisClientType | null> {
  if (process.env.NODE_ENV === 'test') {
    return null;
  }

  if (!config.REDIS_URL) {
    return null;
  }

  if (client) {
    return client;
  }

  if (!connecting) {
    const instance = createClient({ url: config.REDIS_URL });

    instance.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error('Redis client error:', err);
    });

    connecting = instance
      .connect()
      .then(() => {
        client = instance;
        return instance;
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('Failed to connect to Redis, caching disabled:', err);
        client = null;
        return null;
      });
  }

  return connecting;
}

export async function getCachedJson<T>(key: string): Promise<T | null> {
  const redis = await getRedisClientInternal();
  if (!redis) return null;

  try {
    const raw = await redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to read from Redis cache:', err);
    return null;
  }
}

export async function setCachedJson<T>(key: string, value: T, ttlSeconds = config.REDIS_CACHE_TTL_SECONDS): Promise<void> {
  const redis = await getRedisClientInternal();
  if (!redis) return;

  try {
    await redis.set(key, JSON.stringify(value), { EX: ttlSeconds });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to write to Redis cache:', err);
  }
}

export type UserSession = {
  userId: string;
  email: string;
  role: string;
  createdAt: string;
  lastSeenAt: string;
  userAgent?: string;
  ip?: string;
};

function buildSessionKey(userId: string): string {
  return `session:${userId}`;
}

export async function setUserSession(userId: string, session: Omit<UserSession, 'userId'>): Promise<void> {
  const redis = await getRedisClientInternal();
  if (!redis) return;

  const fullSession: UserSession = {
    userId,
    ...session,
  };

  try {
    await redis.set(buildSessionKey(userId), JSON.stringify(fullSession), { EX: SESSION_TTL_SECONDS });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to write user session to Redis:', err);
  }
}

export async function getUserSession(userId: string): Promise<UserSession | null> {
  const redis = await getRedisClientInternal();
  if (!redis) return null;

  try {
    const raw = await redis.get(buildSessionKey(userId));
    if (!raw) return null;
    return JSON.parse(raw) as UserSession;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to read user session from Redis:', err);
    return null;
  }
}

export async function deleteUserSession(userId: string): Promise<void> {
  const redis = await getRedisClientInternal();
  if (!redis) return;

  try {
    await redis.del(buildSessionKey(userId));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to delete user session from Redis:', err);
  }
}

