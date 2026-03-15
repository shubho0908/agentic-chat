export interface GateDecision {
  shouldResearch: boolean;
  reason: string;
  confidence: 'low' | 'medium' | 'high';
}

export interface DirectLLMResponse {
  answer: string;
  confidence: 'low' | 'medium' | 'high';
}

export interface Citation {
  id: string;
  source: string;
  author?: string;
  year?: string;
  url?: string;
  relevance: string;
}

export type StrictnessLevel = 0 | 1 | 2;

export interface EvaluationResult {
  meetsStandards: boolean;
  isRelevant: boolean;
  feedback: string;
  rewrittenPrompt?: string;
  score: number;
}
