import { z } from 'zod';
import { generateStructured } from '../config/gemini';
import { env } from '../config/env';
import { errorMessage, logger } from '../config/logger';
import { toUnicodeMath } from '../types/unicodeMap';
import { searchJeeNews } from '../services/searchService';
import { TelegramService } from '../services/telegramService';
import type { NewsArticle, NewsSummary } from '../types';
import type { Telegraf } from 'telegraf';
import type { Context } from 'telegraf';

const summarySchema = z.object({ headline: z.string(), bullets: z.array(z.string()).min(1).max(3) });
const summaryJsonSchema = {
  type: 'object',
  properties: { headline: { type: 'string' }, bullets: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 3 } },
  required: ['headline', 'bullets'],
  propertyOrdering: ['headline', 'bullets']
};

function max120Words(summary: NewsSummary): NewsSummary {
  const all = [summary.headline, ...summary.bullets].join(' ');
  const count = all.split(/\s+/).filter(Boolean).length;
  if (count <= 120) return summary;
  let remaining = 118;
  const bullets = summary.bullets.map((bullet) => {
    const words = bullet.split(/\s+/).filter(Boolean);
    if (remaining <= 0) return '';
    const kept = words.slice(0, remaining);
    remaining -= kept.length;
    return kept.join(' ');
  }).filter(Boolean);
  return { headline: summary.headline.split(/\s+/).slice(0, 20).join(' '), bullets };
}

async function summarizeArticles(articles: NewsArticle[]): Promise<NewsSummary> {
  const prompt = `Summarize these JEE-related updates into an executive Telegram post. Produce exactly 3 concise factual bullets when the source material supports it, never exceed 120 words total, and preserve dates/numbers accurately. Do not invent facts. Headline should be short.
${articles.map((article, index) => `SOURCE ${index + 1}\nTitle: ${article.title}\nURL: ${article.url}\nText: ${article.rawText.slice(0, 12000)}`).join('\n\n')}`;
  const result = await generateStructured<NewsSummary>('jee-news-summary', prompt, summaryJsonSchema, summarySchema, env.GEMINI_TEXT_MODEL, 0.1);
  const limited = max120Words(result);
  return {
    headline: toUnicodeMath(limited.headline),
    bullets: limited.bullets.map(toUnicodeMath)
  };
}

export async function runJeeNewsBranch(bot: Telegraf<Context>, query: string): Promise<NewsSummary> {
  const telegram = new TelegramService(bot);
  const articles = await searchJeeNews(query);
  const summary = await summarizeArticles(articles);
  const sourceLinks = articles.map((article) => `• ${article.title}: ${article.url}`).join('\n');
  const caption = `${summary.headline}\n\n${summary.bullets.map((bullet) => `• ${bullet}`).join('\n')}\n\nSources:\n${sourceLinks}`;

  const firstImage = articles.find((article) => Boolean(article.imageUrl))?.imageUrl;
  try {
    if (firstImage) await telegram.sendPhoto(env.TELEGRAM_CHANNEL_ID, firstImage, caption);
    else await telegram.sendMessage(env.TELEGRAM_CHANNEL_ID, caption);
  } catch (error) {
    logger.error('News branch failed while publishing', { error: errorMessage(error) });
    throw error;
  }
  return summary;
}
