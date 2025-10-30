import { Innertube } from 'youtubei.js';
import type { YouTubeTranscriptSegment } from '@/types/tools';

interface TranscriptExtractionResult {
  segments: YouTubeTranscriptSegment[];
  text: string;
  method: 'innertube' | 'none';
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
  try {
    const youtube = await Innertube.create();
    const info = await youtube.getInfo(videoId);
    
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
      if (error.message.includes('Type mismatch') || error.message.includes('Parser') || error.message.includes('[Parser]')) {
        console.warn('[YouTube Transcript] Parser error for video:', videoId, '- Video has unsupported metadata format');
        return { 
          success: false, 
          error: 'Video metadata parsing failed (YouTube API format issue). This video may have an unsupported description format.' 
        };
      }
      return { 
        success: false, 
        error: error.message 
      };
    }
    return { 
      success: false, 
      error: 'Failed to extract transcript via Innertube API' 
    };
  }
}

export async function extractTranscript(
  videoId: string,
  language: string = 'en',
  onProgress?: (method: string, status: string) => void
): Promise<TranscriptExtractionResult> {
  onProgress?.('innertube', 'attempting');
  const result = await tryInnertubeTranscript(videoId, language);
  
  if (result.success) {
    onProgress?.('innertube', 'success');
    return {
      segments: result.segments!,
      text: result.text!,
      method: 'innertube',
      language: result.language || language,
    };
  }
  
  return {
    segments: [],
    text: '',
    method: 'none',
    language,
    error: `Transcript extraction failed. ${result.error}.`,
  };
}
