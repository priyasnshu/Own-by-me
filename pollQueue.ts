import { Queue } from 'bullmq';
import { env } from '../config/env';

export interface PollDeletionJob {
  chatId: string;
  messageId: number;
}

function parseRedisConnection(): Record<string, unknown> {
  const url = new URL(env.REDIS_URL);
  const connection: Record<string, unknown> = {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    maxRetriesPerRequest: null
  };
  if (url.username) connection.username = decodeURIComponent(url.username);
  if (url.password) connection.password = decodeURIComponent(url.password);
  if (url.pathname && url.pathname !== '/') connection.db = Number(url.pathname.slice(1));
  if (url.protocol === 'rediss:') connection.tls = {};
  return connection;
}

export const pollQueue = new Queue<PollDeletionJob>('telegram-poll-deletions', {
  connection: parseRedisConnection(),
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: { age: 7 * 24 * 60 * 60 }
  }
});
