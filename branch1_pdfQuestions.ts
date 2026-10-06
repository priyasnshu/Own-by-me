import pdfParse from 'pdf-parse';
import { logger } from '../config/logger';
import { passOneExtract } from '../ai/passes/passOne';
import { passTwoAudit } from '../ai/passes/passTwo';
import { passThreeReconcile } from '../ai/passes/passThree';
import { createDiagramUrl } from '../services/chartService';
import { createQuestionsGoogleDoc } from '../services/googleDocsService';
import type { ReconciledQuestionExtraction } from '../types';

export async function processQuestionPdf(buffer: Buffer, requestedTopic?: string): Promise<{ documentUrl: string; result: ReconciledQuestionExtraction }> {
  let parsed: { text: string };
  try {
    parsed = await pdfParse(buffer);
  } catch (error) {
    logger.error('PDF parsing failed', { error });
    throw new Error('Unable to parse the supplied PDF.');
  }

  const rawText = parsed.text.trim();
  if (!rawText) throw new Error('The PDF contained no extractable text.');

  const passOne = await passOneExtract(rawText);
  const passTwo = await passTwoAudit(rawText, passOne);
  const result = await passThreeReconcile(rawText, passOne, passTwo);

  const detectedNumbers = new Set<string>();
  const questionMarkerPattern = /(?:^|\n)\s*(?:Q(?:uestion)?\s*)?(\d{1,3})[.)]\s/gim;
  for (const match of rawText.matchAll(questionMarkerPattern)) {
    const number = match[1];
    if (number) detectedNumbers.add(number);
  }
  const extractedNumbers = new Set(result.questions.map((question) => {
    const match = question.number.match(/\d+/);
    return match?.[0] ?? question.number.trim();
  }));
  const locallyMissingNumbers = [...detectedNumbers].filter((number) => !extractedNumbers.has(number));
  if (locallyMissingNumbers.length > 0) {
    throw new Error(`Local question-number coverage check failed. Missing from final set: ${locallyMissingNumbers.join(', ')}`);
  }

  if (!result.coverageConfirmed || result.unresolvedElements.length > 0 || passTwo.coverageAssessment !== 'COMPLETE') {
    throw new Error(`Three-pass consensus did not confirm complete coverage. Unresolved elements: ${result.unresolvedElements.join(' | ') || passTwo.notes}`);
  }

  if (requestedTopic?.trim()) result.topic = requestedTopic.trim();

  const diagramUrls = new Map<string, string>();
  for (const question of result.questions) {
    if (!question.hasDiagramRequirement || !question.diagram) continue;
    try {
      const url = await createDiagramUrl(question.diagram);
      diagramUrls.set(question.number, url);
    } catch (error) {
      logger.warn('Diagram generation failed; preserving text-only question', { questionNumber: question.number, error });
    }
  }

  const documentUrl = await createQuestionsGoogleDoc(result, diagramUrls);
  return { documentUrl, result };
}
