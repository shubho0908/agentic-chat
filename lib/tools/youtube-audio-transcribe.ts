import ytdl from '@distube/ytdl-core';
import { unlinkSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawn } from 'child_process';
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

async function downloadAudioWithYtdl(
  videoId: string,
  outputPath: string,
  onProgress?: (message: string) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      
      onProgress?.('Downloading audio from YouTube...');
      
      const audioStream = ytdl(videoUrl, {
        quality: 'highestaudio',
        filter: 'audioonly',
      });

      const ffmpegBinary = ffmpegPath || 'ffmpeg';
      if (!ffmpegBinary) {
        reject(new Error(TOOL_ERROR_MESSAGES.YOUTUBE.FFMPEG_NOT_FOUND));
        return;
      }

      const ffmpegProcess = spawn(ffmpegBinary, [
        '-i', 'pipe:0',
        '-acodec', 'libmp3lame',
        '-ab', '128k',
        '-ar', '44100',
        '-f', 'mp3',
        outputPath
      ], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      audioStream.pipe(ffmpegProcess.stdin);

      let errorOutput = '';
      ffmpegProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      audioStream.on('error', (error) => {
        reject(new Error(`YouTube audio stream error: ${error.message}`));
      });

      ffmpegProcess.on('error', (error) => {
        reject(new Error(`FFmpeg process error: ${error.message}`));
      });

      ffmpegProcess.on('close', (code) => {
        if (code === 0 && existsSync(outputPath)) {
          resolve();
        } else {
          reject(new Error(`FFmpeg exited with code ${code}. Error: ${errorOutput}`));
        }
      });

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      reject(new Error(`Failed to download audio: ${errorMsg}`));
    }
  });
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
    await downloadAudioWithYtdl(videoId, audioPath, onProgress);

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
