import YTDlpWrap from 'yt-dlp-wrap';
import { unlinkSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { YouTubeTranscriptSegment } from '@/types/tools';
import { TOOL_ERROR_MESSAGES } from '@/constants/errors';
import ffmpegPath from 'ffmpeg-static';

interface GroqTranscriptionSegment {
  id: number;
  seek: number;
  start: number;
  end: number;
  text: string;
  tokens: number[];
  temperature: number;
  avg_logprob: number;
  compression_ratio: number;
  no_speech_prob: number;
}

interface GroqTranscriptionResponse {
  text: string;
  segments?: GroqTranscriptionSegment[];
  language?: string;
  duration?: number;
}

const GROQ_API_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

function getGroqApiKey(): string | undefined {
  return process.env.GROQ_API_KEY;
}

let ytDlpInstance: YTDlpWrap | null = null;
let ytDlpInitialized = false;

async function getYtDlpInstance(): Promise<YTDlpWrap> {
  if (ytDlpInstance) return ytDlpInstance;
  
  if (!ytDlpInitialized) {
    ytDlpInitialized = true;
    
    try {
      ytDlpInstance = new YTDlpWrap();
      await ytDlpInstance.getVersion();
      return ytDlpInstance;
    } catch {
      const binaryPath = join(tmpdir(), 'yt-dlp');
      ytDlpInstance = new YTDlpWrap(binaryPath);
      await YTDlpWrap.downloadFromGithub(binaryPath);
      return ytDlpInstance;
    }
  }
  
  throw new Error(TOOL_ERROR_MESSAGES.YOUTUBE.YTDLP_INIT_FAILED);
}

export async function transcribeFromAudio(
  videoId: string,
  onProgress?: (message: string) => void
): Promise<YouTubeTranscriptSegment[]> {
  const GROQ_API_KEY = getGroqApiKey();
  if (!GROQ_API_KEY) {
    throw new Error(TOOL_ERROR_MESSAGES.YOUTUBE.GROQ_API_KEY_NOT_CONFIGURED);
  }

  const audioPath = join(tmpdir(), `${videoId}.mp3`);
  
  try {
    onProgress?.('Initializing yt-dlp...');
    const ytDlp = await getYtDlpInstance();
    
    onProgress?.('Downloading audio from YouTube...');
    
    const ffmpegBinary = ffmpegPath || 'ffmpeg';
    
    const ytDlpArgs = [
      `https://www.youtube.com/watch?v=${videoId}`,
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', '5',
      '-o', audioPath,
      '--no-playlist',
      '--no-warnings',
      '--quiet'
    ];
    
    if (ffmpegBinary && ffmpegBinary !== 'ffmpeg' && existsSync(ffmpegBinary)) {
      ytDlpArgs.push('--ffmpeg-location', ffmpegBinary);
    }
    
    await ytDlp.execPromise(ytDlpArgs);

    if (!existsSync(audioPath)) {
      throw new Error(TOOL_ERROR_MESSAGES.YOUTUBE.AUDIO_DOWNLOAD_FAILED);
    }

    onProgress?.('Transcribing audio with Groq Whisper...');

    const audioBuffer = readFileSync(audioPath);
    const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' });
    
    const formData = new FormData();
    formData.append('file', audioBlob, `${videoId}.mp3`);
    formData.append('model', 'whisper-large-v3-turbo');
    formData.append('response_format', 'verbose_json');
    formData.append('language', 'en');

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(TOOL_ERROR_MESSAGES.YOUTUBE.GROQ_API_ERROR(response.status, errorText));
    }

    const transcription = await response.json() as GroqTranscriptionResponse;

    const segments: YouTubeTranscriptSegment[] = [];
    
    if (transcription.segments && transcription.segments.length > 0) {
      for (const seg of transcription.segments) {
        segments.push({
          text: seg.text.trim(),
          offset: Math.round(seg.start * 1000),
          duration: Math.round((seg.end - seg.start) * 1000)
        });
      }
    } else if (transcription.text) {
      segments.push({
        text: transcription.text,
        offset: 0,
        duration: 0
      });
    }

    return segments;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(TOOL_ERROR_MESSAGES.YOUTUBE.AUDIO_TRANSCRIPTION_FAILED(errorMsg));
  } finally {
    if (existsSync(audioPath)) {
      try {
        unlinkSync(audioPath);
      } catch (cleanupError) {
        console.warn('[Audio Transcribe] Failed to cleanup:', cleanupError);
      }
    }
  }
}

export function hasGroqAPIKey(): boolean {
  return !!getGroqApiKey();
}
