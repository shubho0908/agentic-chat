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

interface PlannedWebSearch {
  query: string;
  rationale: string;
  expectedResultCount: number;
  priority: 'high' | 'medium' | 'low';
}

interface WebSearchPlanSummary {
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
