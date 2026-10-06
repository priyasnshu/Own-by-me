import axios from 'axios';
import type { Telegraf } from 'telegraf';
import { Input } from 'telegraf';
import type { Context } from 'telegraf';
import { env } from '../config/env';
import { errorMessage, logger, withRetry } from '../config/logger';

export interface DownloadedTelegramFile {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}

export class TelegramService {
  public constructor(private readonly bot: Telegraf<Context>) {}

  public async sendMessage(chatId: string | number, text: string): Promise<void> {
    await withRetry('telegram-send-message', async () => {
      try {
        await this.bot.telegram.sendMessage(chatId, text, { disable_web_page_preview: true });
      } catch (error) {
        logger.error('Telegram sendMessage failed', { chatId, error: errorMessage(error) });
        throw error;
      }
    });
  }

  public async sendPhoto(chatId: string | number, photoUrl: string, caption: string): Promise<void> {
    await withRetry('telegram-send-photo', async () => {
      try {
        await this.bot.telegram.sendPhoto(chatId, photoUrl, { caption });
      } catch (error) {
        logger.error('Telegram sendPhoto failed', { chatId, error: errorMessage(error) });
        throw error;
      }
    });
  }

  public async sendDocument(chatId: string | number, documentPath: string, caption: string): Promise<void> {
    await withRetry('telegram-send-document', async () => {
      try {
        await this.bot.telegram.sendDocument(chatId, Input.fromLocalFile(documentPath), { caption });
      } catch (error) {
        logger.error('Telegram sendDocument failed', { chatId, error: errorMessage(error) });
        throw error;
      }
    });
  }

  public async sendPoll(
    chatId: string | number,
    question: string,
    options: [string, string, string, string],
    correctOptionId: number,
    explanation: string
  ): Promise<number> {
    return withRetry('telegram-send-poll', async () => {
      try {
        const message = await this.bot.telegram.sendPoll(chatId, question, options, {
          type: 'quiz',
          correct_option_id: correctOptionId,
          is_anonymous: false,
          allows_multiple_answers: false,
          explanation
        });
        return message.message_id;
      } catch (error) {
        logger.error('Telegram sendPoll failed', { chatId, error: errorMessage(error) });
        throw error;
      }
    });
  }

  public async deleteMessage(chatId: string | number, messageId: number): Promise<void> {
    await withRetry('telegram-delete-message', async () => {
      try {
        await this.bot.telegram.deleteMessage(chatId, messageId);
      } catch (error) {
        const message = errorMessage(error);
        if (/message to delete not found|message can't be deleted/i.test(message)) {
          logger.info('Telegram message was already absent or not deletable', { chatId, messageId, error: message });
          return;
        }
        logger.error('Telegram deleteMessage failed', { chatId, messageId, error: message });
        throw error;
      }
    }, 3, 1000);
  }

  public async downloadFile(fileId: string, fileName: string, mimeType: string): Promise<DownloadedTelegramFile> {
    const url = await withRetry('telegram-get-file-link', async () => this.bot.telegram.getFileLink(fileId));
    return withRetry('telegram-file-download', async () => {
      const response = await axios.get<ArrayBuffer>(url.toString(), {
        responseType: 'arraybuffer',
        timeout: 60000,
        maxContentLength: env.MAX_TELEGRAM_DOWNLOAD_BYTES,
        maxBodyLength: env.MAX_TELEGRAM_DOWNLOAD_BYTES
      });
      const buffer = Buffer.from(response.data);
      if (buffer.byteLength > env.MAX_TELEGRAM_DOWNLOAD_BYTES) {
        throw new Error(`Telegram file exceeds MAX_TELEGRAM_DOWNLOAD_BYTES (${env.MAX_TELEGRAM_DOWNLOAD_BYTES}).`);
      }
      return { buffer, fileName, mimeType };
    }, 3, 1000);
  }
}
