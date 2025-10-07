import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { decryptApiKey } from '@/lib/encryption';
import { headers } from 'next/headers';
import OpenAI from 'openai';
import { API_ERROR_MESSAGES, HTTP_STATUS } from '@/constants/errors';

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

    if (!model || !messages) {
      return new Response(
        JSON.stringify({ error: API_ERROR_MESSAGES.MISSING_MODEL_MESSAGES }),
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
            controller.error(error);
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
    const errorMessage = error instanceof Error ? error.message : API_ERROR_MESSAGES.INTERNAL_SERVER_ERROR;
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
