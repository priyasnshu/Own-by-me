import IORedis, { type RedisOptions } from 'ioredis';
import { env } from './env';

const options: RedisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: true
};

export const redis = new IORedis(env.REDIS_URL, options);

export function createRedisConnection(): IORedis {
  return new IORedis(env.REDIS_URL, options);
}
