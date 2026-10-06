import express from 'express';
import { Telegraf } from 'telegraf';
import { env } from './config/env';
import { logger, errorMessage, withRetry } from './config/logger';
import { redis } from './config/redis';
import { pollQueue } from './queues/pollQueue';
import { createPollWorker } from './queues/workers/pollWorker';
import { parseGoogleServiceAccountForHealthCheck } from './services/googleDocsService';
import { registerHandlers } from './bot/handlers';
import { authorizationMiddleware } from './bot/middleware';

async function main(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const bot = new Telegraf(env.TELEGRAM_BOT_TOKEN);
  bot.catch((error, ctx) => {
    logger.error('Telegraf update handler error', { updateType: ctx.updateType, error: errorMessage(error) });
  });
  bot.use(authorizationMiddleware);
  registerHandlers(bot);

  await redis.connect().catch((error: unknown) => {
    logger.error('Redis connection failed', { error: errorMessage(error) });
    throw error;
  });
  await redis.ping();
  parseGoogleServiceAccountForHealthCheck();

  const worker = createPollWorker(bot);

  app.get('/health', async (_req, res) => {
    try {
      const redisStatus = await redis.ping();
      const counts = await pollQueue.getJobCounts('waiting', 'delayed', 'active', 'failed');
      res.status(200).json({ status: 'ok', redis: redisStatus, pollQueue: counts });
    } catch (error) {
      logger.error('Health check failed', { error: errorMessage(error) });
      res.status(503).json({ status: 'degraded' });
    }
  });

  app.get('/', (_req, res) => {
    res.status(200).json({ service: 'ai-telegram-automation-backend', status: 'running' });
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error('Express error', { error: errorMessage(error) });
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  });

  const server = app.listen(env.PORT, () => logger.info('HTTP server listening', { port: env.PORT }));

  await withRetry('telegram-bot-launch', () => bot.launch(), 3, 1000);
  logger.info('Telegram bot polling started');

  const shutdown = async (signal: string): Promise<void> => {
    logger.info('Graceful shutdown requested', { signal });
    try {
      bot.stop(signal);
      await worker.close();
      await pollQueue.close();
      await redis.quit();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
      process.exit(0);
    } catch (error) {
      logger.error('Graceful shutdown failed', { error: errorMessage(error) });
      process.exit(1);
    }
  };

  process.once('SIGINT', () => { void shutdown('SIGINT'); });
  process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
}

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason: errorMessage(reason) });
});
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: errorMessage(error) });
});

void main().catch((error: unknown) => {
  logger.error('Application startup failed', { error: errorMessage(error) });
  process.exitCode = 1;
});
