'use server';

import { getPgPool } from '@/lib/rag/storage/pgvector-client';
import { ensurePgVectorTables } from '@/lib/rag/storage/pgvector-init';
import { getUserApiKey } from '@/lib/api-utils';
import OpenAI from 'openai';

const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL as string;

if (!EMBEDDING_MODEL) {
  throw new Error(`[Memory] Missing environment variable: EMBEDDING_MODEL`);
}

async function getOpenAIClient(userId: string): Promise<OpenAI> {
  const apiKey = await getUserApiKey(userId);
  return new OpenAI({ apiKey });
}

async function generateEmbedding(text: string, userId: string): Promise<number[]> {
  const client = await getOpenAIClient(userId);
  const response = await client.embeddings.create({
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
    await ensurePgVectorTables();
    const pool = getPgPool();

    const memoryText = `User: ${userMessage}\nAssistant: ${assistantMessage}`;
    const embedding = await generateEmbedding(memoryText, userId);

    await pool.query(
      `INSERT INTO conversation_memory 
       (user_id, conversation_id, user_message, assistant_message, memory_text, embedding)
       VALUES ($1, $2, $3, $4, $5, $6::vector)`,
      [userId, conversationId || null, userMessage, assistantMessage, memoryText, JSON.stringify(embedding)]
    );
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
    await ensurePgVectorTables();
    const pool = getPgPool();

    const queryEmbedding = await generateEmbedding(query, userId);

    const result = await pool.query(
      `SELECT 
        user_message,
        assistant_message,
        created_at,
        conversation_id,
        1 - (embedding <=> $1::vector) AS score
       FROM conversation_memory
       WHERE user_id = $2
       ORDER BY embedding <=> $1::vector
       LIMIT $3`,
      [JSON.stringify(queryEmbedding), userId, limit]
    );

    const memories = result.rows.map((row: {
      user_message: string;
      assistant_message: string;
      created_at: Date;
      conversation_id: string | null;
      score: number;
    }) => ({
      userMessage: row.user_message,
      assistantMessage: row.assistant_message,
      timestamp: row.created_at.toISOString(),
      conversationId: row.conversation_id || undefined,
      score: row.score,
    }));

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
    const pool = getPgPool();
    await pool.query(
      'DELETE FROM conversation_memory WHERE user_id = $1',
      [userId]
    );
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
    await ensurePgVectorTables();
    const pool = getPgPool();

    const result = await pool.query(
      `SELECT id, user_message, assistant_message, created_at
       FROM conversation_memory
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    return result.rows.map((row: {
      id: string;
      user_message: string;
      assistant_message: string;
      created_at: Date;
    }) => ({
      id: row.id,
      userMessage: row.user_message,
      assistantMessage: row.assistant_message,
      timestamp: row.created_at.toISOString(),
    }));
  } catch (error) {
    console.error('[Memory] Error getting all memories:', error);
    return [];
  }
}

export async function deleteMemory(memoryId: string): Promise<boolean> {
  try {
    const pool = getPgPool();
    await pool.query(
      'DELETE FROM conversation_memory WHERE id = $1',
      [memoryId]
    );
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
    await ensurePgVectorTables();
    const pool = getPgPool();
    
    const embedding = await generateEmbedding(newMemoryText, userId);
    
    await pool.query(
      `UPDATE conversation_memory 
       SET memory_text = $1, embedding = $2::vector, created_at = NOW()
       WHERE id = $3 AND user_id = $4`,
      [newMemoryText, JSON.stringify(embedding), memoryId, userId]
    );
    
    return true;
  } catch (error) {
    console.error('[Memory] Error updating memory:', error);
    return false;
  }
}
