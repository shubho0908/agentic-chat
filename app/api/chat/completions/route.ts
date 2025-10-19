import { NextRequest } from 'next/server';
import { headers } from 'next/headers';
import { getAuthenticatedUser, errorResponse } from '@/lib/api-utils';
import { prisma } from '@/lib/prisma';
import { decryptApiKey } from '@/lib/encryption';
import OpenAI from 'openai';
import { API_ERROR_MESSAGES, HTTP_STATUS } from '@/constants/errors';
import { validateChatMessages } from '@/lib/validation';
import { parseOpenAIError } from '@/lib/openai-errors';
import { routeContext } from '@/lib/context-router';
import { RoutingDecision, type MemoryStatus } from '@/types/chat';
import type { Message } from '@/lib/schemas/chat';
import { injectContextToMessages } from '@/lib/chat/message-helpers';
import { createChatStreamHandler } from '@/lib/chat/stream-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes for deep research & google suite tools

export async function POST(request: NextRequest) {
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
    
    if (!model || typeof model !== 'string') {
      return errorResponse(API_ERROR_MESSAGES.MODEL_REQUIRED, undefined, HTTP_STATUS.BAD_REQUEST);
    }

    const validation = validateChatMessages(messages);
    if (!validation.valid) {
      return errorResponse(validation.error || 'Invalid messages', undefined, HTTP_STATUS.BAD_REQUEST);
    }

    let enhancedMessages = messages;
    let memoryStatusInfo: MemoryStatus = { 
      hasMemories: false, 
      hasDocuments: false, 
      memoryCount: 0, 
      documentCount: 0,
      hasImages: false,
      imageCount: 0,
      hasUrls: false,
      urlCount: 0,
      routingDecision: RoutingDecision.MemoryOnly,
      skippedMemory: false,
    };
    
    try {
      const lastUserMessage = messages[messages.length - 1]?.content || '';
      
      const { context, metadata } = await routeContext(
        lastUserMessage,
        authUser.id,
        messages.slice(0, -1) as Message[],
        conversationId,
        activeTool,
        memoryEnabled,
        deepResearchEnabled
      );

      memoryStatusInfo = metadata;
      
      if (context) {
        enhancedMessages = injectContextToMessages(enhancedMessages, context);
      }
    } catch (error) {
      console.error('[Context Routing Error]', error);
    }

    const openai = new OpenAI({ apiKey });

    if (stream) {
      const abortController = new AbortController();
      
      const streamHandler = createChatStreamHandler({
        memoryStatusInfo,
        messages,
        activeTool,
        enhancedMessages,
        model,
        openai,
        apiKey,
        deepResearchEnabled,
        abortSignal: abortController.signal,
        userId: authUser.id,
        conversationId,
        searchDepth,
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
      const completion = await openai.chat.completions.create({
        model,
        messages: enhancedMessages,
        stream: false,
      });

      return new Response(
        JSON.stringify(completion),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    const { message, statusCode } = parseOpenAIError(error);
    return errorResponse(message, undefined, statusCode);
  }
}
