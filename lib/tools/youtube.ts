import { YoutubeTranscript } from 'youtube-transcript';
import type { z } from 'zod';
import { youtubeParamsSchema } from '@/lib/schemas/youtube.tools';
import { extractVideoId, detectYouTubeUrls, constructYouTubeUrl } from './youtube-urls';
import { extractChapters, formatChapters } from './youtube-chapters';
import { searchYouTubeVideos, searchResultToVideo, type YouTubeSearchResult } from './youtube-search';
import { formatViewCount, formatTimestamp, createFallbackMetadata, formatDuration } from './youtube-utils';
import { youtubeClient } from './youtube-client';
import { TOOL_ERROR_MESSAGES } from '@/constants/errors';
import type { YouTubeProgress, YouTubeVideoContext, YouTubeVideo, YouTubeTranscriptSegment, YouTubeChapter } from '@/types/tools';

type YouTubeInput = z.infer<typeof youtubeParamsSchema>;

async function fetchVideoMetadata(videoId: string): Promise<Partial<YouTubeVideo>> {
  const url = constructYouTubeUrl(videoId);
  if (!youtubeClient) return createFallbackMetadata(videoId, url);

  try {
    const response = await youtubeClient.videos.list({
      part: ['snippet', 'contentDetails'],
      id: [videoId]
    });

    const video = response.data.items?.[0];
    if (!video) return createFallbackMetadata(videoId, url);

    return {
      id: videoId,
      title: video.snippet?.title || `Video ${videoId}`,
      channelName: video.snippet?.channelTitle || undefined,
      duration: video.contentDetails?.duration ? formatDuration(video.contentDetails.duration) : undefined,
      url
    };
  } catch (error) {
    console.error('[YouTube Tool] Error fetching metadata:', error);
    return createFallbackMetadata(videoId, url);
  }
}

async function fetchTranscript(
  videoId: string,
  language: string = 'en'
): Promise<YouTubeTranscriptSegment[]> {
  try {
    const transcript = await YoutubeTranscript.fetchTranscript(videoId, {
      lang: language
    });

    return transcript.map(segment => ({
      text: segment.text,
      offset: segment.offset,
      duration: segment.duration
    }));
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('Transcript is disabled')) {
        throw new Error('The creator has disabled transcripts/captions for this video');
      }

      const languageMatch = error.message.match(/Available languages?: ([^\n]+)/i);
      
      if (languageMatch) {
        const availableLangs = languageMatch[1].split(',').map(l => l.trim());
        const firstAvailableLang = availableLangs[0];
        
        console.log(`[YouTube Tool] Language '${language}' not available for ${videoId}. Trying '${firstAvailableLang}' instead.`);
        
        try {
          const transcript = await YoutubeTranscript.fetchTranscript(videoId, {
            lang: firstAvailableLang
          });
          
          return transcript.map(segment => ({
            text: segment.text,
            offset: segment.offset,
            duration: segment.duration
          }));
        } catch (fallbackError) {
          console.error(`[YouTube Tool] Failed to fetch transcript in ${firstAvailableLang}:`, fallbackError);
          throw new Error(`Transcript not available in requested language (${language}). Available: ${availableLangs.join(', ')} - but failed to fetch.`);
        }
      }

      if (error.message.includes('Could not find') || error.message.includes('No transcripts')) {
        try {
          const transcript = await YoutubeTranscript.fetchTranscript(videoId);
          
          return transcript.map(segment => ({
            text: segment.text,
            offset: segment.offset,
            duration: segment.duration
          }));
        } catch (fallbackError) {
          console.error(`[YouTube Tool] No transcripts available for ${videoId}:`, fallbackError);
          throw new Error('No transcripts/captions are available for this video in any language');
        }
      }
    }
    
    throw error;
  }
}

async function fetchVideoDescription(videoId: string): Promise<string> {
  if (!youtubeClient) return '';

  try {
    const response = await youtubeClient.videos.list({
      part: ['snippet'],
      id: [videoId]
    });
    return response.data.items?.[0]?.snippet?.description || '';
  } catch {
    return '';
  }
}

