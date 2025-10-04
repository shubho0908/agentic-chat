import { streamText, createTextStreamResponse } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { DEFAULT_ASSISTANT_PROMPT } from '../../../lib/prompts';
import { generateEmbedding, searchSemanticCache, addToSemanticCache, ensureCollection } from '@/lib/qdrant';

const ChatRequestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string(),
    })
  ),
  encodedApiKey: z.string().min(1, 'API key is required'),
  model: z.string().min(1, 'Model is required'),
});

export const maxDuration = 30;

function decodeApiKey(encoded: string): string {
  try {
    return decodeURIComponent(atob(encoded));
  } catch {
    throw new Error('Invalid API key format');
  }
}

async function hashApiKey(apiKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

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

    const { messages, encodedApiKey, model } = parsedBody.data;

    const apiKey = decodeApiKey(encodedApiKey);
    const userHash = await hashApiKey(apiKey);

    const lastUserMessage = messages.filter(msg => msg.role === 'user').pop();
    
    await ensureCollection(3072);

    let cachedResponse = null;
    let queryEmbedding = null;
    
    if (lastUserMessage) {
      queryEmbedding = await generateEmbedding(lastUserMessage.content);
      cachedResponse = await searchSemanticCache(queryEmbedding, userHash);
    }

    if (cachedResponse) {
      return new Response(
        JSON.stringify({
          role: 'assistant',
          content: cachedResponse
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

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

    const customOpenAI = createOpenAI({
      apiKey: apiKey,
    });
    const modelProvider = customOpenAI(model);

    const result = streamText({
      model: modelProvider,
      messages: messagesWithSystemPrompt,
      onFinish: async ({ text }) => {
        if (lastUserMessage && queryEmbedding) {
          await addToSemanticCache(lastUserMessage.content, text, queryEmbedding, userHash);
        }
      },
    });

    return createTextStreamResponse(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMessage.includes('API key')) {
      console.error('API key error - details omitted for security');
    } else {
      console.error('Error in chat API:', errorMessage);
    }

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