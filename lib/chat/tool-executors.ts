import type { Message } from '@/lib/schemas/chat';
import { encodeToolProgress, encodeToolCall, encodeToolResult, encodeChatChunk } from './streaming-helpers';
import { injectContextToMessages } from './message-helpers';
import { TOOL_IDS } from '@/lib/tools/config';
import { YOUTUBE_ANALYSIS_INSTRUCTIONS, WEB_SEARCH_ANALYSIS_INSTRUCTIONS, GMAIL_ANALYSIS_INSTRUCTIONS } from '@/lib/prompts';
import type { DeepResearchProgress, GoogleSuiteProgress } from '@/types/tools';
import { mapYouTubeStatus, mapDeepResearchStatus, mapGoogleSuiteStatus } from '@/lib/tools/status-mapping';
import { TOOL_ERROR_MESSAGES } from '@/constants/errors';

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
        controller.enqueue(encodeChatChunk(TOOL_ERROR_MESSAGES.WEB_SEARCH.ABORTED));
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
        controller.enqueue(encodeChatChunk(TOOL_ERROR_MESSAGES.WEB_SEARCH.ABORTED));
      } catch {}
      return messages;
    }
    
    try {
      controller.enqueue(encodeToolProgress(
        TOOL_IDS.WEB_SEARCH,
        'completed',
        TOOL_ERROR_MESSAGES.WEB_SEARCH.FAILED_FALLBACK
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
  let streamClosed = false;
  
  try {
    if (abortSignal?.aborted) {
      try {
        controller.enqueue(encodeChatChunk(TOOL_ERROR_MESSAGES.YOUTUBE.ABORTED));
      } catch {}
      return messages;
    }
    
    const toolArgs = {
      includeChapters: true,
      includeTimestamps: true,
      language: 'en',
    };
    
    try {
      controller.enqueue(encodeToolCall(TOOL_IDS.YOUTUBE, toolCallId, toolArgs));
    } catch {
      console.error('[YouTube Tool] Failed to enqueue tool call (controller closed)');
      streamClosed = true;
      return messages;
    }
    
    const { executeYouTubeTool } = await import('@/lib/tools/youtube/youtube');
    
    let totalVideos = 0;
    let processedCount = 0;
    
    const youtubeResults = await executeYouTubeTool(
      toolArgs,
      textQuery,
      abortSignal,
      (progress) => {
        if (streamClosed || abortSignal?.aborted) return;
        
        if (progress.details?.videoCount) {
          totalVideos = progress.details.videoCount;
        }
        if (progress.details?.processedCount !== undefined) {
          processedCount = progress.details.processedCount;
        }
        
        const mappedStatus = mapYouTubeStatus(progress.status);
        
        try {
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
        } catch {
          console.error('[YouTube Tool] Failed to enqueue progress (controller closed)');
          streamClosed = true;
        }
      }
    );
    
    if (!streamClosed && !abortSignal?.aborted) {
      try {
        controller.enqueue(encodeToolResult(TOOL_IDS.YOUTUBE, toolCallId, youtubeResults));
      } catch {
        console.error('[YouTube Tool] Failed to enqueue result (controller closed)');
        streamClosed = true;
      }
    }
    
    const youtubeContext = `\n\n## YouTube Video Context\n\n${youtubeResults}\n${YOUTUBE_ANALYSIS_INSTRUCTIONS}`;
    
    return injectContextToMessages(messages, youtubeContext);
  } catch (error) {
    console.error('[Chat API] YouTube tool error:', error);
    
    if (error instanceof Error && error.message.includes('aborted')) {
      try {
        controller.enqueue(encodeChatChunk(TOOL_ERROR_MESSAGES.YOUTUBE.ABORTED));
      } catch {}
      return messages;
    }
    
    try {
      controller.enqueue(encodeToolProgress(
        TOOL_IDS.YOUTUBE,
        'completed',
        TOOL_ERROR_MESSAGES.YOUTUBE.FAILED_FALLBACK
      ));
    } catch {
      console.error('[YouTube Tool] Failed to send error progress (controller closed)');
    }
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
        controller.enqueue(encodeChatChunk(TOOL_ERROR_MESSAGES.DEEP_RESEARCH.ABORTED));
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
          controller.enqueue(encodeChatChunk(TOOL_ERROR_MESSAGES.DEEP_RESEARCH.ABORTED));
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
        controller.enqueue(encodeChatChunk(TOOL_ERROR_MESSAGES.DEEP_RESEARCH.ABORTED));
      } catch {}
      return { messages, failed: false };
    }
    
    try {
      controller.enqueue(encodeToolProgress(
        TOOL_IDS.DEEP_RESEARCH,
        'completed',
        TOOL_ERROR_MESSAGES.DEEP_RESEARCH.FAILED
      ));
      
      controller.enqueue(encodeToolResult(
        TOOL_IDS.DEEP_RESEARCH, 
        toolCallId, 
        TOOL_ERROR_MESSAGES.DEEP_RESEARCH.FAILED_DETAILED
      ));
    } catch {
      console.error('[Tool Executor] Failed to send error to UI (controller closed)');
    }
    return { messages, failed: true };
  }
}

export async function executeGoogleSuiteTool(
  textQuery: string,
  controller: ReadableStreamDefaultController,
  messages: Message[],
  userId: string,
  apiKey: string,
  model: string,
  abortSignal?: AbortSignal
): Promise<Message[]> {
  const toolCallId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  let streamClosed = false;

  try {
    if (abortSignal?.aborted) {
      try {
        controller.enqueue(encodeChatChunk(TOOL_ERROR_MESSAGES.GOOGLE_SUITE.ABORTED));
      } catch {}
      return messages;
    }

    controller.enqueue(encodeToolCall(TOOL_IDS.GOOGLE_SUITE, toolCallId, { query: textQuery }));

    const { executeGoogleSuiteTool } = await import('@/lib/tools/google-suite/gmail');

    const gmailResults = await executeGoogleSuiteTool(
      textQuery,
      userId,
      apiKey,
      model,
      (progress: GoogleSuiteProgress) => {
        if (streamClosed || abortSignal?.aborted) return;

        const mappedStatus = mapGoogleSuiteStatus(progress.status);

        try {
          controller.enqueue(encodeToolProgress(
            TOOL_IDS.GOOGLE_SUITE,
            mappedStatus,
            progress.message,
            progress.details
          ));
          setImmediate(() => {});
        } catch {
          console.error('[Google Suite Tool] Failed to enqueue progress (controller closed)');
          streamClosed = true;
        }
      },
      abortSignal
    );

    if (!streamClosed && !abortSignal?.aborted) {
      try {
        controller.enqueue(encodeToolResult(TOOL_IDS.GOOGLE_SUITE, toolCallId, gmailResults));
      } catch {
        streamClosed = true;
      }
    }

    const gmailContext = `\n\n## Google Suite Context\n\n${gmailResults}\n${GMAIL_ANALYSIS_INSTRUCTIONS}`;

    return injectContextToMessages(messages, gmailContext);
  } catch (error) {
    console.error('[Chat API] Google Suite tool error:', error);

    if (error instanceof Error && error.message.includes('aborted')) {
      try {
        controller.enqueue(encodeChatChunk(TOOL_ERROR_MESSAGES.GOOGLE_SUITE.ABORTED));
      } catch {}
      return messages;
    }

    try {
      controller.enqueue(encodeToolProgress(
        TOOL_IDS.GOOGLE_SUITE,
        'completed',
        TOOL_ERROR_MESSAGES.GOOGLE_SUITE.FAILED_FALLBACK
      ));
    } catch {}

    return messages;
  }
}
