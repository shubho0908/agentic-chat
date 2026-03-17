import type OpenAI from 'openai';
import type { ChatCompletionMessageParam, ChatCompletionContentPart } from 'openai/resources/chat/completions';
import type { Message } from '@/lib/schemas/chat';
import type { MemoryStatus } from '@/types/chat';
import type { SearchDepth } from '@/lib/schemas/web-search.tools';
import { TOOL_IDS } from '@/lib/tools/config';
import { parseOpenAIError } from '@/lib/openai-errors';
import { extractTextFromMessage } from './message-content';
import { executeWebSearchTool, executeDeepResearchTool, executeGoogleSuiteTool } from './tool-executors';
import {
  encodeMemoryStatus,
  encodeChatChunk,
  encodeError,
  encodeDone,
  shouldSendMemoryStatus,
} from './streaming-helpers';
import {
  reserveDeepResearchUsage,
  releaseDeepResearchUsageReservation,
} from '@/lib/deep-research-usage';
import { TOOL_ERROR_MESSAGES } from '@/constants/errors';
import { prisma } from '@/lib/prisma';
import { filterDocumentAttachments, partitionByStatus, extractIds } from '@/lib/rag/retrieval/status-helpers';
import { waitForDocumentProcessing } from '@/lib/rag/retrieval/status';
import { getRAGContext } from '@/lib/rag/retrieval/context';
import { withRetry } from '@/lib/retry';
import { getStageModel } from '@/lib/model-policy';
import { extractUrlsFromMessage, formatScrapedContentForContext, scrapeMultipleUrls } from '@/lib/url-scraper/scraper';
import { checkTokenBudget } from '@/lib/chat/token-budget';
import {
  enqueueOrStartJobWithinCapacity,
  finishOrchestrationJob,
} from '@/lib/orchestration/store';
import { runOrQueueDocumentProcessingJob } from '@/lib/orchestration/document-jobs';
import { logWarn } from '@/lib/observability';

interface StreamHandlerOptions {
  memoryStatusInfo: MemoryStatus;
  messages: Message[];
  activeTool?: string | null;
  enhancedMessages: Message[];
  model: string;
  openai: OpenAI;
  apiKey: string;
  deepResearchEnabled?: boolean;
  abortSignal?: AbortSignal;
  userId?: string;
  conversationId?: string;
  searchDepth?: SearchDepth;
  requestId?: string;
}

function toOpenAIMessages(messages: Message[]): ChatCompletionMessageParam[] {
  return messages as ChatCompletionMessageParam[];
}

function logStreamWriteFailure(context: string, error: unknown): void {
  console.warn(`[Stream Handler] Failed to ${context}:`, error);
}

