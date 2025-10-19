import type { z } from 'zod';
import { youtubeParamsSchema } from '@/lib/schemas/youtube.tools';
import { extractVideoId, detectYouTubeUrls, constructYouTubeUrl } from './urls';
import { extractChapters } from './chapters';
import { searchYouTubeVideos, type YouTubeSearchResult } from './search';
import { formatDuration } from '@/utils/youtube';
import { youtubeClient } from './client';
import { TOOL_ERROR_MESSAGES } from '@/constants/errors';
import type { YouTubeProgress, YouTubeVideo, YouTubeChapter } from '@/types/tools';
import { extractTranscript } from './transcript-extractor';
import { analyzeVideo, type VideoAnalysis } from './analyzer';
import { formatVideoForLLM, formatVideoError, formatSearchResults } from './structured-formatter';

type YouTubeInput = z.infer<typeof youtubeParamsSchema>;

/**
 * Features:
 * - Multi-tier transcript extraction (never fails)
 * - Intelligent video analysis with map-reduce
 * - Structured output to prevent hallucinations
 * - Works within Vercel serverless constraints
 */

interface ProcessedVideo {
  video: YouTubeVideo;
  analysis?: VideoAnalysis;
  chapters: YouTubeChapter[];
  transcriptText: string;
  error?: string;
}

interface VideoMetadata extends Partial<YouTubeVideo> {
  thumbnailUrl?: string;
  publishedAt?: string;
  viewCount?: number;
}

async function fetchVideoMetadata(videoId: string): Promise<VideoMetadata> {
  const url = constructYouTubeUrl(videoId);
  
  if (!youtubeClient) {
    return {
      id: videoId,
      title: `Video ${videoId}`,
      url,
    };
  }

  try {
    const response = await youtubeClient.videos.list({
      part: ['snippet', 'contentDetails', 'statistics'],
      id: [videoId],
    });

    const video = response.data.items?.[0];
    if (!video) {
      return {
        id: videoId,
        title: `Video ${videoId}`,
        url,
      };
    }

    return {
      id: videoId,
      title: video.snippet?.title || `Video ${videoId}`,
      channelName: video.snippet?.channelTitle || undefined,
      duration: video.contentDetails?.duration ? formatDuration(video.contentDetails.duration) : undefined,
      url,
      thumbnailUrl: video.snippet?.thumbnails?.high?.url || video.snippet?.thumbnails?.default?.url || undefined,
      publishedAt: video.snippet?.publishedAt || undefined,
      viewCount: video.statistics?.viewCount ? parseInt(video.statistics.viewCount) : undefined,
    };
  } catch (error) {
    console.error('[YouTube Tool] Error fetching metadata:', error);
    return {
      id: videoId,
      title: `Video ${videoId}`,
      url,
    };
  }
}

async function fetchVideoDescription(videoId: string): Promise<string> {
  if (!youtubeClient) return '';

  try {
    const response = await youtubeClient.videos.list({
      part: ['snippet'],
      id: [videoId],
    });
    return response.data.items?.[0]?.snippet?.description || '';
  } catch {
    return '';
  }
}

