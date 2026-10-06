import 'dotenv/config';
import { z } from 'zod';

const positiveIntFromString = z.coerce.number().int().positive();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  PORT: positiveIntFromString.default(3000),
  TELEGRAM_BOT_TOKEN: z.string().min(20),
  TELEGRAM_CHANNEL_ID: z.string().min(1),
  ADMIN_TELEGRAM_USER_ID: positiveIntFromString,
  AUTHORIZED_TELEGRAM_USER_IDS: z.string().min(1),
  GEMINI_API_KEY: z.string().min(10),
  GEMINI_TEXT_MODEL: z.string().min(1).default('gemini-3.8-flash'),
  GEMINI_VISION_MODEL: z.string().min(1).default('gemini-3.8-flash'),
  REDIS_URL: z.string().url(),
  GOOGLE_CSE_API_KEY: z.string().min(10),
  GOOGLE_CSE_ID: z.string().min(1),
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().min(100),
  GOOGLE_DRIVE_FOLDER_ID: z.string().optional(),
  QUICKCHART_API_KEY: z.string().optional(),
  MAX_PDF_TEXT_CHARS: positiveIntFromString.default(600000),
  MAX_TELEGRAM_DOWNLOAD_BYTES: positiveIntFromString.default(25000000)
}).superRefine((value, ctx) => {
  try {
    const parsed: unknown = JSON.parse(value.GOOGLE_SERVICE_ACCOUNT_JSON);
    if (!parsed || typeof parsed !== 'object') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['GOOGLE_SERVICE_ACCOUNT_JSON'], message: 'Must contain a JSON object.' });
    }
  } catch {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['GOOGLE_SERVICE_ACCOUNT_JSON'], message: 'Must contain valid JSON.' });
  }
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const formatted = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
  throw new Error(`Environment validation failed: ${formatted}`);
}

const authorizedIds = parsed.data.AUTHORIZED_TELEGRAM_USER_IDS.split(',')
  .map((entry) => entry.trim())
  .filter((entry) => entry.length > 0)
  .map((entry) => Number(entry));

if (authorizedIds.length === 0 || authorizedIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
  throw new Error('AUTHORIZED_TELEGRAM_USER_IDS must contain only positive Telegram user IDs.');
}

export const env = {
  ...parsed.data,
  AUTHORIZED_TELEGRAM_USER_IDS: authorizedIds
};

export type AppEnv = typeof env;
