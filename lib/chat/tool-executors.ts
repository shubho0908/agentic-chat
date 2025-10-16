import type { Message } from '@/lib/schemas/chat';
import { encodeToolProgress, encodeToolCall, encodeToolResult, encodeChatChunk } from './streaming-helpers';
import { injectContextToMessages } from './message-helpers';
import { TOOL_IDS } from '@/lib/tools/config';
import { YOUTUBE_ANALYSIS_INSTRUCTIONS, WEB_SEARCH_ANALYSIS_INSTRUCTIONS } from '@/lib/prompts';
import type { DeepResearchProgress } from '@/types/tools';
import { mapYouTubeStatus, mapDeepResearchStatus } from '@/lib/tools/status-mapping';

export async function executeWebSearchTool(
  textQuery: string,
  controller: ReadableStreamDefaultController,
  messages: Message[],
  abortSignal?: AbortSignal
): Promise<Message[]> {
  const toolCallId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  let streamClosed = false;
  
  try {
    if (abortSignal?.aborted) {
      try {
        controller.enqueue(encodeChatChunk('Search was aborted, please try again later.'));
      } catch {}
      return messages;
    }
    const toolArgs = {
      query: textQuery,
      maxResults: 5,
      searchDepth: 'advanced' as const,
      includeAnswer: false,
    };
    
    controller.enqueue(encodeToolCall(TOOL_IDS.WEB_SEARCH, toolCallId, toolArgs));
    
    const { executeWebSearch } = await import('@/lib/tools/web-search');
    
    const searchResults = await executeWebSearch(
      toolArgs,
      (progress) => {
        if (streamClosed || abortSignal?.aborted) return;
        
        try {
          controller.enqueue(encodeToolProgress(
            TOOL_IDS.WEB_SEARCH,
            progress.status,
            progress.message,
            progress.details
          ));
          setImmediate(() => {});
        } catch {
          console.error('[Web Search Tool] Failed to enqueue progress (controller closed)');
          streamClosed = true;
        }
      },
      abortSignal
    );
    
    if (!streamClosed && !abortSignal?.aborted) {
      try {
        controller.enqueue(encodeToolResult(TOOL_IDS.WEB_SEARCH, toolCallId, searchResults));
      } catch {
        streamClosed = true;
      }
    }
    
    const searchContext = `\n\n## Web Search Context\n\n${searchResults}\n${WEB_SEARCH_ANALYSIS_INSTRUCTIONS}`;
    
    return injectContextToMessages(messages, searchContext);
  } catch (error) {
    console.error('[Chat API] Web search error:', error);
    
    if (error instanceof Error && error.message.includes('aborted')) {
      try {
        controller.enqueue(encodeChatChunk('Search was aborted, please try again later.'));
      } catch {}
      return messages;
    }
    
    try {
      controller.enqueue(encodeToolProgress(
        TOOL_IDS.WEB_SEARCH,
        'completed',
        'Search failed, continuing without web results...'
      ));
    } catch {}
    
    return messages;
  }
}

export async function executeYouTubeTool(
  textQuery: string,
  controller: ReadableStreamDefaultController,
  messages: Message[],
  abortSignal?: AbortSignal
): Promise<Message[]> {
  const toolCallId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    if (abortSignal?.aborted) {
      try {
        controller.enqueue(encodeChatChunk('YouTube analysis was aborted, please try again later.'));
      } catch {}
      return messages;
    }
    
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
      abortSignal,
      (progress) => {
        if (progress.details?.videoCount) {
          totalVideos = progress.details.videoCount;
        }
        if (progress.details?.processedCount !== undefined) {
          processedCount = progress.details.processedCount;
        }
        
        const mappedStatus = mapYouTubeStatus(progress.status, {
          step: progress.details?.step,
          processedCount,
          videoCount: totalVideos,
        });
        
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
        setImmediate(() => {});
      }
    );
    
    controller.enqueue(encodeToolResult(TOOL_IDS.YOUTUBE, toolCallId, youtubeResults));
    
    const youtubeContext = `\n\n## YouTube Video Context\n\n${youtubeResults}\n${YOUTUBE_ANALYSIS_INSTRUCTIONS}`;
    
    return injectContextToMessages(messages, youtubeContext);
  } catch (error) {
    console.error('[Chat API] YouTube tool error:', error);
    
    if (error instanceof Error && error.message.includes('aborted')) {
      try {
        controller.enqueue(encodeChatChunk('YouTube analysis was aborted, please try again later.'));
      } catch {}
      return messages;
    }
    
    controller.enqueue(encodeToolProgress(
      TOOL_IDS.YOUTUBE,
      'completed',
      'YouTube processing failed, continuing without video data...'
    ));
    return messages;
  }
}

