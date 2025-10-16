export interface WebSearchSource {
  title: string;
  url: string;
  domain: string;
  snippet: string;
  score: number;
  position: number;
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

// Enhanced types for new deep research system
export interface GateDecision {
  shouldResearch: boolean;
  reason: string;
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

export interface EvaluationResult {
  meetsStandards: boolean;
  isRelevant: boolean;
  feedback: string;
  rewrittenPrompt?: string;
  score: number;
}

export interface DeepResearchProgress {
  status: 
    | 'gate_check'              // Checking if research needed
    | 'gate_skip'               // Skipping - generic question
    | 'routing'                 // Legacy router (deprecated)
    | 'planning'                // Planning research tasks
    | 'task_start'              // Starting a task
    | 'task_progress'           // Task in progress
    | 'task_complete'           // Task completed
    | 'aggregating'             // Combining findings
    | 'evaluating'              // Quality evaluation
    | 'retrying'                // Retry with feedback
    | 'formatting'              // Final formatting
    | 'completed';              // Done
  message: string;
  details?: {
    // Gate phase
    gateDecision?: GateDecision;
    skipped?: boolean;
    directResponse?: string;
    
    // Legacy routing
    routingDecision?: 'simple' | 'deep_research';
    
    // Research phase
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
    
    // Evaluation phase
    evaluationResult?: EvaluationResult;
    currentAttempt?: number;
    maxAttempts?: number;
    strictnessLevel?: 0 | 1 | 2;
    
    // Output phase
    citations?: Citation[];
    followUpQuestions?: string[];
    wordCount?: number;
  };
}
