'use server';

import { addMemories, retrieveMemories } from '@mem0/vercel-ai-provider';

const MEM0_API_KEY = process.env.MEM0_API_KEY;

if (!MEM0_API_KEY) {
  console.warn('[Mem0] MEM0_API_KEY not configured - memory features disabled');
}

export async function storeConversationMemory(
  userMessage: string,
  assistantMessage: string,
  userId: string
): Promise<void> {
  if (!MEM0_API_KEY) {
    return;
  }

  try {
    const messages = [
      { role: 'user' as const, content: [{ type: 'text' as const, text: userMessage }] },
      { role: 'assistant' as const, content: [{ type: 'text' as const, text: assistantMessage }] },
    ];

    await addMemories(messages, {
      user_id: userId,
      mem0ApiKey: MEM0_API_KEY,
    });
  } catch (error) {
    console.error('[Mem0] Error storing memory:', error);
  }
}

export async function getMemoryContext(
  query: string,
  userId: string
): Promise<string> {
  if (!MEM0_API_KEY) {
    return '';
  }

  try {
    return await retrieveMemories(query, {
      user_id: userId,
      mem0ApiKey: MEM0_API_KEY,
    }) || '';
  } catch (error) {
    console.error('[Mem0] Error retrieving memory context:', error);
    return '';
  }
}
