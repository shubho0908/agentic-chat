import type OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { Message } from '@/lib/schemas/chat';
import type { MemoryStatus } from '@/types/chat';
import type { SearchDepth } from '@/lib/schemas/webSearchTools';
import type { ToolId } from '@/lib/tools/config';
import { routeContext } from '@/lib/contextRouter';
import { TOOL_IDS } from '@/lib/tools/config';
import { parseOpenAIError } from '@/lib/openaiErrors';
import { injectContextToMessages } from '@/lib/chat/messageHelpers';
import { extractTextFromMessage } from './messageContent';
import { executeWebSearchTool, executeGoogleSuiteTool } from './toolExecutors';
import {
  encodeMemoryStatus,
  encodeChatChunk,
  encodeError,
  encodeDone,
} from './streamingHelpers';
import { TOOL_ERROR_MESSAGES } from '@/constants/errors';
import { checkTokenBudget } from '@/lib/chat/tokenBudget';
import { getChatReasoningEffort } from '@/lib/modelPolicy';
import { withRetry } from '@/lib/retry';

import { logger } from "@/lib/logger";
interface StreamHandlerOptions {
  memoryStatusInfo: MemoryStatus;
  messages: Message[];
  sanitizedActiveTool?: ToolId | null;
  model: string;
  openai: OpenAI;
  apiKey: string;
  memoryEnabled?: boolean;
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
  logger.warn(`[Stream Handler] Failed to ${context}:`, error);
}

export function createChatStreamHandler(options: StreamHandlerOptions) {
  const {
    apiKey,
    abortSignal,
    conversationId,
    memoryEnabled = true,
    messages,
    model,
    openai,
    sanitizedActiveTool,
    searchDepth = 'basic',
    userId,
  } = options;
  let memoryStatusInfo: MemoryStatus = { ...options.memoryStatusInfo };
  let enhancedMessages = messages;

  return {
    async start(controller: ReadableStreamDefaultController) {
      let streamClosed = false;
      
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

      const emitMemoryStatus = async () => {
        try {
          controller.enqueue(encodeMemoryStatus(memoryStatusInfo, sanitizedActiveTool));
          await new Promise((resolve) => setImmediate(resolve));
        } catch (error) {
          logStreamWriteFailure('send memory status', error);
        }
      };

      const ensurePromptBudget = async () => {
        const budgetCheck = checkTokenBudget(enhancedMessages, model);
        memoryStatusInfo.tokenUsage = budgetCheck.tokenUsage;
        await emitMemoryStatus();

        if (budgetCheck.ok) {
          return true;
        }

        try {
          controller.enqueue(encodeError(budgetCheck.errorMessage ?? 'Request exceeds the server token budget.'));
          controller.enqueue(encodeDone());
        } catch (error) {
          logStreamWriteFailure('send prompt budget error', error);
        }

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

        const lastUserMessage = messages[messages.length - 1]?.content || '';
        await emitMemoryStatus();

        try {
          if (userId) {
            const contextResult = await routeContext(
              lastUserMessage,
              userId,
              messages.slice(0, -1),
              conversationId,
              sanitizedActiveTool,
              memoryEnabled,
              { apiKey }
            );

            memoryStatusInfo = {
              ...memoryStatusInfo,
              ...contextResult.metadata,
            };

            if (contextResult.context) {
              enhancedMessages = injectContextToMessages(enhancedMessages, contextResult.context, model);
            }
          }
        } catch (error) {
          logger.error('[Stream Handler] Context routing failed:', error);
          memoryStatusInfo.degradedContexts = [
            ...(memoryStatusInfo.degradedContexts || []),
            {
              source: 'context_router',
              reason: error instanceof Error ? error.message : String(error),
            },
          ];
        }

        if (!(await ensurePromptBudget())) {
          return;
        }

        const textQuery = extractTextFromMessage(lastUserMessage);
        
        if (sanitizedActiveTool === TOOL_IDS.WEB_SEARCH) {
          enhancedMessages = await executeWebSearchTool(
            textQuery,
            controller,
            enhancedMessages,
            apiKey,
            model,
            abortSignal,
            searchDepth,
            messages
          );
          if (!(await ensurePromptBudget())) {
            return;
          }
        }

        if (sanitizedActiveTool === TOOL_IDS.GOOGLE_SUITE) {
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
        
        if (abortSignal?.aborted) {
          try {
            controller.enqueue(encodeChatChunk(TOOL_ERROR_MESSAGES.GENERAL.REQUEST_ABORTED));
          } catch (error) {
            logStreamWriteFailure('send aborted request fallback', error);
          }
          safeClose();
          return;
        }

        if (!(await ensurePromptBudget())) {
          return;
        }
        
        const reasoningEffort = getChatReasoningEffort(model);
        const streamResponse = await withRetry(
          () =>
            openai.chat.completions.create(
              {
                model,
                messages: toOpenAIMessages(enhancedMessages),
                stream: true,
                ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
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
              logger.error('[Stream Handler] Could not enqueue chunk (controller closed)');
              break;
            }
          }
        }
        
        try {
          controller.enqueue(encodeDone());
        } catch {
          logger.error('[Stream Handler] Could not enqueue done (controller closed)');
        }
        safeClose();
      } catch (error) {
        if (error instanceof Error && (error.message.includes('aborted by user') || abortSignal?.aborted)) {
          logger.error('🛑 [Stream Handler] Request aborted, closing stream cleanly');
          try {
            controller.enqueue(encodeChatChunk(TOOL_ERROR_MESSAGES.GENERAL.REQUEST_ABORTED));
          } catch (error) {
            logStreamWriteFailure('send aborted request terminal message', error);
          }
          safeClose();
          return;
        }

        const { message } = parseOpenAIError(error);
        
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
