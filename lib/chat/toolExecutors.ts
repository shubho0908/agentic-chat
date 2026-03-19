import type { Message } from '@/lib/schemas/chat';
import { encodeToolProgress, encodeToolCall, encodeToolResult, encodeChatChunk } from './streamingHelpers';
import { injectContextToMessages, extractConversationHistory } from './messageHelpers';
import { TOOL_IDS } from '@/lib/tools/config';
import type { DeepResearchProgress, SearchResultWithSources, WebSearchSource, WebSearchImage } from '@/types/tools';
import type { Citation } from '@/types/deepResearch';
import { mapDeepResearchStatus, mapGoogleSuiteStatus } from '@/lib/tools/statusMapping';
import { TOOL_ERROR_MESSAGES } from '@/constants/errors';
import { executeDeepResearch } from '@/lib/tools/deep-research';
import { executeGoogleWorkspace } from '@/lib/tools/google-suite/executor';
import { getRecommendedMaxResults, type SearchDepth } from '@/lib/schemas/webSearchTools';
import { getWebSearchInstructions } from '../tools/web-search/prompts';
import { executeWebSearch } from '../tools/web-search';
import { executeMultiSearch } from '../tools/web-search/searchPlanner';
import { prepareWebSearchQuery, resolveWebSearchQuery } from '../tools/web-search/queryContext';
import { createUnifiedPlan, type WebSearchPlan } from '../tools/unifiedPlanner';
import { truncateTextToTokenLimit } from '@/lib/utils/tokenCounter';


import { logger } from "@/lib/logger";
const MAX_TOOL_CONTEXT_TOKENS = 1600;

function logToolWriteFailure(toolLabel: string, context: string, error: unknown): void {
  logger.warn(`[${toolLabel}] Failed to ${context}:`, error);
}

function truncateContext(text: string, model: string, maxTokens: number = MAX_TOOL_CONTEXT_TOKENS): string {
  return truncateTextToTokenLimit(
    text,
    model,
    maxTokens,
    '\n\n[Tool context truncated to stay within the prompt budget.]'
  );
}

function buildSearchPlanSummary(searchPlan: WebSearchPlan) {
  return {
    originalQuery: searchPlan.originalQuery,
    queryType: searchPlan.queryType,
    complexity: searchPlan.complexity,
    reasoning: searchPlan.reasoning,
    totalResultsNeeded: searchPlan.totalResultsNeeded,
    searches: searchPlan.recommendedSearches.length,
    recommendedSearches: searchPlan.recommendedSearches,
  };
}

