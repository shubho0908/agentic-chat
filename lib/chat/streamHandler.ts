import type OpenAI from 'openai';
import type {
  ChatCompletionContentPart,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import type {
  ResponseInputItem,
  ResponseInputMessageContentList,
} from 'openai/resources/responses/responses';
import type { Message, MessageContentPart } from '@/lib/schemas/chat';
import { MessageRole } from '@/lib/schemas/chat';
import type { MemoryStatus } from '@/types/chat';
import { routeContext } from '@/lib/contextRouter';
import { parseOpenAIError } from '@/lib/openaiErrors';
import { injectContextToMessages } from '@/lib/chat/messageHelpers';
import { extractTextFromMessage } from './messageContent';
import {
  encodeMemoryStatus,
  encodeChatChunk,
  encodeError,
  encodeDone,
  encodeThinkingChunk,
  encodeToolProgress,
} from './streamingHelpers';
import { TOOL_ERROR_MESSAGES } from '@/constants/errors';
import { checkTokenBudget } from '@/lib/chat/tokenBudget';
import { getChatReasoningEffort } from '@/lib/modelPolicy';
import { withRetry } from '@/lib/retry';

import { logger } from "@/lib/logger";
interface StreamHandlerOptions {
  memoryStatusInfo: MemoryStatus;
  messages: Message[];
  model: string;
  openai: OpenAI;
  apiKey: string;
  memoryEnabled?: boolean;
  abortSignal?: AbortSignal;
  userId?: string;
  conversationId?: string;
  requestId?: string;
  thinkingEnabled?: boolean;
}

function toChatCompletionContentPart(part: MessageContentPart): ChatCompletionContentPart {
  if (part.type === 'text') {
    return { type: 'text', text: part.text };
  }

  return {
    type: 'image_url',
    image_url: {
      url: part.image_url.url,
    },
  };
}

function toResponseInputContentPart(part: MessageContentPart): ResponseInputMessageContentList[number] {
  if (part.type === 'text') {
    return { type: 'input_text', text: part.text };
  }

  return {
    type: 'input_image',
    image_url: part.image_url.url,
    detail: 'auto',
  };
}

function toTextContent(content: Message['content']): string {
  return extractTextFromMessage(content);
}

export function toOpenAIChatMessages(messages: Message[]): ChatCompletionMessageParam[] {
  return messages.map(({ role, content }) => {
    if (role === MessageRole.USER) {
      return {
        role,
        content: typeof content === 'string'
          ? content
          : content.map(toChatCompletionContentPart),
      };
    }

    return {
      role,
      content: toTextContent(content),
    };
  });
}

function toOpenAIResponseInput(messages: Message[]): ResponseInputItem[] {
  return messages.map(({ role, content }) => ({
    type: 'message',
    role,
    content: typeof content === 'string'
      ? content
      : content.map(toResponseInputContentPart),
  }));
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
    userId,
    thinkingEnabled = false,
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
          controller.enqueue(encodeMemoryStatus(memoryStatusInfo));
          await new Promise((resolve) => setImmediate(resolve));
        } catch (error) {
          logStreamWriteFailure('send memory status', error);
        }
      };

      const ensurePromptBudget = async () => {
        const budgetCheck = checkTokenBudget(enhancedMessages, model);
        memoryStatusInfo.tokenUsage = budgetCheck.tokenUsage;

        if (budgetCheck.ok) {
          void emitMemoryStatus();
          return true;
        }

        await emitMemoryStatus();

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
              null,
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

            if (contextResult.metadata.citations?.length) {
              try {
                controller.enqueue(encodeToolProgress(
                  'document_retrieval',
                  'completed',
                  'Retrieved relevant document passages',
                  { citations: contextResult.metadata.citations }
                ));
              } catch (error) {
                logStreamWriteFailure('send document retrieval progress', error);
              }
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

        if (abortSignal?.aborted) {
          try {
            controller.enqueue(encodeChatChunk(TOOL_ERROR_MESSAGES.GENERAL.REQUEST_ABORTED));
          } catch (error) {
            logStreamWriteFailure('send aborted request fallback', error);
          }
          safeClose();
          return;
        }
        
        const reasoningEffort = getChatReasoningEffort(model, thinkingEnabled);

        if (thinkingEnabled && reasoningEffort && reasoningEffort !== 'none') {
          const responseStream = await withRetry(
            () =>
              openai.responses.create(
                {
                  model,
                  input: toOpenAIResponseInput(enhancedMessages),
                  stream: true,
                  reasoning: { effort: reasoningEffort, summary: 'detailed' },
                },
                { signal: abortSignal }
              ),
            { signal: abortSignal }
          );

          for await (const event of responseStream) {
            if (event.type === 'response.reasoning_summary_text.delta' || event.type === 'response.reasoning_text.delta') {
              try {
                controller.enqueue(encodeThinkingChunk(event.delta));
              } catch (error) {
                logStreamWriteFailure('send thinking chunk', error);
              }
            } else if (event.type === 'response.output_text.delta') {
              try {
                controller.enqueue(encodeChatChunk(event.delta));
              } catch (error) {
                logStreamWriteFailure('send response chunk', error);
                break;
              }
            }
          }
        } else {
          const streamResponse = await withRetry(
            () =>
              openai.chat.completions.create(
                {
                  model,
                  messages: toOpenAIChatMessages(enhancedMessages),
                  stream: true,
                  ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
                },
                { signal: abortSignal }
              ),
            { signal: abortSignal }
          );

          for await (const chunk of streamResponse) {
            const delta = chunk.choices[0]?.delta;
            const text = delta?.content || '';

            if (text) {
              try {
                controller.enqueue(encodeChatChunk(text));
              } catch (error) {
                logStreamWriteFailure('send chat chunk', error);
                break;
              }
            }
          }
        }
        
        try {
          controller.enqueue(encodeDone());
        } catch (error) {
          logStreamWriteFailure('send done marker', error);
        }
        safeClose();
      } catch (error) {
        if (error instanceof Error && (error.message.includes('aborted by user') || abortSignal?.aborted)) {
          logger.warn('[Stream Handler] Request aborted, closing stream cleanly');
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
