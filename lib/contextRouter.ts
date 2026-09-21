import { getMemoryContextResult } from "./memory";
import { getRAGContext } from "./rag/retrieval/context";
import type { Message } from "@/lib/schemas/chat";
import { selectDocumentAttachmentsForTurn } from "./chat/attachmentRouting";
import { MessageRole } from "@/lib/schemas/chat";
import { RoutingDecision } from "@/types/chat";
import { prisma } from "./prisma";
import { filterDocumentAttachments } from "./rag/retrieval/statusHelpers";
import { isSupportedDocumentExtension } from "./fileValidation";
import { extractTextFromMessage } from "./chat/messageContent";
import { mediateMemoryIntent } from "./chat/requestMediator";
import { estimateMemoryEntryCount } from "./chat/memoryPolicy";
import { extractTextQuery, isReferentialQuery } from "./chat/referentialQuery";
import { logWarn } from "./observability";

import { logger } from "@/lib/logger";
import { safeFetch } from "@/lib/network/safeFetch";

const INLINE_ATTACHMENT_MAX_BYTES = 512 * 1024;

const INLINE_ELIGIBLE_TYPES = new Set([
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/json",
  "application/xml",
  "text/html",
  "text/xml",
]);

function isInlineEligibleType(fileType: string): boolean {
  return INLINE_ELIGIBLE_TYPES.has(fileType) || fileType.startsWith("text/");
}

function sanitizeAttachedFileName(name: string): string {
  const sanitized = name
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .trim()
    .slice(0, 256);
  return sanitized || "untitled";
}

async function tryInlineAttachmentContent(
  attachmentIds: string[],
  userId: string,
  signal?: AbortSignal,
): Promise<{ context: string; documentCount: number } | null> {
  try {
    const attachments = await prisma.attachment.findMany({
      where: {
        id: { in: attachmentIds },
        message: { conversation: { userId } },
      },
      select: {
        id: true,
        fileName: true,
        fileUrl: true,
        fileSize: true,
        fileType: true,
      },
    });

    if (attachments.length === 0) return null;

    const eligible = attachments.filter((a) =>
      isInlineEligibleType(a.fileType),
    );
    if (eligible.length === 0) return null;

    const totalSize = eligible.reduce((sum, a) => sum + a.fileSize, 0);
    if (totalSize > INLINE_ATTACHMENT_MAX_BYTES) return null;

    const contents = await Promise.all(
      eligible.map(async (att) => {
        const res = await safeFetch(att.fileUrl, {
          timeoutMs: 10000,
          maxResponseBytes: INLINE_ATTACHMENT_MAX_BYTES,
          signal,
        });
        if (!res.ok) return null;
        const text = await res.text();
        return `<attached_file name="${sanitizeAttachedFileName(att.fileName)}">\n${text}\n</attached_file>`;
      }),
    );

    const validContents = contents.filter((c): c is string => c !== null);
    if (validContents.length === 0) return null;

    const context =
      "\n\nThe user has attached the following files. Use their FULL content to answer.\n" +
      validContents.join("\n\n");

    return { context, documentCount: validContents.length };
  } catch (error) {
    if (signal?.aborted)
      throw signal.reason ?? new DOMException("Aborted", "AbortError");
    logger.warn("[Context Router] Inline attachment fetch failed:", error);
    return null;
  }
}
interface ContextRoutingMetadata {
  hasMemories: boolean;
  attemptedMemory: boolean;
  hasDocuments: boolean;
  hasImages: boolean;
  memoryCount: number;
  documentCount: number;
  imageCount: number;
  routingDecision?: RoutingDecision;
  skippedMemory: boolean;
  activeToolName?: string;
  citations?: Array<{
    id: string;
    source: string;
    relevance: string;
    score?: number;
    page?: number;
  }>;
  degradedContexts?: Array<{
    source: string;
    reason: string;
  }>;
}

interface ContextRoutingResult {
  context: string;
  metadata: ContextRoutingMetadata;
  role?: MessageRole;
}