export function createChatStreamHandler(options: StreamHandlerOptions) {
  const { memoryStatusInfo, messages, activeTool, model, openai, apiKey, deepResearchEnabled, abortSignal, userId, conversationId, searchDepth = 'basic', requestId } = options;
  let { enhancedMessages } = options;

  return {
    async start(controller: ReadableStreamDefaultController) {
      let streamClosed = false;
      let deepResearchReservationActive = false;
      let reservedUsageInfo: { usageCount: number; remaining: number; limit: number } | null = null;
      let deepResearchJobId: string | null = null;
      
      const safeClose = () => {
        if (!streamClosed) {
          try {
            controller.close();
            streamClosed = true;
          } catch (error) {
            logStreamWriteFailure('close stream controller', error);
          }
        }
      };

      const releaseDeepResearchReservation = async () => {
        if (!deepResearchReservationActive || !userId) {
          return;
        }

        try {
          await releaseDeepResearchUsageReservation(userId);
        } catch (error) {
          console.error('[Stream Handler] Failed to release deep research reservation:', error);
        } finally {
          deepResearchReservationActive = false;
        }
      };

      const finishDeepResearchJob = async (
        status: 'completed' | 'failed',
        payload?: { result?: unknown; error?: string }
      ) => {
        if (!deepResearchJobId) {
          return;
        }

        try {
          await finishOrchestrationJob(deepResearchJobId, status, payload);
        } catch (error) {
          console.error('[Stream Handler] Failed to finish deep research job:', error);
        } finally {
          deepResearchJobId = null;
        }
      };

      const ensurePromptBudget = async () => {
        const budgetCheck = checkTokenBudget(enhancedMessages, model);
        memoryStatusInfo.tokenUsage = budgetCheck.tokenUsage;

        if (budgetCheck.ok) {
          return true;
        }

        try {
          controller.enqueue(encodeError(budgetCheck.errorMessage ?? 'Request exceeds the server token budget.'));
          controller.enqueue(encodeDone());
        } catch (error) {
          logStreamWriteFailure('send prompt budget error', error);
        }

        await releaseDeepResearchReservation();
        await finishDeepResearchJob('failed', {
          error: budgetCheck.errorMessage ?? 'prompt_budget_exceeded',
        });
        safeClose();
        return false;
      };
      
      try {
        if (abortSignal?.aborted) {
          try {
            controller.enqueue(encodeChatChunk(TOOL_ERROR_MESSAGES.GENERAL.REQUEST_ABORTED));
          } catch (error) {
            logStreamWriteFailure('send aborted request message', error);
          }
          safeClose();
          return;
        }

        if (shouldSendMemoryStatus(memoryStatusInfo)) {
          controller.enqueue(encodeMemoryStatus(memoryStatusInfo, activeTool));
          await new Promise(resolve => setImmediate(resolve));
        }
        
        const lastUserMessage = messages[messages.length - 1]?.content || '';
        const textQuery = extractTextFromMessage(lastUserMessage);
        
        if (activeTool === TOOL_IDS.WEB_SEARCH) {
          enhancedMessages = await executeWebSearchTool(textQuery, controller, enhancedMessages, apiKey, model, abortSignal, searchDepth);
          if (!(await ensurePromptBudget())) {
            return;
          }
        }

        if (activeTool === TOOL_IDS.GOOGLE_SUITE) {
          if (!userId) {
            try {
              controller.enqueue(encodeChatChunk(TOOL_ERROR_MESSAGES.GOOGLE_SUITE.AUTH_REQUIRED));
            } catch (error) {
              logStreamWriteFailure('send Google auth required message', error);
            }
          } else {
            enhancedMessages = await executeGoogleSuiteTool(textQuery, controller, enhancedMessages, userId, apiKey, model, abortSignal);
            if (!(await ensurePromptBudget())) {
              return;
            }
          }
        }
        
        let researchFailed = false;
        if (deepResearchEnabled) {
          if (!userId) {
            console.error('[Stream Handler] ❌ SECURITY: No userId provided, rejecting deep research request');
            try {
              controller.enqueue(encodeChatChunk(TOOL_ERROR_MESSAGES.DEEP_RESEARCH.AUTH_REQUIRED));
            } catch {
              console.error('[Stream Handler] Could not send auth error message (controller closed)');
            }
          } else {
            try {
              const deepResearchReservation = await enqueueOrStartJobWithinCapacity({
                type: 'deep_research',
                userId,
                payload: { query: textQuery, conversationId, requestId },
                maxRunning: 2,
                leaseOwner: requestId,
                persistIfAtCapacity: false,
              });

              if (deepResearchReservation.atCapacity) {
                controller.enqueue(encodeChatChunk('Deep research is temporarily busy. Please retry in a moment.'));
                controller.enqueue(encodeDone());
                safeClose();
                return;
              }

              deepResearchJobId = deepResearchReservation.job?.id ?? null;
              if (!deepResearchReservation.started) {
                controller.enqueue(encodeChatChunk('Deep research is already running for this request. Please wait for it to finish.'));
                controller.enqueue(encodeDone());
                safeClose();
                return;
              }

              try {
                const usageInfo = await reserveDeepResearchUsage(userId);
                reservedUsageInfo = {
                  usageCount: usageInfo.usageCount,
                  remaining: usageInfo.remaining,
                  limit: usageInfo.limit,
                };
                deepResearchReservationActive = true;
              } catch (usageCheckError) {
                const message =
                  usageCheckError instanceof Error
                    ? usageCheckError.message
                    : TOOL_ERROR_MESSAGES.DEEP_RESEARCH.TECHNICAL_ERROR;

                try {
                  controller.enqueue(encodeChatChunk(message));
                } catch {
                  console.error('[Stream Handler] Could not send limit error message (controller closed)');
                }
                try {
                  controller.enqueue(encodeDone());
                } catch {
                  console.error('[Stream Handler] Could not enqueue done (controller closed)');
                }
                await finishDeepResearchJob('failed', { error: message });
                safeClose();
                return;
              }

              let attachmentIds: string[] = [];
              if (conversationId) {
                try {
                  controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({
                    type: 'tool_progress',
                    toolId: TOOL_IDS.DEEP_RESEARCH,
                    status: 'preparing_documents',
                    message: 'Preparing attached documents...',
                  })}\n\n`));
                  
                  const messages = await prisma.message.findMany({
                    where: {
                      conversationId,
                      isDeleted: false,
                    },
                    include: {
                      attachments: {
                        select: {
                          id: true,
                          fileType: true,
                          processingStatus: true,
                        },
                      },
                    },
                  });
                  
                  const allAttachments = messages.flatMap(m => m.attachments);
                  const documentAttachments = filterDocumentAttachments(allAttachments);
                  
                  if (documentAttachments.length > 0) {
                    const partitioned = partitionByStatus(documentAttachments);
                    const completedIds = extractIds(partitioned.completed);
                    const processingIds = extractIds([...partitioned.processing, ...partitioned.pending]);
                    
                    if (processingIds.length > 0) {
                      if (userId) {
                        await Promise.allSettled(
                          extractIds(partitioned.pending).map((attachmentId) =>
                            runOrQueueDocumentProcessingJob(attachmentId, userId)
                          )
                        );
                      }

                      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({
                        type: 'tool_progress',
                        toolId: TOOL_IDS.DEEP_RESEARCH,
                        status: 'waiting_documents',
                        message: `Waiting for ${processingIds.length} document(s) to finish processing...`,
                      })}\n\n`));
                      
                      const newlyCompleted = await waitForDocumentProcessing(processingIds);
                      attachmentIds = [...completedIds, ...newlyCompleted];
                    } else {
                      attachmentIds = completedIds;
                    }
                    
                    if (attachmentIds.length > 0) {
                      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({
                        type: 'tool_progress',
                        toolId: TOOL_IDS.DEEP_RESEARCH,
                        status: 'documents_ready',
                        message: `${attachmentIds.length} document(s) ready for research`,
                      })}\n\n`));
                    }
                  }
                } catch (docError) {
                  console.error('[Stream Handler] Document pre-processing error:', docError);
                  // Continue with research even if document prep fails
                }
              }
              
              let documentContextForPlanning = '';
              if (attachmentIds.length > 0) {
                try {
                  controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({
                    type: 'tool_progress',
                    toolId: TOOL_IDS.DEEP_RESEARCH,
                    status: 'analyzing_documents',
                    message: 'Analyzing document content for research planning...',
                  })}\n\n`));
                  
                  const ragContext = await getRAGContext(
                    textQuery,
                    userId,
                    {
                      conversationId,
                      attachmentIds: attachmentIds,
                      limit: 15,
                      scoreThreshold: 0.5,
                      waitForProcessing: false,
                    }
                  );
                  
                  if (ragContext) {
                    documentContextForPlanning = ragContext.context;
                  } else {
                    logWarn({
                      event: 'deep_research_rag_context_missing',
                      requestId,
                      userId,
                      conversationId,
                      attachmentCount: attachmentIds.length,
                      queryLength: textQuery.trim().length,
                    });
                  }
                } catch (docContextError) {
                  console.error('[Stream Handler] Document context retrieval for planning error:', docContextError);
                  // Continue without document context for planning
                }
              }

              const messageUrls = extractUrlsFromMessage(lastUserMessage);
              if (messageUrls.length > 0) {
                try {
                  const scrapedUrls = await scrapeMultipleUrls(messageUrls);
                  if (scrapedUrls.length > 0) {
                    const urlContext = formatScrapedContentForContext(scrapedUrls);
                    documentContextForPlanning = documentContextForPlanning
                      ? `${documentContextForPlanning}\n\n${urlContext}`
                      : urlContext;
                  }
                } catch (urlError) {
                  console.error('[Stream Handler] URL context retrieval for deep research failed:', urlError);
                }
              }
              
              let imageContext = '';
              const hasImages = messages.some(m => 
                Array.isArray(m.content) && 
                m.content.some(part => typeof part === 'object' && 'image_url' in part)
              );
              
              if (hasImages) {
                try {
                  controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({
                    type: 'tool_progress',
                    toolId: TOOL_IDS.DEEP_RESEARCH,
                    status: 'processing_images',
                    message: 'Analyzing attached images...',
                  })}\n\n`));
                  
                  const imageMessages = messages.filter(m => 
                    Array.isArray(m.content) && 
                    m.content.some(part => typeof part === 'object' && 'image_url' in part)
                  );
                  
                  if (imageMessages.length > 0) {
                    const visionMessages: ChatCompletionMessageParam[] = [
                      {
                        role: 'system',
                        content: 'You are an expert at analyzing images and extracting detailed information. Describe what you see in the images, including any text, data, diagrams, charts, or relevant visual information that could be useful for research purposes. Be thorough and specific.',
                      },
                    ];
                    
                    for (const msg of imageMessages) {
                      if (msg.role === 'user' && Array.isArray(msg.content)) {
                        visionMessages.push({
                          role: 'user',
                          content: msg.content as ChatCompletionContentPart[],
                        });
                      }
                    }
                    
                    const visionResponse = await withRetry(
                      () =>
                        openai.chat.completions.create(
                          {
                            model: getStageModel(model, 'vision'),
                            messages: visionMessages,
                          },
                          { signal: abortSignal }
                        ),
                      { signal: abortSignal }
                    );
                    
                    imageContext = visionResponse.choices[0]?.message?.content || '';
                  }
                } catch (visionError) {
                  console.error('[Stream Handler] Image analysis error:', visionError);
                  imageContext = 'Note: Images were attached but could not be analyzed.';
                }
              }
              
              try {
                const result = await executeDeepResearchTool(
                  textQuery, 
                  controller, 
                  enhancedMessages, 
                  apiKey, 
                  model, 
                  true, 
                  abortSignal,
                  userId,
                  conversationId,
                  imageContext,
                  attachmentIds,
                  documentContextForPlanning,
                  requestId
                );
                enhancedMessages = result.messages;
                researchFailed = result.failed;
                
                if (!researchFailed && !abortSignal?.aborted) {
                  if (result.skipped) {
                    await releaseDeepResearchReservation();
                  } else {
                    deepResearchReservationActive = false;
                    if (reservedUsageInfo) {
                      try {
                        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({
                          type: 'usage_updated',
                          usageCount: reservedUsageInfo.usageCount,
                          remaining: reservedUsageInfo.remaining,
                          limit: reservedUsageInfo.limit,
                        })}\n\n`));
                      } catch {
                        console.error('[Stream Handler] Could not send usage update event (controller closed)');
                      }
                    }
                  }

                  if (result.finalResponse) {
                    try {
                      controller.enqueue(encodeChatChunk(result.finalResponse));
                      controller.enqueue(encodeDone());
                    } catch {
                      console.error('[Stream Handler] Could not enqueue direct research response (controller closed)');
                    }
                    safeClose();
                    await finishDeepResearchJob('completed', {
                      result: {
                        skipped: result.skipped,
                        finalResponse: Boolean(result.finalResponse),
                      },
                    });
                    return;
                  }
                }
              } catch (researchError) {
                console.error('[Stream Handler] ❌ Deep research execution error:', researchError);
                await releaseDeepResearchReservation();
                await finishDeepResearchJob('failed', {
                  error: researchError instanceof Error ? researchError.message : String(researchError),
                });
                try {
                  controller.enqueue(encodeChatChunk(TOOL_ERROR_MESSAGES.DEEP_RESEARCH.EXECUTION_ERROR));
                } catch {
                  console.error('[Stream Handler] Could not send error message (controller closed)');
                }
                researchFailed = true;
              }
            } catch (error) {
              console.error('[Stream Handler] ❌ Unexpected error during deep research flow:', error);
              await releaseDeepResearchReservation();
              await finishDeepResearchJob('failed', {
                error: error instanceof Error ? error.message : String(error),
              });
              try {
                controller.enqueue(encodeChatChunk(TOOL_ERROR_MESSAGES.DEEP_RESEARCH.TECHNICAL_ERROR));
              } catch {
                console.error('[Stream Handler] Could not send error message (controller closed)');
              }
            }
          }
        }
        
        if (abortSignal?.aborted) {
          await releaseDeepResearchReservation();
          await finishDeepResearchJob('failed', { error: 'aborted' });
          try {
            controller.enqueue(encodeChatChunk(TOOL_ERROR_MESSAGES.GENERAL.REQUEST_ABORTED));
          } catch (error) {
            logStreamWriteFailure('send aborted request fallback', error);
          }
          safeClose();
          return;
        }
        if (researchFailed) {
          await releaseDeepResearchReservation();
          await finishDeepResearchJob('failed', { error: 'research_failed_fallback' });
          try {
            controller.enqueue(encodeChatChunk(TOOL_ERROR_MESSAGES.DEEP_RESEARCH.FAILED_FALLBACK));
          } catch {
            console.error('[Stream Handler] Could not send error message (controller closed)');
            safeClose();
            return;
          }
        }

        if (!(await ensurePromptBudget())) {
          return;
        }
        
        const streamResponse = await withRetry(
          () =>
            openai.chat.completions.create(
              {
                model,
                messages: toOpenAIMessages(enhancedMessages),
                stream: true,
              },
              { signal: abortSignal }
            ),
          { signal: abortSignal }
        );
        
        for await (const chunk of streamResponse) {
          const text = chunk.choices[0]?.delta?.content || '';
          if (text) {
            try {
              controller.enqueue(encodeChatChunk(text));
            } catch {
              console.error('[Stream Handler] Could not enqueue chunk (controller closed)');
              break;
            }
          }
        }
        
        try {
          controller.enqueue(encodeDone());
        } catch {
          console.error('[Stream Handler] Could not enqueue done (controller closed)');
        }
        await finishDeepResearchJob('completed', {
          result: { continuedWithStandardCompletion: true },
        });
        safeClose();
      } catch (error) {
        if (error instanceof Error && (error.message.includes('aborted by user') || abortSignal?.aborted)) {
          console.error('🛑 [Stream Handler] Request aborted, closing stream cleanly');
          await releaseDeepResearchReservation();
          await finishDeepResearchJob('failed', { error: 'aborted' });
          try {
            controller.enqueue(encodeChatChunk(TOOL_ERROR_MESSAGES.GENERAL.REQUEST_ABORTED));
          } catch (error) {
            logStreamWriteFailure('send aborted request terminal message', error);
          }
          safeClose();
          return;
        }

        const { message } = parseOpenAIError(error);
        await releaseDeepResearchReservation();
        await finishDeepResearchJob('failed', { error: message });
        
        try {
          controller.enqueue(encodeError(message));
          controller.enqueue(encodeDone());
        } catch (error) {
          logStreamWriteFailure('send terminal stream error', error);
        }
        safeClose();
      }
    },
  };
}
