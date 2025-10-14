import { TOOL_IDS } from './config';
import { executeWebSearch } from './web-search';
import { executeYouTubeTool } from './youtube';
import type { WebSearchProgress, YouTubeProgress } from '@/types/tools';

export type ToolProgressCallback = (progress: WebSearchProgress | YouTubeProgress) => void;

export interface ToolExecutionResult {
  success: boolean;
  data?: string;
  error?: string;
}

export async function executeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  onProgress?: ToolProgressCallback
): Promise<ToolExecutionResult> {
  try {
    switch (toolName) {
      case TOOL_IDS.WEB_SEARCH: {
        const webSearchArgs = args as { query: string; maxResults?: number; searchDepth?: 'basic' | 'advanced'; includeAnswer?: boolean };
        const result = await executeWebSearch(
          {
            query: webSearchArgs.query,
            maxResults: webSearchArgs.maxResults ?? 5,
            searchDepth: webSearchArgs.searchDepth ?? 'basic',
            includeAnswer: webSearchArgs.includeAnswer ?? false,
          },
          onProgress as ((progress: WebSearchProgress) => void) | undefined
        );
        return {
          success: true,
          data: result,
        };
      }

      case TOOL_IDS.YOUTUBE: {
        const youtubeArgs = args as { 
          query?: string;
          maxResults?: number;
          urls?: string[]; 
          includeChapters?: boolean; 
          includeTimestamps?: boolean; 
          language?: string 
        };
        const messageContent = youtubeArgs.query || '';
        const result = await executeYouTubeTool(
          {
            urls: youtubeArgs.urls,
            maxResults: youtubeArgs.maxResults ?? 1,
            includeChapters: youtubeArgs.includeChapters ?? true,
            includeTimestamps: youtubeArgs.includeTimestamps ?? true,
            language: youtubeArgs.language ?? 'en',
          },
          messageContent,
          onProgress as ((progress: YouTubeProgress) => void) | undefined
        );
        return {
          success: true,
          data: result,
        };
      }

      default:
        return {
          success: false,
          error: `Unknown tool: ${toolName}`,
        };
    }
  } catch (error) {
    console.error(`[Tool Executor] Error executing ${toolName}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}
