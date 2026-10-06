import { z } from 'zod';
import { generateStructured } from '../../config/gemini';
import { toUnicodeMath } from '../../types/unicodeMap';
import type { AuditResult, QuestionExtractionResult, ReconciledQuestionExtraction } from '../../types';

const optionSchema = z.object({ label: z.string(), text: z.string() });
const diagramSchema = z.object({
  kind: z.enum(['LINE_GRAPH', 'SCATTER_GRAPH', 'BAR_GRAPH', 'GEOMETRY', 'CIRCUIT']),
  title: z.string(), labels: z.array(z.string()), xValues: z.array(z.number()), yValues: z.array(z.number()), seriesLabel: z.string()
});
const questionSchema = z.object({
  number: z.string(), questionText: z.string(), options: z.array(optionSchema), correctAnswer: z.string(), solutionLogic: z.string(),
  hasDiagramRequirement: z.boolean(), diagramDescription: z.string(), diagram: diagramSchema.optional()
});
const resultSchema = z.object({
  topic: z.string(),
  coverageConfirmed: z.boolean(),
  unresolvedElements: z.array(z.string()),
  questions: z.array(questionSchema)
});

const resultJsonSchema = {
  type: 'object',
  properties: {
    topic: { type: 'string' },
    coverageConfirmed: { type: 'boolean' },
    unresolvedElements: { type: 'array', items: { type: 'string' } },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          number: { type: 'string' }, questionText: { type: 'string' },
          options: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, text: { type: 'string' } }, required: ['label', 'text'] } },
          correctAnswer: { type: 'string' }, solutionLogic: { type: 'string' }, hasDiagramRequirement: { type: 'boolean' }, diagramDescription: { type: 'string' },
          diagram: { type: 'object', properties: {
            kind: { type: 'string', enum: ['LINE_GRAPH', 'SCATTER_GRAPH', 'BAR_GRAPH', 'GEOMETRY', 'CIRCUIT'] }, title: { type: 'string' }, labels: { type: 'array', items: { type: 'string' } },
            xValues: { type: 'array', items: { type: 'number' } }, yValues: { type: 'array', items: { type: 'number' } }, seriesLabel: { type: 'string' }
          }, required: ['kind', 'title', 'labels', 'xValues', 'yValues', 'seriesLabel'] }
        },
        required: ['number', 'questionText', 'options', 'correctAnswer', 'solutionLogic', 'hasDiagramRequirement', 'diagramDescription']
      }
    }
  },
  required: ['topic', 'coverageConfirmed', 'unresolvedElements', 'questions'],
  propertyOrdering: ['topic', 'coverageConfirmed', 'unresolvedElements', 'questions']
};

export async function passThreeReconcile(
  rawPdfText: string,
  passOne: QuestionExtractionResult,
  passTwo: AuditResult
): Promise<ReconciledQuestionExtraction> {
  const prompt = `You are Pass 3, the final reconciliation pass of a high-reliability question-paper parser.
Independently re-scan the raw PDF text, compare it with Pass 1, apply every Pass 2 finding, and produce the canonical final question set.
A paper must NOT be marked coverageConfirmed if any missing element, number, option, diagram reference, or unresolved ambiguity remains. When uncertain, set coverageConfirmed=false and list unresolvedElements.
Do not invent content. Preserve numbering. Normalize all math and chemistry to Unicode symbols only.

RAW PDF:
---BEGIN PDF---
${rawPdfText}
---END PDF---

PASS 1:
${JSON.stringify(passOne)}

PASS 2:
${JSON.stringify(passTwo)}

Return JSON only.`;

  const result = await generateStructured<ReconciledQuestionExtraction>('pdf-pass-three-reconciliation', prompt, resultJsonSchema, resultSchema);
  return {
    ...result,
    topic: toUnicodeMath(result.topic),
    unresolvedElements: result.unresolvedElements.map(toUnicodeMath),
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
