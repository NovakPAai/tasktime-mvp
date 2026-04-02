import { createClient, type RedisClientType } from 'redis';
import { config } from '../config.js';

type RedisClient = RedisClientType;

let client: RedisClient | null = null;
let connecting: Promise<RedisClient | null> | null = null;

// 7 days in seconds — синхронизировано с refresh-токеном
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

async function getRedisClientInternal(): Promise<RedisClient | null> {
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
    const instance = createClient({ url: config.REDIS_URL }) as RedisClient;

    instance.on('error', (err) => {
      console.error('Redis client error:', err);
    });

    connecting = instance
      .connect()
      .then(() => {
        client = instance;
        return instance;
      })
      .catch((err) => {
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
    console.error('Failed to write to Redis cache:', err);
  }
}

/** Delete a single cache key. */
export async function delCachedJson(key: string): Promise<void> {
  const redis = await getRedisClientInternal();
  if (!redis) return;

  try {
    await redis.del(key);
  } catch (err) {
    console.error('Failed to delete from Redis cache:', err);
  }
}

/**
 * Delete all keys whose name starts with `prefix`.
 * Uses SCAN to avoid blocking the server; safe on large keyspaces.
 */
export async function delCacheByPrefix(prefix: string): Promise<void> {
  const redis = await getRedisClientInternal();
  if (!redis) return;

  try {
    let cursor = 0;
    do {
      const reply = await redis.scan(cursor, { MATCH: `${prefix}*`, COUNT: 100 });
      cursor = reply.cursor;
      if (reply.keys.length > 0) {
        await redis.del(reply.keys);
      }
    } while (cursor !== 0);
  } catch (err) {
    console.error('Failed to delete cache by prefix:', err);
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
    console.error('Failed to delete user session from Redis:', err);
  }
}

export async function isRedisReady(): Promise<boolean> {
  const redis = await getRedisClientInternal();
  if (!redis) return false;

  try {
    const response = await redis.ping();
    return response === 'PONG';
  } catch {
    return false;
  }
}