const CHAT_DOCUMENT_WAIT_TIMEOUT_MS = 30_000;

function detectImages(
  content:
    | string
    | Array<{ type: string; text?: string; image_url?: { url: string } }>,
): number {
  if (!Array.isArray(content)) return 0;
  return content.filter(
    (part) => typeof part === "object" && part !== null && "image_url" in part,
  ).length;
}

function getRecentConversationExcerpt(
  messages: Message[],
  maxMessages: number = 6,
): string {
  const relevantMessages = messages
    .filter((message) => message.role !== MessageRole.SYSTEM)
    .slice(-maxMessages)
    .map((message) => {
      const text = extractTextFromMessage(message.content).trim();
      if (!text) return null;
      return `${message.role}: ${text}`;
    })
    .filter((line): line is string => Boolean(line));

  return relevantMessages.join("\n");
}

function uniqueQueries(queries: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const query of queries) {
    const normalized = query.trim().replace(/\s+/g, " ");
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
  isReferential: boolean,
): string[] {
  const trimmedQuery = textQuery.trim();
  const recentConversation = getRecentConversationExcerpt(messages);

  if (!recentConversation) {
    return uniqueQueries([trimmedQuery]);
  }

  const standaloneQuery =
    `Recent conversation about attached documents:\n${recentConversation}\n\n` +
    `Current request:\n${trimmedQuery || "Summarize the attached document."}`;

  const focusedQuery =
    `Document question: ${trimmedQuery || "Summarize the attached document."}\n\n` +
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
    processingTimeoutMs?: number;
    signal?: AbortSignal;
    currentDocumentAttachmentIds?: string[];
  },
) {
  if (!queries.length) return null;
  // Retrieval owns cross-variant RRF. Processing is awaited once, while every
  // rewrite contributes candidates instead of the first non-empty result winning.
  try {
    return await getRAGContext(queries[0], userId, {
      conversationId: options.conversationId,
      attachmentIds: options.attachmentIds,
      limit: 8,
      scoreThreshold: 0.55,
      waitForProcessing: options.waitForProcessing,
      processingTimeoutMs: options.processingTimeoutMs,
      queryVariants: queries.slice(1),
      signal: options.signal,
    });
  } catch (error) {
    if (options.signal?.aborted)
      throw options.signal.reason ?? new DOMException("Aborted", "AbortError");
    logger.warn("[Context Router] RAG multi-query retrieval failed:", error);
    return null;
  }
}

function buildMissingDocumentContext(): string {
  return (
    "\n\nIMPORTANT: The user has attached documents to this conversation but they are still being processed." +
    "\n<document_processing_notice>" +
    "\nThe attached documents have NOT been fully processed yet — do NOT answer the question from your own knowledge." +
    "\nYou MUST tell the user that their documents are still being processed and ask them to wait a moment and try again." +
    "\nDo NOT provide a general answer. Acknowledge the attachment and explain the brief processing delay." +
    "\n</document_processing_notice>"
  );
}

function logMissingDocumentRetrieval(params: {
  userId: string;
  conversationId?: string;
  query: string;
  documentCount: number;
  isReferential: boolean;
}): void {
  logWarn({
    event: "rag_context_missing_with_attachments",
    userId: params.userId,
    conversationId: params.conversationId,
    queryLength: params.query.trim().length,
    documentCount: params.documentCount,
    isReferential: params.isReferential,
  });
}

