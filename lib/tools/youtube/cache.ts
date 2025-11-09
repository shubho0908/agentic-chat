import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import type { YouTubeVideo, YouTubeTranscriptSegment, YouTubeChapter } from '@/types/tools';
import type { VideoAnalysis } from './analyzer';

export interface CachedVideoResult {
  video: YouTubeVideo;
  transcriptText: string;
  transcriptSegments: YouTubeTranscriptSegment[];
  chapters: YouTubeChapter[];
  analysis: VideoAnalysis;
}

export interface CacheStats {
  totalVideos: number;
  totalAccesses: number;
  mostAccessed: Array<{
    videoId: string;
    title: string;
    accessCount: number;
    lastAccessedAt: Date;
  }>;
  recentAdditions: Array<{
    videoId: string;
    title: string;
    createdAt: Date;
  }>;
  cacheSizeBytes: number;
}

function toJsonValue(data: YouTubeTranscriptSegment[] | YouTubeChapter[] | VideoAnalysis): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(data)) as Prisma.InputJsonValue;
}

function fromJsonValue<T>(data: Prisma.JsonValue): T {
  return data as T;
}

export async function getCachedVideoAnalysis(
  videoId: string,
  language: string = 'en'
): Promise<CachedVideoResult | null> {
  try {
    const cached = await prisma.youTubeVideoCache.findUnique({
      where: {
        videoId_language: {
          videoId,
          language,
        },
      },
    });

    if (!cached) {
      return null;
    }

    prisma.youTubeVideoCache
      .update({
        where: { id: cached.id },
        data: {
          lastAccessedAt: new Date(),
          accessCount: { increment: 1 },
        },
      })
      .catch((err) => {
        console.error('[YouTube Cache] Failed to update access stats:', err);
      });

    const video: YouTubeVideo = {
      id: cached.videoId,
      title: cached.title,
      channelName: cached.channelName || undefined,
      duration: cached.duration || undefined,
      url: cached.url,
    };

    const transcriptSegments = fromJsonValue<YouTubeTranscriptSegment[]>(cached.transcriptSegments);
    const chapters = fromJsonValue<YouTubeChapter[]>(cached.chapters);
    const analysis = fromJsonValue<VideoAnalysis>(cached.analysisResult);

    return {
      video,
      transcriptText: cached.transcriptText,
      transcriptSegments,
      chapters,
      analysis,
    };
  } catch (error) {
    console.error('[YouTube Cache] Error fetching from cache:', error);
    return null;
  }
}

export async function cacheVideoAnalysis(
  videoId: string,
  language: string,
  result: CachedVideoResult,
  processingTimeMs?: number
): Promise<void> {
  try {
    await prisma.youTubeVideoCache.upsert({
      where: {
        videoId_language: {
          videoId,
          language,
        },
      },
      create: {
        videoId,
        language,
        title: result.video.title,
        channelName: result.video.channelName,
        duration: result.video.duration,
        url: result.video.url,
        thumbnailUrl: undefined,
        publishedAt: undefined,
        viewCount: undefined,
        transcriptText: result.transcriptText,
        transcriptSegments: toJsonValue(result.transcriptSegments),
        chapters: toJsonValue(result.chapters),
        analysisResult: toJsonValue(result.analysis),
        processingTime: processingTimeMs,
        accessCount: 1,
      },
      update: {
        title: result.video.title,
        channelName: result.video.channelName,
        duration: result.video.duration,
        transcriptText: result.transcriptText,
        transcriptSegments: toJsonValue(result.transcriptSegments),
        chapters: toJsonValue(result.chapters),
        analysisResult: toJsonValue(result.analysis),
        lastAccessedAt: new Date(),
      },
    });

  } catch (error) {
    console.error('[YouTube Cache] Save failed:', error);
  }
}

export async function getCacheStats(): Promise<CacheStats> {
  try {
    const [totalVideos, totalAccessesResult, mostAccessed, recentAdditions] = await Promise.all([
      prisma.youTubeVideoCache.count(),
      prisma.youTubeVideoCache.aggregate({
        _sum: {
          accessCount: true,
        },
      }),
      prisma.youTubeVideoCache.findMany({
        select: {
          videoId: true,
          title: true,
          accessCount: true,
          lastAccessedAt: true,
        },
        orderBy: {
          accessCount: 'desc',
        },
        take: 10,
      }),
      prisma.youTubeVideoCache.findMany({
        select: {
          videoId: true,
          title: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 10,
      }),
    ]);

    return {
      totalVideos,
      totalAccesses: totalAccessesResult._sum.accessCount || 0,
      mostAccessed,
      recentAdditions,
      cacheSizeBytes: 0,
    };
  } catch (error) {
    console.error('[YouTube Cache] Error fetching stats:', error);
    return {
      totalVideos: 0,
      totalAccesses: 0,
      mostAccessed: [],
      recentAdditions: [],
      cacheSizeBytes: 0,
    };
  }
}

export async function invalidateCacheEntry(videoId: string, language: string = 'en'): Promise<boolean> {
  try {
    await prisma.youTubeVideoCache.delete({
      where: {
        videoId_language: {
          videoId,
          language,
        },
      },
    });
    return true;
  } catch (error) {
    console.error('[YouTube Cache] Invalidation failed:', error);
    return false;
  }
}

export async function cleanupOldCacheEntries(daysOld: number = 90): Promise<number> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await prisma.youTubeVideoCache.deleteMany({
      where: {
        lastAccessedAt: {
          lt: cutoffDate,
        },
        accessCount: {
          lt: 5,
        },
      },
    });

    return result.count;
  } catch (error) {
    console.error('[YouTube Cache] Cleanup failed:', error);
    return 0;
  }
}

export async function getCacheEffectiveness(): Promise<{
  averageAccessCount: number;
  medianAccessCount: number;
  cacheHitRate: number;
}> {
  try {
    const stats = await prisma.youTubeVideoCache.aggregate({
      _avg: {
        accessCount: true,
      },
    });

    return {
      averageAccessCount: stats._avg.accessCount || 0,
      medianAccessCount: 0,
      cacheHitRate: 0,
    };
  } catch (error) {
    console.error('[YouTube Cache] Error calculating effectiveness:', error);
    return {
      averageAccessCount: 0,
      medianAccessCount: 0,
      cacheHitRate: 0,
    };
  }
}
