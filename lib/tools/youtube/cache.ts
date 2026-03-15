import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import type { YouTubeVideo, YouTubeTranscriptSegment, YouTubeChapter } from '@/types/tools';
import type { VideoAnalysis } from './analyzer';

interface CachedVideoResult {
  video: YouTubeVideo;
  transcriptText: string;
  transcriptSegments: YouTubeTranscriptSegment[];
  chapters: YouTubeChapter[];
  analysis: VideoAnalysis;
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
