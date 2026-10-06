import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { inspectNotes } from '../ai/visionInspector';
import { TelegramService } from '../services/telegramService';
import type { NotesQualityReport } from '../types';
import type { Telegraf } from 'telegraf';
import type { Context } from 'telegraf';

async function normalizeImage(buffer: Buffer, mimeType: string): Promise<{ buffer: Buffer; mimeType: string }> {
  if (!mimeType.startsWith('image/')) return { buffer, mimeType };
  const normalized = await sharp(buffer).rotate().png().toBuffer();
  return { buffer: normalized, mimeType: 'image/png' };
}

function buildCaption(report: NotesQualityReport): string {
  const headings = report.detectedHeadings.length > 0 ? report.detectedHeadings.join(', ') : 'No clear headings detected';
  return `✅ Notes quality approved\n\nOverall: ${report.overallScore}/100\nLegibility: ${report.legibilityScore}/100\nStructure: ${report.structuralClarityScore}/100\nAccuracy: ${report.contentAccuracyScore}/100\n\nHeadings: ${headings}`;
}

function buildAdminFeedback(report: NotesQualityReport): string {
  const suggestions = report.improvementSuggestions.map((item) => `• ${item}`).join('\n');
  return `Notes quality review: NOT APPROVED\n\nOverall: ${report.overallScore}/100\nLegibility: ${report.legibilityScore}/100\nStructure: ${report.structuralClarityScore}/100\nAccuracy: ${report.contentAccuracyScore}/100\n\nImprovement steps:\n${suggestions || 'Improve readability, structure, and factual precision.'}`;
}

export async function runNotesCheckBranch(
  bot: Telegraf<Context>,
  buffer: Buffer,
  mimeType: string,
  originalFileName: string
): Promise<NotesQualityReport> {
  const normalized = await normalizeImage(buffer, mimeType);
  const report = await inspectNotes(normalized.buffer, normalized.mimeType);
  const telegram = new TelegramService(bot);

  if (report.overallScore >= 80) {
    const tmpPath = path.join(os.tmpdir(), `notes-${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(originalFileName) || '.png'}`);
    try {
      await fs.writeFile(tmpPath, buffer);
      await telegram.sendDocument(env.TELEGRAM_CHANNEL_ID, tmpPath, buildCaption(report));
    } finally {
      await fs.rm(tmpPath, { force: true }).catch((error: unknown) => logger.warn('Temporary notes file cleanup failed', { error }));
    }
  } else {
    await telegram.sendMessage(env.ADMIN_TELEGRAM_USER_ID, buildAdminFeedback(report));
  }

  return report;
}
