import { GoogleGenAI } from '@google/genai';
import type { ZodType } from 'zod';
import { env } from './env';
import { errorMessage, logger, withRetry } from './logger';

export const gemini = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

if (env.GEMINI_TEXT_MODEL.startsWith('gemini-2.0-') || env.GEMINI_VISION_MODEL.startsWith('gemini-2.0-')) {
  logger.warn('Configured Gemini 2.0 model is retired; requests to it will fail. Configure a currently supported model instead.', {
    textModel: env.GEMINI_TEXT_MODEL,
    visionModel: env.GEMINI_VISION_MODEL
  });
}

export type JsonSchema = Record<string, unknown>;

function parseModelJson<T>(text: string, validator: ZodType<T>): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`Gemini returned invalid JSON: ${errorMessage(error)}`);
  }
  return validator.parse(parsed);
}

export async function generateStructured<T>(
  operationName: string,
  prompt: string,
  schema: JsonSchema,
  validator: ZodType<T>,
  model = env.GEMINI_TEXT_MODEL,
  temperature = 0
): Promise<T> {
  return withRetry(operationName, async () => {
    try {
      const response = await gemini.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseJsonSchema: schema,
          temperature
        }
      });
      if (!response.text) throw new Error('Gemini response contained no text.');
      return parseModelJson(response.text, validator);
    } catch (error) {
      logger.error('Gemini structured generation failed', { operationName, error: errorMessage(error) });
      throw error;
    }
  }, 3, 1000);
}

export async function generateStructuredVision<T>(
  operationName: string,
  prompt: string,
  buffer: Buffer,
  mimeType: string,
  schema: JsonSchema,
  validator: ZodType<T>
): Promise<T> {
  return withRetry(operationName, async () => {
    try {
      const response = await gemini.models.generateContent({
        model: env.GEMINI_VISION_MODEL,
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              { inlineData: { mimeType, data: buffer.toString('base64') } }
            ]
          }
        ],
        config: {
          responseMimeType: 'application/json',
          responseJsonSchema: schema,
          temperature: 0
        }
      });
      if (!response.text) throw new Error('Gemini vision response contained no text.');
      return parseModelJson(response.text, validator);
    } catch (error) {
      logger.error('Gemini vision generation failed', { operationName, error: errorMessage(error) });
      throw error;
    }
  }, 3, 1000);
}
