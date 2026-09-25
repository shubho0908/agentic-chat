import { getMemoryContextResult } from "./memory";
import { getRAGContext } from "./rag/retrieval/context";
import type { Message } from "@/lib/schemas/chat";
import {
  attachmentKind,
  referencesDocument,
  referencesSnippet,
  requestedAttachmentKind,
} from "./chat/attachmentKind";
import { MessageRole } from "@/lib/schemas/chat";
import { DegradedContextSource, RoutingDecision } from "@/types/chat";
import { prisma } from "./prisma";
import { filterDocumentAttachments } from "./rag/retrieval/statusHelpers";
import { isSupportedForRAG } from "./rag/utils";
import { extractTextFromMessage } from "./chat/messageContent";
import { mediateMemoryIntent } from "./chat/requestMediator";
import { estimateMemoryEntryCount } from "./chat/memoryPolicy";
import { memoryGateDegradation } from "./jev/memoryGate";
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

export function isInlineEligibleType(fileType: string): boolean {
  const mime = fileType.split(";")[0].trim().toLowerCase();
  return INLINE_ELIGIBLE_TYPES.has(mime) || mime.startsWith("text/");
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
  kind: "document" | "snippet" = "document",
): Promise<{ context: string; documentCount: number } | null> {
  try {
    const attachments = await prisma.attachment.findMany({
      where: {
        id: { in: attachmentIds },
        kind,
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

    if (
      attachmentIds.length === 0 ||
      attachments.length !== new Set(attachmentIds).size
    )
      return null;

    const eligible = attachments.filter((a) =>
      isInlineEligibleType(a.fileType),
    );
    if (eligible.length === 0 || eligible.length !== attachments.length)
      return null;

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
    if (validContents.length !== attachments.length) return null;

    const context =
      `\n\nThe user has attached the following ${kind === "snippet" ? "snippets" : "documents"}. Use their FULL content to answer.\n` +
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
  attachmentContextKind?: "document" | "snippet";
  imageCount: number;
  routingDecision?: RoutingDecision;
  skippedMemory: boolean;
  activeToolName?: string;
  documentContextState?: "ready" | "unavailable";
  documentEvidenceIds?: string[];
  documentEvidenceFiles?: Array<{ id: string; fileUrl: string }>;
  citations?: Array<{
    id: string;
    source: string;
    relevance: string;
    score?: number;
    page?: number;
  }>;
  degradedContexts?: Array<{
    source: DegradedContextSource;
    reason: string;
  }>;
}

interface ContextRoutingResult {
  context: string;
  metadata: ContextRoutingMetadata;
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

export function buildRetrievalQueries(
  textQuery: string,
  messages: Message[],
  isReferential: boolean,
): string[] {
  const trimmedQuery = textQuery.trim();
  const recentConversation = getRecentConversationExcerpt(messages);

  if (!recentConversation) {
    return uniqueQueries([trimmedQuery || "Summarize the attached documents."]);
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
    attachmentKind?: "document" | "snippet";
    waitForProcessing?: boolean;
    processingTimeoutMs?: number;
    signal?: AbortSignal;
  },
) {
  if (!queries.length) return null;
  // Retrieval owns cross-variant RRF. Processing is awaited once, while every
  // rewrite contributes candidates instead of the first non-empty result winning.
  try {
    const result = await getRAGContext(queries[0], userId, {
      conversationId: options.conversationId,
      attachmentIds: options.attachmentIds,
      attachmentKind: options.attachmentKind,
      limit: 8,
      scoreThreshold: 0.55,
      waitForProcessing: options.waitForProcessing,
      processingTimeoutMs: options.processingTimeoutMs,
      queryVariants: queries.slice(1),
      signal: options.signal,
    });
    if (options.attachmentIds?.length) {
      const statuses = await prisma.attachment.findMany({
        where: {
          id: { in: options.attachmentIds },
          kind: options.attachmentKind ?? "document",
          message: { conversation: { userId } },
        },
        select: { id: true, processingStatus: true },
      });
      if (!allDocumentsReady(options.attachmentIds, statuses)) return null;
    }
    return result;
  } catch (error) {
    if (options.signal?.aborted)
      throw options.signal.reason ?? new DOMException("Aborted", "AbortError");
    logger.warn("[Context Router] RAG multi-query retrieval failed:", error);
    return null;
  }
}

export function allDocumentsReady(
  attachmentIds: string[],
  statuses: Array<{ id: string; processingStatus: string }>,
): boolean {
  const expected = new Set(attachmentIds);
  return (
    expected.size > 0 &&
    statuses.length === expected.size &&
    statuses.every(
      (item) => expected.has(item.id) && item.processingStatus === "COMPLETED",
    )
  );
}

function buildMissingDocumentContext(
  query: string,
  kind: "document" | "snippet" = "document",
): string {
  const target = kind === "snippet" ? "snippets" : "documents";
  const normalizedQuery = query.trim() || `the attached ${target}`;

  return (
    `\n\nIMPORTANT: The user attached ${target} but complete ${kind} evidence is unavailable for this request.` +
    `\n<${kind}_processing_notice>` +
    `\nUser's request: ${normalizedQuery}` +
    `\nDo NOT answer the ${kind} question from memory, the image alone, or partial ${kind} evidence.` +
    `\nTell the user you could not read all of the attached ${target} yet; processing, retrieval, or file access may have failed. Ask them to retry without asserting a specific cause.` +
    "\nDo NOT provide a general answer. Acknowledge the attachments and the missing evidence." +
    `\n</${kind}_processing_notice>`
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
  currentMessageId?: string,
  priorMessageIds?: string[],
  rootBefore?: Date,
  kind: "document" | "snippet" = "document",
): Promise<{
  hasDocuments: boolean;
  documentCount: number;
  documentAttachmentIds: string[];
  documentFiles: Array<{ id: string; fileUrl: string }>;
  currentMessageFound: boolean;
  hasSnippets?: boolean;
  currentMessageCreatedAt?: Date;
  currentMessageParentId?: string | null;
  unsupportedDocumentCount: number;
}> {
  try {
    const messages = await prisma.message.findMany({
      where: {
        conversationId,
        conversation: {
          userId,
        },
        isDeleted: false,
        role: "USER",
        ...(currentMessageId
          ? { id: currentMessageId }
          : priorMessageIds
            ? { id: { in: priorMessageIds } }
            : rootBefore
              ? {
                  parentMessageId: null,
                  createdAt: { lt: rootBefore },
                  attachments: { some: { kind } },
                }
              : {}),
      },
      ...(currentTurnOnly
        ? { orderBy: { createdAt: "desc" as const }, take: 1 }
        : rootBefore
          ? { orderBy: { createdAt: "desc" as const }, take: 2 }
          : {}),
      select: {
        createdAt: true,
        parentMessageId: true,
        attachments: {
          select: {
            id: true,
            fileType: true,
            kind: true,
            fileName: true,
            fileUrl: true,
          },
        },
      },
    });

    if (rootBefore && messages.length !== 1) {
      return {
        hasDocuments: false,
        documentCount: 0,
        documentAttachmentIds: [],
        documentFiles: [],
        currentMessageFound: false,
        unsupportedDocumentCount: 0,
      };
    }

    const hasSnippets = messages.some((message) =>
      message.attachments.some(
        (attachment) => attachmentKind(attachment) === "snippet",
      ),
    );
    const allAttachments = messages
      .slice(currentTurnOnly ? -1 : 0)
      .flatMap((message) => message.attachments)
      .filter((attachment) => attachmentKind(attachment) === kind);

    if (allAttachments.length === 0) {
      return {
        hasDocuments: false,
        documentCount: 0,
        documentAttachmentIds: [],
        documentFiles: [],
        currentMessageFound: messages.length > 0,
        hasSnippets,
        currentMessageCreatedAt: messages[0]?.createdAt,
        currentMessageParentId: messages[0]?.parentMessageId,
        unsupportedDocumentCount: 0,
      };
    }

    const retrievableDocumentAttachments = filterDocumentAttachments(
      allAttachments,
      kind,
    ).filter((att) => isSupportedForRAG(att.fileType));
    return {
      hasDocuments: retrievableDocumentAttachments.length > 0,
      documentCount: retrievableDocumentAttachments.length,
      documentAttachmentIds: retrievableDocumentAttachments
        .map((attachment) => attachment.id)
        .filter((id): id is string => Boolean(id)),
      documentFiles: retrievableDocumentAttachments.map(({ id, fileUrl }) => ({
        id,
        fileUrl,
      })),
      currentMessageFound: messages.length > 0,
      hasSnippets,
      currentMessageCreatedAt: messages[0]?.createdAt,
      currentMessageParentId: messages[0]?.parentMessageId,
      unsupportedDocumentCount:
        allAttachments.length - retrievableDocumentAttachments.length,
    };
  } catch (error) {
    logger.warn("[Context Router] Failed to get attachment info:", error);
    return {
      hasDocuments: false,
      documentCount: 0,
      documentAttachmentIds: [],
      documentFiles: [],
      currentMessageFound: false,
      unsupportedDocumentCount: 0,
    };
  }
}

export function shouldSkipTextContextForImage(
  hasImages: boolean,
  textQuery: string,
  hasDocuments: boolean,
): boolean {
  return hasImages && !hasDocuments && textQuery.trim().length < 3;
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
    currentMessageId?: string;
    branchId?: string;
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

  const addDegradedContext = (
    source: DegradedContextSource,
    reason: string,
  ) => {
    metadata.degradedContexts = [
      ...(metadata.degradedContexts || []),
      { source, reason },
    ];
  };

  const currentAttachmentInfo = conversationId
    ? await getAttachmentInfo(
        conversationId,
        userId,
        true,
        options?.currentMessageId,
      )
    : {
        hasDocuments: false,
        documentCount: 0,
        documentAttachmentIds: [],
        documentFiles: [],
        currentMessageFound: !options?.currentMessageId,
        unsupportedDocumentCount: 0,
      };
  if (
    options?.currentMessageId &&
    !currentAttachmentInfo.currentMessageFound &&
    hasImages
  ) {
    metadata.skippedMemory = true;
    metadata.documentContextState = "unavailable";
    metadata.routingDecision = RoutingDecision.Hybrid;
    metadata.hasDocuments = true;
    return { context: buildMissingDocumentContext(textQuery), metadata };
  }
  const priorMessageIds = currentAttachmentInfo.currentMessageFound
    ? messages.flatMap((message) =>
        message.role === MessageRole.USER && message.id ? [message.id] : [],
      )
    : [];
  const snippetCurrent =
    (referencesSnippet(textQuery) || currentAttachmentInfo.hasSnippets) &&
    conversationId &&
    currentAttachmentInfo.currentMessageFound
      ? await getAttachmentInfo(
          conversationId,
          userId,
          true,
          options?.currentMessageId,
          undefined,
          undefined,
          "snippet",
        )
      : null;
  const requestedChannel = requestedAttachmentKind(
    textQuery,
    hasImages,
    currentAttachmentInfo.hasDocuments ||
      currentAttachmentInfo.unsupportedDocumentCount > 0,
    Boolean(
      snippetCurrent?.hasDocuments || snippetCurrent?.unsupportedDocumentCount,
    ),
  );
  if (requestedChannel === "ambiguous") {
    metadata.skippedMemory = true;
    return {
      context:
        "The request refers to multiple attachment types without a specific target. Ask which attachment the user means; do not combine unrelated evidence.",
      metadata,
    };
  }
  if (requestedChannel === "image") {
    metadata.routingDecision = RoutingDecision.VisionOnly;
    metadata.skippedMemory = true;
    return { context: "", metadata };
  }
  const requestedKind: "document" | "snippet" =
    requestedChannel === "snippet" ? "snippet" : "document";
  const selectedCurrent =
    requestedKind === "document"
      ? currentAttachmentInfo
      : (snippetCurrent ?? {
          ...currentAttachmentInfo,
          hasDocuments: false,
          documentCount: 0,
          documentAttachmentIds: [],
          documentFiles: [],
          unsupportedDocumentCount: 0,
        });
  const allowVisibleLookback =
    isReferential &&
    conversationId &&
    priorMessageIds.length > 0 &&
    (!hasImages ||
      (requestedKind === "document"
        ? referencesDocument(textQuery)
        : referencesSnippet(textQuery)));
  const attachmentInfo =
    selectedCurrent.hasDocuments ||
    selectedCurrent.unsupportedDocumentCount > 0 ||
    !allowVisibleLookback
      ? selectedCurrent
      : await getAttachmentInfo(
          conversationId!,
          userId,
          false,
          undefined,
          priorMessageIds,
          undefined,
          requestedKind,
        );

  const canUseOlderRoot =
    isReferential &&
    conversationId &&
    !options?.branchId &&
    (!hasImages ||
      (requestedKind === "document"
        ? referencesDocument(textQuery)
        : referencesSnippet(textQuery))) &&
    !selectedCurrent.hasDocuments &&
    !selectedCurrent.unsupportedDocumentCount &&
    !attachmentInfo.hasDocuments &&
    !attachmentInfo.unsupportedDocumentCount &&
    options?.currentMessageId &&
    currentAttachmentInfo.currentMessageParentId === null &&
    currentAttachmentInfo.currentMessageCreatedAt;
  const rootAttachmentInfo = canUseOlderRoot
    ? await getAttachmentInfo(
        conversationId!,
        userId,
        false,
        undefined,
        undefined,
        currentAttachmentInfo.currentMessageCreatedAt,
        requestedKind,
      )
    : null;
  metadata.attachmentContextKind = requestedKind;
  const selectedAttachmentInfo =
    rootAttachmentInfo?.hasDocuments ||
    rootAttachmentInfo?.unsupportedDocumentCount
      ? rootAttachmentInfo
      : attachmentInfo;

  if (selectedAttachmentInfo.unsupportedDocumentCount > 0) {
    metadata.skippedMemory = true;
    metadata.documentCount =
      selectedAttachmentInfo.documentCount +
      selectedAttachmentInfo.unsupportedDocumentCount;
    metadata.hasDocuments = true;
    metadata.documentContextState = "unavailable";
    metadata.routingDecision = hasImages
      ? RoutingDecision.Hybrid
      : RoutingDecision.DocumentsOnly;
    metadata.documentEvidenceFiles = selectedAttachmentInfo.documentFiles;
    logMissingDocumentRetrieval({
      userId,
      conversationId,
      query: textQuery,
      documentCount: metadata.documentCount,
      isReferential,
    });
    return {
      context: buildMissingDocumentContext(textQuery, requestedKind),
      metadata,
    };
  }

  if (selectedAttachmentInfo.hasDocuments)
    metadata.documentEvidenceFiles = selectedAttachmentInfo.documentFiles;

  if (
    shouldSkipTextContextForImage(
      hasImages,
      textQuery,
      selectedAttachmentInfo.hasDocuments,
    )
  ) {
    metadata.routingDecision = RoutingDecision.VisionOnly;
    metadata.skippedMemory = true;
    return { context: "", metadata };
  }

  if (isReferential) {
    metadata.skippedMemory = true;

    if (selectedAttachmentInfo.hasDocuments) {
      const inlineResult = await tryInlineAttachmentContent(
        selectedAttachmentInfo.documentAttachmentIds,
        userId,
        options?.signal,
        requestedKind,
      );

      if (inlineResult) {
        metadata.hasDocuments = true;
        metadata.documentCount = selectedAttachmentInfo.documentCount;
        metadata.documentContextState = "ready";
        metadata.documentEvidenceIds =
          selectedAttachmentInfo.documentAttachmentIds;
        metadata.routingDecision = hasImages
          ? RoutingDecision.Hybrid
          : RoutingDecision.DocumentsOnly;
        return { context: inlineResult.context, metadata };
      }

      const ragResult = await resolveDocumentContext(retrievalQueries, userId, {
        conversationId,
        attachmentIds: selectedAttachmentInfo.documentAttachmentIds,
        attachmentKind: requestedKind,
        waitForProcessing: true,
        processingTimeoutMs: CHAT_DOCUMENT_WAIT_TIMEOUT_MS,
        signal: options?.signal,
      });

      if (ragResult) {
        metadata.hasDocuments = true;
        metadata.documentCount = selectedAttachmentInfo.documentCount;
        metadata.citations = ragResult.citations;
        metadata.documentContextState = "ready";
        metadata.documentEvidenceIds = ragResult.usedAttachmentIds;
        metadata.routingDecision = hasImages
          ? RoutingDecision.Hybrid
          : RoutingDecision.DocumentsOnly;

        if (hasImages) {
          metadata.routingDecision = RoutingDecision.Hybrid;
          return { context: ragResult.context, metadata };
        }

        return { context: ragResult.context, metadata };
      }

      metadata.documentCount = selectedAttachmentInfo.documentCount;
      metadata.hasDocuments = true;
      metadata.skippedMemory = true;
      metadata.documentContextState = "unavailable";
      metadata.routingDecision = hasImages
        ? RoutingDecision.Hybrid
        : RoutingDecision.DocumentsOnly;
      logMissingDocumentRetrieval({
        userId,
        conversationId,
        query: textQuery,
        documentCount: selectedAttachmentInfo.documentCount,
        isReferential,
      });
      return {
        context: buildMissingDocumentContext(textQuery, requestedKind),
        metadata,
      };
    }

    if (hasImages) {
      metadata.routingDecision = RoutingDecision.VisionOnly;
      return { context: "", metadata };
    }

    return { context: "", metadata };
  }

  if (selectedAttachmentInfo.hasDocuments) {
    const inlineResult = await tryInlineAttachmentContent(
      selectedAttachmentInfo.documentAttachmentIds,
      userId,
      options?.signal,
      requestedKind,
    );

    if (inlineResult) {
      metadata.hasDocuments = true;
      metadata.documentCount = selectedAttachmentInfo.documentCount;
      metadata.documentContextState = "ready";
      metadata.documentEvidenceIds =
        selectedAttachmentInfo.documentAttachmentIds;
      metadata.routingDecision = hasImages
        ? RoutingDecision.Hybrid
        : RoutingDecision.DocumentsOnly;
      return { context: inlineResult.context, metadata };
    }

    const ragResult = await resolveDocumentContext(retrievalQueries, userId, {
      conversationId,
      attachmentIds: selectedAttachmentInfo.documentAttachmentIds,
      attachmentKind: requestedKind,
      waitForProcessing: true,
      processingTimeoutMs: CHAT_DOCUMENT_WAIT_TIMEOUT_MS,
      signal: options?.signal,
    });

    if (ragResult) {
      metadata.hasDocuments = true;
      metadata.documentCount = selectedAttachmentInfo.documentCount;
      metadata.citations = ragResult.citations;
      metadata.documentContextState = "ready";
      metadata.documentEvidenceIds = ragResult.usedAttachmentIds;

      if (hasImages) {
        metadata.routingDecision = RoutingDecision.Hybrid;
        return { context: ragResult.context, metadata };
      }

      metadata.routingDecision = RoutingDecision.DocumentsOnly;
      return { context: ragResult.context, metadata };
    }

    // A current document was supplied but did not produce usable evidence.
    // Never substitute personal memory for the user's requested document.
    metadata.documentCount = selectedAttachmentInfo.documentCount;
    metadata.hasDocuments = true;
    metadata.documentContextState = "unavailable";
    metadata.routingDecision = hasImages
      ? RoutingDecision.Hybrid
      : RoutingDecision.DocumentsOnly;
    metadata.skippedMemory = true;
    logMissingDocumentRetrieval({
      userId,
      conversationId,
      query: textQuery,
      documentCount: selectedAttachmentInfo.documentCount,
      isReferential,
    });
    return {
      context: buildMissingDocumentContext(textQuery, requestedKind),
      metadata,
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
    const degradation = memoryGateDegradation(memoryDecision);
    if (degradation) addDegradedContext(degradation.source, degradation.reason);
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
      DegradedContextSource.Memory,
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