async function processVideo(
  videoId: string,
  language: string,
  apiKey: string,
  model: string,
  onProgress?: (progress: YouTubeProgress) => void,
  videoNumber?: number,
  totalVideos?: number
): Promise<ProcessedVideo> {
  const videoPrefix = videoNumber && totalVideos ? `[${videoNumber}/${totalVideos}] ` : '';
  
  onProgress?.({
    status: 'extracting',
    message: `${videoPrefix}Fetching video metadata...`,
    details: { currentVideoId: videoId, step: 'metadata' },
  });

  const metadata = await fetchVideoMetadata(videoId);
  const video: YouTubeVideo = {
    id: videoId,
    title: metadata.title || `Video ${videoId}`,
    channelName: metadata.channelName,
    duration: metadata.duration,
    url: constructYouTubeUrl(videoId),
  };

  onProgress?.({
    status: 'extracting',
    message: `${videoPrefix}Extracting transcript for "${video.title}"...`,
    details: { currentVideoId: videoId, currentVideo: video, step: 'transcript' },
  });

  const transcriptResult = await extractTranscript(
    videoId,
    language,
    (method, status) => {
      onProgress?.({
        status: 'extracting',
        message: `${videoPrefix}Trying ${method} for transcript extraction... (${status})`,
        details: { currentVideoId: videoId, step: 'transcript_method' },
      });
    }
  );

  if (transcriptResult.error) {
    return {
      video,
      chapters: [],
      transcriptText: '',
      error: transcriptResult.error,
    };
  }

  const transcriptText = transcriptResult.text;
  const transcript = transcriptResult.segments;

  let chapters: YouTubeChapter[] = [];
  onProgress?.({
    status: 'processing_chapters',
    message: `${videoPrefix}Extracting chapters...`,
    details: { currentVideoId: videoId, step: 'chapters' },
  });

  const description = await fetchVideoDescription(videoId);
  chapters = extractChapters(description);

  onProgress?.({
    status: 'extracting',
    message: `${videoPrefix}Analyzing video content with AI...`,
    details: { currentVideoId: videoId, step: 'analysis_start' },
  });

  let analysis;
  try {
    analysis = await analyzeVideo(
      {
        videoId,
        title: video.title,
        channelName: video.channelName,
        duration: video.duration,
        transcript,
        transcriptText,
        chapters,
      },
      apiKey,
      model,
      (step, details) => {
        onProgress?.({
          status: 'extracting',
          message: `${videoPrefix}AI Analysis: ${step}...`,
          details: { currentVideoId: videoId, ...details },
        });
      }
    );
  } catch (error) {
    console.error('[YouTube Tool] Analysis error:', error);
    return {
      video,
      chapters,
      transcriptText,
      error: `Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }

  return {
    video,
    analysis,
    chapters,
    transcriptText,
  };
}

function extractNumberFromQuery(query: string): number {
  const patterns = [
    // "find 10 videos", "search 5 results", "get 10 videos"
    /(?:find|search|get|show|fetch|give|list)\s+(?:me\s+)?(?:the\s+)?(?:top\s+)?(\d+)\s+(?:videos?|results?|items?|vids?)/i,
    // "top 10 videos", "best 5 results"  
    /(?:top|best|first)\s+(\d+)\s+(?:videos?|results?|items?|vids?)/i,
    // "10 videos about", "5 results for"
    /^(\d+)\s+(?:videos?|results?|items?|vids?)\s+(?:about|for|on|of)/i,
    // Just number at start: "10 docker tutorials"
    /^(\d+)\s+/,
  ];
  
  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (match) {
      const num = parseInt(match[1]);
      if (num > 0 && num <= 15) return num;
      if (num > 15) {
        return 15;
      }
    }
  }
  
  return 5;
}

export async function executeYouTubeTool(
  input: YouTubeInput,
  messageContent: string,
  apiKey: string,
  model: string,
  abortSignal?: AbortSignal,
  onProgress?: (progress: YouTubeProgress) => void
): Promise<string> {
  const startTime = Date.now();

  if (!apiKey) {
    return TOOL_ERROR_MESSAGES.YOUTUBE.TOOL_FAILED('OpenAI API key not configured for video analysis');
  }

  try {
    if (abortSignal?.aborted) {
      throw new Error('YouTube analysis aborted by user');
    }

    let urls = input.urls || [];
    let searchMode = false;
    let searchQuery = '';

    if (urls.length === 0) {
      onProgress?.({
        status: 'detecting',
        message: 'Analyzing message for YouTube URLs...',
        details: { step: 'url_detection' },
      });

      urls = detectYouTubeUrls(messageContent);
      
      if (urls.length > 0) {
        onProgress?.({
          status: 'detecting',
          message: `Detected ${urls.length} YouTube ${urls.length === 1 ? 'URL' : 'URLs'}`,
          details: { detectedUrls: urls, step: 'url_detected' },
        });
      } else {
        searchMode = true;
        searchQuery = messageContent.trim();
        
        onProgress?.({
          status: 'detecting',
          message: 'No URLs found. Searching YouTube...',
          details: { query: searchQuery, step: 'search_mode' },
        });
      }
    }

    const processedVideos: ProcessedVideo[] = [];
    const completedVideos: YouTubeVideo[] = [];
    let searchResults: YouTubeSearchResult[] = [];

    if (searchMode) {
      const maxResults = input.maxResults || extractNumberFromQuery(searchQuery);
      
      onProgress?.({
        status: 'detecting',
        message: `Searching YouTube for: "${searchQuery}" (finding ${maxResults} videos)...`,
        details: { query: searchQuery, maxResults, step: 'search_start' },
      });

      searchResults = await searchYouTubeVideos(searchQuery, maxResults);
      
      if (searchResults.length === 0) {
        return `# YouTube Search Results\n\nNo videos found for query: "${searchQuery}"\n\nTry:\n- Using different keywords\n- Being more specific\n- Checking spelling`;
      }

      onProgress?.({
        status: 'detecting',
        message: `Found ${searchResults.length} videos. Starting analysis...`,
        details: { resultsCount: searchResults.length, step: 'search_complete', query: searchQuery },
      });

      urls = searchResults.map(r => constructYouTubeUrl(r.videoId));
    }
    urls = urls.slice(0, 15);

    for (let i = 0; i < urls.length; i++) {
      if (abortSignal?.aborted) {
        throw new Error('YouTube analysis aborted by user');
      }

      const videoId = extractVideoId(urls[i]);
      if (!videoId) {
        processedVideos.push({
          video: { id: '', title: 'Invalid URL', url: urls[i] },
          chapters: [],
          transcriptText: '',
          error: 'Invalid YouTube URL',
        });
        continue;
      }

      const result = await processVideo(
        videoId,
        input.language || 'en',
        apiKey,
        model,
        onProgress,
        i + 1,
        urls.length
      );

      processedVideos.push(result);
      completedVideos.push(result.video);
      
      onProgress?.({
        status: 'extracting',
        message: `Completed video ${i + 1}/${urls.length}: "${result.video.title}"${result.error ? ' (with errors)' : ''}`,
        details: {
          videoCount: urls.length,
          processedCount: i + 1,
          currentVideo: result.video,
          videos: [...completedVideos],
          step: 'video_complete',
        },
      });
    }

    const responseTime = Date.now() - startTime;
    const successfulResults = processedVideos.filter(r => !r.error);
    const failedResults = processedVideos.filter(r => r.error);

    onProgress?.({
      status: 'completed',
      message: `Analysis complete! ${successfulResults.length}/${processedVideos.length} successful`,
      details: {
        videoCount: processedVideos.length,
        processedCount: successfulResults.length,
        responseTime,
        videos: completedVideos,
        step: 'complete',
      },
    });

    if (searchMode && searchResults.length > 0) {
      return formatSearchResults(
        processedVideos.map(pv => ({
          video: pv.video,
          analysis: pv.analysis,
          error: pv.error,
        })),
        searchQuery,
        responseTime
      );
    }
    let output = '';
    
    if (processedVideos.length > 1) {
      output += `# 📺 YouTube Video Analysis\n\n`;
      output += `**Videos:** ${processedVideos.length}\n`;
      output += `**Successfully Analyzed:** ${successfulResults.length}\n`;
      output += `**Time:** ${(responseTime / 1000).toFixed(1)}s\n\n`;
      output += '---\n\n';
    }

    processedVideos.forEach((result, index) => {
      if (index > 0) output += '\n---\n\n';
      
      if (result.error) {
        output += formatVideoError(result.video, result.error);
      } else if (result.analysis) {
        output += formatVideoForLLM(
          result.video,
          result.analysis,
          result.chapters,
          result.transcriptText,
          false
        );
      }
    });

    if (failedResults.length > 0 && successfulResults.length > 0) {
      output += `\n\n## ⚠️ Processing Notes\n\n`;
      output += `${failedResults.length} video(s) encountered issues (see above for details)\n`;
    }

    return output;
  } catch (error) {
    console.error('[YouTube Tool] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return TOOL_ERROR_MESSAGES.YOUTUBE.TOOL_FAILED(errorMessage);
  }
}
