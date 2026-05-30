import { NextRequest } from 'next/server';
import { headers } from 'next/headers';
import { getAuthenticatedUser, errorResponse } from '@/lib/apiUtils';
import { prisma } from '@/lib/prisma';
import { decryptApiKey } from '@/lib/encryption';
import OpenAI from 'openai';
import { API_ERROR_MESSAGES, HTTP_STATUS } from '@/constants/errors';

const openaiClientCache = new Map<string, OpenAI>();
function getOpenAIClient(apiKey: string): OpenAI {
  let client = openaiClientCache.get(apiKey);
  if (!client) {
    client = new OpenAI({ apiKey });
    openaiClientCache.set(apiKey, client);
  }
  return client;
}
import { validateChatMessages } from '@/lib/validation';
import { parseOpenAIError } from '@/lib/openaiErrors';
import type { MemoryStatus } from '@/types/chat';
import { createChatStreamHandler, toOpenAIChatMessages } from '@/lib/chat/streamHandler';
import { wrapOpenAIWithLangSmith, withTrace } from '@/lib/langsmithConfig';
import { createRequestId, logError, logWarn } from '@/lib/observability';
import { validateRequestedModel, getChatReasoningEffort } from '@/lib/modelPolicy';
import { withRetry } from '@/lib/retry';
import { checkTokenBudget } from '@/lib/chat/tokenBudget';
import { logger } from "@/lib/logger";
import { isRecord } from '@/lib/typeGuards';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function parseOptionalBoolean(
  value: unknown,
  fieldName: string,
  defaultValue: boolean,
): { success: true; value: boolean } | { success: false; error: string } {
  if (value === undefined) {
    return { success: true, value: defaultValue };
  }

  if (typeof value !== 'boolean') {
    return { success: false, error: `${fieldName} must be a boolean` };
  }

  return { success: true, value };
}

