import { z } from 'zod';
import { env } from '../config/env';
import { generateStructured } from '../config/gemini';
import { Intent, type IntentClassification } from '../types';

const routerSchema = z.object({
  intent: z.nativeEnum(Intent),
  confidence: z.number().min(0).max(1),
  extractedTopic: z.string().optional(),
  userInstructions: z.string().optional()
});

const routerJsonSchema = {
  type: 'object',
  properties: {
    intent: {
      type: 'string',
      enum: Object.values(Intent)
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    extractedTopic: { type: 'string' },
    userInstructions: { type: 'string' }
  },
  required: ['intent', 'confidence'],
  propertyOrdering: ['intent', 'confidence', 'extractedTopic', 'userInstructions']
};

export async function classifyIntent(input: string, metadata = 'text message'): Promise<IntentClassification> {
  const prompt = `Classify the following Telegram request into exactly one intent.
Metadata: ${metadata}
Request: ${input}

Rules:
- QUESTION_EXTRACTION: extracting questions from a PDF or question paper.
- NEWS_SEARCH: JEE/education news or current notification requests.
- CREATE_POLL: create a Telegram multiple-choice poll.
- NOTES_CHECK: inspect handwritten notes or study-note quality.
- FORMULA_SHEET: create or verify a formula sheet.
Return only JSON matching the supplied schema.`;

  const result = await generateStructured<IntentClassification>('intent-classification', prompt, routerJsonSchema, routerSchema, env.GEMINI_TEXT_MODEL, 0);
  return result;
}
