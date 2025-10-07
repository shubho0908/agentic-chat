import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { decryptApiKey } from '@/lib/encryption';
import { headers } from 'next/headers';
import OpenAI from 'openai';
import { API_ERROR_MESSAGES, HTTP_STATUS } from '@/constants/errors';
import { validateChatMessages } from '@/lib/validation';
import { parseOpenAIError } from '@/lib/openai-errors';

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    
    if (!session?.user) {
      return new Response(
        JSON.stringify({ error: API_ERROR_MESSAGES.UNAUTHORIZED }),
        { status: HTTP_STATUS.UNAUTHORIZED, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { encryptedApiKey: true },
    });

    if (!user?.encryptedApiKey) {
      return new Response(
        JSON.stringify({ error: API_ERROR_MESSAGES.API_KEY_NOT_CONFIGURED }),
        { status: HTTP_STATUS.BAD_REQUEST, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = decryptApiKey(user.encryptedApiKey);
    const body = await request.json();

    const { model, messages, stream = true } = body;

    if (!model || typeof model !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Model is required and must be a string' }),
        { status: HTTP_STATUS.BAD_REQUEST, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const validation = validateChatMessages(messages);
    if (!validation.valid) {
      return new Response(
        JSON.stringify({ error: validation.error }),
        { status: HTTP_STATUS.BAD_REQUEST, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const openai = new OpenAI({ apiKey });

    if (stream) {
      const streamResponse = await openai.chat.completions.create({
        model,
        messages,
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
            console.error('Streaming error:', error);
            const { message } = parseOpenAIError(error);
            
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`));
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            } catch (e) {
              console.error('Failed to send error through stream:', e);
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
        messages,
        stream: false,
      });

      return new Response(
        JSON.stringify(completion),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('Chat completion error:', error);
    const { message, statusCode } = parseOpenAIError(error);

    return new Response(
      JSON.stringify({ error: message }),
      { status: statusCode, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
