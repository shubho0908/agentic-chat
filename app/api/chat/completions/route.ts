import { NextRequest } from 'next/server';
import { headers } from 'next/headers';
import { getAuthenticatedUser, errorResponse } from '@/lib/api-utils';
import { prisma } from '@/lib/prisma';
import { decryptApiKey } from '@/lib/encryption';
import OpenAI from 'openai';
import { API_ERROR_MESSAGES, HTTP_STATUS } from '@/constants/errors';
import { validateChatMessages } from '@/lib/validation';
import { parseOpenAIError } from '@/lib/openai-errors';
import { getMemoryContext } from '@/lib/memory-conversation-context';
import { getRAGContext } from '@/lib/rag/retrieval/context';
import type { Message } from '@/lib/schemas/chat';

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

    const { model, messages, stream = true, conversationId } = body;

    if (!model || typeof model !== 'string') {
      return errorResponse('Model is required and must be a string', undefined, HTTP_STATUS.BAD_REQUEST);
    }

    const validation = validateChatMessages(messages);
    if (!validation.valid) {
      return errorResponse(validation.error || 'Invalid messages', undefined, HTTP_STATUS.BAD_REQUEST);
    }

    let enhancedMessages = messages;
    try {
      const lastUserMessage = messages[messages.length - 1]?.content || '';
      let contextToAdd = '';
      
      if (lastUserMessage) {
        const memoryContext = await getMemoryContext(
          lastUserMessage,
          authUser.id,
          messages.slice(0, -1) as Message[],
          conversationId
        );

        if (memoryContext) {
          contextToAdd += memoryContext;
        }

        const ragContext = await getRAGContext(
          typeof lastUserMessage === 'string' ? lastUserMessage : JSON.stringify(lastUserMessage),
          authUser.id,
          {
            conversationId,
            limit: 5,
            scoreThreshold: 0.7,
            waitForProcessing: true,
            maxWaitTime: 30000,
          }
        );

        if (ragContext) {
          contextToAdd += ragContext;
        }

        if (contextToAdd) {
          const systemMessageIndex = enhancedMessages.findIndex((m: Message) => m.role === 'system');
          
          if (systemMessageIndex >= 0) {
            enhancedMessages = [...enhancedMessages];
            enhancedMessages[systemMessageIndex] = {
              ...enhancedMessages[systemMessageIndex],
              content: enhancedMessages[systemMessageIndex].content + contextToAdd
            };
          } else {
            enhancedMessages = [
              { role: 'system', content: contextToAdd },
              ...enhancedMessages
            ];
          }
        }
      }
    } catch {
      // Context fetch failed, continue without it
    }

    const openai = new OpenAI({ apiKey });

    if (stream) {
      const streamResponse = await openai.chat.completions.create({
        model,
        messages: enhancedMessages,
        stream: true,
      });

      const encoder = new TextEncoder();
      const readableStream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of streamResponse) {
              const text = chunk.choices[0]?.delta?.content || '';
              if (text) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: text })}\n\n`));
              }
            }
            
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          } catch (error) {
            const { message } = parseOpenAIError(error);
            
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`));
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            } catch {
              // Failed to send error to client
            }
            controller.close();
          }
        },
      });

      return new Response(readableStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
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
