'use server';

import { getMemoryContext } from './memory-conversation-context';
import { getRAGContext } from './rag/retrieval/context';
import type { Message } from './schemas/chat';
import { prisma } from './prisma';
import { filterDocumentAttachments } from './rag/retrieval/status-helpers';
import { RoutingDecision } from '@/hooks/chat/types';

export interface ContextRoutingResult {
  context: string;
  metadata: {
    hasMemories: boolean;
    hasDocuments: boolean;
    hasImages: boolean;
    memoryCount: number;
    documentCount: number;
    imageCount: number;
    routingDecision: RoutingDecision;
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

async function hasDocumentAttachments(conversationId: string): Promise<boolean> {
  try {
    const messages = await prisma.message.findMany({
      where: {
        conversationId,
        isDeleted: false,
      },
      include: {
        attachments: {
          select: {
            fileType: true,
          },
        },
      },
    });

    const allAttachments = messages.flatMap(m => m.attachments);
    const documentAttachments = filterDocumentAttachments(allAttachments);
    
    return documentAttachments.length > 0;
  } catch {
    return false;
  }
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
    routingDecision: RoutingDecision;
    skippedMemory: boolean;
  } = {
    hasMemories: false,
    hasDocuments: false,
    hasImages,
    memoryCount: 0,
    documentCount: 0,
    imageCount,
    routingDecision: RoutingDecision.MemoryOnly,
    skippedMemory: false,
  };

  const textQuery = typeof query === 'string' 
    ? query 
    : query.filter(p => p.type === 'text' && p.text).map(p => p.text).join(' ');

  const hasAttachmentsPromise = conversationId 
    ? hasDocumentAttachments(conversationId)
    : Promise.resolve(false);

  const ragPromise = getRAGContext(textQuery, userId, {
    conversationId,
    limit: 5,
    scoreThreshold: 0.7,
    waitForProcessing: true,
    maxWaitTime: 30000,
  });

  // For image-only queries (no text query or referential patterns), skip RAG
  if (hasImages && (!textQuery.trim() || textQuery.trim().length < 3)) {
    metadata.routingDecision = RoutingDecision.VisionOnly;
    metadata.skippedMemory = true;
    return { context: '', metadata };
  }

  if (isReferential) {
    metadata.routingDecision = RoutingDecision.DocumentsOnly;
    metadata.skippedMemory = true;

    const ragResult = await ragPromise;
    if (ragResult) {
      metadata.hasDocuments = true;
      metadata.documentCount = ragResult ? 1 : 0;
      return { context: ragResult, metadata };
    }

    return { context: '', metadata };
  }

  const [ragResult, hasAttachments] = await Promise.all([ragPromise, hasAttachmentsPromise]);

  if (ragResult) {
    metadata.hasDocuments = true;
    metadata.documentCount = ragResult ? 1 : 0;
    
    if (hasImages) {
      metadata.routingDecision = RoutingDecision.Hybrid;
      metadata.skippedMemory = true;
      return { context: ragResult, metadata };
    }
    
    metadata.routingDecision = RoutingDecision.DocumentsOnly;
    metadata.skippedMemory = true;
    return { context: ragResult, metadata };
  }

  if (hasAttachments) {
    metadata.routingDecision = RoutingDecision.DocumentsOnly;
    metadata.skippedMemory = true;
    return { context: '', metadata };
  }

  if (hasImages) {
    metadata.routingDecision = RoutingDecision.VisionOnly;
    metadata.skippedMemory = true;
    return { context: '', metadata };
  }

  const memoryContext = await getMemoryContext(query, userId, messages, conversationId);

  if (memoryContext) {
    metadata.hasMemories = true;
    const memoryMatches = memoryContext.match(/\d+\./g);
    metadata.memoryCount = memoryMatches?.length || 0;
    metadata.routingDecision = RoutingDecision.MemoryOnly;
    return { context: memoryContext, metadata };
  }

  return { context: '', metadata };
}
