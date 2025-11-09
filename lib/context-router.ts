'use server';

import { getMemoryContext } from './memory';
import { getRAGContext } from './rag/retrieval/context';
import type { Message } from '@/lib/schemas/chat';
import { RoutingDecision } from '@/types/chat';
import { prisma } from './prisma';
import { filterDocumentAttachments } from './rag/retrieval/status-helpers';
import { isSupportedDocumentExtension } from './file-validation';
import { TOOL_IDS } from './tools/config';
import { extractUrlsFromMessage, scrapeMultipleUrls, formatScrapedContentForContext } from './url-scraper/scraper';
import { shouldQueryMemoryWithCache } from './memory-classifier';

export interface ContextRoutingResult {
  context: string;
  metadata: {
    hasMemories: boolean;
    hasDocuments: boolean;
    hasImages: boolean;
    hasUrls: boolean;
    memoryCount: number;
    documentCount: number;
    imageCount: number;
    urlCount: number;
    routingDecision?: RoutingDecision;
    skippedMemory: boolean;
    activeToolName?: string;
  };
}

function extractTextQuery(query: string | Array<{ type: string; text?: string; image_url?: { url: string } }>): string {
  return typeof query === 'string' 
    ? query 
    : query.filter(p => p.type === 'text' && p.text).map(p => p.text).join(' ');
}

