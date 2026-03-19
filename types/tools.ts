export interface WebSearchImage {
  url: string;
  description?: string;
  searchIndex?: number;
  searchQuery?: string;
}

export interface MultiSearchImage extends WebSearchImage {
  searchIndex: number;
  searchQuery: string;
}

export interface WebSearchSource {
  title: string;
  url: string;
  domain: string;
  snippet: string;
  score: number;
  position: number;
  searchIndex?: number;
  searchQuery?: string;
}

export interface PlannedWebSearch {
  query: string;
  rationale: string;
  expectedResultCount: number;
  priority: 'high' | 'medium' | 'low';
}

export interface WebSearchPlanSummary {
  originalQuery?: string;
  queryType?: 'factual' | 'comparative' | 'analytical' | 'exploratory' | 'how-to' | 'current-events';
  complexity?: 'simple' | 'moderate' | 'complex';
  reasoning?: string;
  totalResultsNeeded?: number;
  searches?: number;
  recommendedSearches?: PlannedWebSearch[];
}

export interface WebSearchProgressDetails {
  originalQuery?: string;
  query?: string;
  resultsCount?: number;
  responseTime?: number;
  sources?: WebSearchSource[];
  currentSource?: WebSearchSource;
  processedCount?: number;
  images?: WebSearchImage[];
  imageCount?: number;
  searchDepth?: 'basic' | 'advanced';
  phase?: number;
  totalPhases?: number;
  intelligent?: boolean;
  searchIndex?: number;
  total?: number;
  completedSearches?: number;
  searchPlan?: WebSearchPlanSummary;
  usedConversationContext?: boolean;
}

export interface SearchResultWithSources {
  output: string;
  sources: WebSearchSource[];
  images?: WebSearchImage[];
}

export interface WebSearchProgress {
  status: 'searching' | 'found' | 'processing_sources' | 'completed';
  message: string;
  details?: WebSearchProgressDetails;
}

export interface ResearchQuestion {
  question: string;
  rationale: string;
  suggestedTools: string[];
}

export interface ResearchTask {
  id: string;
  question: string;
  tools: string[];
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  result?: string;
  sources?: WebSearchSource[];
  retries: number;
  error?: string;
}


export interface DeepResearchProgress {
  status: 
    | 'gate_check'
    | 'gate_skip'
    | 'routing'
    | 'planning'
    | 'task_start'
    | 'task_progress'
    | 'task_complete'
    | 'aggregating'
    | 'evaluating'
    | 'retrying'
    | 'formatting'
    | 'completed';
  message: string;
  details?: {
    gateDecision?: {
      shouldResearch: boolean;
      reason: string;
      confidence: 'low' | 'medium' | 'high';
    };
    skipped?: boolean;
    directResponse?: string;
    routingDecision?: 'simple' | 'deep_research';
    researchPlan?: ResearchQuestion[];
    currentTask?: ResearchTask;
    taskIndex?: number;
    currentTaskIndex?: number;
    totalTasks?: number;
    completedTasks?: ResearchTask[];
    toolProgress?: {
      toolName: string;
      status: string;
      message: string;
    };
    evaluationResult?: {
      meetsStandards: boolean;
      isRelevant: boolean;
      feedback: string;
      rewrittenPrompt?: string;
      score: number;
    };
    currentAttempt?: number;
    maxAttempts?: number;
    strictnessLevel?: 0 | 1 | 2;
    citations?: Array<{
      id: string;
      source: string;
      author?: string;
      year?: string;
      url?: string;
      relevance: string;
    }>;
    followUpQuestions?: string[];
    wordCount?: number;
  };
}

export enum GoogleSuiteStatus {
  INITIALIZING = 'initializing',
  ANALYZING = 'analyzing',
  PLANNING = 'planning',
  THINKING = 'thinking',
  TASK_START = 'task_start',
  EXECUTING = 'executing',
  TASK_COMPLETE = 'task_complete',
  VALIDATING = 'validating',
  COMPLETED = 'completed',
  AUTH_REQUIRED = 'auth_required',
}

export interface GoogleSuiteTask {
  id: string;
  tool: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  iteration: number;
  result?: string;
  error?: string;
}
