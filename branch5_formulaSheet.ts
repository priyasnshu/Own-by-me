import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { z } from 'zod';
import { env } from '../config/env';
import { generateStructured } from '../config/gemini';
import { toUnicodeMath } from '../types/unicodeMap';
import { TelegramService } from '../services/telegramService';
import type { FormulaSheetResult, FormulaVerificationResult } from '../types';
import type { Telegraf } from 'telegraf';
import type { Context } from 'telegraf';

const formulaSchema = z.object({ name: z.string(), formula: z.string(), units: z.string(), notes: z.string() });
const sheetSchema = z.object({
  topic: z.string(), formulas: z.array(formulaSchema).min(1), physicalConstants: z.array(z.string()), shortcutTricks: z.array(z.string()), verificationNotes: z.array(z.string())
});
const sheetJsonSchema = {
  type: 'object', properties: {
    topic: { type: 'string' },
    formulas: { type: 'array', minItems: 1, items: { type: 'object', properties: { name: { type: 'string' }, formula: { type: 'string' }, units: { type: 'string' }, notes: { type: 'string' } }, required: ['name', 'formula', 'units', 'notes'] } },
    physicalConstants: { type: 'array', items: { type: 'string' } }, shortcutTricks: { type: 'array', items: { type: 'string' } }, verificationNotes: { type: 'array', items: { type: 'string' } }
  }, required: ['topic', 'formulas', 'physicalConstants', 'shortcutTricks', 'verificationNotes'], propertyOrdering: ['topic', 'formulas', 'physicalConstants', 'shortcutTricks', 'verificationNotes']
};

const verificationSchema = z.object({
  dimensionallyConsistent: z.boolean(), signConventionsConsistent: z.boolean(), rejectedFormulaNames: z.array(z.string()), corrections: z.array(z.string()), reasoning: z.string()
});
const verificationJsonSchema = {
  type: 'object', properties: {
    dimensionallyConsistent: { type: 'boolean' }, signConventionsConsistent: { type: 'boolean' },
    rejectedFormulaNames: { type: 'array', items: { type: 'string' } }, corrections: { type: 'array', items: { type: 'string' } }, reasoning: { type: 'string' }
  }, required: ['dimensionallyConsistent', 'signConventionsConsistent', 'rejectedFormulaNames', 'corrections', 'reasoning'], propertyOrdering: ['dimensionallyConsistent', 'signConventionsConsistent', 'rejectedFormulaNames', 'corrections', 'reasoning']
};

function normalizeSheet(sheet: FormulaSheetResult): FormulaSheetResult {
  return {
    topic: toUnicodeMath(sheet.topic),
    formulas: sheet.formulas.map((formula) => ({ ...formula, name: toUnicodeMath(formula.name), formula: toUnicodeMath(formula.formula), units: toUnicodeMath(formula.units), notes: toUnicodeMath(formula.notes) })),
    physicalConstants: sheet.physicalConstants.map(toUnicodeMath),
    shortcutTricks: sheet.shortcutTricks.map(toUnicodeMath),
    verificationNotes: sheet.verificationNotes.map(toUnicodeMath)
  };
}

async function verifyFormulaSheet(sheet: FormulaSheetResult): Promise<FormulaVerificationResult> {
  const prompt = `Perform an independent verification pass on this formula sheet for ${sheet.topic}.
Check dimensional consistency of every formula using standard SI dimensions and check sign conventions/definitions. Identify any formula that must be rejected or corrected. Do not accept a formula merely because it looks familiar. All math in text must use Unicode symbols.
Formula sheet:
${JSON.stringify(sheet)}`;
  return generateStructured<FormulaVerificationResult>('formula-verification', prompt, verificationJsonSchema, verificationSchema, env.GEMINI_TEXT_MODEL, 0);
}

function renderText(sheet: FormulaSheetResult, verification: FormulaVerificationResult): string {
  const lines: string[] = [];
  lines.push(`FORMULA SHEET — ${sheet.topic}`, '');
  lines.push('FORMULAS');
  for (const formula of sheet.formulas) {
    if (verification.rejectedFormulaNames.includes(formula.name)) continue;
    lines.push(`${formula.name}: ${formula.formula}`, `Units: ${formula.units}`, `Note: ${formula.notes}`, '');
  }
  lines.push('PHYSICAL CONSTANTS');
  for (const item of sheet.physicalConstants) lines.push(`• ${item}`);
  lines.push('', 'SHORTCUT TRICKS');
  for (const item of sheet.shortcutTricks) lines.push(`• ${item}`);
  lines.push('', 'VERIFICATION');
  lines.push(`Dimensional consistency: ${verification.dimensionallyConsistent ? 'PASS' : 'FAIL'}`);
  lines.push(`Sign conventions: ${verification.signConventionsConsistent ? 'PASS' : 'FAIL'}`);
  for (const correction of verification.corrections) lines.push(`Correction: ${correction}`);
  lines.push(`Reasoning: ${verification.reasoning}`);
  return toUnicodeMath(lines.join('\n'));
}

export async function runFormulaSheetBranch(bot: Telegraf<Context>, topic: string): Promise<FormulaVerificationResult> {
  const sheetPrompt = `Create a complete Class 11/JEE formula sheet for the topic: ${topic}.
Include all important formulas, SI units, relevant physical constants, and high-value shortcut tricks. Include sign conventions where relevant. Avoid source markup for mathematics and chemistry; use Unicode symbols. Be comprehensive but factual.`;
  const sheet = normalizeSheet(await generateStructured<FormulaSheetResult>('formula-sheet-generation', sheetPrompt, sheetJsonSchema, sheetSchema, env.GEMINI_TEXT_MODEL, 0.1));
  const verification = await verifyFormulaSheet(sheet);
  if (!verification.dimensionallyConsistent || !verification.signConventionsConsistent) {
    throw new Error(`Formula verification failed. Corrections: ${verification.corrections.join(' | ')}`);
  }

  const text = renderText(sheet, verification);
  const telegram = new TelegramService(bot);
  const filePath = path.join(os.tmpdir(), `formula-sheet-${Date.now()}.txt`);
  try {
    await fs.writeFile(filePath, text, 'utf8');
    await telegram.sendDocument(env.TELEGRAM_CHANNEL_ID, filePath, `Formula sheet: ${sheet.topic}`);
  } finally {
    await fs.rm(filePath, { force: true }).catch(() => undefined);
  }
  return verification;
}
