import { z } from 'zod';
import { generateStructuredVision } from '../config/gemini';
import type { NotesQualityReport } from '../types';

const reportSchema = z.object({
  legibilityScore: z.number().min(0).max(100),
  structuralClarityScore: z.number().min(0).max(100),
  contentAccuracyScore: z.number().min(0).max(100),
  overallScore: z.number().min(0).max(100),
  detectedHeadings: z.array(z.string()),
  improvementSuggestions: z.array(z.string())
});

const reportJsonSchema = {
  type: 'object',
  properties: {
    legibilityScore: { type: 'number', minimum: 0, maximum: 100 },
    structuralClarityScore: { type: 'number', minimum: 0, maximum: 100 },
    contentAccuracyScore: { type: 'number', minimum: 0, maximum: 100 },
    overallScore: { type: 'number', minimum: 0, maximum: 100 },
    detectedHeadings: { type: 'array', items: { type: 'string' } },
    improvementSuggestions: { type: 'array', items: { type: 'string' } }
  },
  required: ['legibilityScore', 'structuralClarityScore', 'contentAccuracyScore', 'overallScore', 'detectedHeadings', 'improvementSuggestions'],
  propertyOrdering: ['legibilityScore', 'structuralClarityScore', 'contentAccuracyScore', 'overallScore', 'detectedHeadings', 'improvementSuggestions']
};

export async function inspectNotes(buffer: Buffer, mimeType: string): Promise<NotesQualityReport> {
  const prompt = `Inspect these handwritten study notes as a strict educational quality reviewer.
Score legibility, structural clarity, and content accuracy separately from 0 to 100. OverallScore must be a conservative holistic score, not an optimistic average.
Identify visible headings and give concrete improvement suggestions based only on the submitted notes. Do not invent missing content.
Return JSON only.`;
  return generateStructuredVision<NotesQualityReport>('handwritten-notes-quality', prompt, buffer, mimeType, reportJsonSchema, reportSchema);
}
