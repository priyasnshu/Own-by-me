export enum Intent {
  QUESTION_EXTRACTION = 'QUESTION_EXTRACTION',
  NEWS_SEARCH = 'NEWS_SEARCH',
  CREATE_POLL = 'CREATE_POLL',
  NOTES_CHECK = 'NOTES_CHECK',
  FORMULA_SHEET = 'FORMULA_SHEET'
}

export interface IntentClassification {
  intent: Intent;
  confidence: number;
  extractedTopic?: string;
  userInstructions?: string;
}

export interface QuestionOption {
  label: string;
  text: string;
}

export interface DiagramSpec {
  kind: 'LINE_GRAPH' | 'SCATTER_GRAPH' | 'BAR_GRAPH' | 'GEOMETRY' | 'CIRCUIT';
  title: string;
  labels: string[];
  xValues: number[];
  yValues: number[];
  seriesLabel: string;
}

export interface ExtractedQuestion {
  number: string;
  questionText: string;
  options: QuestionOption[];
  correctAnswer: string;
  solutionLogic: string;
  hasDiagramRequirement: boolean;
  diagramDescription: string;
  diagram?: DiagramSpec;
}

export interface QuestionExtractionResult {
  topic: string;
  questions: ExtractedQuestion[];
}

export interface AuditResult {
  missingElements: string[];
  missingQuestionNumbers: string[];
  coverageAssessment: 'COMPLETE' | 'INCOMPLETE' | 'UNCERTAIN';
  notes: string;
}

export interface ReconciledQuestionExtraction {
  topic: string;
  coverageConfirmed: boolean;
  unresolvedElements: string[];
  questions: ExtractedQuestion[];
}

export interface NewsArticle {
  title: string;
  url: string;
  snippet: string;
  imageUrl?: string;
  sourceDomain: string;
  rawText: string;
}

export interface NewsSummary {
  headline: string;
  bullets: string[];
}

export interface GeneratedPoll {
  question: string;
  options: [string, string, string, string];
  correctOptionId: number;
  explanation: string;
}

export interface NotesQualityReport {
  legibilityScore: number;
  structuralClarityScore: number;
  contentAccuracyScore: number;
  overallScore: number;
  detectedHeadings: string[];
  improvementSuggestions: string[];
}

export interface FormulaItem {
  name: string;
  formula: string;
  units: string;
  notes: string;
}

export interface FormulaSheetResult {
  topic: string;
  formulas: FormulaItem[];
  physicalConstants: string[];
  shortcutTricks: string[];
  verificationNotes: string[];
}

export interface FormulaVerificationResult {
  dimensionallyConsistent: boolean;
  signConventionsConsistent: boolean;
  rejectedFormulaNames: string[];
  corrections: string[];
  reasoning: string;
}
