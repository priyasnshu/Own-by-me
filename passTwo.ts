import { z } from 'zod';
import { env } from '../../config/env';
import { generateStructured } from '../../config/gemini';
import type { AuditResult, QuestionExtractionResult } from '../../types';

const auditSchema = z.object({
  missingElements: z.array(z.string()),
  missingQuestionNumbers: z.array(z.string()),
  coverageAssessment: z.enum(['COMPLETE', 'INCOMPLETE', 'UNCERTAIN']),
  notes: z.string()
});

const auditJsonSchema = {
  type: 'object',
  properties: {
    missingElements: { type: 'array', items: { type: 'string' } },
    missingQuestionNumbers: { type: 'array', items: { type: 'string' } },
    coverageAssessment: { type: 'string', enum: ['COMPLETE', 'INCOMPLETE', 'UNCERTAIN'] },
    notes: { type: 'string' }
  },
  required: ['missingElements', 'missingQuestionNumbers', 'coverageAssessment', 'notes'],
  propertyOrdering: ['missingElements', 'missingQuestionNumbers', 'coverageAssessment', 'notes']
};

export async function passTwoAudit(rawPdfText: string, passOne: QuestionExtractionResult): Promise<AuditResult> {
  if (rawPdfText.length > env.MAX_PDF_TEXT_CHARS) {
    throw new Error(`PDF text exceeds MAX_PDF_TEXT_CHARS (${env.MAX_PDF_TEXT_CHARS}). Refusing partial audit.`);
  }
  const prompt = `You are Pass 2, an adversarial audit of Pass 1.
Compare the original raw PDF text against Pass 1 output. Detect every missing question, sub-part, option, answer, solution fragment, question number, and diagram reference. Do not rewrite the entire paper. Return an array of missing elements and explicitly list missing question numbers.
If there is any uncertainty, mark coverageAssessment as UNCERTAIN rather than COMPLETE.

Original raw PDF:
---BEGIN PDF---
${rawPdfText}
---END PDF---

Pass 1 output:
${JSON.stringify(passOne)}

Return JSON only.`;

  return generateStructured<AuditResult>('pdf-pass-two-audit', prompt, auditJsonSchema, auditSchema, env.GEMINI_TEXT_MODEL, 0);
}
