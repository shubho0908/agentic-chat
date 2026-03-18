import { NextRequest } from 'next/server';
import { headers } from 'next/headers';
import { getAuthenticatedUser, errorResponse } from '@/lib/apiUtils';
import { prisma } from '@/lib/prisma';
import { decryptApiKey } from '@/lib/encryption';
import OpenAI from 'openai';
import { API_ERROR_MESSAGES, HTTP_STATUS } from '@/constants/errors';
import { validateChatMessages } from '@/lib/validation';
import { parseOpenAIError } from '@/lib/openaiErrors';
import { routeContext } from '@/lib/contextRouter';
import type { MemoryStatus } from '@/types/chat';
import type { Message } from '@/lib/schemas/chat';
import { injectContextToMessages } from '@/lib/chat/messageHelpers';
import { createChatStreamHandler } from '@/lib/chat/streamHandler';
import { wrapOpenAIWithLangSmith, withTrace } from '@/lib/langsmithConfig';
import { createRequestId, logError, logWarn } from '@/lib/observability';
import { validateRequestedModel } from '@/lib/modelPolicy';
import { withRetry } from '@/lib/retry';
import { checkTokenBudget } from '@/lib/chat/tokenBudget';
import { parseToolId } from '@/lib/tools/config';
import { logger } from "@/lib/logger";
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes for deep research & google suite tools

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
    const body = await request.json();
    
    const { model, messages, stream = true, conversationId, activeTool, memoryEnabled = true, deepResearchEnabled = false, searchDepth = 'basic' } = body;
    const sanitizedActiveTool =
      typeof activeTool === 'string' ? parseToolId(activeTool) : null;

    if (typeof activeTool === 'string' && !sanitizedActiveTool) {
      logWarn({
        event: 'chat_invalid_active_tool_ignored',
        requestId,
        conversationId,
        requestedTool: activeTool,
      });
    }
    
    if (!model || typeof model !== 'string') {
      return errorResponse(API_ERROR_MESSAGES.MODEL_REQUIRED, undefined, HTTP_STATUS.BAD_REQUEST);
    }
    const validatedModel = validateRequestedModel(model);
    if (!validatedModel) {
      return errorResponse('Unsupported model requested', undefined, HTTP_STATUS.BAD_REQUEST);
    }

    const validation = validateChatMessages(messages);
    if (!validation.valid) {
      return errorResponse(validation.error || 'Invalid messages', undefined, HTTP_STATUS.BAD_REQUEST);
    }

    let enhancedMessages = messages;
    let memoryStatusInfo: MemoryStatus = { 
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
    
    try {
      const lastUserMessage = messages[messages.length - 1]?.content || '';

      const contextResult = await withTrace(
        'context-routing',
        async () => {
          return await routeContext(
            lastUserMessage,
            authUser.id,
            messages.slice(0, -1) as Message[],
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

    const openai = wrapOpenAIWithLangSmith(new OpenAI({ apiKey }));

    if (stream) {
      const abortController = new AbortController();
      
      const streamHandler = createChatStreamHandler({
        memoryStatusInfo,
        messages,
        activeTool: sanitizedActiveTool,
        enhancedMessages,
        model: validatedModel,
        openai,
        apiKey,
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
      if (sanitizedActiveTool || deepResearchEnabled) {
        return errorResponse(
          'Non-stream responses do not support tool execution or deep research. Retry with streaming enabled.',
          undefined,
          HTTP_STATUS.BAD_REQUEST
        );
      }

      const completion = await withRetry(
        () =>
          openai.chat.completions.create(
            {
              model: validatedModel,
              messages: enhancedMessages,
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
