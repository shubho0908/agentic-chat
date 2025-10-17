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
    minWords: 6000,
    minSources: 15,
    minFollowUpQuestions: 4,
    requirements: [
      'Comprehensive coverage of all major aspects',
      'At least 15 credible, diverse sources',
      'Well-structured with 8-10 major sections',
      'Each major section has multiple subsections',
      'Minimum 6000 words with substantial depth',
      'Multiple concrete examples and case studies',
      'Specific data points, statistics, and evidence',
      'Clear markdown formatting with proper hierarchy',
    ],
  },
  1: {
    level: 1,
    minWords: 8000,
    minSources: 25,
    minFollowUpQuestions: 5,
    requirements: [
      'Exhaustive coverage with detailed multi-perspective analysis',
      '25+ high-quality authoritative sources',
      'Excellent structure with 10-12 major sections',
      'Proper citations integrated naturally throughout',
      'Multiple subsections per major section with clear hierarchy',
      'Minimum 8000 words with expert-level depth',
      'Rich examples, case studies, code snippets, comparison tables',
      'Addresses multiple perspectives and expert opinions',
      'Critical analysis and synthesis throughout',
      'Specific technical details and practical guidance',
    ],
  },
  2: {
    level: 2,
    minWords: 10000,
    minSources: 35,
    minFollowUpQuestions: 6,
    requirements: [
      'Authoritative mastery with exhaustive depth across all dimensions',
      '35+ high-quality authoritative sources',
      'Exceptional structure with 12-15 major sections',
      'Citations seamlessly integrated throughout narrative',
      'Outstanding logical flow and organization',
      'Minimum 10000 words demonstrating comprehensive expertise',
      'Extensive examples, case studies, benchmarks, and data',
      'Deep critical analysis with nuanced understanding',
      'Addresses limitations, edge cases, trade-offs, controversies',
      'Forward-looking analysis and emerging trends',
      'Professional-grade research suitable for publication',
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