async function getAttachmentInfo(
  conversationId: string,
  userId: string,
  currentTurnOnly: boolean,
): Promise<{
  hasDocuments: boolean;
  documentCount: number;
  documentAttachmentIds: string[];
}> {
  try {
    const messages = await prisma.message.findMany({
      where: {
        conversationId,
        conversation: {
          userId,
        },
        isDeleted: false,
      },
      ...(currentTurnOnly
        ? { orderBy: { createdAt: "desc" as const }, take: 1 }
        : {}),
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

    const allAttachments = selectDocumentAttachmentsForTurn(
      messages,
      !currentTurnOnly,
    );

    if (allAttachments.length === 0) {
      return {
        hasDocuments: false,
        documentCount: 0,
        documentAttachmentIds: [],
      };
    }

    const retrievableDocumentAttachments =
      filterDocumentAttachments(allAttachments);
    const uiDocumentAttachments = retrievableDocumentAttachments.filter(
      (att) => att.fileName && isSupportedDocumentExtension(att.fileName),
    );

    return {
      hasDocuments: retrievableDocumentAttachments.length > 0,
      documentCount: uiDocumentAttachments.length,
      documentAttachmentIds: retrievableDocumentAttachments
        .map((attachment) => attachment.id)
        .filter((id): id is string => Boolean(id)),
    };
  } catch (error) {
    logger.warn("[Context Router] Failed to get attachment info:", error);
    return { hasDocuments: false, documentCount: 0, documentAttachmentIds: [] };
  }
}

export async function routeContext(
  query:
    | string
    | Array<{ type: string; text?: string; image_url?: { url: string } }>,
  userId: string,
  messages: Message[],
  conversationId?: string,
  activeTool?: string | null,
  memoryEnabled: boolean = true,
  options?: {
    apiKey?: string;
    signal?: AbortSignal;
    currentDocumentAttachmentIds?: string[];
  },
): Promise<ContextRoutingResult> {
  const textQuery = extractTextQuery(query);
  const imageCount = detectImages(query);
  const hasImages = imageCount > 0;
  const isReferential = isReferentialQuery(textQuery);
  const retrievalQueries = buildRetrievalQueries(
    textQuery,
    messages,
    isReferential,
  );

  const metadata: ContextRoutingMetadata = {
    hasMemories: false,
    attemptedMemory: false,
    hasDocuments: false,
    hasImages,
    memoryCount: 0,
    documentCount: 0,
    imageCount,
    skippedMemory:
      !memoryEnabled ||
      Boolean(activeTool) ||
      process.env.MEMORY_ENABLED === "false",
    degradedContexts: [],
  };

  const addDegradedContext = (source: string, reason: string) => {
    metadata.degradedContexts = [
      ...(metadata.degradedContexts || []),
      { source, reason },
    ];
  };

  if (hasImages && (!textQuery.trim() || textQuery.trim().length < 3)) {
    metadata.routingDecision = RoutingDecision.VisionOnly;
    metadata.skippedMemory = true;
    return { context: "", metadata };
  }

  const attachmentInfo = conversationId
    ? options?.currentDocumentAttachmentIds?.length && !isReferential
      ? {
          hasDocuments: true,
          documentCount: options.currentDocumentAttachmentIds.length,
          documentAttachmentIds: options.currentDocumentAttachmentIds,
        }
      : await getAttachmentInfo(conversationId, userId, !isReferential)
    : { hasDocuments: false, documentCount: 0, documentAttachmentIds: [] };

  if (isReferential) {
    metadata.skippedMemory = true;

    if (attachmentInfo.hasDocuments) {
      const inlineResult = await tryInlineAttachmentContent(
        attachmentInfo.documentAttachmentIds,
        userId,
        options?.signal,
      );

      if (inlineResult) {
        metadata.hasDocuments = true;
        metadata.documentCount = inlineResult.documentCount;
        metadata.routingDecision = hasImages
          ? RoutingDecision.Hybrid
          : RoutingDecision.DocumentsOnly;
        return { context: inlineResult.context, metadata };
      }

      const ragResult = await resolveDocumentContext(retrievalQueries, userId, {
        conversationId,
        attachmentIds: attachmentInfo.documentAttachmentIds,
        waitForProcessing: true,
        processingTimeoutMs: CHAT_DOCUMENT_WAIT_TIMEOUT_MS,
        signal: options?.signal,
      });

      if (ragResult) {
        metadata.hasDocuments = true;
        metadata.documentCount = ragResult.documentCount;
        metadata.citations = ragResult.citations;
        metadata.routingDecision = hasImages
          ? RoutingDecision.Hybrid
          : RoutingDecision.DocumentsOnly;

        if (hasImages) {
          metadata.routingDecision = RoutingDecision.Hybrid;
          return { context: ragResult.context, metadata };
        }

        return { context: ragResult.context, metadata };
      }

      metadata.documentCount = attachmentInfo.documentCount;
      metadata.hasDocuments = true;
      logMissingDocumentRetrieval({
        userId,
        conversationId,
        query: textQuery,
        documentCount: attachmentInfo.documentCount,
        isReferential,
      });
      return {
        context: buildMissingDocumentContext(),
        metadata,
        role: MessageRole.SYSTEM,
      };
    }

    if (hasImages) {
      metadata.routingDecision = RoutingDecision.VisionOnly;
      return { context: "", metadata };
    }

    return { context: "", metadata };
  }

  if (attachmentInfo.hasDocuments) {
    const inlineResult = await tryInlineAttachmentContent(
      attachmentInfo.documentAttachmentIds,
      userId,
      options?.signal,
    );

    if (inlineResult) {
      metadata.hasDocuments = true;
      metadata.documentCount = inlineResult.documentCount;
      metadata.routingDecision = hasImages
        ? RoutingDecision.Hybrid
        : RoutingDecision.DocumentsOnly;
      return { context: inlineResult.context, metadata };
    }

    const ragResult = await resolveDocumentContext(retrievalQueries, userId, {
      conversationId,
      attachmentIds: attachmentInfo.documentAttachmentIds,
      waitForProcessing: true,
      processingTimeoutMs: CHAT_DOCUMENT_WAIT_TIMEOUT_MS,
      signal: options?.signal,
    });

    if (ragResult) {
      metadata.hasDocuments = true;
      metadata.documentCount = ragResult.documentCount;
      metadata.citations = ragResult.citations;

      if (hasImages) {
        metadata.routingDecision = RoutingDecision.Hybrid;
        return { context: ragResult.context, metadata };
      }

      metadata.routingDecision = RoutingDecision.DocumentsOnly;
      return { context: ragResult.context, metadata };
    }

    // A current document was supplied but did not produce usable evidence.
    // Never substitute personal memory for the user's requested document.
    metadata.documentCount = attachmentInfo.documentCount;
    metadata.hasDocuments = true;
    metadata.skippedMemory = true;
    logMissingDocumentRetrieval({
      userId,
      conversationId,
      query: textQuery,
      documentCount: attachmentInfo.documentCount,
      isReferential,
    });
    return {
      context: buildMissingDocumentContext(),
      metadata,
      role: MessageRole.SYSTEM,
    };
  }

  if (hasImages) {
    metadata.routingDecision = RoutingDecision.VisionOnly;
    metadata.skippedMemory = true;
    return { context: "", metadata };
  }

  if (!memoryEnabled || metadata.skippedMemory) {
    return { context: "", metadata };
  }

  const recentConversation = getRecentConversationExcerpt(messages);
  const memoryDecision = await mediateMemoryIntent({
    messageText: textQuery,
    recentConversation,
    userId,
    conversationId,
    signal: options?.signal,
  });

  if (!memoryDecision.shouldQuery) {
    return { context: "", metadata };
  }

  metadata.attemptedMemory = true;

  const memoryContextResult = await getMemoryContextResult(textQuery, userId, {
    recentConversation,
    conversationId,
    signal: options?.signal,
  });

  if (memoryContextResult.failed) {
    addDegradedContext(
      "memory",
      memoryContextResult.error || "Memory retrieval failed",
    );
    return { context: "", metadata };
  }

  if (memoryContextResult.context) {
    metadata.hasMemories = true;
    metadata.memoryCount = estimateMemoryEntryCount(
      memoryContextResult.context,
    );
    metadata.routingDecision = RoutingDecision.MemoryOnly;
    return { context: memoryContextResult.context, metadata };
  }

  return { context: "", metadata };
}