async function processVideo(
  url: string,
  options: YouTubeInput,
  onProgress?: (progress: YouTubeProgress) => void,
  videoNumber?: number,
  totalVideos?: number
): Promise<YouTubeVideoContext> {
  const videoId = extractVideoId(url);

  if (!videoId) {
    return {
      video: { id: '', title: 'Invalid URL', url },
      transcript: [],
      chapters: [],
      transcriptText: '',
      error: `Invalid YouTube URL: ${url}`
    };
  }

  try {
    const videoPrefix = videoNumber && totalVideos ? `[${videoNumber}/${totalVideos}] ` : '';
    
    onProgress?.({
      status: 'extracting',
      message: `${videoPrefix}Fetching video metadata (ID: ${videoId})...`,
      details: { 
        currentVideoId: videoId, 
        processedCount: videoNumber ? videoNumber - 1 : 0,
        videoCount: totalVideos || 1
      }
    });

    const metadata = await fetchVideoMetadata(videoId);
    const video: YouTubeVideo = {
      id: videoId,
      title: metadata.title || `Video ${videoId}`,
      channelName: metadata.channelName,
      duration: metadata.duration,
      url: constructYouTubeUrl(videoId)
    };

    onProgress?.({
      status: 'extracting',
      message: `${videoPrefix}Extracting transcript for "${video.title}" (language: ${options.language || 'en'})...`,
      details: { 
        currentVideo: video, 
        step: 'transcript',
        processedCount: videoNumber ? videoNumber - 1 : 0,
        videoCount: totalVideos || 1
      }
    });

    const transcript = await fetchTranscript(videoId, options.language);
    
    onProgress?.({
      status: 'extracting',
      message: `${videoPrefix}Processing transcript for "${video.title}" (${transcript.length} segments)...`,
      details: { 
        currentVideo: video, 
        transcriptSegments: transcript.length, 
        step: 'processing',
        processedCount: videoNumber ? videoNumber - 1 : 0,
        videoCount: totalVideos || 1
      }
    });
    const transcriptText = transcript.map(seg => seg.text).join(' ');

    let chapters: YouTubeChapter[] = [];
    if (options.includeChapters) {
      onProgress?.({
        status: 'processing_chapters',
        message: `${videoPrefix}Fetching video description for chapter extraction...`,
        details: { 
          currentVideo: video, 
          step: 'chapters_fetch',
          processedCount: videoNumber ? videoNumber - 1 : 0,
          videoCount: totalVideos || 1
        }
      });

      const description = await fetchVideoDescription(videoId);
      
      onProgress?.({
        status: 'processing_chapters',
        message: `${videoPrefix}Parsing chapters from "${video.title}"...`,
        details: { 
          currentVideo: video, 
          step: 'chapters_parse',
          processedCount: videoNumber ? videoNumber - 1 : 0,
          videoCount: totalVideos || 1
        }
      });
      
      chapters = extractChapters(description);
      
      if (chapters.length > 0) {
        onProgress?.({
          status: 'processing_chapters',
          message: `${videoPrefix}Found ${chapters.length} chapters in "${video.title}"`,
          details: { 
            currentVideo: video, 
            chaptersFound: chapters.length, 
            step: 'chapters_complete',
            processedCount: videoNumber ? videoNumber - 1 : 0,
            videoCount: totalVideos || 1
          }
        });
      }
    }

    return {
      video,
      transcript,
      chapters,
      transcriptText
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[YouTube Tool] Error processing video ${videoId}:`, error);

    const metadata = await fetchVideoMetadata(videoId);
    return {
      video: {
        id: videoId,
        title: metadata.title || `Video ${videoId}`,
        channelName: metadata.channelName,
        duration: metadata.duration,
        url: constructYouTubeUrl(videoId)
      },
      transcript: [],
      chapters: [],
      transcriptText: '',
      error: errorMessage
    };
  }
}

function formatVideoContext(context: YouTubeVideoContext, includeTimestamps: boolean, isForLLM: boolean = true): string {
  let output = `## ${context.video.title}\n`;
  output += `**URL:** ${context.video.url}\n`;

  if (context.video.channelName) {
    output += `**Channel:** ${context.video.channelName}\n`;
  }

  if (context.video.duration) {
    output += `**Duration:** ${context.video.duration}\n`;
  }

  output += '\n';

  if (context.error) {
    output += `**Error:** ${context.error}\n`;
    return output;
  }

  if (context.chapters.length > 0) {
    output += `**Chapters:**\n${formatChapters(context.chapters)}\n\n`;
  }

  if (isForLLM && context.transcriptText) {
    output += `**Transcript:**\n`;
    if (includeTimestamps && context.transcript.length > 0) {
      const formattedTranscript = context.transcript
        .map(seg => `[${formatTimestamp(seg.offset)}] ${seg.text}`)
        .join('\n');
      output += formattedTranscript;
    } else {
      output += context.transcriptText;
    }
  }

  return output;
}

function extractNumberFromQuery(query: string): number {
  const patterns = [
    /(?:top|best|first|get|find|show|fetch|search)\s+(\d+)/i,
    /(\d+)\s+(?:videos|results|items|things|vids)/i,
  ];
  
  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (match) {
      const num = parseInt(match[1]);
      if (num > 0 && num <= 15) return num;
    }
  }
  
  return 3;
}

export async function executeYouTubeTool(
  input: YouTubeInput,
  messageContent: string,
  onProgress?: (progress: YouTubeProgress) => void
): Promise<string> {
  const startTime = Date.now();

  try {
    let urls = input.urls || [];
    let searchMode = false;
    let searchQuery = '';

    if (urls.length === 0) {
      onProgress?.({
        status: 'detecting',
        message: 'Analyzing message for YouTube URLs...',
        details: { step: 'url_detection' }
      });

      urls = detectYouTubeUrls(messageContent);
      
      if (urls.length > 0) {
        onProgress?.({
          status: 'detecting',
          message: `Detected ${urls.length} YouTube ${urls.length === 1 ? 'URL' : 'URLs'}`,
          details: { detectedUrls: urls, step: 'url_detected' }
        });
      }
      
      if (urls.length === 0) {
        searchMode = true;
        searchQuery = messageContent.trim();
        
        onProgress?.({
          status: 'detecting',
          message: 'No URLs found. Searching YouTube...',
          details: {}
        });
      }
    }

    let results: YouTubeVideoContext[] = [];
    let searchResults: YouTubeSearchResult[] = [];

    if (searchMode) {
      try {
        const maxResults = extractNumberFromQuery(searchQuery);
        
        onProgress?.({
          status: 'detecting',
          message: `Querying YouTube API for: "${searchQuery}"...`,
          details: { query: searchQuery, step: 'search_start' }
        });

        searchResults = await searchYouTubeVideos(searchQuery, maxResults);
        
        onProgress?.({
          status: 'detecting',
          message: `YouTube API returned ${searchResults.length} results, ranking by relevance...`,
          details: { resultsCount: searchResults.length, videoCount: searchResults.length, step: 'search_results' }
        });
        
        if (searchResults.length === 0) {
          return `# YouTube Search Results\n\nNo videos found for query: "${searchQuery}"\n\nTry:\n- Using different keywords\n- Being more specific\n- Checking spelling`;
        }

        onProgress?.({
          status: 'extracting',
          message: `Selected top ${searchResults.length} videos. Starting analysis...`,
          details: {
            videoCount: searchResults.length,
            processedCount: 0,
            videos: searchResults.map(searchResultToVideo),
            step: 'search_complete'
          }
        });

        urls = searchResults.map(r => constructYouTubeUrl(r.videoId));
        results = [];
        for (let i = 0; i < urls.length; i++) {
          const result = await processVideo(urls[i], input, onProgress, i + 1, urls.length);
          results.push(result);
          
          onProgress?.({
            status: 'extracting',
            message: `Completed video ${i + 1}/${urls.length}: "${result.video.title}"${result.error ? ' (with errors)' : ''}`,
            details: {
              videoCount: urls.length,
              processedCount: i + 1,
              currentVideo: result.video,
              step: 'video_complete'
            }
          });
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        if (errorMsg.includes('API key')) {
          return `# YouTube Search Unavailable\n\n⚠️ **YouTube search requires an API key.**\n\nThe YouTube tool can still analyze videos if you provide direct YouTube URLs.\n\nTo enable search functionality:\n1. Get a free API key from: https://console.cloud.google.com/apis/credentials\n2. Add it to your .env file as: \`YOUTUBE_API_KEY=your_key_here\`\n3. Restart the application\n\n**For now, try pasting a YouTube URL directly!**`;
        }
        throw error;
      }
    } else {
      urls = urls.slice(0, 15);

      onProgress?.({
        status: 'detecting',
        message: `Found ${urls.length} ${urls.length === 1 ? 'video' : 'videos'}. Starting analysis...`,
        details: { videoCount: urls.length, urls, step: 'analysis_start' }
      });

      results = [];
      for (let i = 0; i < urls.length; i++) {
        const result = await processVideo(urls[i], input, onProgress, i + 1, urls.length);
        results.push(result);
        
        onProgress?.({
          status: 'extracting',
          message: `Completed video ${i + 1}/${urls.length}: "${result.video.title}"${result.error ? ' (with errors)' : ''}`,
          details: {
            videoCount: urls.length,
            processedCount: i + 1,
            currentVideo: result.video,
            step: 'video_complete'
          }
        });
      }
    }

    const responseTime = Date.now() - startTime;
    const successfulResults = results.filter(r => !r.error);
    const failedResults = results.filter(r => r.error);

    onProgress?.({
      status: 'completed',
      message: `Analysis complete!`,
      details: {
        videoCount: results.length,
        processedCount: successfulResults.length,
        failedCount: failedResults.length,
        videos: results.map(r => r.video),
        responseTime,
        step: 'complete'
      }
    });

    let output = '';

    if (searchMode) {
      output += `# 🔍 YouTube Search Results\n\n`;
      output += `**Query:** "${searchQuery}"\n`;
      output += `**Found:** ${results.length} videos\n`;
      output += `**Time:** ${(responseTime / 1000).toFixed(1)}s\n\n`;
      
      if (searchResults.length > 0) {
        output += `## 📊 Selected Videos\n\n`;
        searchResults.forEach((sr, idx) => {
          output += `${idx + 1}. **${sr.title}**\n`;
          output += `   - 👤 ${sr.channelName}\n`;
          if (sr.viewCount) {
            output += `   - 👁️ ${formatViewCount(sr.viewCount)} views\n`;
          }
          output += '\n';
        });
        output += '---\n\n';
      }
    } else {
      output += `# 📺 YouTube Video Analysis\n\n`;
      output += `**Videos:** ${results.length}\n`;
      output += `**Analyzed:** ${successfulResults.length}\n`;
      output += `**Time:** ${(responseTime / 1000).toFixed(1)}s\n\n`;
      output += '---\n\n';
    }

    results.forEach((context, index) => {
      if (index > 0) output += '\n---\n\n';
      output += formatVideoContext(context, input.includeTimestamps !== false, false);
    });

    if (failedResults.length > 0) {
      output += `\n\n## ⚠️ Processing Notes\n\n`;
      output += `${failedResults.length} video(s) encountered issues:\n\n`;
      failedResults.forEach(result => {
        output += `- **${result.video.title}**: ${result.error}\n`;
      });
    }

    if (searchMode && successfulResults.length > 0) {
      output += `\n\n---\n\n`;
      output += `💡 **Tip:** I analyzed the top ${successfulResults.length} most relevant videos. `;
      output += `You can ask me specific questions about the content, compare different approaches, or request summaries of key points!`;
    }

    return output;
  } catch (error) {
    console.error('[YouTube Tool] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return TOOL_ERROR_MESSAGES.YOUTUBE.TOOL_FAILED(errorMessage);
  }
}
