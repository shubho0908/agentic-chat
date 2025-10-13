import type { Message } from '@/types/core';
import { encodeToolProgress, encodeToolCall, encodeToolResult } from './streaming-helpers';
import { injectContextToMessages } from './message-helpers';
import { TOOL_IDS } from '@/lib/tools/config';
import { YOUTUBE_ANALYSIS_INSTRUCTIONS, WEB_SEARCH_ANALYSIS_INSTRUCTIONS } from '@/lib/prompts';

export async function executeWebSearchTool(
  textQuery: string,
  controller: ReadableStreamDefaultController,
  messages: Message[]
): Promise<Message[]> {
  const toolCallId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    const toolArgs = {
      query: textQuery,
      searchDepth: 'advanced' as const,
      includeAnswer: false,
    };
    
    controller.enqueue(encodeToolCall(TOOL_IDS.WEB_SEARCH, toolCallId, toolArgs));
    
    const { executeWebSearch } = await import('@/lib/tools/web-search');
    
    const searchResults = await executeWebSearch(
      toolArgs,
      (progress) => {
        controller.enqueue(encodeToolProgress(
          TOOL_IDS.WEB_SEARCH,
          progress.status,
          progress.message,
          progress.details
        ));
      }
    );
    
    controller.enqueue(encodeToolResult(TOOL_IDS.WEB_SEARCH, toolCallId, searchResults));
    
    const searchContext = `\n\n## Web Search Context\n\n${searchResults}\n${WEB_SEARCH_ANALYSIS_INSTRUCTIONS}`;
    
    return injectContextToMessages(messages, searchContext);
  } catch (error) {
    console.error('[Chat API] Web search error:', error);
    controller.enqueue(encodeToolProgress(
      TOOL_IDS.WEB_SEARCH,
      'completed',
      'Search failed, continuing without web results...'
    ));
    return messages;
  }
}

export async function executeYouTubeTool(
  textQuery: string,
  controller: ReadableStreamDefaultController,
  messages: Message[]
): Promise<Message[]> {
  const toolCallId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    const toolArgs = {
      includeChapters: true,
      includeTimestamps: true,
      language: 'en',
    };
    
    controller.enqueue(encodeToolCall(TOOL_IDS.YOUTUBE, toolCallId, toolArgs));
    
    const { executeYouTubeTool } = await import('@/lib/tools/youtube');
    
    let totalVideos = 0;
    let processedCount = 0;
    
    const youtubeResults = await executeYouTubeTool(
      toolArgs,
      textQuery,
      (progress) => {
        let mappedStatus: 'searching' | 'found' | 'processing_sources' | 'completed' = 'searching';
        
        if (progress.status === 'detecting') {
          mappedStatus = 'searching';
          if (progress.details?.videoCount) {
            totalVideos = progress.details.videoCount;
          }
        } else if (progress.status === 'extracting') {
          if (progress.details?.processedCount !== undefined) {
            processedCount = progress.details.processedCount;
          }
          if (progress.details?.videoCount !== undefined) {
            totalVideos = progress.details.videoCount;
          }
          
          if (progress.details?.step === 'search_complete' || (totalVideos > 0 && processedCount === 0)) {
            mappedStatus = 'found';
          } else {
            mappedStatus = 'processing_sources';
          }
        } else if (progress.status === 'processing_chapters') {
          mappedStatus = 'processing_sources';
          if (progress.details?.processedCount !== undefined) {
            processedCount = progress.details.processedCount;
          }
          if (progress.details?.videoCount !== undefined) {
            totalVideos = progress.details.videoCount;
          }
        } else if (progress.status === 'completed') {
          mappedStatus = 'completed';
          if (progress.details?.processedCount !== undefined) {
            processedCount = progress.details.processedCount;
          }
          if (progress.details?.videoCount !== undefined) {
            totalVideos = progress.details.videoCount;
          }
        }
        
        controller.enqueue(encodeToolProgress(
          TOOL_IDS.YOUTUBE,
          mappedStatus,
          progress.message,
          {
            ...progress.details,
            processedCount,
            videoCount: totalVideos
          }
        ));
      }
    );
    
    controller.enqueue(encodeToolResult(TOOL_IDS.YOUTUBE, toolCallId, youtubeResults));
    
    const youtubeContext = `\n\n## YouTube Video Context\n\n${youtubeResults}\n${YOUTUBE_ANALYSIS_INSTRUCTIONS}`;
    
    return injectContextToMessages(messages, youtubeContext);
  } catch (error) {
    console.error('[Chat API] YouTube tool error:', error);
    controller.enqueue(encodeToolProgress(
      TOOL_IDS.YOUTUBE,
      'completed',
      'YouTube processing failed, continuing without video data...'
    ));
    return messages;
  }
}
