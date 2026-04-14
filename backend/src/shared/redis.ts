import { randomUUID } from 'node:crypto';
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
    let cursor = '0';
    do {
      const reply = await redis.scan(cursor, { MATCH: `${prefix}*`, COUNT: 100 });
      cursor = reply.cursor;
      if (reply.keys.length > 0) {
        await redis.del(reply.keys);
      }
    } while (cursor !== '0');
  } catch (err) {
    console.error('Failed to delete cache by prefix:', err);
  }
}

export type UserSession = {
  userId: string;
  email: string;
  systemRoles: string[];
  createdAt: string;
  lastSeenAt: string;
  userAgent?: string;
  ip?: string;
};

function buildSessionKey(userId: string): string {
  return `session:${userId}`;
}

/** Returns true when a Redis client is connected and ready. */
export async function isRedisAvailable(): Promise<boolean> {
  const redis = await getRedisClientInternal();
  return redis !== null;
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

/**
 * Update lastSeenAt and reset TTL for an existing session (sliding window).
 * Returns false if the session does not exist (already expired).
 */
export async function touchUserSession(userId: string, ttlSeconds: number): Promise<boolean> {
  const redis = await getRedisClientInternal();
  if (!redis) return true; // Redis unavailable — allow request, degrade gracefully

  try {
    const raw = await redis.get(buildSessionKey(userId));
    if (!raw) return false; // session expired

    const session = JSON.parse(raw) as UserSession;
    session.lastSeenAt = new Date().toISOString();
    await redis.set(buildSessionKey(userId), JSON.stringify(session), { EX: ttlSeconds });
    return true;
  } catch (err) {
    console.error('Failed to touch user session in Redis:', err);
    return true; // Redis error — allow request, degrade gracefully
  }
}

export async function deleteCachedByPattern(pattern: string): Promise<void> {
  const redis = await getRedisClientInternal();
  if (!redis) return;

  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) await redis.del(keys);
  } catch (err) {
    console.error('Failed to delete cached keys by pattern:', err);
  }
}

// Lua script: atomic compare-and-delete — only deletes key if value matches owner token
const RELEASE_LOCK_SCRIPT = `if redis.call("get",KEYS[1]) == ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end`;

/**
 * Acquire a distributed lock using Redis SET NX EX with a unique owner token.
 * Returns the owner token string on success, or null if the lock is already held.
 * In test env (no Redis) returns a synthetic token so tests aren't blocked.
 * In prod with Redis errors returns null to enforce the lock.
 */
export async function acquireLock(key: string, ttlSeconds = 60): Promise<string | null> {
  const redis = await getRedisClientInternal();
  if (!redis) {
    return process.env.NODE_ENV === 'test' ? 'test-token' : null;
  }

  const token = randomUUID();
  try {
    const result = await redis.set(key, token, { NX: true, EX: ttlSeconds });
    return result === 'OK' ? token : null;
  } catch (err) {
    console.error('acquireLock Redis error:', err);
    return process.env.NODE_ENV === 'test' ? 'test-token' : null;
  }
}

/**
 * Release a distributed lock only if the caller owns it (token matches).
 * Uses an atomic Lua script to prevent releasing another owner's lock.
 */
export async function releaseLock(key: string, token: string): Promise<void> {
  const redis = await getRedisClientInternal();
  if (!redis) return;

  try {
    await redis.eval(RELEASE_LOCK_SCRIPT, { keys: [key], arguments: [token] });
  } catch (err) {
    console.error('releaseLock Redis error:', err);
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

