import type OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
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
import { incrementDeepResearchUsage } from '@/lib/deep-research-usage';
import { TOOL_ERROR_MESSAGES } from '@/constants/errors';

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
}

function toOpenAIMessages(messages: Message[]): ChatCompletionMessageParam[] {
  return messages as ChatCompletionMessageParam[];
}

export function createChatStreamHandler(options: StreamHandlerOptions) {
  const { memoryStatusInfo, messages, activeTool, model, openai, apiKey, deepResearchEnabled, abortSignal, userId } = options;
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
              
              try {
                const result = await executeDeepResearchTool(textQuery, controller, enhancedMessages, apiKey, model, true, abortSignal);
                enhancedMessages = result.messages;
                researchFailed = result.failed;
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
              if (error instanceof Error && error.message.includes('limit reached')) {
                try {
                  controller.enqueue(encodeChatChunk(TOOL_ERROR_MESSAGES.DEEP_RESEARCH.RATE_LIMIT));
                } catch {
                  console.error('[Stream Handler] Could not send rate limit message (controller closed)');
                }
              } else {
                console.error('[Stream Handler] ❌ Unexpected error during deep research flow:', error);
                try {
                  controller.enqueue(encodeChatChunk(TOOL_ERROR_MESSAGES.DEEP_RESEARCH.TECHNICAL_ERROR));
                } catch {
                  console.error('[Stream Handler] Could not send error message (controller closed)');
                }
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
