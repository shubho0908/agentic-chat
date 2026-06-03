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
import { checkTokenBudget } from '@/lib/chat/tokenBudget';
import { getChatReasoningEffort } from '@/lib/modelPolicy';
import { withRetry } from '@/lib/retry';
import { createSafeStream } from './safeStream';

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
      const stream = createSafeStream(controller, {
        abortSignal,
        label: "Stream Handler",
      });

      const finishStream = () => {
        stream.finish({ done: encodeDone() });
      };

      const abortStream = () => {
        stream.abort();
      };

      const emitMemoryStatus = async () => {
        stream.enqueue(encodeMemoryStatus(memoryStatusInfo));
        await Promise.resolve();
      };

      const ensurePromptBudget = async () => {
        const budgetCheck = checkTokenBudget(enhancedMessages, model);
        memoryStatusInfo.tokenUsage = budgetCheck.tokenUsage;

        if (budgetCheck.ok) {
          void emitMemoryStatus();
          return true;
        }

        await emitMemoryStatus();

        stream.enqueue(encodeError(budgetCheck.errorMessage ?? 'Request exceeds the server token budget.'));

        finishStream();
        return false;
      };
      
      try {
        if (abortSignal?.aborted) {
          abortStream();
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
              stream.enqueue(encodeToolProgress(
                  'document_retrieval',
                  'completed',
                  'Retrieved relevant document passages',
                  { citations: contextResult.metadata.citations }
              ));
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
          abortStream();
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
            if (abortSignal?.aborted) break;
            if (event.type === 'response.reasoning_summary_text.delta' || event.type === 'response.reasoning_text.delta') {
              if (!stream.enqueue(encodeThinkingChunk(event.delta))) {
                break;
              }
            } else if (event.type === 'response.output_text.delta') {
              if (!stream.enqueue(encodeChatChunk(event.delta))) {
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
            if (abortSignal?.aborted) break;
            const delta = chunk.choices[0]?.delta;
            const text = delta?.content || '';

            if (text) {
              if (!stream.enqueue(encodeChatChunk(text))) {
                break;
              }
            }
          }
        }

        if (abortSignal?.aborted) {
          abortStream();
          return;
        }

        finishStream();
      } catch (error) {
        if (
          abortSignal?.aborted ||
          (error instanceof Error && (error.name === 'AbortError' || error.message.includes('aborted by user')))
        ) {
          logger.warn('[Stream Handler] Request aborted by user');
          abortStream();
          return;
        }

        const { message } = parseOpenAIError(error);

        stream.enqueue(encodeError(message));
        finishStream();
      }
    },
  };
}
