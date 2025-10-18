import type OpenAI from 'openai';
import type { ChatCompletionMessageParam, ChatCompletionContentPart } from 'openai/resources/chat/completions';
import type { Message } from '@/lib/schemas/chat';
import type { MemoryStatus } from '@/types/chat';
import { TOOL_IDS } from '@/lib/tools/config';
import { parseOpenAIError } from '@/lib/openai-errors';
import { extractTextFromMessage } from './message-helpers';
import { executeWebSearchTool, executeYouTubeTool, executeDeepResearchTool, executeGoogleSuiteTool } from './tool-executors';
import {
  encodeMemoryStatus,
  encodeChatChunk,
  encodeError,
  encodeDone,
  shouldSendMemoryStatus,
} from './streaming-helpers';
import { incrementDeepResearchUsage, checkDeepResearchUsage } from '@/lib/deep-research-usage';
import { TOOL_ERROR_MESSAGES } from '@/constants/errors';
import { prisma } from '@/lib/prisma';
import { filterDocumentAttachments, partitionByStatus, extractIds } from '@/lib/rag/retrieval/status-helpers';
import { waitForDocumentProcessing } from '@/lib/rag/retrieval/status';
import { getRAGContext } from '@/lib/rag/retrieval/context';

export interface StreamHandlerOptions {
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
}

function toOpenAIMessages(messages: Message[]): ChatCompletionMessageParam[] {
  return messages as ChatCompletionMessageParam[];
}

export function createChatStreamHandler(options: StreamHandlerOptions) {
  const { memoryStatusInfo, messages, activeTool, model, openai, apiKey, deepResearchEnabled, abortSignal, userId, conversationId } = options;
  let { enhancedMessages } = options;

  return {
    async start(controller: ReadableStreamDefaultController) {
      let streamClosed = false;
      
      const safeClose = () => {
        if (!streamClosed) {
          try {
            controller.close();
            streamClosed = true;
          } catch {
            // Already closed
          }
        }
      };
      
      try {
        if (abortSignal?.aborted) {
          try {
            controller.enqueue(encodeChatChunk(TOOL_ERROR_MESSAGES.GENERAL.REQUEST_ABORTED));
          } catch {}
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
          enhancedMessages = await executeWebSearchTool(textQuery, controller, enhancedMessages, abortSignal);
        }
        
        if (activeTool === TOOL_IDS.YOUTUBE) {
          enhancedMessages = await executeYouTubeTool(textQuery, controller, enhancedMessages, abortSignal);
        }

        if (activeTool === TOOL_IDS.GOOGLE_SUITE) {
          if (!userId) {
            try {
              controller.enqueue(encodeChatChunk(TOOL_ERROR_MESSAGES.GOOGLE_SUITE.AUTH_REQUIRED));
            } catch {}
          } else {
            enhancedMessages = await executeGoogleSuiteTool(textQuery, controller, enhancedMessages, userId, apiKey, model, abortSignal);
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
              const usageInfo = await checkDeepResearchUsage(userId);
              if (!usageInfo.canUse) {
                const resetDate = new Date(usageInfo.resetDate);
                try {
                  controller.enqueue(encodeChatChunk(
                    `Deep research limit reached. You have used all ${usageInfo.limit} requests this month. Resets on ${resetDate.toLocaleDateString()}.`
                  ));
                } catch {
                  console.error('[Stream Handler] Could not send limit error message (controller closed)');
                }
                return;
              }
            } catch (usageCheckError) {
              console.error('[Stream Handler] Failed to check deep research usage:', usageCheckError);
              try {
                controller.enqueue(encodeChatChunk(TOOL_ERROR_MESSAGES.DEEP_RESEARCH.TECHNICAL_ERROR));
              } catch {
                console.error('[Stream Handler] Could not send error message (controller closed)');
              }
              return;
            }
            
            try {
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
                  }
                } catch (docContextError) {
                  console.error('[Stream Handler] Document context retrieval for planning error:', docContextError);
                  // Continue without document context for planning
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
                    
                    const visionResponse = await openai.chat.completions.create({
                      model: model.includes('vision') || model.includes('gpt-4') ? model : 'gpt-4o',
                      messages: visionMessages,
                      max_tokens: 2000,
                    });
                    
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
                  documentContextForPlanning
                );
                enhancedMessages = result.messages;
                researchFailed = result.failed;
                
                if (!researchFailed && !abortSignal?.aborted && !result.skipped) {
                  try {
                    const updatedUsage = await incrementDeepResearchUsage(userId);
                    try {
                      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({
                        type: 'usage_updated',
                        usageCount: updatedUsage.usageCount,
                        remaining: updatedUsage.remaining,
                        limit: updatedUsage.limit,
                      })}\n\n`));
                    } catch {
                      console.error('[Stream Handler] Could not send usage update event (controller closed)');
                    }
                  } catch (usageError) {
                    console.error('[Stream Handler] Failed to increment usage after successful research:', usageError);
                    // Continue anyway - research was successful, this is just a tracking issue
                  }
                }
              } catch (researchError) {
                console.error('[Stream Handler] ❌ Deep research execution error:', researchError);
                try {
                  controller.enqueue(encodeChatChunk(TOOL_ERROR_MESSAGES.DEEP_RESEARCH.EXECUTION_ERROR));
                } catch {
                  console.error('[Stream Handler] Could not send error message (controller closed)');
                }
                researchFailed = true;
              }
            } catch (error) {
              console.error('[Stream Handler] ❌ Unexpected error during deep research flow:', error);
              try {
                controller.enqueue(encodeChatChunk(TOOL_ERROR_MESSAGES.DEEP_RESEARCH.TECHNICAL_ERROR));
              } catch {
                console.error('[Stream Handler] Could not send error message (controller closed)');
              }
            }
          }
        }
        
        if (abortSignal?.aborted) {
          try {
            controller.enqueue(encodeChatChunk(TOOL_ERROR_MESSAGES.GENERAL.REQUEST_ABORTED));
          } catch {}
          safeClose();
          return;
        }
        if (researchFailed) {
          try {
            controller.enqueue(encodeChatChunk(TOOL_ERROR_MESSAGES.DEEP_RESEARCH.FAILED_FALLBACK));
          } catch {
            console.error('[Stream Handler] Could not send error message (controller closed)');
            safeClose();
            return;
          }
        }
        
        const streamResponse = await openai.chat.completions.create({
          model,
          messages: toOpenAIMessages(enhancedMessages),
          stream: true,
        });
        
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
        safeClose();
      } catch (error) {
        if (error instanceof Error && (error.message.includes('aborted by user') || abortSignal?.aborted)) {
          console.error('🛑 [Stream Handler] Request aborted, closing stream cleanly');
          try {
            controller.enqueue(encodeChatChunk(TOOL_ERROR_MESSAGES.GENERAL.REQUEST_ABORTED));
          } catch {}
          safeClose();
          return;
        }

        const { message } = parseOpenAIError(error);
        
        try {
          controller.enqueue(encodeError(message));
          controller.enqueue(encodeDone());
        } catch {}
        safeClose();
      }
    },
  };
}
