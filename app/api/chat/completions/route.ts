import { NextRequest } from 'next/server';
import { headers } from 'next/headers';
import { getAuthenticatedUser, errorResponse } from '@/lib/apiUtils';
import { prisma } from '@/lib/prisma';
import { decryptApiKey } from '@/lib/encryption';
import OpenAI from 'openai';
import { API_ERROR_MESSAGES, HTTP_STATUS } from '@/constants/errors';
import { validateChatMessages } from '@/lib/validation';
import { parseOpenAIError } from '@/lib/openaiErrors';
import type { MemoryStatus } from '@/types/chat';
import type { Message } from '@/lib/schemas/chat';
import { createChatStreamHandler } from '@/lib/chat/streamHandler';
import { wrapOpenAIWithLangSmith, withTrace } from '@/lib/langsmithConfig';
import { createRequestId, logError, logWarn } from '@/lib/observability';
import { validateRequestedModel } from '@/lib/modelPolicy';
import { withRetry } from '@/lib/retry';
import { checkTokenBudget } from '@/lib/chat/tokenBudget';
import { parseToolId } from '@/lib/tools/config';
import { searchDepthEnum, type SearchDepth } from '@/lib/schemas/webSearchTools';
import { logger } from "@/lib/logger";
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes for deep research & google suite tools

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

    if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
      return errorResponse('Request body must be a JSON object.', undefined, HTTP_STATUS.BAD_REQUEST);
    }

    const body = rawBody as Record<string, unknown>;
    const { model, messages } = body;
    const conversationId =
      body.conversationId === undefined || body.conversationId === null
        ? undefined
        : typeof body.conversationId === 'string'
          ? body.conversationId.trim() || undefined
          : null;
    const activeTool =
      body.activeTool === undefined || body.activeTool === null
        ? null
        : typeof body.activeTool === 'string'
          ? body.activeTool
          : null;

    if (conversationId === null) {
      return errorResponse('conversationId must be a string when provided.', undefined, HTTP_STATUS.BAD_REQUEST);
    }

    if (
      body.activeTool !== undefined &&
      body.activeTool !== null &&
      typeof body.activeTool !== 'string'
    ) {
      return errorResponse('activeTool must be a string when provided.', undefined, HTTP_STATUS.BAD_REQUEST);
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

    const deepResearchEnabledResult = parseOptionalBoolean(body.deepResearchEnabled, 'deepResearchEnabled', false);
    if (!deepResearchEnabledResult.success) {
      return errorResponse(deepResearchEnabledResult.error, undefined, HTTP_STATUS.BAD_REQUEST);
    }
    const deepResearchEnabled = deepResearchEnabledResult.value;

    if (!stream && (deepResearchEnabled || activeTool)) {
      return errorResponse(
        'Non-stream responses do not support tool execution or deep research. Retry with streaming enabled.',
        undefined,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const parsedSearchDepth = searchDepthEnum.safeParse(body.searchDepth ?? 'basic');
    if (!parsedSearchDepth.success) {
      return errorResponse('searchDepth must be either "basic" or "advanced".', undefined, HTTP_STATUS.BAD_REQUEST);
    }

    const memoryEnabled = memoryEnabledResult.value;
    const searchDepth: SearchDepth = parsedSearchDepth.data;
    const sanitizedActiveTool = activeTool ? parseToolId(activeTool) : null;

    if (activeTool && !sanitizedActiveTool) {
      logWarn({
        event: 'chat_invalid_active_tool_ignored',
        requestId,
        conversationId,
        requestedTool: activeTool,
      });
    }
    
    if (typeof model !== 'string' || !model.trim()) {
      return errorResponse(API_ERROR_MESSAGES.MODEL_REQUIRED, undefined, HTTP_STATUS.BAD_REQUEST);
    }
    const validatedModel = validateRequestedModel(model.trim());
    if (!validatedModel) {
      return errorResponse('Unsupported model requested', undefined, HTTP_STATUS.BAD_REQUEST);
    }

    const validation = validateChatMessages(messages as Array<Record<string, unknown>>);
    if (!validation.valid) {
      return errorResponse(validation.error || 'Invalid messages', undefined, HTTP_STATUS.BAD_REQUEST);
    }

    const validatedMessages = messages as Message[];
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

    const openai = wrapOpenAIWithLangSmith(new OpenAI({ apiKey }));

    if (stream) {
      const abortController = new AbortController();
      
      const streamHandler = createChatStreamHandler({
        messages: validatedMessages,
        sanitizedActiveTool,
        memoryStatusInfo: baseMemoryStatusInfo,
        model: validatedModel,
        openai,
        apiKey,
        memoryEnabled,
        deepResearchEnabled,
        abortSignal: abortController.signal,
        userId: authUser.id,
        conversationId,
        searchDepth,
        requestId,
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
              sanitizedActiveTool,
              memoryEnabled,
              deepResearchEnabled,
              { apiKey }
            );
          },
          {
            userId: authUser.id,
            conversationId,
            activeTool: sanitizedActiveTool,
            memoryEnabled,
            deepResearchEnabled,
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

      const completion = await withRetry(
        () =>
          openai.chat.completions.create(
            {
              model: validatedModel,
              messages: enhancedMessages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
              stream: false,
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