export async function executeWebSearchTool(
  textQuery: string,
  controller: ReadableStreamDefaultController,
  messages: Message[],
  apiKey?: string,
  model?: string,
  abortSignal?: AbortSignal,
  searchDepth: SearchDepth = 'basic',
  conversationMessages: Message[] = messages
): Promise<Message[]> {
  const toolCallId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  let streamClosed = false;
  let currentPhase = 0;
  const totalPhases = 5;
  
  try {
    if (abortSignal?.aborted) {
      try {
        controller.enqueue(encodeChatChunk(TOOL_ERROR_MESSAGES.WEB_SEARCH.ABORTED));
      } catch (error) {
        logToolWriteFailure('Web Search Tool', 'send aborted message', error);
      }
      return messages;
    }
    const preparedQuery = prepareWebSearchQuery(textQuery);
    const queryInput = preparedQuery.searchQuery || preparedQuery.originalQuery;
    const useIntelligentPlanning = searchDepth === 'advanced' && apiKey && model;
    const queryResolution = await resolveWebSearchQuery({
      query: queryInput,
      messages: conversationMessages,
      apiKey,
      model,
      abortSignal,
    });
    const effectiveQuery = queryResolution.resolvedQuery;

    if (queryResolution.usedConversationContext) {
      try {
        controller.enqueue(encodeToolProgress(
          TOOL_IDS.WEB_SEARCH,
          'contextualizing_query',
          `Resolved follow-up from chat context: "${effectiveQuery}"`,
          {
            originalQuery: queryResolution.originalQuery,
            query: effectiveQuery,
            usedConversationContext: true,
            explicitUrls: preparedQuery.explicitUrls,
            usedProvidedUrls: preparedQuery.explicitUrls.length > 0,
            searchDepth,
            ...(searchDepth === 'advanced' ? { phase: 1, totalPhases } : {}),
          }
        ));
        setImmediate(() => {});
      } catch {
        streamClosed = true;
      }
    }
    
    let searchResults: string;
    
    if (useIntelligentPlanning) {
      currentPhase = 1;
      try {
        controller.enqueue(encodeToolProgress(
          TOOL_IDS.WEB_SEARCH,
          'phase_1_analysis',
          'Analyzing query complexity and planning optimal search strategy...',
          {
            originalQuery: queryResolution.originalQuery,
            query: effectiveQuery,
            usedConversationContext: queryResolution.usedConversationContext,
            searchDepth,
            phase: currentPhase,
            totalPhases,
            intelligent: true,
          }
        ));
        setImmediate(() => {});
      } catch {
        streamClosed = true;
      }

      const searchPlan = await createUnifiedPlan({
        query: effectiveQuery,
        toolType: 'web_search',
        apiKey: apiKey!,
        model: model!,
        searchDepth,
        abortSignal,
        conversationHistory: extractConversationHistory(conversationMessages, {
          excludeLastMessage: true,
          maxExchanges: 4,
          includeAllForShortConversations: true,
        }),
      }) as WebSearchPlan;
      
      const toolArgs = {
        query: effectiveQuery,
        maxResults: searchPlan.totalResultsNeeded,
        searchDepth: searchDepth,
        includeAnswer: false,
        searchPlan: {
          type: searchPlan.queryType,
          complexity: searchPlan.complexity,
          searches: searchPlan.recommendedSearches.length,
        },
      };
      
      controller.enqueue(encodeToolCall(TOOL_IDS.WEB_SEARCH, toolCallId, toolArgs));
      
      currentPhase = 2;
      try {
        controller.enqueue(encodeToolProgress(
          TOOL_IDS.WEB_SEARCH,
          'phase_2_planning',
          `Query analyzed: ${searchPlan.queryType} (${searchPlan.complexity}). Executing ${searchPlan.recommendedSearches.length} targeted searches with ${searchPlan.totalResultsNeeded} total results.`,
          {
            originalQuery: queryResolution.originalQuery,
            query: effectiveQuery,
            usedConversationContext: queryResolution.usedConversationContext,
            explicitUrls: preparedQuery.explicitUrls,
            usedProvidedUrls: preparedQuery.explicitUrls.length > 0,
            searchDepth,
            phase: currentPhase,
            totalPhases,
            searchPlan: buildSearchPlanSummary(searchPlan),
            intelligent: true,
          }
        ));
        setImmediate(() => {});
      } catch {
        streamClosed = true;
      }

      const multiSearchResult = await executeMultiSearch(
        searchPlan,
        async (query: string, maxResults: number): Promise<SearchResultWithSources> => {
          let capturedSources: WebSearchSource[] = [];
          let capturedImages: WebSearchImage[] = [];
          
          const output = await executeWebSearch(
            { query, maxResults, searchDepth, includeAnswer: false, includeImages: true },
            (progress) => {
              if (progress.details?.sources) {
                capturedSources = progress.details.sources;
              }
              if (progress.details?.images) {
                capturedImages = progress.details.images;
              }
            },
            abortSignal
          );
          
          return { output, sources: capturedSources, images: capturedImages };
        },
        ({ phase, searchIndex, total, query, completedSearches, accumulatedSources, accumulatedImages }) => {
          if (streamClosed || abortSignal?.aborted) return;

          if (phase === 'start') {
            currentPhase = 3;
          }

          try {
            controller.enqueue(encodeToolProgress(
              TOOL_IDS.WEB_SEARCH,
              'phase_3_execution',
              phase === 'complete'
                ? `Completed search ${searchIndex}/${total}: "${query.substring(0, 60)}${query.length > 60 ? '...' : ''}"`
                : `Executing search ${searchIndex}/${total}: "${query.substring(0, 60)}${query.length > 60 ? '...' : ''}"`,
              {
                query,
                originalQuery: queryResolution.originalQuery,
                usedConversationContext: queryResolution.usedConversationContext,
                explicitUrls: preparedQuery.explicitUrls,
                usedProvidedUrls: preparedQuery.explicitUrls.length > 0,
                searchDepth,
                phase: currentPhase,
                totalPhases,
                searchIndex,
                total,
                completedSearches,
                intelligent: true,
                searchPlan: buildSearchPlanSummary(searchPlan),
                sources: accumulatedSources,
                images: accumulatedImages,
                imageCount: accumulatedImages.length,
                resultsCount: accumulatedSources.length,
              }
            ));
            setImmediate(() => {});
          } catch {
            streamClosed = true;
          }
        }
      );
      
      searchResults = multiSearchResult.formattedOutput;
      
      currentPhase = 4;
      try {
        controller.enqueue(encodeToolProgress(
          TOOL_IDS.WEB_SEARCH,
          'phase_4_synthesis',
          'Synthesizing results from multiple targeted searches...',
          {
            originalQuery: queryResolution.originalQuery,
            query: effectiveQuery,
            usedConversationContext: queryResolution.usedConversationContext,
            explicitUrls: preparedQuery.explicitUrls,
            usedProvidedUrls: preparedQuery.explicitUrls.length > 0,
            searchDepth,
            phase: currentPhase,
            totalPhases,
            intelligent: true,
            completedSearches: searchPlan.recommendedSearches.length,
            searchPlan: buildSearchPlanSummary(searchPlan),
            sources: multiSearchResult.allSources,
            images: multiSearchResult.allImages,
            imageCount: multiSearchResult.allImages.length,
            resultsCount: multiSearchResult.allSources.length,
          }
        ));
        setImmediate(() => {});
      } catch {
        streamClosed = true;
      }
      
      try {
        controller.enqueue(encodeToolProgress(
          TOOL_IDS.WEB_SEARCH,
          'completed',
          `Intelligent search complete: ${multiSearchResult.allSources.length} sources${multiSearchResult.allImages.length > 0 ? ` and ${multiSearchResult.allImages.length} images` : ''} from ${searchPlan.recommendedSearches.length} targeted searches`,
          {
            originalQuery: queryResolution.originalQuery,
            query: effectiveQuery,
            usedConversationContext: queryResolution.usedConversationContext,
            explicitUrls: preparedQuery.explicitUrls,
            usedProvidedUrls: preparedQuery.explicitUrls.length > 0,
            searchDepth, 
            phase: currentPhase,
            totalPhases,
            intelligent: true,
            completedSearches: searchPlan.recommendedSearches.length,
            sources: multiSearchResult.allSources,
            images: multiSearchResult.allImages,
            resultsCount: multiSearchResult.allSources.length,
            imageCount: multiSearchResult.allImages.length,
            searchPlan: buildSearchPlanSummary(searchPlan),
          }
        ));
        setImmediate(() => {});
      } catch {
        streamClosed = true;
      }
    } else {
      const toolArgs = {
        query: effectiveQuery,
        maxResults: getRecommendedMaxResults(searchDepth),
        searchDepth: searchDepth,
        includeAnswer: false,
        includeImages: true,
      };
      
      controller.enqueue(encodeToolCall(TOOL_IDS.WEB_SEARCH, toolCallId, toolArgs));
      
      if (searchDepth === 'advanced') {
        currentPhase = 1;
        try {
          controller.enqueue(encodeToolProgress(
            TOOL_IDS.WEB_SEARCH,
            'phase_1_analysis',
            'Analyzing query and gathering comprehensive sources...',
            {
              originalQuery: queryResolution.originalQuery,
              query: effectiveQuery,
              usedConversationContext: queryResolution.usedConversationContext,
              explicitUrls: preparedQuery.explicitUrls,
              usedProvidedUrls: preparedQuery.explicitUrls.length > 0,
              searchDepth,
              phase: currentPhase,
              totalPhases,
            }
          ));
          setImmediate(() => {});
        } catch {
          streamClosed = true;
        }
      }
      
      searchResults = await executeWebSearch(
        toolArgs,
      (progress) => {
        if (streamClosed || abortSignal?.aborted) return;
        
        try {
          // Map search statuses to phases for advanced mode
          if (searchDepth === 'advanced') {
            if (progress.status === 'searching') {
              if (currentPhase < 2) {
                currentPhase = 2;
                controller.enqueue(encodeToolProgress(
                  TOOL_IDS.WEB_SEARCH,
                  'phase_2_gathering',
                  'Gathering evidence from 10-15 comprehensive sources',
                  {
                    ...progress.details,
                    originalQuery: queryResolution.originalQuery,
                    query: progress.details?.query || effectiveQuery,
                    usedConversationContext: queryResolution.usedConversationContext,
                    explicitUrls: preparedQuery.explicitUrls,
                    usedProvidedUrls: preparedQuery.explicitUrls.length > 0,
                    searchDepth,
                    phase: currentPhase,
                    totalPhases,
                  }
                ));
              }
            } else if (progress.status === 'found') {
              if (currentPhase < 3) {
                currentPhase = 3;
                controller.enqueue(encodeToolProgress(
                  TOOL_IDS.WEB_SEARCH,
                  'phase_3_verification',
                  'Cross-verifying information across multiple sources',
                  {
                    ...progress.details,
                    originalQuery: queryResolution.originalQuery,
                    query: progress.details?.query || effectiveQuery,
                    usedConversationContext: queryResolution.usedConversationContext,
                    explicitUrls: preparedQuery.explicitUrls,
                    usedProvidedUrls: preparedQuery.explicitUrls.length > 0,
                    searchDepth,
                    phase: currentPhase,
                    totalPhases,
                  }
                ));
              }
            } else if (progress.status === 'processing_sources') {
              if (currentPhase < 3) {
                currentPhase = 3;
              }
              controller.enqueue(encodeToolProgress(
                TOOL_IDS.WEB_SEARCH,
                'phase_3_verification',
                `Verifying source ${progress.details?.processedCount || 0}/${progress.details?.resultsCount || 0}`,
                {
                  ...progress.details,
                  originalQuery: queryResolution.originalQuery,
                  query: progress.details?.query || effectiveQuery,
                  usedConversationContext: queryResolution.usedConversationContext,
                  explicitUrls: preparedQuery.explicitUrls,
                  usedProvidedUrls: preparedQuery.explicitUrls.length > 0,
                  searchDepth,
                  phase: currentPhase,
                  totalPhases,
                }
              ));
            } else if (progress.status === 'completed') {
              if (currentPhase < 4) {
                currentPhase = 4;
                controller.enqueue(encodeToolProgress(
                  TOOL_IDS.WEB_SEARCH,
                  'phase_4_synthesis',
                  'Synthesizing comprehensive analysis',
                  {
                    ...progress.details,
                    originalQuery: queryResolution.originalQuery,
                    query: progress.details?.query || effectiveQuery,
                    usedConversationContext: queryResolution.usedConversationContext,
                    explicitUrls: preparedQuery.explicitUrls,
                    usedProvidedUrls: preparedQuery.explicitUrls.length > 0,
                    searchDepth,
                    phase: currentPhase,
                    totalPhases,
                  }
                ));
              }
            }
          } else {
            // Basic mode: Use standard progress
            controller.enqueue(encodeToolProgress(
              TOOL_IDS.WEB_SEARCH,
              progress.status,
              progress.message,
              {
                ...progress.details,
                originalQuery: queryResolution.originalQuery,
                query: progress.details?.query || effectiveQuery,
                usedConversationContext: queryResolution.usedConversationContext,
                explicitUrls: preparedQuery.explicitUrls,
                usedProvidedUrls: preparedQuery.explicitUrls.length > 0,
                searchDepth,
              }
            ));
          }
          setImmediate(() => {});
        } catch {
          logger.error('[Web Search Tool] Failed to enqueue progress (controller closed)');
          streamClosed = true;
        }
      },
      abortSignal
      );
    }
    
    if (!streamClosed && !abortSignal?.aborted) {
      try {
        controller.enqueue(encodeToolResult(TOOL_IDS.WEB_SEARCH, toolCallId, searchResults));
      } catch {
        streamClosed = true;
      }
    }
    
    // Advanced Search: Emit Phase 5 - Final Validation
    if (searchDepth === 'advanced' && !streamClosed) {
      currentPhase = 5;
      try {
        controller.enqueue(encodeToolProgress(
          TOOL_IDS.WEB_SEARCH,
          'phase_5_validation',
          'Final validation and quality check complete',
          {
            originalQuery: queryResolution.originalQuery,
            query: effectiveQuery,
            usedConversationContext: queryResolution.usedConversationContext,
            explicitUrls: preparedQuery.explicitUrls,
            usedProvidedUrls: preparedQuery.explicitUrls.length > 0,
            searchDepth,
            phase: currentPhase,
            totalPhases,
          }
        ));
        setImmediate(() => {});
      } catch {
        streamClosed = true;
      }
    }
    
    const webSearchInstructions = getWebSearchInstructions(searchDepth);
    const searchContext = `## Web Search Context\n\n${truncateContext(searchResults, model || 'gpt-4o')}\n\n${webSearchInstructions}`;
    
    return injectContextToMessages(messages, searchContext, model);
  } catch (error) {
    logger.error('[Chat API] Web search error:', error);
    
    if (error instanceof Error && error.message.includes('aborted')) {
      try {
        controller.enqueue(encodeChatChunk(TOOL_ERROR_MESSAGES.WEB_SEARCH.ABORTED));
      } catch (enqueueError) {
        logToolWriteFailure('Web Search Tool', 'send aborted fallback', enqueueError);
      }
      return messages;
    }
    
    try {
      controller.enqueue(encodeToolProgress(
        TOOL_IDS.WEB_SEARCH,
        'completed',
        TOOL_ERROR_MESSAGES.WEB_SEARCH.FAILED_FALLBACK
      ));
    } catch (enqueueError) {
      logToolWriteFailure('Web Search Tool', 'send failure fallback', enqueueError);
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
  documentContextForPlanning?: string,
  requestId?: string
): Promise<{ messages: Message[]; failed: boolean; skipped?: boolean; finalResponse?: string; citations?: Citation[]; followUpQuestions?: string[] }> {
  const toolCallId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  let streamClosed = false;
  
  try {
    if (abortSignal?.aborted) {
      try {
        controller.enqueue(encodeChatChunk(TOOL_ERROR_MESSAGES.DEEP_RESEARCH.ABORTED));
      } catch (error) {
        logToolWriteFailure('Deep Research Tool', 'send aborted message', error);
      }
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
        logger.error('[Tool Executor] Failed to enqueue progress (controller closed):', error);
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
      requestId,
    });
    
    if (streamClosed || abortSignal?.aborted) {
      if (abortSignal?.aborted) {
        try {
          controller.enqueue(encodeChatChunk(TOOL_ERROR_MESSAGES.DEEP_RESEARCH.ABORTED));
        } catch (error) {
          logToolWriteFailure('Deep Research Tool', 'send aborted post-run message', error);
        }
      }
      return { messages, failed: false, skipped: result.skipped };
    }
    
    try {
      controller.enqueue(encodeToolProgress(
        TOOL_IDS.DEEP_RESEARCH,
        'completed',
        'Deep research completed',
        {
          sources: result.sources || [],
          citations: result.citations || [],
          followUpQuestions: result.followUpQuestions || [],
          skipped: result.skipped,
        }
      ));
    } catch {
      logger.error('[Tool Executor] Failed to send final progress (controller closed)');
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
        logger.error('[Tool Executor] Failed to send tool result (controller closed)');
        streamClosed = true;
      }
    }
    
    const researchContext = `## Deep Research Results\n\n${truncateContext(formattedResult, model, 2200)}`;
    
    return {
      messages: injectContextToMessages(messages, researchContext, model),
      failed: false,
      skipped: result.skipped,
      finalResponse: result.response,
      citations: result.citations || [],
      followUpQuestions: result.followUpQuestions || [],
    };
  } catch (error) {
    logger.error('[Chat API] Deep research error:', error);
    streamClosed = true;
    
    if (error instanceof Error && error.message.includes('aborted')) {
      try {
        controller.enqueue(encodeChatChunk(TOOL_ERROR_MESSAGES.DEEP_RESEARCH.ABORTED));
      } catch (enqueueError) {
        logToolWriteFailure('Deep Research Tool', 'send aborted fallback', enqueueError);
      }
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
      logger.error('[Tool Executor] Failed to send error to UI (controller closed)');
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
      } catch (error) {
        logToolWriteFailure('Google Workspace Tool', 'send aborted message', error);
      }
      return messages;
    }

    controller.enqueue(encodeToolCall(TOOL_IDS.GOOGLE_SUITE, toolCallId, { query: textQuery }));

    const conversationHistory = extractConversationHistory(messages, {
      maxExchanges: 15,
      excludeLastMessage: true,
      includeAllForShortConversations: true,
    });

    const workspaceResults = await executeGoogleWorkspace({
      query: textQuery,
      userId,
      apiKey,
      model,
      conversationHistory,
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
          logger.error('[Google Workspace] Failed to enqueue progress (controller closed)');
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

    const workspaceContext = `## Google Workspace Context\n\n${truncateContext(workspaceResults, model, 1400)}`;

    return injectContextToMessages(messages, workspaceContext, model);
  } catch (error) {
    logger.error('[Chat API] Google Workspace error:', error);

    if (error instanceof Error && error.message.includes('aborted')) {
      try {
        controller.enqueue(encodeChatChunk(TOOL_ERROR_MESSAGES.GOOGLE_SUITE.ABORTED));
      } catch (enqueueError) {
        logToolWriteFailure('Google Workspace Tool', 'send aborted fallback', enqueueError);
      }
      return messages;
    }

    try {
      controller.enqueue(encodeToolProgress(
        TOOL_IDS.GOOGLE_SUITE,
        'completed',
        TOOL_ERROR_MESSAGES.GOOGLE_SUITE.FAILED_FALLBACK
      ));
    } catch (enqueueError) {
      logToolWriteFailure('Google Workspace Tool', 'send failure fallback', enqueueError);
    }

    return messages;
  }
}
