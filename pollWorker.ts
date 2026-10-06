import { Worker } from 'bullmq';
import { env } from '../../config/env';
import { errorMessage, logger } from '../../config/logger';
import type { Telegraf } from 'telegraf';
import type { Context } from 'telegraf';
import { TelegramService } from '../../services/telegramService';
import type { PollDeletionJob } from '../pollQueue';

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

export function createPollWorker(bot: Telegraf<Context>): Worker<PollDeletionJob> {
  const telegram = new TelegramService(bot);
  const worker = new Worker<PollDeletionJob>(
    'telegram-poll-deletions',
    async (job) => {
      const { chatId, messageId } = job.data;
      try {
        await telegram.deleteMessage(chatId, messageId);
        logger.info('Expired Telegram poll deleted', { chatId, messageId, jobId: job.id });
      } catch (error) {
        logger.error('Poll deletion job failed', { chatId, messageId, jobId: job.id, error: errorMessage(error) });
        throw error;
      }
    },
    { connection: parseRedisConnection(), concurrency: 4 }
  );

  worker.on('completed', (job) => logger.info('Poll deletion job completed', { jobId: job.id }));
  worker.on('failed', (job, error) => logger.error('Poll deletion job marked failed', { jobId: job?.id, error: errorMessage(error) }));
  worker.on('error', (error) => logger.error('BullMQ worker error', { error: errorMessage(error) }));
  return worker;
}
