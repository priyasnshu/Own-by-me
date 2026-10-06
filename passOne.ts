import { z } from 'zod';
import { env } from '../../config/env';
import { generateStructured } from '../../config/gemini';
import { toUnicodeMath } from '../../types/unicodeMap';
import type { QuestionExtractionResult } from '../../types';

const optionSchema = z.object({ label: z.string().min(1), text: z.string().min(1) });
const diagramSchema = z.object({
  kind: z.enum(['LINE_GRAPH', 'SCATTER_GRAPH', 'BAR_GRAPH', 'GEOMETRY', 'CIRCUIT']),
  title: z.string(),
  labels: z.array(z.string()),
  xValues: z.array(z.number()),
  yValues: z.array(z.number()),
  seriesLabel: z.string()
});
const questionSchema = z.object({
  number: z.string().min(1),
  questionText: z.string().min(1),
  options: z.array(optionSchema),
  correctAnswer: z.string(),
  solutionLogic: z.string(),
  hasDiagramRequirement: z.boolean(),
  diagramDescription: z.string(),
  diagram: diagramSchema.optional()
});
const resultSchema = z.object({ topic: z.string(), questions: z.array(questionSchema).min(1) });

const resultJsonSchema = {
  type: 'object',
  properties: {
    topic: { type: 'string' },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          number: { type: 'string' },
          questionText: { type: 'string' },
          options: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, text: { type: 'string' } }, required: ['label', 'text'] } },
          correctAnswer: { type: 'string' },
          solutionLogic: { type: 'string' },
          hasDiagramRequirement: { type: 'boolean' },
          diagramDescription: { type: 'string' },
          diagram: { type: 'object', properties: {
            kind: { type: 'string', enum: ['LINE_GRAPH', 'SCATTER_GRAPH', 'BAR_GRAPH', 'GEOMETRY', 'CIRCUIT'] },
            title: { type: 'string' }, labels: { type: 'array', items: { type: 'string' } },
            xValues: { type: 'array', items: { type: 'number' } }, yValues: { type: 'array', items: { type: 'number' } },
            seriesLabel: { type: 'string' }
          }, required: ['kind', 'title', 'labels', 'xValues', 'yValues', 'seriesLabel'] }
        },
        required: ['number', 'questionText', 'options', 'correctAnswer', 'solutionLogic', 'hasDiagramRequirement', 'diagramDescription']
      }
    }
  },
  required: ['topic', 'questions'],
  propertyOrdering: ['topic', 'questions']
};

export async function passOneExtract(rawPdfText: string): Promise<QuestionExtractionResult> {
  if (rawPdfText.length > env.MAX_PDF_TEXT_CHARS) {
    throw new Error(`PDF text exceeds MAX_PDF_TEXT_CHARS (${env.MAX_PDF_TEXT_CHARS}). Refusing partial extraction.`);
  }

  const prompt = `You are Pass 1 of a high-reliability exam-paper extraction pipeline.
Read the complete raw PDF text below. Extract EVERY question, sub-part, option, stated answer, and solution detail. Do not skip diagram references. Preserve question numbering exactly. Do not invent missing content.
For diagrams, set hasDiagramRequirement=true and describe what is required. If enough numerical information is present, provide chart data.
All mathematical and chemical content in the output must be plain Unicode text, not source markup.
Raw PDF text starts below:
---BEGIN PDF---
${rawPdfText}
---END PDF---`;

  const result = await generateStructured<QuestionExtractionResult>('pdf-pass-one', prompt, resultJsonSchema, resultSchema, env.GEMINI_TEXT_MODEL, 0);
  return {
    topic: toUnicodeMath(result.topic),
    questions: result.questions.map((question) => ({
      ...question,
      questionText: toUnicodeMath(question.questionText),
      correctAnswer: toUnicodeMath(question.correctAnswer),
      solutionLogic: toUnicodeMath(question.solutionLogic),
      diagramDescription: toUnicodeMath(question.diagramDescription),
      options: question.options.map((option) => ({ ...option, text: toUnicodeMath(option.text) }))
    }))
  };
}
