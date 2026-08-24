import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 100, 3000);
    return delay;
  },
  lazyConnect: true,
});

redis.on('error', (err) => {
  console.error('[Redis Client Error]', err.message);
});

redis.on('connect', () => {
  console.log('[Redis] Connected successfully');
});

export async function checkRedisHealth(): Promise<boolean> {
  try {
    if (redis.status !== 'ready' && redis.status !== 'connecting') {
      await redis.connect();
    }
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch (error) {
    console.error('[Redis Health Check Failed]', error);
    return false;
  }
}
