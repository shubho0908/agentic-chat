import type { Message } from '@/lib/schemas/chat';
import { encodeToolProgress, encodeToolCall, encodeToolResult, encodeChatChunk } from './streaming-helpers';
import { injectContextToMessages } from './message-helpers';
import { TOOL_IDS } from '@/lib/tools/config';
import { YOUTUBE_ANALYSIS_INSTRUCTIONS, GMAIL_ANALYSIS_INSTRUCTIONS } from '@/lib/prompts';
import type { DeepResearchProgress } from '@/types/tools';
import { mapYouTubeStatus, mapDeepResearchStatus, mapGoogleSuiteStatus } from '@/lib/tools/status-mapping';
import { TOOL_ERROR_MESSAGES } from '@/constants/errors';
import { executeDeepResearch } from '@/lib/tools/deep-research';
import { executeGoogleWorkspace } from '@/lib/tools/google-suite/executor';
import { getRecommendedMaxResults, type SearchDepth } from '@/lib/schemas/web-search.tools';
import { getWebSearchInstructions } from '../tools/web-search/prompts';
import { executeWebSearch } from '../tools/web-search';
import { executeYouTubeTool as executeYouTubeToolCore } from '@/lib/tools/youtube';

export async function executeWebSearchTool(
  textQuery: string,
  controller: ReadableStreamDefaultController,
  messages: Message[],
  abortSignal?: AbortSignal,
  searchDepth: SearchDepth = 'basic'
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
      maxResults: getRecommendedMaxResults(searchDepth),
      searchDepth: searchDepth,
      includeAnswer: false,
    };
    
    controller.enqueue(encodeToolCall(TOOL_IDS.WEB_SEARCH, toolCallId, toolArgs));
    
    // Advanced Search: Emit agentic phase indicators
    if (searchDepth === 'advanced') {
      try {
        controller.enqueue(encodeToolProgress(
          TOOL_IDS.WEB_SEARCH,
          'phase_1_analysis',
          'Phase 1: Analyzing query and decomposing research questions',
          { searchDepth, phase: 1, totalPhases: 5 }
        ));
        setImmediate(() => {});
      } catch {
        streamClosed = true;
      }
    }
    
    const searchResults = await executeWebSearch(
      toolArgs,
      (progress) => {
        if (streamClosed || abortSignal?.aborted) return;
        
        try {
          // Map search statuses to phases for advanced mode
          if (searchDepth === 'advanced') {
            if (progress.status === 'searching') {
              controller.enqueue(encodeToolProgress(
                TOOL_IDS.WEB_SEARCH,
                'phase_2_gathering',
                'Phase 2: Gathering evidence from 10-15 comprehensive sources',
                { ...progress.details, searchDepth, phase: 2, totalPhases: 5 }
              ));
            } else if (progress.status === 'found') {
              controller.enqueue(encodeToolProgress(
                TOOL_IDS.WEB_SEARCH,
                'phase_3_verification',
                'Phase 3: Cross-verifying information across multiple sources',
                { ...progress.details, searchDepth, phase: 3, totalPhases: 5 }
              ));
            } else if (progress.status === 'processing_sources') {
              controller.enqueue(encodeToolProgress(
                TOOL_IDS.WEB_SEARCH,
                'phase_3_verification',
                `Phase 3: Verifying source ${progress.details?.processedCount || 0}/${progress.details?.resultsCount || 0}`,
                { ...progress.details, searchDepth, phase: 3, totalPhases: 5 }
              ));
            } else if (progress.status === 'completed') {
              controller.enqueue(encodeToolProgress(
                TOOL_IDS.WEB_SEARCH,
                'phase_4_synthesis',
                'Phase 4: Synthesizing comprehensive analysis',
                { ...progress.details, searchDepth, phase: 4, totalPhases: 5 }
              ));
            }
          } else {
            // Basic mode: Use standard progress
            controller.enqueue(encodeToolProgress(
              TOOL_IDS.WEB_SEARCH,
              progress.status,
              progress.message,
              { ...progress.details, searchDepth }
            ));
          }
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
    
    // Advanced Search: Emit final phase indicator
    if (searchDepth === 'advanced' && !streamClosed) {
      try {
        controller.enqueue(encodeToolProgress(
          TOOL_IDS.WEB_SEARCH,
          'phase_5_validation',
          'Phase 5: Final validation and quality check complete',
          { searchDepth, phase: 5, totalPhases: 5, resultsCount: toolArgs.maxResults }
        ));
        setImmediate(() => {});
      } catch {
        streamClosed = true;
      }
    }
    
    const webSearchInstructions = getWebSearchInstructions(searchDepth);
    const searchContext = `\n\n## Web Search Context\n\n${searchResults}\n${webSearchInstructions}`;
    
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
  apiKey: string,
  model: string,
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
    
    let totalVideos = 0;
    let processedCount = 0;
    
    const youtubeResults = await executeYouTubeToolCore(
      toolArgs,
      textQuery,
      apiKey,
      model,
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
  abortSignal?: AbortSignal,
  userId?: string,
  conversationId?: string,
  imageContext?: string,
  attachmentIds?: string[],
  documentContextForPlanning?: string
): Promise<{ messages: Message[]; failed: boolean; skipped?: boolean }> {
  const toolCallId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  let streamClosed = false;
  
  try {
    if (abortSignal?.aborted) {
      try {
        controller.enqueue(encodeChatChunk(TOOL_ERROR_MESSAGES.DEEP_RESEARCH.ABORTED));
      } catch {}
      return { messages, failed: false, skipped: false };
    }
    
    controller.enqueue(encodeToolCall(TOOL_IDS.DEEP_RESEARCH, toolCallId, { query: textQuery }));
    setImmediate(() => {});
    
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
      userId,
      conversationId,
      imageContext,
      attachmentIds,
      documentContextForPlanning,
    });
    
    if (streamClosed || abortSignal?.aborted) {
      if (abortSignal?.aborted) {
        try {
          controller.enqueue(encodeChatChunk(TOOL_ERROR_MESSAGES.DEEP_RESEARCH.ABORTED));
        } catch {}
      }
      return { messages, failed: false, skipped: result.skipped };
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
    
    return { messages: injectContextToMessages(messages, researchContext), failed: false, skipped: result.skipped };
  } catch (error) {
    console.error('[Chat API] Deep research error:', error);
    streamClosed = true;
    
    if (error instanceof Error && error.message.includes('aborted')) {
      try {
        controller.enqueue(encodeChatChunk(TOOL_ERROR_MESSAGES.DEEP_RESEARCH.ABORTED));
      } catch {}
      return { messages, failed: false, skipped: false };
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
    return { messages, failed: true, skipped: false };
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

    const workspaceResults = await executeGoogleWorkspace({
      query: textQuery,
      userId,
      apiKey,
      model,
      onProgress: (progress) => {
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
          console.error('[Google Workspace] Failed to enqueue progress (controller closed)');
          streamClosed = true;
        }
      },
      abortSignal,
    });

    if (!streamClosed && !abortSignal?.aborted) {
      try {
        controller.enqueue(encodeToolResult(TOOL_IDS.GOOGLE_SUITE, toolCallId, workspaceResults));
      } catch {
        streamClosed = true;
      }
    }

    const workspaceContext = `\n\n## Google Workspace Context\n\n${workspaceResults}\n${GMAIL_ANALYSIS_INSTRUCTIONS}`;

    return injectContextToMessages(messages, workspaceContext);
  } catch (error) {
    console.error('[Chat API] Google Workspace error:', error);

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
