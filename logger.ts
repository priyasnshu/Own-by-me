import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'ai-telegram-automation-backend' },
  transports: [
    new winston.transports.Console()
  ]
});

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
}

export async function withRetry<T>(
  operationName: string,
  operation: () => Promise<T>,
  attempts = 3,
  baseDelayMs = 500
): Promise<T> {
  let lastError: unknown = undefined;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      logger.warn('External operation failed', {
        operationName,
        attempt,
        attempts,
        error: errorMessage(error)
      });
      if (attempt < attempts) {
        const delay = baseDelayMs * 2 ** (attempt - 1) + Math.floor(Math.random() * 150);
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${operationName} failed after ${attempts} attempts.`);
}