export async function POST(request: NextRequest) {
  const requestId = createRequestId('chat');
  try {
    const { user: authUser, error } = await getAuthenticatedUser(await headers());
    if (error) {
      return error;
    }
    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { encryptedApiKey: true },
    });

    if (!user?.encryptedApiKey) {
      return errorResponse(API_ERROR_MESSAGES.API_KEY_NOT_CONFIGURED, undefined, HTTP_STATUS.BAD_REQUEST);
    }

    const apiKey = decryptApiKey(user.encryptedApiKey);
    let rawBody: unknown;

    try {
      rawBody = await request.json();
    } catch {
      return errorResponse('Request body must be valid JSON.', undefined, HTTP_STATUS.BAD_REQUEST);
    }

    if (!isRecord(rawBody)) {
      return errorResponse('Request body must be a JSON object.', undefined, HTTP_STATUS.BAD_REQUEST);
    }

    const body = rawBody;
    const { model, messages } = body;
    const conversationId =
      body.conversationId === undefined || body.conversationId === null
        ? undefined
        : typeof body.conversationId === 'string'
          ? body.conversationId.trim() || undefined
          : null;

    if (conversationId === null) {
      return errorResponse('conversationId must be a string when provided.', undefined, HTTP_STATUS.BAD_REQUEST);
    }

    const streamResult = parseOptionalBoolean(body.stream, 'stream', true);
    if (!streamResult.success) {
      return errorResponse(streamResult.error, undefined, HTTP_STATUS.BAD_REQUEST);
    }
    const stream = streamResult.value;

    const memoryEnabledResult = parseOptionalBoolean(body.memoryEnabled, 'memoryEnabled', true);
    if (!memoryEnabledResult.success) {
      return errorResponse(memoryEnabledResult.error, undefined, HTTP_STATUS.BAD_REQUEST);
    }

    const memoryEnabled = memoryEnabledResult.value;

    const thinkingEnabledResult = parseOptionalBoolean(body.thinkingEnabled, 'thinkingEnabled', false);
    if (!thinkingEnabledResult.success) {
      return errorResponse(thinkingEnabledResult.error, undefined, HTTP_STATUS.BAD_REQUEST);
    }
    const thinkingEnabled = thinkingEnabledResult.value;

    if (typeof model !== 'string' || !model.trim()) {
      return errorResponse(API_ERROR_MESSAGES.MODEL_REQUIRED, undefined, HTTP_STATUS.BAD_REQUEST);
    }
    const validatedModel = validateRequestedModel(model.trim());
    if (!validatedModel) {
      return errorResponse('Unsupported model requested', undefined, HTTP_STATUS.BAD_REQUEST);
    }

    const validation = validateChatMessages(messages);
    if (!validation.valid) {
      return errorResponse(validation.error || 'Invalid messages', undefined, HTTP_STATUS.BAD_REQUEST);
    }

    const validatedMessages = validation.messages;
    const baseMemoryStatusInfo: MemoryStatus = {
      hasMemories: false, 
      attemptedMemory: false,
      hasDocuments: false, 
      memoryCount: 0, 
      documentCount: 0,
      hasImages: false,
      imageCount: 0,
      hasUrls: false,
      urlCount: 0,
      skippedMemory: false,
    };

    const openai = wrapOpenAIWithLangSmith(getOpenAIClient(apiKey));

    if (stream) {
      const abortController = new AbortController();
      
      const streamHandler = createChatStreamHandler({
        messages: validatedMessages,
        memoryStatusInfo: baseMemoryStatusInfo,
        model: validatedModel,
        openai,
        apiKey,
        memoryEnabled,
        abortSignal: abortController.signal,
        userId: authUser.id,
        conversationId,
        requestId,
        thinkingEnabled,
      });
      const readableStream = new ReadableStream({
        ...streamHandler,
        cancel() {
          abortController.abort();
        },
      }, {
        highWaterMark: 1,
      });

      return new Response(readableStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      });
    } else {
      let enhancedMessages = validatedMessages;
      let memoryStatusInfo: MemoryStatus = { ...baseMemoryStatusInfo };

      try {
        const { routeContext } = await import('@/lib/contextRouter');
        const { injectContextToMessages } = await import('@/lib/chat/messageHelpers');
        const lastUserMessage = validatedMessages[validatedMessages.length - 1]?.content || '';

        const contextResult = await withTrace(
          'context-routing',
          async () => {
            return await routeContext(
              lastUserMessage,
              authUser.id,
              validatedMessages.slice(0, -1),
              conversationId,
              null,
              memoryEnabled,
              { apiKey }
            );
          },
          {
            userId: authUser.id,
            conversationId,
            memoryEnabled,
            model: validatedModel,
          }
        );

        memoryStatusInfo = contextResult.metadata;

        if (contextResult.context) {
          enhancedMessages = injectContextToMessages(enhancedMessages, contextResult.context, validatedModel);
        }
      } catch (error) {
        logger.error('[Context Routing Error]', error);
        memoryStatusInfo.degradedContexts = [
          ...(memoryStatusInfo.degradedContexts || []),
          {
            source: 'context_router',
            reason: error instanceof Error ? error.message : String(error),
          },
        ];
      }

      try {
        const budgetCheck = checkTokenBudget(enhancedMessages, validatedModel);
        memoryStatusInfo.tokenUsage = budgetCheck.tokenUsage;
        if (!budgetCheck.ok) {
          logWarn({
            event: 'chat_request_rejected_budget',
            requestId,
            model: validatedModel,
            usedTokens: budgetCheck.tokenUsage.used,
            limit: budgetCheck.tokenUsage.limit,
            reserve: budgetCheck.tokenUsage.responseReserve,
          });
          return errorResponse(
            budgetCheck.errorMessage ?? 'Request exceeds the server token budget. Please shorten the conversation or attachments and try again.',
            undefined,
            HTTP_STATUS.BAD_REQUEST
          );
        }
      } catch (error) {
        logError({
          event: 'token_count_failed',
          requestId,
          error: error instanceof Error ? error.message : String(error),
        });
        memoryStatusInfo.tokenUsage = undefined;
        return errorResponse(
          'Unable to validate request size. Please try again.',
          undefined,
          HTTP_STATUS.BAD_REQUEST
        );
      }

      const reasoningEffort = getChatReasoningEffort(validatedModel, thinkingEnabled);
      const completion = await withRetry(
        () =>
          openai.chat.completions.create(
            {
              model: validatedModel,
              messages: toOpenAIChatMessages(enhancedMessages),
              stream: false,
              ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
            },
            { signal: request.signal }
          ),
        { signal: request.signal }
      );

      return new Response(
        JSON.stringify(completion),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    logError({
      event: 'chat_route_failed',
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });
    const { message, statusCode } = parseOpenAIError(error);
    return errorResponse(message, undefined, statusCode);
  }
}
