import { Innertube } from 'youtubei.js';
import { YoutubeTranscript } from 'youtube-transcript';
import type { YouTubeTranscriptSegment } from '@/types/tools';

interface TranscriptExtractionResult {
  segments: YouTubeTranscriptSegment[];
  text: string;
  method: 'innertube' | 'youtube-transcript' | 'none';
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

async function tryInnertubeTranscript(videoId: string, targetLanguage: string): Promise<ExtractionAttempt> {
  let youtube;
  let info;

  try {
    youtube = await Innertube.create({
      retrieve_player: false,
    });
  } catch {
    return {
      success: false,
      error: 'Failed to initialize YouTube client'
    };
  }

  try {
    info = await youtube.getInfo(videoId);
    
    const transcriptData = await info.getTranscript();
    if (!transcriptData) {
      return { success: false, error: 'No transcript available for this video' };
    }
    
    const transcriptContent = transcriptData.transcript;
    if (!transcriptContent || !transcriptContent.content || !transcriptContent.content.body) {
      return { success: false, error: 'Transcript data structure invalid' };
    }
    
    const body = transcriptContent.content.body;
    if (!body.initial_segments || body.initial_segments.length === 0) {
      return { success: false, error: 'No transcript segments found' };
    }
    
    const segments: YouTubeTranscriptSegment[] = body.initial_segments.map((segment) => {
      const startMs = typeof segment.start_ms === 'string' ? parseFloat(segment.start_ms) : (segment.start_ms || 0);
      const endMs = segment.end_ms ? (typeof segment.end_ms === 'string' ? parseFloat(segment.end_ms) : segment.end_ms) : 0;
      
      return {
        text: segment.snippet.text || '',
        offset: startMs,
        duration: endMs > 0 ? endMs - startMs : 0,
      };
    }).filter((seg) => seg.text.trim().length > 0);
    
    if (segments.length === 0) {
      return { success: false, error: 'All transcript segments were empty' };
    }
    
    const text = segments.map(seg => seg.text).join(' ');
    const detectedLanguage = targetLanguage;
    
    return { 
      success: true, 
      segments, 
      text, 
      language: detectedLanguage 
    };
  } catch (error) {
    if (error instanceof Error) {
      const errorMsg = error.message.toLowerCase();
      if (errorMsg.includes('type mismatch') || errorMsg.includes('parser')) {
        return {
          success: false,
          error: 'Video description format incompatible with parser'
        };
      }
      if (errorMsg.includes('transcript')) {
        return {
          success: false,
          error: 'No transcript available (may be disabled)'
        };
      }
      return {
        success: false,
        error: error.message
      };
    }
    return {
      success: false,
      error: 'Transcript extraction failed'
    };
  }
}

async function tryYoutubeTranscriptLibrary(videoId: string): Promise<ExtractionAttempt> {
  try {
    const transcriptItems = await YoutubeTranscript.fetchTranscript(videoId);

    if (!transcriptItems || transcriptItems.length === 0) {
      return { success: false, error: 'No transcript segments found' };
    }

    const segments: YouTubeTranscriptSegment[] = transcriptItems.map((item) => ({
      text: item.text,
      offset: item.offset,
      duration: item.duration || 0,
    }));

    const text = segments.map(seg => seg.text).join(' ');

    return {
      success: true,
      segments,
      text,
      language: 'en',
    };
  } catch (error) {
    if (error instanceof Error) {
      return {
        success: false,
        error: error.message.includes('Transcript is disabled')
          ? 'Transcript is disabled for this video'
          : error.message,
      };
    }
    return {
      success: false,
      error: 'Failed to extract transcript via youtube-transcript library',
    };
  }
}

export async function extractTranscript(
  videoId: string,
  language: string = 'en',
  onProgress?: (method: string, status: string) => void
): Promise<TranscriptExtractionResult> {
  onProgress?.('innertube', 'attempting');
  const innertubeResult = await tryInnertubeTranscript(videoId, language);

  if (innertubeResult.success) {
    onProgress?.('innertube', 'success');
    return {
      segments: innertubeResult.segments!,
      text: innertubeResult.text!,
      method: 'innertube',
      language: innertubeResult.language || language,
    };
  }

  onProgress?.('youtube-transcript', 'attempting');

  const fallbackResult = await tryYoutubeTranscriptLibrary(videoId);

  if (fallbackResult.success) {
    onProgress?.('youtube-transcript', 'success');
    return {
      segments: fallbackResult.segments!,
      text: fallbackResult.text!,
      method: 'youtube-transcript',
      language: fallbackResult.language || language,
    };
  }

  onProgress?.('all-methods', 'failed');
  return {
    segments: [],
    text: '',
    method: 'none',
    language,
    error: `All extraction methods failed. Primary: ${innertubeResult.error}. Fallback: ${fallbackResult.error}`,
  };
}
