'use server';

import { getMemoryContext } from './memory-conversation-context';
import { getRAGContext } from './rag/retrieval/context';
import type { Message } from './schemas/chat';

export interface ContextRoutingResult {
  context: string;
  metadata: {
    hasMemories: boolean;
    hasDocuments: boolean;
    hasImages: boolean;
    memoryCount: number;
    documentCount: number;
    imageCount: number;
    routingDecision: 'vision-only' | 'documents-only' | 'memory-only' | 'hybrid';
    skippedMemory: boolean;
  };
}

function detectImages(content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>): number {
  if (!Array.isArray(content)) return 0;
  return content.filter(part => 
    typeof part === 'object' && part !== null && 'image_url' in part
  ).length;
}

function isReferentialQuery(query: string | Array<{ type: string; text?: string; image_url?: { url: string } }>): boolean {
  const textQuery = typeof query === 'string' 
    ? query 
    : query.filter(p => p.type === 'text' && p.text).map(p => p.text).join(' ');

  const normalized = textQuery.toLowerCase().trim();

  const patterns = [
    /\b(this|that|the|attached)\s+(doc|document|file|pdf|attachment|image|picture)/i,
    /\bwhat('s|\s+is)?\s+(in|about)\s+(this|that|the|it)/i,
    /\b(summarize|explain|analyze|describe)\s+(this|that|the|it)/i,
    /^(summarize|summary|explain|analyze|describe)$/i,
  ];

  return patterns.some(p => p.test(normalized));
}

export async function routeContext(
  query: string | Array<{ type: string; text?: string; image_url?: { url: string } }>,
  userId: string,
  messages: Message[],
  conversationId?: string
): Promise<ContextRoutingResult> {
  const imageCount = detectImages(query);
  const hasImages = imageCount > 0;
  const isReferential = isReferentialQuery(query);

  const metadata: {
    hasMemories: boolean;
    hasDocuments: boolean;
    hasImages: boolean;
    memoryCount: number;
    documentCount: number;
    imageCount: number;
    routingDecision: 'vision-only' | 'documents-only' | 'memory-only' | 'hybrid';
    skippedMemory: boolean;
  } = {
    hasMemories: false,
    hasDocuments: false,
    hasImages,
    memoryCount: 0,
    documentCount: 0,
    imageCount,
    routingDecision: 'memory-only',
    skippedMemory: false,
  };

  const textQuery = typeof query === 'string' 
    ? query 
    : query.filter(p => p.type === 'text' && p.text).map(p => p.text).join(' ');

  const ragPromise = getRAGContext(textQuery, userId, {
    conversationId,
    limit: 5,
    scoreThreshold: 0.7,
    waitForProcessing: true,
    maxWaitTime: 30000,
  });

  // For image-only queries (no text query or referential patterns), skip RAG
  if (hasImages && (!textQuery.trim() || textQuery.trim().length < 3)) {
    metadata.routingDecision = 'vision-only';
    metadata.skippedMemory = true;
    return { context: '', metadata };
  }

  if (isReferential) {
    metadata.routingDecision = 'documents-only';
    metadata.skippedMemory = true;

    const ragResult = await ragPromise;
    if (ragResult) {
      metadata.hasDocuments = true;
      metadata.documentCount = ragResult ? 1 : 0;
      return { context: ragResult, metadata };
    }

    return { context: '', metadata };
  }

  const ragResult = await ragPromise;

  if (ragResult) {
    metadata.hasDocuments = true;
    metadata.documentCount = ragResult ? 1 : 0;
    
    if (hasImages) {
      metadata.routingDecision = 'hybrid';
      metadata.skippedMemory = true;
      return { context: ragResult, metadata };
    }
    
    metadata.routingDecision = 'documents-only';
    metadata.skippedMemory = true;
    return { context: ragResult, metadata };
  }

  if (hasImages) {
    metadata.routingDecision = 'vision-only';
    metadata.skippedMemory = true;
    return { context: '', metadata };
  }

  const memoryContext = await getMemoryContext(query, userId, messages, conversationId);

  if (memoryContext) {
    metadata.hasMemories = true;
    const memoryMatches = memoryContext.match(/\d+\./g);
    metadata.memoryCount = memoryMatches?.length || 0;
    metadata.routingDecision = 'memory-only';
    return { context: memoryContext, metadata };
  }

  return { context: '', metadata };
}