export async function executeDeepResearchTool(
  textQuery: string,
  controller: ReadableStreamDefaultController,
  messages: Message[],
  apiKey: string,
  model: string,
  forceDeepResearch: boolean = true,
  abortSignal?: AbortSignal
): Promise<{ messages: Message[]; failed: boolean }> {
  const toolCallId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  let streamClosed = false;
  
  try {
    if (abortSignal?.aborted) {
      try {
        controller.enqueue(encodeChatChunk('Research was aborted, please try again later.'));
      } catch {}
      return { messages, failed: false };
    }
    
    controller.enqueue(encodeToolCall(TOOL_IDS.DEEP_RESEARCH, toolCallId, { query: textQuery }));
    setImmediate(() => {});
    
    const { executeDeepResearch } = await import('@/lib/tools/deep-research');
    
    const progressCallback = (progress: DeepResearchProgress) => {
      if (streamClosed || abortSignal?.aborted) {
        return;
      }
      
      const mappedStatus = mapDeepResearchStatus(progress.status);
      
      const enrichedDetails = {
        ...progress.details,
        status: progress.status,
      };
      
      try {
        controller.enqueue(encodeToolProgress(
          TOOL_IDS.DEEP_RESEARCH,
          mappedStatus,
          progress.message,
          enrichedDetails
        ));
        
        setImmediate(() => {});
      } catch (error) {
        console.error('[Tool Executor] Failed to enqueue progress (controller closed):', error);
        streamClosed = true;
      }
    };
    
    const result = await executeDeepResearch({
      query: textQuery,
      openaiApiKey: apiKey,
      model: model,
      onProgress: progressCallback,
      forceDeepResearch: forceDeepResearch,
      abortSignal,
    });
    
    if (streamClosed || abortSignal?.aborted) {
      if (abortSignal?.aborted) {
        try {
          controller.enqueue(encodeChatChunk('Research was aborted, please try again later.'));
        } catch {}
      }
      return { messages, failed: false };
    }
    
    try {
      controller.enqueue(encodeToolProgress(
        TOOL_IDS.DEEP_RESEARCH,
        'completed',
        'Deep research completed',
        {
          citations: result.citations || [],
          followUpQuestions: result.followUpQuestions || [],
          skipped: result.skipped,
        }
      ));
    } catch {
      console.error('[Tool Executor] Failed to send final progress (controller closed)');
      streamClosed = true;
    }
    
    let formattedResult = result.response;
    
    if (result.sources.length > 0) {
      formattedResult += '\n\n## Sources\n\n';
      result.sources.forEach((source, index) => {
        formattedResult += `${index + 1}. [${source.title}](${source.url}) - ${source.domain}\n`;
      });
    }
    
    if (!streamClosed) {
      try {
        controller.enqueue(encodeToolResult(TOOL_IDS.DEEP_RESEARCH, toolCallId, formattedResult));
      } catch {
        console.error('[Tool Executor] Failed to send tool result (controller closed)');
        streamClosed = true;
      }
    }
    
    const researchContext = `\n\n## Deep Research Results\n\n${formattedResult}`;
    
    return { messages: injectContextToMessages(messages, researchContext), failed: false };
  } catch (error) {
    console.error('[Chat API] Deep research error:', error);
    streamClosed = true;
    
    if (error instanceof Error && error.message.includes('aborted')) {
      try {
        controller.enqueue(encodeChatChunk('Research was aborted, please try again later.'));
      } catch {}
      return { messages, failed: false };
    }
    
    try {
      controller.enqueue(encodeToolProgress(
        TOOL_IDS.DEEP_RESEARCH,
        'completed',
        'Research failed'
      ));
      
      controller.enqueue(encodeToolResult(
        TOOL_IDS.DEEP_RESEARCH, 
        toolCallId, 
        'Deep research encountered an error and could not be completed. Please try again or rephrase your query.'
      ));
    } catch {
      console.error('[Tool Executor] Failed to send error to UI (controller closed)');
    }
    return { messages, failed: true };
  }
}
