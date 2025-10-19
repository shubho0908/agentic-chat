import { YoutubeTranscript } from 'youtube-transcript';
import youtubedl from 'youtube-dl-exec';
import type { YouTubeTranscriptSegment } from '@/types/tools';

export interface TranscriptExtractionResult {
  segments: YouTubeTranscriptSegment[];
  text: string;
  method: 'youtube-transcript' | 'yt-dlp' | 'none';
  language: string;
  error?: string;
}

interface ExtractionAttempt {
  success: boolean;
  segments?: YouTubeTranscriptSegment[];
  text?: string;
  language?: string;
  error?: string;
}

async function tryYoutubeTranscript(videoId: string, language: string): Promise<ExtractionAttempt> {
  try {
    const transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang: language });
    const segments = transcript.map(seg => ({
      text: seg.text,
      offset: seg.offset,
      duration: seg.duration,
    }));
    const text = segments.map(seg => seg.text).join(' ');
    return { success: true, segments, text, language };
  } catch (error) {
    if (error instanceof Error && error.message.includes('language')) {
      try {
        const transcript = await YoutubeTranscript.fetchTranscript(videoId);
        const segments = transcript.map(seg => ({
          text: seg.text,
          offset: seg.offset,
          duration: seg.duration,
        }));
        const text = segments.map(seg => seg.text).join(' ');
        return { success: true, segments, text, language: 'auto' };
      } catch {}
    }
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

interface YtDlpResult {
  subtitles?: Record<string, Array<{ ext: string; url?: string }>>;
  automatic_captions?: Record<string, Array<{ ext: string; url?: string }>>;
}

interface SubtitleEvent {
  tStartMs?: number;
  dDurationMs?: number;
  segs?: Array<{ utf8: string }>;
}

interface SubtitleData {
  events?: SubtitleEvent[];
}

interface SubtitleSegment {
  utf8: string;
}

interface SubtitleFormat {
  ext: string;
  url?: string;
}

async function tryYtDlpSubtitles(videoId: string, language: string): Promise<ExtractionAttempt> {
  try {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    
    const result = await youtubedl(url, {
      dumpSingleJson: true,
      skipDownload: true,
      writeAutoSub: true,
      subLang: language,
      noWarnings: true,
      noCheckCertificates: true,
      preferFreeFormats: true,
      youtubeSkipDashManifest: true,
      simulate: true,
    }) as YtDlpResult;

    const subtitles = result.subtitles || result.automatic_captions;
    if (!subtitles) return { success: false, error: 'No subtitles available' };

    const availableLangs = Object.keys(subtitles);
    const selectedLang = availableLangs.includes(language) ? language : availableLangs[0];
    if (!selectedLang) return { success: false, error: 'No subtitle languages' };

    const subFormats = subtitles[selectedLang] as SubtitleFormat[];
    const jsonFormat = subFormats.find((f) => f.ext === 'json3' || f.ext === 'srv3');
    if (!jsonFormat?.url) return { success: false, error: 'No suitable subtitle format' };

    const response = await fetch(jsonFormat.url);
    if (!response.ok) return { success: false, error: `HTTP ${response.status}` };
    
    const data = await response.json();
    const segments: YouTubeTranscriptSegment[] = [];
    
    const subtitleData = data as SubtitleData;
    if (subtitleData.events) {
      for (const event of subtitleData.events) {
        if (event.segs) {
          const text = event.segs.map((s: SubtitleSegment) => s.utf8).join('').trim();
          if (text) {
            segments.push({
              text,
              offset: event.tStartMs || 0,
              duration: event.dDurationMs || 0,
            });
          }
        }
      }
    }

    if (segments.length === 0) return { success: false, error: 'Empty subtitles' };

    const text = segments.map(seg => seg.text).join(' ');
    return { success: true, segments, text, language: selectedLang };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'yt-dlp failed' };
  }
}

export async function extractTranscript(
  videoId: string,
  language: string = 'en',
  onProgress?: (method: string, status: string) => void
): Promise<TranscriptExtractionResult> {
  onProgress?.('youtube-transcript', 'attempting');
  const tier1 = await tryYoutubeTranscript(videoId, language);
  if (tier1.success) {
    onProgress?.('youtube-transcript', 'success');
    return {
      segments: tier1.segments!,
      text: tier1.text!,
      method: 'youtube-transcript',
      language: tier1.language || language,
    };
  }
  
  onProgress?.('yt-dlp', 'attempting');
  const tier2 = await tryYtDlpSubtitles(videoId, language);
  if (tier2.success) {
    onProgress?.('yt-dlp', 'success');
    return {
      segments: tier2.segments!,
      text: tier2.text!,
      method: 'yt-dlp',
      language: tier2.language || language,
    };
  }
  
  const errors = [tier1.error, tier2.error].filter(Boolean).join(' | ');
  return {
    segments: [],
    text: '',
    method: 'none',
    language,
    error: `All methods failed. ${errors}. Video may not have captions.`,
  };
}
