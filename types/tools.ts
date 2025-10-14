export enum WebSearchProgressStatus {
  Searching = 'searching',
  Found = 'found',
  ProcessingSources = 'processing_sources',
  Completed = 'completed',
}

export interface WebSearchSource {
  title: string;
  url: string;
  domain: string;
  snippet: string;
  score: number;
  position: number;
}

export interface WebSearchProgress {
  status: WebSearchProgressStatus;
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

export enum YouTubeProgressStatus {
  Detecting = 'detecting',
  Extracting = 'extracting',
  ProcessingChapters = 'processing_chapters',
  Combining = 'combining',
  Completed = 'completed',
}

export interface YouTubeProgress {
  status: YouTubeProgressStatus;
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
