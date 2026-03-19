'use server';

import { getMemoryContextResult } from './memory';
import { getRAGContext, getDocumentOverviewContext } from './rag/retrieval/context';
import type { Message } from '@/lib/schemas/chat';
import { RoutingDecision } from '@/types/chat';
import { prisma } from './prisma';
import { filterDocumentAttachments } from './rag/retrieval/statusHelpers';
import { isSupportedDocumentExtension } from './fileValidation';
import { parseToolId, TOOL_IDS } from './tools/config';
import { extractUrlsFromMessage, scrapeMultipleUrls, formatScrapedContentForContext } from './url-scraper/scraper';
import { extractTextFromMessage } from './chat/messageContent';
import { mediateMemoryIntent } from './chat/requestMediator';
import { estimateMemoryEntryCount } from './chat/memoryPolicy';
import { extractTextQuery, isReferentialQuery } from './chat/referentialQuery';
import { logWarn } from './observability';


import { logger } from "@/lib/logger";
interface ContextRoutingMetadata {
  hasMemories: boolean;
  attemptedMemory: boolean;
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
  degradedContexts?: Array<{
    source: string;
    reason: string;
  }>;
}

interface ContextRoutingResult {
  context: string;
  metadata: ContextRoutingMetadata;
}

function detectImages(content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>): number {
  if (!Array.isArray(content)) return 0;
  return content.filter(part => 
    typeof part === 'object' && part !== null && 'image_url' in part
  ).length;
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
    attachmentIds?: string[];
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
      attachmentIds: options.attachmentIds,
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

function logMissingDocumentRetrieval(params: {
  userId: string;
  conversationId?: string;
  query: string;
  documentCount: number;
  isReferential: boolean;
  hadOverviewFallback: boolean;
}): void {
  logWarn({
    event: 'rag_context_missing_with_attachments',
    userId: params.userId,
    conversationId: params.conversationId,
    queryLength: params.query.trim().length,
    documentCount: params.documentCount,
    isReferential: params.isReferential,
    hadOverviewFallback: params.hadOverviewFallback,
  });
}

async function getAttachmentInfo(conversationId: string): Promise<{
  hasDocuments: boolean;
  hasAny: boolean;
  documentCount: number;
  documentAttachmentIds: string[];
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
      return { hasDocuments: false, hasAny: false, documentCount: 0, documentAttachmentIds: [] };
    }

    const retrievableDocumentAttachments = filterDocumentAttachments(allAttachments);
    const uiDocumentAttachments = retrievableDocumentAttachments.filter((att) =>
      att.fileName && isSupportedDocumentExtension(att.fileName)
    );

    return {
      hasDocuments: retrievableDocumentAttachments.length > 0,
      hasAny: true,
      documentCount: uiDocumentAttachments.length,
      documentAttachmentIds: retrievableDocumentAttachments.map((attachment) => attachment.id),
    };
  } catch (error) {
    logger.warn('[Context Router] Failed to get attachment info:', error);
    return { hasDocuments: false, hasAny: false, documentCount: 0, documentAttachmentIds: [] };
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
  options?: {
    apiKey?: string;
  },
): Promise<ContextRoutingResult> {
  const textQuery = extractTextQuery(query);
  const imageCount = detectImages(query);
  const hasImages = imageCount > 0;
  const isReferential = isReferentialQuery(textQuery);
  const retrievalQueries = buildRetrievalQueries(textQuery, messages, isReferential);
  const sanitizedActiveTool = parseToolId(activeTool);

  const metadata: ContextRoutingMetadata = {
    hasMemories: false,
    attemptedMemory: false,
    hasDocuments: false,
    hasImages,
    hasUrls: false,
    memoryCount: 0,
    documentCount: 0,
    imageCount,
    urlCount: 0,
    skippedMemory: !memoryEnabled,
    degradedContexts: [],
  };

  const addDegradedContext = (source: string, reason: string) => {
    metadata.degradedContexts = [
      ...(metadata.degradedContexts || []),
      { source, reason },
    ];
  };

  if (activeTool && !sanitizedActiveTool) {
    addDegradedContext('tool_validation', `Ignored invalid active tool: ${activeTool}`);
    logWarn({
      event: 'context_router_invalid_active_tool_ignored',
      conversationId,
      userId,
      requestedTool: activeTool,
    });
  }


  if (deepResearchEnabled) {
    metadata.routingDecision = RoutingDecision.ToolOnly;
    metadata.skippedMemory = true;
    metadata.activeToolName = TOOL_IDS.DEEP_RESEARCH;

    if (conversationId) {
      const attachmentInfo = await getAttachmentInfo(conversationId);
      if (attachmentInfo.hasDocuments) {
        metadata.hasDocuments = true;
        metadata.documentCount = attachmentInfo.documentCount;
      }
    }

    const detectedUrls = extractUrlsFromMessage(query);
    if (detectedUrls.length > 0) {
      try {
        const scrapedContent = await scrapeMultipleUrls(detectedUrls);
        if (scrapedContent.length > 0) {
          metadata.hasUrls = true;
          metadata.urlCount = scrapedContent.length;
          return {
            context: formatScrapedContentForContext(scrapedContent),
            metadata,
          };
        }
      } catch (error) {
        logger.error('[Context Router] Deep research URL scraping failed:', error);
        addDegradedContext('url_scrape', error instanceof Error ? error.message : String(error));
      }
    }

    return { context: '', metadata };
  }

  if (sanitizedActiveTool) {
    metadata.routingDecision = RoutingDecision.ToolOnly;
    metadata.skippedMemory = true;
    metadata.activeToolName = sanitizedActiveTool;
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
        logger.log('[Context Router] All URL scraping attempts failed, continuing with normal flow');
      }
    } catch (error) {
      logger.error('[Context Router] URL scraping failed:', error);
      addDegradedContext('url_scrape', error instanceof Error ? error.message : String(error));
      // Continue with normal flow if URL scraping fails
    }
  }

  if (hasImages && (!textQuery.trim() || textQuery.trim().length < 3)) {
    metadata.routingDecision = RoutingDecision.VisionOnly;
    metadata.skippedMemory = true;
    return { context: '', metadata };
  }

  const attachmentInfo = conversationId
    ? await getAttachmentInfo(conversationId)
    : { hasDocuments: false, hasAny: false, documentCount: 0, documentAttachmentIds: [] };

  if (isReferential) {
    metadata.routingDecision = RoutingDecision.DocumentsOnly;
    metadata.skippedMemory = true;

    if (attachmentInfo.hasDocuments) {
      const ragResult = await resolveDocumentContext(retrievalQueries, userId, {
        conversationId,
        attachmentIds: attachmentInfo.documentAttachmentIds,
        waitForProcessing: true,
      });

      if (ragResult) {
        metadata.hasDocuments = true;
        metadata.documentCount = ragResult.documentCount;
        
        if (hasImages) {
          metadata.routingDecision = RoutingDecision.Hybrid;
          return { context: ragResult.context, metadata };
        }
        
        return { context: ragResult.context, metadata };
      }

      metadata.documentCount = attachmentInfo.documentCount;
      const overviewContext = await getDocumentOverviewContext(userId, {
        conversationId,
        attachmentIds: attachmentInfo.documentAttachmentIds,
        waitForProcessing: false,
      });

      if (overviewContext) {
        metadata.hasDocuments = true;
        metadata.documentCount = overviewContext.documentCount;
        return { context: overviewContext.context, metadata };
      }

      metadata.hasDocuments = true;
      logMissingDocumentRetrieval({
        userId,
        conversationId,
        query: textQuery,
        documentCount: attachmentInfo.documentCount,
        isReferential,
        hadOverviewFallback: false,
      });
      return { context: buildMissingDocumentContext(textQuery), metadata };
    }

    // If no document context but has images, treat as VisionOnly
    if (hasImages) {
      metadata.routingDecision = RoutingDecision.VisionOnly;
      return { context: '', metadata };
    }

    return { context: '', metadata };
  }

  if (attachmentInfo.hasDocuments) {
    const ragResult = await resolveDocumentContext(retrievalQueries, userId, {
      conversationId,
      attachmentIds: attachmentInfo.documentAttachmentIds,
      waitForProcessing: true,
    });

    if (ragResult) {
      metadata.hasDocuments = true;
      metadata.documentCount = ragResult.documentCount;
      
      if (hasImages) {
        metadata.routingDecision = RoutingDecision.Hybrid;
        return { context: ragResult.context, metadata };
      }
      
      metadata.routingDecision = RoutingDecision.DocumentsOnly;
      return { context: ragResult.context, metadata };
    }

    metadata.skippedMemory = true;
    metadata.routingDecision = RoutingDecision.DocumentsOnly;
    metadata.hasDocuments = true;
    metadata.documentCount = attachmentInfo.documentCount;

    const overviewContext = await getDocumentOverviewContext(userId, {
      conversationId,
      attachmentIds: attachmentInfo.documentAttachmentIds,
      waitForProcessing: false,
    });

    if (overviewContext) {
      metadata.documentCount = overviewContext.documentCount;
      return { context: overviewContext.context, metadata };
    }

    logMissingDocumentRetrieval({
      userId,
      conversationId,
      query: textQuery,
      documentCount: attachmentInfo.documentCount,
      isReferential,
      hadOverviewFallback: false,
    });
    return { context: buildMissingDocumentContext(textQuery), metadata };
  }

  if (hasImages) {
    metadata.routingDecision = RoutingDecision.VisionOnly;
    metadata.skippedMemory = true;
    return { context: '', metadata };
  }

  if (!memoryEnabled || metadata.skippedMemory) {
    return { context: '', metadata };
  }

  const recentConversation = getRecentConversationExcerpt(messages);
  const memoryDecision = await mediateMemoryIntent({
    messageText: textQuery,
    recentConversation,
    apiKey: options?.apiKey,
  });

  if (!memoryDecision.shouldQuery) {
    return { context: '', metadata };
  }

  metadata.attemptedMemory = true;

  const memoryContextResult = await getMemoryContextResult(textQuery, userId, {
    recentConversation,
  });

  if (memoryContextResult.failed) {
    addDegradedContext('memory', memoryContextResult.error || 'Memory retrieval failed');
    return { context: '', metadata };
  }

  if (memoryContextResult.context) {
    metadata.hasMemories = true;
    metadata.memoryCount = estimateMemoryEntryCount(memoryContextResult.context);
    metadata.routingDecision = RoutingDecision.MemoryOnly;
    return { context: memoryContextResult.context, metadata };
  }

  return { context: '', metadata };
}
