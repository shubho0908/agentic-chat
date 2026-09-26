import { getMemoryContextResult } from "./memory";
import { getRAGContext } from "./rag/retrieval/context";
import type { Message } from "@/lib/schemas/chat";
import { MessageRole } from "@/lib/schemas/chat";
import { DegradedContextSource, RoutingDecision } from "@/types/chat";
import { prisma } from "./prisma";
import { isSupportedForRAG } from "./rag/utils";
import { extractTextFromMessage } from "./chat/messageContent";
import { mediateMemoryIntent } from "./chat/requestMediator";
import { estimateMemoryEntryCount } from "./chat/memoryPolicy";
import { memoryGateDegradation } from "./jev/memoryGate";
import { extractTextQuery, isReferentialQuery } from "./chat/referentialQuery";
import { getConversationResourceCatalog } from "./chat/resourceCatalog";
import { selectConversationResource } from "./chat/resourceSelection";

import { logger } from "@/lib/logger";
import { safeFetch } from "@/lib/network/safeFetch";
import { isTrustedAttachmentUrl } from "@/lib/network/ssrf";

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
  historicalImageFiles?: Array<{ id: string; fileUrl: string }>;
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

  const catalog =
    conversationId && options?.currentMessageId
      ? await getConversationResourceCatalog({
          conversationId,
          userId,
          currentMessageId: options.currentMessageId,
          visibleMessages: messages,
          branchId: options.branchId,
        })
      : null;
  if (catalog && !catalog.foundCurrent) {
    metadata.skippedMemory = true;
    metadata.documentContextState = "unavailable";
    return { context: "<document_processing_notice>The current message could not be verified. Do not use other attachments. Ask the user to retry.</document_processing_notice>", metadata };
  }
  if (catalog && !catalog.complete) {
    metadata.skippedMemory = true;
    return { context: "<document_processing_notice>Historical attachment search was incomplete. Ask the user to name or reattach the file. Do not guess from partial history.</document_processing_notice>", metadata };
  }
  const selection = catalog?.foundCurrent
    ? selectConversationResource(textQuery, hasImages, catalog.resources)
    : null;
  if (catalog && selection?.state === "none" && /\b(?:this|that|these|those|earlier|previous|prior|old|attached|uploaded)\s+(?:images?|photos?|pictures?|documents?|pdfs?|files?|attachments?|snippets?)\b/i.test(textQuery)) {
    metadata.skippedMemory = true;
    return { context: "<document_processing_notice>The referenced attachment could not be identified. Ask the user to name or reattach it; do not guess.</document_processing_notice>", metadata };
  }
  if (selection?.state === "ambiguous") {
    metadata.skippedMemory = true;
    return {
      context:
        "<document_processing_notice>Several attachments could match that request. Ask which file the user means before using evidence.</document_processing_notice>",
      metadata,
    };
  }
  const selectedHistoricalImages = selection?.state === "selected"
    ? (selection.kind === "image" ? selection.resources : selection.images ?? [])
        .filter((resource) => !resource.current)
    : [];
  if (selectedHistoricalImages.some((resource) =>
    !resource.fileType.toLowerCase().startsWith("image/") ||
    !/^https:\/\//i.test(resource.fileUrl) ||
    !isTrustedAttachmentUrl(resource.fileUrl)
  )) {
    metadata.skippedMemory = true;
    return {
      context: "<document_processing_notice>The referenced image URL could not be verified as trusted image storage. Ask the user to reattach it; do not guess from other images.</document_processing_notice>",
      metadata,
    };
  }
  if (selection?.state === "selected" && selection.kind === "image") {
    const historicalImages = selection.resources.filter((resource) => !resource.current);
    if (historicalImages.length) metadata.historicalImageFiles = historicalImages.map(({ id, fileUrl }) => ({ id, fileUrl }));
    metadata.hasImages = hasImages || selection.resources.length > 0;
    metadata.imageCount = imageCount + historicalImages.length;
    metadata.routingDecision = RoutingDecision.VisionOnly;
    metadata.skippedMemory = true;
    return { context: "", metadata };
  }
  const selectedResource =
    selection?.state === "selected" && selection.kind !== "image"
      ? selection
      : null;
  const catalogAttachmentInfo = selectedResource
    ? {
        hasDocuments: selectedResource.resources.some((resource) =>
          isSupportedForRAG(resource.fileType),
        ),
        documentCount: selectedResource.resources.filter((resource) =>
          isSupportedForRAG(resource.fileType),
        ).length,
        documentAttachmentIds: selectedResource.resources
          .filter((resource) => isSupportedForRAG(resource.fileType))
          .map((resource) => resource.id),
        documentFiles: selectedResource.resources
          .filter((resource) => isSupportedForRAG(resource.fileType))
          .map(({ id, fileUrl }) => ({ id, fileUrl })),
        unsupportedDocumentCount: selectedResource.resources.filter(
          (resource) => !isSupportedForRAG(resource.fileType),
        ).length,
      }
    : null;
  if (selectedResource && catalogAttachmentInfo) {
    const kind = selectedResource.kind as "document" | "snippet";
    metadata.attachmentContextKind = kind;
    const historicalImages = selectedResource.images?.filter((resource) => !resource.current) || [];
    if (historicalImages.length) metadata.historicalImageFiles = historicalImages.map(({ id, fileUrl }) => ({ id, fileUrl }));
    const hasSelectedImages = hasImages || historicalImages.length > 0;
    metadata.hasImages = hasSelectedImages;
    metadata.imageCount = imageCount + historicalImages.length;
    metadata.documentEvidenceFiles = catalogAttachmentInfo.documentFiles;
    if (catalogAttachmentInfo.unsupportedDocumentCount > 0) {
      metadata.skippedMemory = true;
      metadata.hasDocuments = true;
      metadata.documentCount = selectedResource.resources.length;
      metadata.documentContextState = "unavailable";
      metadata.routingDecision = hasSelectedImages
        ? RoutingDecision.Hybrid
        : RoutingDecision.DocumentsOnly;
      return {
        context: buildMissingDocumentContext(textQuery, kind),
        metadata,
      };
    }
    const inlineResult = await tryInlineAttachmentContent(
      catalogAttachmentInfo.documentAttachmentIds,
      userId,
      options?.signal,
      kind,
    );
    const ragResult = inlineResult
      ? null
      : await resolveDocumentContext(retrievalQueries, userId, {
          conversationId,
          attachmentIds: catalogAttachmentInfo.documentAttachmentIds,
          attachmentKind: kind,
          waitForProcessing: true,
          processingTimeoutMs: CHAT_DOCUMENT_WAIT_TIMEOUT_MS,
          signal: options?.signal,
        });
    metadata.hasDocuments = true;
    metadata.documentCount = catalogAttachmentInfo.documentCount;
    metadata.routingDecision = hasSelectedImages
      ? RoutingDecision.Hybrid
      : RoutingDecision.DocumentsOnly;
    if (inlineResult || ragResult) {
      metadata.documentContextState = "ready";
      metadata.documentEvidenceIds = inlineResult
        ? catalogAttachmentInfo.documentAttachmentIds
        : ragResult!.usedAttachmentIds;
      if (ragResult) metadata.citations = ragResult.citations;
      return { context: inlineResult?.context ?? ragResult!.context, metadata };
    }
    metadata.skippedMemory = true;
    metadata.documentContextState = "unavailable";
    return { context: buildMissingDocumentContext(textQuery, kind), metadata };
  }

  if (!catalog && hasImages) {
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
