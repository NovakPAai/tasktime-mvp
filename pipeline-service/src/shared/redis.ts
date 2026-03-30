import { createClient, type RedisClientType } from 'redis';
import { config } from '../config.js';

type RedisClient = RedisClientType;

let client: RedisClient | null = null;
let connecting: Promise<RedisClient | null> | null = null;

function prefixKey(key: string): string {
  return `${config.REDIS_KEY_PREFIX}${key}`;
}

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
    const raw = await redis.get(prefixKey(key));
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
    await redis.set(prefixKey(key), JSON.stringify(value), { EX: ttlSeconds });
  } catch (err) {
    console.error('Failed to write to Redis cache:', err);
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
