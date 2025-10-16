import type { WebSearchSource } from './tools';

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

export interface EvaluationCriteria {
  level: StrictnessLevel;
  minWords: number;
  minSources: number;
  minFollowUpQuestions: number;
  requirements: string[];
}

export const EVALUATION_CRITERIA: Record<StrictnessLevel, EvaluationCriteria> = {
  0: {
    level: 0,
    minWords: 3000,
    minSources: 3,
    minFollowUpQuestions: 3,
    requirements: [
      'Covers main points with sufficient detail',
      'At least 3 credible sources',
      'Basic structure with clear headers and sections',
      'Minimum 3000 words for comprehensive coverage',
    ],
  },
  1: {
    level: 1,
    minWords: 4500,
    minSources: 5,
    minFollowUpQuestions: 4,
    requirements: [
      'Comprehensive coverage with detailed analysis',
      'Multiple credible sources (5+)',
      'Proper citations for key claims',
      'Well-structured with multiple sections and subsections',
      'Addresses multiple perspectives',
      'Minimum 4500 words with in-depth explanations',
    ],
  },
  2: {
    level: 2,
    minWords: 6000,
    minSources: 7,
    minFollowUpQuestions: 5,
    requirements: [
      'Exhaustive expert-level depth and analysis',
      'Multiple high-quality authoritative sources (7+)',
      'Citations integrated naturally throughout',
      'Excellent logical flow with clear progression',
      'Specific examples, data points, and statistics',
      'Critical analysis and synthesis of information',
      'Addresses nuances, limitations, and edge cases',
      'Minimum 6000 words for thorough deep research',
    ],
  },
};

export interface EnhancedResearchTask {
  step: number;
  action: string;
  rationale: string;
  completed: boolean;
  result?: string;
  sources?: WebSearchSource[];
}

export interface ResearchResponse {
  reasoning: string;
  tasks: EnhancedResearchTask[];
  response: string;
  citations: Citation[];
  followUpQuestions: string[];
}

export type DeepResearchStatus =
  | 'gate_check'
  | 'gate_skip'
  | 'planning'
  | 'researching'
  | 'synthesizing'
  | 'evaluating'
  | 'retrying'
  | 'formatting'
  | 'completed'
  | 'error';

export interface EnhancedDeepResearchProgress {
  status: DeepResearchStatus;
  message: string;
  details?: {
    // Gate phase
    gateDecision?: GateDecision;
    
    // Research phase
    researchTasks?: EnhancedResearchTask[];
    currentTaskIndex?: number;
    totalTasks?: number;
    
    // Evaluation phase
    evaluationResult?: EvaluationResult;
    currentAttempt?: number;
    maxAttempts?: number;
    strictnessLevel?: StrictnessLevel;
    
    // Output phase
    citations?: Citation[];
    followUpQuestions?: string[];
    wordCount?: number;
    error?: string;
  };
}

export interface EnhancedResearchState {
  // Input
  originalQuery: string;
  
  // Gate phase
  gateDecision?: GateDecision;
  
  // Research phase
  researchTasks?: EnhancedResearchTask[];
  currentTaskIndex?: number;
  
  // Evaluation phase
  currentAttempt: number;
  strictnessLevel: StrictnessLevel;
  evaluationFeedback: string[];
  
  // Output
  citations: Citation[];
  followUpQuestions: string[];
  finalResponse: string;
  error?: string;
  skipped: boolean;
}
