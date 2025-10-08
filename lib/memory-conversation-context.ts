'use server';

import { qdrantClient } from '@/constants/qdrant';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';

const MEMORY_COLLECTION_NAME = process.env.MEMORY_COLLECTION_NAME as string;
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL as string;
const EMBEDDING_DIMENSIONS = parseInt(process.env.EMBEDDING_DIMENSIONS as string, 10);

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not set');
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

async function ensureCollection(): Promise<void> {
  try {
    const collections = await qdrantClient.getCollections();
    const exists = collections.collections.some(c => c.name === MEMORY_COLLECTION_NAME);

    if (!exists) {
      await qdrantClient.createCollection(MEMORY_COLLECTION_NAME, {
        vectors: { size: EMBEDDING_DIMENSIONS, distance: 'Cosine' },
      });
      
      await qdrantClient.createPayloadIndex(MEMORY_COLLECTION_NAME, {
        field_name: 'userId',
        field_schema: 'keyword',
      });
      
      console.log('[Memory] Collection created:', MEMORY_COLLECTION_NAME);
    }
  } catch (error) {
    console.error('[Memory] Error ensuring collection:', error);
    throw error;
  }
}

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await getOpenAIClient().embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });
  return response.data[0].embedding;
}

export async function storeConversationMemory(
  userMessage: string,
  assistantMessage: string,
  userId: string,
  conversationId?: string
): Promise<void> {
  try {
    await ensureCollection();

    const memoryText = `User: ${userMessage}\nAssistant: ${assistantMessage}`;
    const embedding = await generateEmbedding(memoryText);

    await qdrantClient.upsert(MEMORY_COLLECTION_NAME, {
      wait: true,
      points: [{
        id: uuidv4(),
        vector: embedding,
        payload: {
          userId,
          conversationId: conversationId || null,
          userMessage,
          assistantMessage,
          memory: memoryText,
          timestamp: new Date().toISOString(),
        },
      }],
    });

    console.log('[Memory] Stored conversation:', {
      userId: userId.substring(0, 8) + '...',
      conversationId,
      userPreview: userMessage.substring(0, 50),
    });
  } catch (error) {
    console.error('[Memory] Error storing conversation:', error);
    throw error;
  }
}

export async function searchMemories(
  query: string,
  userId: string,
  limit: number = 5
): Promise<Array<{
  userMessage: string;
  assistantMessage: string;
  timestamp: string;
  conversationId?: string;
  score: number;
}>> {
  try {
    await ensureCollection();

    const queryEmbedding = await generateEmbedding(query);

    const results = await qdrantClient.search(MEMORY_COLLECTION_NAME, {
      vector: queryEmbedding,
      limit,
      with_payload: true,
      filter: {
        must: [{ key: 'userId', match: { value: userId } }],
      },
    });

    const memories = results.map(r => ({
      userMessage: r.payload?.userMessage as string,
      assistantMessage: r.payload?.assistantMessage as string,
      timestamp: r.payload?.timestamp as string,
      conversationId: r.payload?.conversationId as string | undefined,
      score: r.score || 0,
    }));

    console.log('[Memory] Search results:', {
      userId: userId.substring(0, 8) + '...',
      found: memories.length,
      topScore: memories[0]?.score,
    });

    return memories;
  } catch (error) {
    console.error('[Memory] Error searching:', error);
    return [];
  }
}

function extractTextContent(content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>): string {
  if (typeof content === 'string') {
    return content;
  }
  
  if (Array.isArray(content)) {
    return content
      .filter(part => part.type === 'text' && part.text)
      .map(part => part.text)
      .join(' ');
  }
  
  return '';
}

/**
 * Get relevant memories for context injection
 * 
 * Strategy: Trust vector search for relevance ranking
 * Only filter: Exclude current conversation (already in context)
 */
export async function getMemoryContext(
  currentQuery: string | Array<{ type: string; text?: string; image_url?: { url: string } }>,
  userId: string,
  recentMessages: Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }> = [],
  currentConversationId?: string
): Promise<string> {
  try {
    const queryText = extractTextContent(currentQuery);
    const contextParts = [
      ...recentMessages.slice(-3).map(m => extractTextContent(m.content)),
      queryText
    ].filter(Boolean);
    
    const searchQuery = contextParts.join(' ');
    
    if (!searchQuery.trim()) return '';

    const memories = await searchMemories(searchQuery, userId, 5);

    if (memories.length === 0) return '';

    // ONLY filter: exclude current conversation (already in message context)
    // No time-based filtering - trust vector search for relevance
    const relevantMemories = memories.filter(m => 
      !currentConversationId || m.conversationId !== currentConversationId
    );

    if (relevantMemories.length === 0) return '';

    const memoryText = relevantMemories
      .map((m, idx) => `${idx + 1}. Previous context:\n   User asked: "${m.userMessage}"\n   You responded: "${m.assistantMessage}"`)
      .join('\n');

    return `\n\n## Relevant Past Context:\n${memoryText}\n\nUse this context to provide more personalized and coherent responses.\n`;
  } catch (error) {
    console.error('[Memory] Error getting context:', error);
    return '';
  }
}

export async function clearMemories(userId: string): Promise<void> {
  try {
    await qdrantClient.delete(MEMORY_COLLECTION_NAME, {
      wait: true,
      filter: {
        must: [{ key: 'userId', match: { value: userId } }],
      },
    });
    console.log('[Memory] Cleared all memories for user:', userId.substring(0, 8) + '...');
  } catch (error) {
    console.error('[Memory] Error clearing memories:', error);
    throw error;
  }
}

export async function getAllMemories(userId: string, limit: number = 50): Promise<Array<{
  id: string;
  userMessage: string;
  assistantMessage: string;
  timestamp: string;
}>> {
  try {
    await ensureCollection();

    const results = await qdrantClient.scroll(MEMORY_COLLECTION_NAME, {
      filter: {
        must: [{ key: 'userId', match: { value: userId } }],
      },
      limit,
      with_payload: true,
    });

    return results.points
      .map(p => ({
        id: p.id.toString(),
        userMessage: p.payload?.userMessage as string,
        assistantMessage: p.payload?.assistantMessage as string,
        timestamp: p.payload?.timestamp as string,
      }))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  } catch (error) {
    console.error('[Memory] Error getting all memories:', error);
    return [];
  }
}

export async function deleteMemory(memoryId: string): Promise<boolean> {
  try {
    await qdrantClient.delete(MEMORY_COLLECTION_NAME, {
      wait: true,
      points: [memoryId],
    });
    console.log('[Memory] Deleted memory:', memoryId);
    return true;
  } catch (error) {
    console.error('[Memory] Error deleting memory:', error);
    return false;
  }
}

export async function updateMemory(
  memoryId: string,
  newMemoryText: string,
  userId: string
): Promise<boolean> {
  try {
    await ensureCollection();
    
    const embedding = await generateEmbedding(newMemoryText);
    const memoryText = newMemoryText;
    
    await qdrantClient.upsert(MEMORY_COLLECTION_NAME, {
      wait: true,
      points: [{
        id: memoryId,
        vector: embedding,
        payload: {
          userId,
          memory: memoryText,
          timestamp: new Date().toISOString(),
        },
      }],
    });
    
    console.log('[Memory] Updated memory:', memoryId);
    return true;
  } catch (error) {
    console.error('[Memory] Error updating memory:', error);
    return false;
  }
}
