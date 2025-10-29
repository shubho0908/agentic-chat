export interface WebSearchSource {
  title: string;
  url: string;
  domain: string;
  snippet: string;
  score: number;
  position: number;
}

export interface SearchResultWithSources {
  output: string;
  sources: WebSearchSource[];
}

export interface WebSearchProgress {
  status: 'searching' | 'found' | 'processing_sources' | 'completed';
  message: string;
  details?: {
    query?: string;
    resultsCount?: number;
    responseTime?: number;
    sources?: WebSearchSource[];
    currentSource?: WebSearchSource;
    processedCount?: number;
  };
}

export interface YouTubeVideo {
  id: string;
  title: string;
  duration?: string;
  channelName?: string;
  url: string;
}

export interface YouTubeChapter {
  timestamp: string;
  timeSeconds: number;
  title: string;
}

export interface YouTubeTranscriptSegment {
  text: string;
  offset: number;
  duration?: number;
}

export interface YouTubeVideoContext {
  video: YouTubeVideo;
  transcript: YouTubeTranscriptSegment[];
  chapters: YouTubeChapter[];
  transcriptText: string;
  error?: string;
}

export interface YouTubeProgress {
  status: 'detecting' | 'extracting' | 'processing_chapters' | 'combining' | 'completed';
  message: string;
  details?: {
    videoCount?: number;
    currentVideo?: YouTubeVideo;
    currentVideoId?: string;
    processedCount?: number;
    videos?: YouTubeVideo[];
    failedCount?: number;
    responseTime?: number;
    step?: string;
    transcriptSegments?: number;
    chaptersFound?: number;
    detectedUrls?: string[];
    urls?: string[];
    query?: string;
    resultsCount?: number;
    maxResults?: number;
  };
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
  EXECUTING = 'executing',
  COMPLETED = 'completed',
  AUTH_REQUIRED = 'auth_required',
}

export interface GoogleSuiteProgress {
  status: GoogleSuiteStatus;
  message: string;
  details?: {
    query?: string;
    operation?: string;
    error?: string;
  };
}
