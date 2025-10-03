import { streamText, createTextStreamResponse } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { DEFAULT_ASSISTANT_PROMPT } from '../../../lib/prompts';

const ChatRequestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string(),
    })
  ),
});

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const requestBody = await req.json();
    const parsedBody = ChatRequestSchema.safeParse(requestBody);

    if (!parsedBody.success) {
      return new Response(
        JSON.stringify({
          error: 'Invalid request body',
          details: parsedBody.error.issues
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    const { messages } = parsedBody.data;

    const messagesWithSystemPrompt = [
      {
        role: 'system' as const,
        content: DEFAULT_ASSISTANT_PROMPT,
      },
      ...messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
    ];

    const result = streamText({
      model: openai(process.env.OPENAI_MODEL as string),
      messages: messagesWithSystemPrompt,
    });

    return createTextStreamResponse(result);
  } catch (error) {
    console.error('Error in chat API:', error);

    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({
          error: 'Validation error',
          details: error.issues
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    if (error && typeof error === 'object' && 'name' in error && 'message' in error) {
      return new Response(
        JSON.stringify({
          error: 'AI Service Error',
          message: (error as Error).message,
          name: (error as Error).name
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}