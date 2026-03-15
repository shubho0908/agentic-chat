'use server';

import { getMemoryContext } from './memory';
import { getRAGContext, getDocumentOverviewContext } from './rag/retrieval/context';
import type { Message } from '@/lib/schemas/chat';
import { RoutingDecision } from '@/types/chat';
import { prisma } from './prisma';
import { filterDocumentAttachments } from './rag/retrieval/status-helpers';
import { isSupportedDocumentExtension } from './file-validation';
import { TOOL_IDS } from './tools/config';
import { extractUrlsFromMessage, scrapeMultipleUrls, formatScrapedContentForContext } from './url-scraper/scraper';
import { shouldQueryMemoryWithCache } from './memory-classifier';
import { extractTextFromMessage } from './chat/message-helpers';

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

function getRecentConversationExcerpt(messages: Message[], maxMessages: number = 6): string {
  const relevantMessages = messages
    .filter((message) => message.role !== 'system')
    .slice(-maxMessages)
    .map((message) => {
      const text = extractTextFromMessage(message.content).trim();
      if (!text) return null;
      return `${message.role}: ${text}`;
    })
    .filter((line): line is string => Boolean(line));

  return relevantMessages.join('\n');
}

function uniqueQueries(queries: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const query of queries) {
    const normalized = query.trim().replace(/\s+/g, ' ');
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    deduped.push(normalized);
  }

  return deduped;
}

function buildRetrievalQueries(
  textQuery: string,
  messages: Message[],
  isReferential: boolean
): string[] {
  const trimmedQuery = textQuery.trim();
  const recentConversation = getRecentConversationExcerpt(messages);

  if (!recentConversation) {
    return uniqueQueries([trimmedQuery]);
  }

  const standaloneQuery =
    `Recent conversation about attached documents:\n${recentConversation}\n\n` +
    `Current request:\n${trimmedQuery || 'Summarize the attached document.'}`;

  const focusedQuery =
    `Document question: ${trimmedQuery || 'Summarize the attached document.'}\n\n` +
    `Relevant recent conversation:\n${recentConversation}`;

  if (isReferential || trimmedQuery.length < 48) {
    return uniqueQueries([focusedQuery, standaloneQuery, trimmedQuery]);
  }

  return uniqueQueries([trimmedQuery, focusedQuery, standaloneQuery]);
}

async function resolveDocumentContext(
  queries: string[],
  userId: string,
  options: {
    conversationId?: string;
    waitForProcessing?: boolean;
  }
) {
  const attempts = queries.map((query, index) => ({
    query,
    limit: index === 0 ? 5 : 8,
    scoreThreshold: index === 0 ? 0.7 : 0.55,
    waitForProcessing: index === 0 ? options.waitForProcessing : false,
  }));

  for (const attempt of attempts) {
    const result = await getRAGContext(attempt.query, userId, {
      conversationId: options.conversationId,
      limit: attempt.limit,
      scoreThreshold: attempt.scoreThreshold,
      waitForProcessing: attempt.waitForProcessing,
    });

    if (result) {
      return result;
    }
  }

  return null;
}

function buildMissingDocumentContext(query: string): string {
  const normalizedQuery = query.trim() || 'the attached documents';

  return (
    '\n\nDocuments are attached to this conversation, but no strong supporting passage was retrieved for the current request.' +
    '\n<document_retrieval_warning>' +
    `\nCurrent request: ${normalizedQuery}` +
    '\nDo not answer as though the documents were successfully retrieved.' +
    '\nExplain that you need a more specific section, page, table, quote, or a clearer question.' +
    '\nOffer to summarize the attached documents first if that would help.' +
    '\n</document_retrieval_warning>'
  );
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
  messages: Message[],
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
  const retrievalQueries = buildRetrievalQueries(textQuery, messages, isReferential);

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

  const ragPromise = resolveDocumentContext(retrievalQueries, userId, {
    conversationId,
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

    const [ragResult, attachmentInfo] = await Promise.all([ragPromise, attachmentInfoPromise]);
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

    if (attachmentInfo.hasDocuments) {
      const overviewContext = await getDocumentOverviewContext(userId, {
        conversationId,
        waitForProcessing: false,
      });

      if (overviewContext) {
        metadata.hasDocuments = true;
        metadata.documentCount = overviewContext.documentCount;
        return { context: overviewContext.context, metadata };
      }

      metadata.hasDocuments = true;
      return { context: buildMissingDocumentContext(textQuery), metadata };
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

    const overviewContext = await getDocumentOverviewContext(userId, {
      conversationId,
      waitForProcessing: false,
    });

    if (overviewContext) {
      metadata.documentCount = overviewContext.documentCount;
      return { context: overviewContext.context, metadata };
    }

    return { context: buildMissingDocumentContext(textQuery), metadata };
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
