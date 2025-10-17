import type { YouTubeVideo } from '@/types/tools';
import { constructYouTubeUrl } from './youtube-urls';
import { calculateRecencyScore } from './youtube-utils';
import { youtubeClient, hasYouTubeAPIKey } from './youtube-client';

function parseDurationToSeconds(isoDuration: string): number {
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  
  const hours = parseInt(match[1] || '0');
  const minutes = parseInt(match[2] || '0');
  const seconds = parseInt(match[3] || '0');
  
  return hours * 3600 + minutes * 60 + seconds;
}

function calculateDurationScore(durationSeconds: number): number {
  if (durationSeconds < 60) return 0.3;
  if (durationSeconds < 180) return 0.6;
  if (durationSeconds < 600) return 1.0;
  if (durationSeconds < 1800) return 0.9;
  if (durationSeconds < 3600) return 0.8;
  if (durationSeconds < 7200) return 0.6;
  return 0.4;
}

function calculateTextRelevance(query: string, title: string, description: string): number {
  const queryTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 2);
  if (queryTerms.length === 0) return 0.5;
  
  const titleLower = title.toLowerCase();
  const descLower = description.toLowerCase();
  
  let titleMatches = 0;
  let descMatches = 0;
  const exactTitleMatch = titleLower.includes(query.toLowerCase());
  
  for (const term of queryTerms) {
    if (titleLower.includes(term)) titleMatches++;
    if (descLower.includes(term)) descMatches++;
  }
  
  const titleRelevance = titleMatches / queryTerms.length;
  const descRelevance = descMatches / queryTerms.length;
  
  if (exactTitleMatch) return 1.0;
  
  return titleRelevance * 0.8 + descRelevance * 0.2;
}

export interface YouTubeSearchResult {
  videoId: string;
  title: string;
  channelName: string;
  description: string;
  publishedAt: string;
  thumbnailUrl: string;
  viewCount?: number;
  relevanceScore: number;
}

export async function searchYouTubeVideos(
  query: string,
  maxResults: number = 5
): Promise<YouTubeSearchResult[]> {
  if (!youtubeClient || !hasYouTubeAPIKey()) {
    throw new Error('YouTube API key is required for search functionality. Please set YOUTUBE_API_KEY environment variable.');
  }

  try {
    const searchResponse = await youtubeClient.search.list({
      part: ['snippet'],
      q: query,
      type: ['video'],
      maxResults: Math.min(maxResults * 3, 50),
      order: 'relevance',
      relevanceLanguage: 'en',
      safeSearch: 'moderate',
      videoEmbeddable: 'true',
      videoSyndicated: 'true',
      videoDuration: 'any',
    });

    const items = searchResponse.data.items || [];
    if (items.length === 0) return [];

    const videoIds = items.map(item => item.id?.videoId).filter(Boolean) as string[];

    const videosResponse = await youtubeClient.videos.list({
      part: ['snippet', 'statistics', 'contentDetails'],
      id: videoIds,
    });

    const videos = videosResponse.data.items || [];

    const results: YouTubeSearchResult[] = videos.map((video, index) => {
      const snippet = video.snippet;
      const statistics = video.statistics;
      const contentDetails = video.contentDetails;
      
      const viewCount = statistics?.viewCount ? parseInt(statistics.viewCount) : 0;
      const likeCount = statistics?.likeCount ? parseInt(statistics.likeCount) : 0;
      const durationSeconds = contentDetails?.duration ? parseDurationToSeconds(contentDetails.duration) : 0;
      
      const positionScore = Math.max(0.1, 1.0 - (index * 0.05));
      
      const viewScore = viewCount > 0 ? Math.min(1.0, Math.log10(viewCount) / 8) : 0.1;
      
      const engagementRatio = viewCount > 0 ? Math.min(1.0, likeCount / viewCount * 100) : 0;
      const engagementScore = Math.min(1.0, engagementRatio * 10);
      
      const recencyScore = calculateRecencyScore(snippet?.publishedAt || '');
      
      const durationScore = calculateDurationScore(durationSeconds);
      
      const textRelevance = calculateTextRelevance(
        query,
        snippet?.title || '',
        snippet?.description || ''
      );
      
      const relevanceScore = (
        textRelevance * 0.35 +
        positionScore * 0.25 +
        viewScore * 0.15 +
        engagementScore * 0.10 +
        durationScore * 0.10 +
        recencyScore * 0.05
      );

      return {
        videoId: video.id || '',
        title: snippet?.title || 'Unknown',
        channelName: snippet?.channelTitle || 'Unknown',
        description: snippet?.description || '',
        publishedAt: snippet?.publishedAt || '',
        thumbnailUrl: snippet?.thumbnails?.medium?.url || '',
        viewCount,
        relevanceScore,
      };
    });

    return results.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, maxResults);
  } catch (error) {
    console.error('[YouTube Search] Error:', error);
    throw new Error(`YouTube search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function searchResultToVideo(result: YouTubeSearchResult): YouTubeVideo {
  return {
    id: result.videoId,
    title: result.title,
    channelName: result.channelName,
    url: constructYouTubeUrl(result.videoId),
  };
}