const REFERENTIAL_PATTERNS = [
  /\b(this|that|the|attached)\s+(doc|document|file|pdf|attachment|image|picture)/i,
  /\bwhat('s|\s+is)?\s+(in|about)\s+(this|that|the|it)/i,
  /\b(summarize|explain|analyze|describe)\s+(this|that|the|it)/i,
  /^(summarize|summary|explain|analyze|describe)$/i,
] as const;

function detectImages(content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>): number {
  if (!Array.isArray(content)) return 0;
  return content.filter(part => 
    typeof part === 'object' && part !== null && 'image_url' in part
  ).length;
}

function isReferentialQuery(normalized: string): boolean {
  return REFERENTIAL_PATTERNS.some(p => p.test(normalized));
}

function shouldQueryMemory(query: string): boolean {
  return shouldQueryMemoryWithCache(query);
}

async function getAttachmentInfo(conversationId: string): Promise<{
  hasDocuments: boolean;
  hasAny: boolean;
}> {
  try {
    const messages = await prisma.message.findMany({
      where: {
        conversationId,
        isDeleted: false,
      },
      select: {
        attachments: {
          select: {
            id: true,
            fileType: true,
            fileName: true,
          },
        },
      },
    });

    const allAttachments = messages.flatMap(m => m.attachments);

    if (allAttachments.length === 0) {
      return { hasDocuments: false, hasAny: false };
    }

    const documentAttachments = filterDocumentAttachments(allAttachments).filter(att =>
      att.fileName && isSupportedDocumentExtension(att.fileName)
    );

    return {
      hasDocuments: documentAttachments.length > 0,
      hasAny: true,
    };
  } catch {
    return { hasDocuments: false, hasAny: false };
  }
}

export async function routeContext(
  query: string | Array<{ type: string; text?: string; image_url?: { url: string } }>,
  userId: string,
  _messages: Message[],
  conversationId?: string,
  activeTool?: string | null,
  memoryEnabled: boolean = false,
  deepResearchEnabled: boolean = false,
): Promise<ContextRoutingResult> {
  const textQuery = extractTextQuery(query);
  const normalized = textQuery.toLowerCase().trim();
  const imageCount = detectImages(query);
  const hasImages = imageCount > 0;
  const isReferential = isReferentialQuery(normalized);

  const metadata: {
    hasMemories: boolean;
    hasDocuments: boolean;
    hasImages: boolean;
    hasUrls: boolean;
    memoryCount: number;
    documentCount: number;
    imageCount: number;
    urlCount: number;
    routingDecision?: RoutingDecision;
    skippedMemory: boolean;
    activeToolName?: string;
  } = {
    hasMemories: false,
    hasDocuments: false,
    hasImages,
    hasUrls: false,
    memoryCount: 0,
    documentCount: 0,
    imageCount,
    urlCount: 0,
    skippedMemory: !memoryEnabled,
  };


  if (deepResearchEnabled) {
    metadata.routingDecision = RoutingDecision.ToolOnly;
    metadata.skippedMemory = true;
    metadata.activeToolName = TOOL_IDS.DEEP_RESEARCH;

    if (conversationId) {
      const attachmentInfo = await getAttachmentInfo(conversationId);
      if (attachmentInfo.hasDocuments) {
        metadata.hasDocuments = true;
      }
    }

    return { context: '', metadata };
  }

  if (activeTool) {
    metadata.routingDecision = RoutingDecision.ToolOnly;
    metadata.skippedMemory = true;
    metadata.activeToolName = activeTool;
    return { context: '', metadata };
  }

  const detectedUrls = extractUrlsFromMessage(query);
  
  if (detectedUrls.length > 0) {
    try {
      const scrapedContent = await scrapeMultipleUrls(detectedUrls);
      
      if (scrapedContent.length > 0) {
        metadata.hasUrls = true;
        metadata.urlCount = scrapedContent.length;
        metadata.routingDecision = RoutingDecision.UrlContent;
        metadata.skippedMemory = true;
        
        const urlContext = formatScrapedContentForContext(scrapedContent);
        
        if (hasImages) {
          metadata.routingDecision = RoutingDecision.Hybrid;
        }
        
        return { context: urlContext, metadata };
      } else {
        console.log('[Context Router] All URL scraping attempts failed, continuing with normal flow');
      }
    } catch (error) {
      console.error('[Context Router] URL scraping failed:', error);
      // Continue with normal flow if URL scraping fails
    }
  }

  const attachmentInfoPromise = conversationId
    ? getAttachmentInfo(conversationId)
    : Promise.resolve({ hasDocuments: false, hasAny: false });

  const ragPromise = getRAGContext(textQuery, userId, {
    conversationId,
    limit: 5,
    scoreThreshold: 0.7,
    waitForProcessing: true,
  });

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
      metadata.documentCount = ragResult.documentCount;
      
      if (hasImages) {
        metadata.routingDecision = RoutingDecision.Hybrid;
        return { context: ragResult.context, metadata };
      }
      
      return { context: ragResult.context, metadata };
    }

    // If no RAG results but has images, treat as VisionOnly
    if (hasImages) {
      metadata.routingDecision = RoutingDecision.VisionOnly;
      return { context: '', metadata };
    }

    return { context: '', metadata };
  }

  const [ragResult, attachmentInfo] = await Promise.all([ragPromise, attachmentInfoPromise]);

  if (ragResult) {
    metadata.hasDocuments = true;
    metadata.documentCount = ragResult.documentCount;
    metadata.skippedMemory = true;

    if (hasImages) {
      metadata.routingDecision = RoutingDecision.Hybrid;
      return { context: ragResult.context, metadata };
    }

    metadata.routingDecision = RoutingDecision.DocumentsOnly;
    return { context: ragResult.context, metadata };
  }

  if (attachmentInfo.hasDocuments) {
    metadata.routingDecision = RoutingDecision.DocumentsOnly;
    metadata.skippedMemory = true;
    metadata.hasDocuments = true;
    return { context: '', metadata };
  }

  if (hasImages) {
    metadata.routingDecision = RoutingDecision.VisionOnly;
    metadata.skippedMemory = true;
    return { context: '', metadata };
  }

  // Skip memory search if conversation has any attachments (reuse existing info)
  if (attachmentInfo.hasAny) {
    metadata.skippedMemory = true;
  }

  if (!memoryEnabled || metadata.skippedMemory) {
    return { context: '', metadata };
  }

  // Fast heuristic-based memory classification (no LLM call needed)
  const needsMemory = shouldQueryMemory(normalized);
  if (!needsMemory) {
    return { context: '', metadata };
  }

  const memoryContext = await getMemoryContext(textQuery, userId);

  if (memoryContext) {
    metadata.hasMemories = true;
    const memoryMatches = memoryContext.match(/\d+\./g);
    metadata.memoryCount = memoryMatches?.length || 0;
    metadata.routingDecision = RoutingDecision.MemoryOnly;
    return { context: memoryContext, metadata };
  }

  return { context: '', metadata };
}