import type { Context, MiddlewareFn } from 'telegraf';
import { env } from '../config/env';
import { logger, withRetry } from '../config/logger';

export const authorizationMiddleware: MiddlewareFn<Context> = async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) {
    logger.warn('Telegram update without user identity', { updateType: ctx.updateType });
    return;
  }
  if (!env.AUTHORIZED_TELEGRAM_USER_IDS.includes(userId)) {
    logger.warn('Rejected unauthorized Telegram user', { userId });
    await withRetry('telegram-unauthorized-reply', () => ctx.reply('⛔ This bot is restricted to authorized users.'), 3, 500);
    return;
  }
  await next();
};

export const adminOnlyMiddleware: MiddlewareFn<Context> = async (ctx, next) => {
  const userId = ctx.from?.id;
  if (userId !== env.ADMIN_TELEGRAM_USER_ID) {
    await withRetry('telegram-admin-reply', () => ctx.reply('⛔ Admin access required.'), 3, 500);
    return;
  }
  await next();
};
