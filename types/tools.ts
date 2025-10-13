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
