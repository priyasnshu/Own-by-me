import { google, type docs_v1 } from 'googleapis';
import { env } from '../config/env';
import { errorMessage, logger, withRetry } from '../config/logger';
import type { ReconciledQuestionExtraction } from '../types';

function buildAuth() {
  const credentials: unknown = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  if (!credentials || typeof credentials !== 'object') throw new Error('Google service account JSON is not an object.');
  const auth = new google.auth.GoogleAuth({
    credentials: credentials as object,
    scopes: [
      'https://www.googleapis.com/auth/documents',
      'https://www.googleapis.com/auth/drive'
    ]
  });
  return auth;
}

function buildRequests(result: ReconciledQuestionExtraction, diagramUrls: Map<string, string>): docs_v1.Schema$Request[] {
  const requests: docs_v1.Schema$Request[] = [];
  let index = 1;
  const appendText = (text: string): void => {
    requests.push({ insertText: { location: { index }, text } });
    index += text.length;
  };

  appendText(`Topic: ${result.topic}\n\n`);
  for (const question of result.questions) {
    appendText(`Question ${question.number}\n${question.questionText}\n`);
    if (question.options.length > 0) {
      for (const option of question.options) appendText(`${option.label}. ${option.text}\n`);
    }
    appendText(`Correct Answer: ${question.correctAnswer}\nSolution: ${question.solutionLogic}\n`);
    if (question.hasDiagramRequirement) {
      appendText(`Diagram: ${question.diagramDescription}\n`);
      const imageUrl = diagramUrls.get(question.number);
      if (imageUrl) {
        requests.push({
          insertInlineImage: {
            location: { index },
            uri: imageUrl,
            objectSize: { width: { magnitude: 450, unit: 'PT' } }
          }
        });
        index += 1;
        appendText('\n');
      }
    }
    appendText('\n');
  }
  return requests;
}

export async function createQuestionsGoogleDoc(
  result: ReconciledQuestionExtraction,
  diagramUrls: Map<string, string>
): Promise<string> {
  const auth = buildAuth();
  const docs = google.docs({ version: 'v1', auth });
  const drive = google.drive({ version: 'v3', auth });
  const title = `Questions Export - ${result.topic || 'Untitled'} - ${new Date().toISOString().slice(0, 10)}`;

  const document = await withRetry('google-docs-create-document', async () => docs.documents.create({ requestBody: { title } }));
  const documentId = document.data.documentId;
  if (!documentId) throw new Error('Google Docs did not return a document ID.');

  const requests = buildRequests(result, diagramUrls);
  await withRetry('google-docs-batch-update', async () => docs.documents.batchUpdate({ documentId, requestBody: { requests } }));

  await withRetry('google-drive-share-document', async () => drive.permissions.create({
    fileId: documentId,
    requestBody: { role: 'reader', type: 'anyone' },
    fields: 'id'
  }));

  if (env.GOOGLE_DRIVE_FOLDER_ID) {
    await withRetry('google-drive-move-document', async () => drive.files.update({
      fileId: documentId,
      addParents: env.GOOGLE_DRIVE_FOLDER_ID,
      fields: 'id, parents'
    }));
  }

  logger.info('Google Doc created', { documentId, title });
  return `https://docs.google.com/document/d/${documentId}/edit`;
}

export function parseGoogleServiceAccountForHealthCheck(): void {
  try {
    const credentials: unknown = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
    if (!credentials || typeof credentials !== 'object') throw new Error('Invalid service account object.');
  } catch (error) {
    throw new Error(`Google service account validation failed: ${errorMessage(error)}`);
  }
}
