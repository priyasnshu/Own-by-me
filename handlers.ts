import type { Telegraf } from 'telegraf';
import type { Context } from 'telegraf';
import { classifyIntent } from '../ai/router';
import { env } from '../config/env';
import { errorMessage, logger, withRetry } from '../config/logger';
import { runJeeNewsBranch } from '../branches/branch2_jeeNews';
import { generateAndSchedulePoll } from '../branches/branch3_autoPolls';
import { runNotesCheckBranch } from '../branches/branch4_notesCheck';
import { runFormulaSheetBranch } from '../branches/branch5_formulaSheet';
import { processQuestionPdf } from '../branches/branch1_pdfQuestions';
import { TelegramService } from '../services/telegramService';
import { adminOnlyMiddleware } from './middleware';

function topicFromCommand(text: string): string {
  const value = text.trim().split(/\s+/).slice(1).join(' ').trim();
  return value || 'JEE Main and JEE Advanced';
}

async function replyUser(ctx: Context, text: string): Promise<void> {
  await withRetry('telegram-user-reply', () => ctx.reply(text), 3, 500);
}

async function runSafely(ctx: Context, name: string, task: () => Promise<void>): Promise<void> {
  try {
    await task();
  } catch (error) {
    logger.error('Telegram branch failed without stopping bot', { branch: name, error: errorMessage(error), userId: ctx.from?.id, chatId: ctx.chat?.id });
    await replyUser(ctx, `❌ ${name} failed safely: ${errorMessage(error).slice(0, 700)}`).catch((replyError: unknown) => {
      logger.error('Failed to notify Telegram user about branch error', { branch: name, error: errorMessage(replyError) });
    });
  }
}

export function registerHandlers(bot: Telegraf<Context>): void {
  bot.start(async (ctx: Context) => {
    await replyUser(ctx, 'AI Telegram Channel Manager is online. Use /news, /poll, /formula, or send a PDF/image for automatic routing.');
  });

  bot.help(async (ctx: Context) => {
    await replyUser(ctx, '/news <topic>\n/poll <topic>\n/formula <topic>\n/admin_status\n\nSend a PDF to extract questions, or an image/PDF of notes to request a quality check.');
  });

  bot.command('news', async (ctx: Context) => {
    await runSafely(ctx, 'JEE news', async () => {
      const summary = await runJeeNewsBranch(bot, topicFromCommand(ctx.message.text));
      await replyUser(ctx, `✅ Published: ${summary.headline}`);
    });
  });

  bot.command('poll', async (ctx: Context) => {
    await runSafely(ctx, 'Auto poll', async () => {
      const { poll, messageId } = await generateAndSchedulePoll(bot, topicFromCommand(ctx.message.text));
      await replyUser(ctx, `✅ Poll published and queued for deletion in 24 hours. Message ID: ${messageId}\nQuestion: ${poll.question}`);
    });
  });

  bot.command('formula', async (ctx: Context) => {
    await runSafely(ctx, 'Formula sheet', async () => {
      await runFormulaSheetBranch(bot, topicFromCommand(ctx.message.text));
      await replyUser(ctx, '✅ Formula sheet verified and uploaded to the channel.');
    });
  });

  bot.command('admin_status', adminOnlyMiddleware, async (ctx: Context) => {
    await replyUser(ctx, `✅ Admin verified. Channel: ${env.TELEGRAM_CHANNEL_ID}`);
  });

  bot.on('document', async (ctx: Context) => {
    const document = ctx.message.document;
    const caption = ctx.message.caption?.trim() ?? '';
    await runSafely(ctx, 'Document automation', async () => {
      const file = await new TelegramService(bot).downloadFile(
        document.file_id,
        document.file_name ?? 'telegram-document',
        document.mime_type ?? 'application/octet-stream'
      );

      if (document.mime_type === 'application/pdf' && !/\bnotes?\b/i.test(caption)) {
        const result = await processQuestionPdf(file.buffer, caption || undefined);
        await replyUser(ctx, `✅ Question paper exported after 3-pass reconciliation.\nGoogle Doc: ${result.documentUrl}`);
        return;
      }

      if (document.mime_type === 'application/pdf' || document.mime_type?.startsWith('image/')) {
        const report = await runNotesCheckBranch(bot, file.buffer, file.mimeType, file.fileName);
        await replyUser(ctx, `✅ Notes inspection completed. Overall score: ${report.overallScore}/100.`);
        return;
      }

      const intent = await classifyIntent(caption || document.file_name || 'Document received', `document: ${document.mime_type ?? 'unknown'}`);
      if (intent.intent === 'FORMULA_SHEET') {
        await runFormulaSheetBranch(bot, intent.extractedTopic ?? 'Class 11 JEE formulas');
        await replyUser(ctx, '✅ Formula sheet uploaded.');
      } else {
        await replyUser(ctx, `ℹ️ Received document. Classified intent: ${intent.intent}.`);
      }
    });
  });

  bot.on('photo', async (ctx: Context) => {
    const photo = ctx.message.photo.at(-1);
    if (!photo) return;
    await runSafely(ctx, 'Image automation', async () => {
      const file = await new TelegramService(bot).downloadFile(photo.file_id, 'telegram-photo.jpg', 'image/jpeg');
      const caption = ctx.message.caption?.trim() ?? '';
      const intent = caption ? await classifyIntent(caption, 'Telegram photo') : { intent: 'NOTES_CHECK' as const, confidence: 1 };
      if (intent.intent === 'NOTES_CHECK') {
        const report = await runNotesCheckBranch(bot, file.buffer, file.mimeType, file.fileName);
        await replyUser(ctx, `✅ Notes inspection completed. Overall score: ${report.overallScore}/100.`);
      } else {
        await replyUser(ctx, `ℹ️ Image classified as ${intent.intent}. Add a more specific instruction if another branch is intended.`);
      }
    });
  });

  bot.on('text', async (ctx: Context) => {
    const text = ctx.message.text.trim();
    if (text.startsWith('/')) return;
    await runSafely(ctx, 'Intent routing', async () => {
      const intent = await classifyIntent(text, 'Telegram text message');
      logger.info('Routed Telegram text', { userId: ctx.from?.id, intent });
      switch (intent.intent) {
        case 'NEWS_SEARCH': {
          const summary = await runJeeNewsBranch(bot, intent.extractedTopic ?? text);
          await replyUser(ctx, `✅ News published: ${summary.headline}`);
          break;
        }
        case 'CREATE_POLL': {
          const result = await generateAndSchedulePoll(bot, intent.extractedTopic ?? text);
          await replyUser(ctx, `✅ Poll published. Message ID ${result.messageId}; scheduled deletion in 24 hours.`);
          break;
        }
        case 'FORMULA_SHEET':
          await runFormulaSheetBranch(bot, intent.extractedTopic ?? text);
          await replyUser(ctx, '✅ Formula sheet uploaded to the channel.');
          break;
        case 'NOTES_CHECK':
          await replyUser(ctx, '📷 Send the handwritten notes as an image or PDF for inspection.');
          break;
        case 'QUESTION_EXTRACTION':
          await replyUser(ctx, '📄 Send the question paper PDF to start the three-pass extractor.');
          break;
        default:
          await replyUser(ctx, 'I could not determine a safe branch for that request.');
      }
    });
  });
}
