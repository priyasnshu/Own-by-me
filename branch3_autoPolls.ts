import { z } from 'zod';
import { env } from '../config/env';
import { generateStructured } from '../config/gemini';
import { pollQueue } from '../queues/pollQueue';
import { TelegramService } from '../services/telegramService';
import type { GeneratedPoll } from '../types';
import { toUnicodeMath } from '../types/unicodeMap';
import type { Telegraf } from 'telegraf';
import type { Context } from 'telegraf';

const pollSchema = z.object({
  question: z.string().min(1),
  options: z.tuple([z.string(), z.string(), z.string(), z.string()]),
  correctOptionId: z.number().int().min(0).max(3),
  explanation: z.string().min(1)
});
const pollJsonSchema = {
  type: 'object',
  properties: {
    question: { type: 'string' },
    options: { type: 'array', minItems: 4, maxItems: 4, items: { type: 'string' } },
    correctOptionId: { type: 'integer', minimum: 0, maximum: 3 },
    explanation: { type: 'string' }
  },
  required: ['question', 'options', 'correctOptionId', 'explanation'],
  propertyOrdering: ['question', 'options', 'correctOptionId', 'explanation']
};

export async function generateAndSchedulePoll(bot: Telegraf<Context>, topic: string): Promise<{ poll: GeneratedPoll; messageId: number }> {
  const generated = await generateStructured<GeneratedPoll>('telegram-poll-generation', `Create one rigorous JEE-level multiple-choice question about ${topic}. Exactly four options. Exactly one correct answer. Include a brief explanation. Do not use source markup for mathematics or chemistry; use Unicode symbols.`, pollJsonSchema, pollSchema, env.GEMINI_TEXT_MODEL, 0.2);
  const generatedUnicode: GeneratedPoll = {
    question: toUnicodeMath(generated.question),
    options: generated.options.map(toUnicodeMath) as [string, string, string, string],
    correctOptionId: generated.correctOptionId,
    explanation: toUnicodeMath(generated.explanation)
  };
  const telegram = new TelegramService(bot);
  const messageId = await telegram.sendPoll(env.TELEGRAM_CHANNEL_ID, generatedUnicode.question, generatedUnicode.options, generatedUnicode.correctOptionId, generatedUnicode.explanation);

  await pollQueue.add(
    'delete-poll',
    { chatId: String(env.TELEGRAM_CHANNEL_ID), messageId },
    { delay: 24 * 60 * 60 * 1000, removeOnComplete: true, attempts: 5, backoff: { type: 'exponential', delay: 5000 } }
  );

  return { poll: generatedUnicode, messageId };
}
