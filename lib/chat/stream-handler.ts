import type OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { Message } from '@/lib/schemas/chat';
import type { MemoryStatus } from '@/types/chat';
import { TOOL_IDS } from '@/lib/tools/config';
import { parseOpenAIError } from '@/lib/openai-errors';
import { extractTextFromMessage } from './message-helpers';
import { executeWebSearchTool, executeYouTubeTool, executeDeepResearchTool } from './tool-executors';
import {
  encodeMemoryStatus,
  encodeChatChunk,
  encodeError,
  encodeDone,
  shouldSendMemoryStatus,
} from './streaming-helpers';
import { incrementDeepResearchUsage } from '@/lib/deep-research-usage';

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
      try {
        if (abortSignal?.aborted) {
          try {
            controller.enqueue(encodeChatChunk('Request was aborted, please try again later.'));
          } catch {}
          controller.close();
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
        
        let researchFailed = false;
        if (deepResearchEnabled) {
          if (!userId) {
            console.error('[Stream Handler] ❌ SECURITY: No userId provided, rejecting deep research request');
            const errorMessage = `⚠️ Authentication error: Unable to verify your identity for deep research. Please refresh and try again.\n\n`;
            try {
              controller.enqueue(encodeChatChunk(errorMessage));
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
                const errorMessage = `⚠️ Unable to complete deep research. Let me answer based on my knowledge instead.\n\n`;
                try {
                  controller.enqueue(encodeChatChunk(errorMessage));
                } catch {
                  console.error('[Stream Handler] Could not send error message (controller closed)');
                }
                researchFailed = true;
              }
            } catch (error) {
              if (error instanceof Error && error.message.includes('limit reached')) {
                const limitMessage = `⚠️ **Deep Research Limit Reached**\n\nYou have used all your deep research requests for this month.\n\n📅 Your limit will reset at the beginning of next month.\n\nI'll answer your question using standard processing instead.\n\n---\n\n`;
                try {
                  controller.enqueue(encodeChatChunk(limitMessage));
                } catch {
                  console.error('[Stream Handler] Could not send rate limit message (controller closed)');
                }
              } else {
                console.error('[Stream Handler] ❌ Unexpected error during deep research flow:', error);
                const errorMessage = `⚠️ Unable to perform deep research at this time due to a technical issue. Let me answer based on my knowledge instead.\n\n`;
                try {
                  controller.enqueue(encodeChatChunk(errorMessage));
                } catch {
                  console.error('[Stream Handler] Could not send error message (controller closed)');
                }
              }
            }
          }
        }
        
        if (abortSignal?.aborted) {
          try {
            controller.enqueue(encodeChatChunk('Request was aborted, please try again later.'));
          } catch {}
          controller.close();
          return;
        }
        if (researchFailed) {
          const errorMessage = "I encountered an issue while conducting deep research. Let me provide an answer based on my knowledge instead.\n\n";
          try {
            controller.enqueue(encodeChatChunk(errorMessage));
          } catch {
            console.error('[Stream Handler] Could not send error message (controller closed)');
            controller.close();
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
          controller.close();
        } catch {
          console.error('[Stream Handler] Could not close (already closed)');
        }
      } catch (error) {
        if (error instanceof Error && (error.message.includes('aborted by user') || abortSignal?.aborted)) {
          console.error('🛑 [Stream Handler] Request aborted, closing stream cleanly');
          try {
            controller.enqueue(encodeChatChunk('Request was aborted, please try again later.'));
          } catch {}
          try {
            controller.close();
          } catch {}
          return;
        }

        const { message } = parseOpenAIError(error);
        
        try {
          controller.enqueue(encodeError(message));
          controller.enqueue(encodeDone());
        } catch {}
        controller.close();
      }
    },
  };
}
