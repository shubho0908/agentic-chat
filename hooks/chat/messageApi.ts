import { type Attachment, type MessageContentPart, type MessageMetadata } from "@/lib/schemas/chat";
import { extractTextFromContent } from "@/lib/contentUtils";
import type { FinalizeEditedMessageResponse, UpdateMessageResponse } from "@/types/chat";
import { isSupportedForRAG } from "@/lib/rag/utils";
import { apiRoutes } from "@/lib/routes";

import { logger } from "@/lib/logger";
interface SavedMessageWithAttachments {
  id: string;
  attachments?: Array<{
    id: string;
    fileType: string;
  }>;
}

function logDocumentProcessingDispatchError(context: string, error: unknown): void {
  try {
    logger.warn(`[Message API] Failed to ${context}:`, error);
  } catch {
    // Swallow — logging must never crash
  }
}

async function processDocumentsAsync(attachmentIds: string[]): Promise<void> {
  if (attachmentIds.length === 0) return;

  try {
    if (attachmentIds.length === 1) {
      await fetch(apiRoutes.documentsProcess, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attachmentId: attachmentIds[0] }),
      });
    } else {
      await fetch(apiRoutes.documentsProcessBatch, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attachmentIds }),
      });
    }
  } catch (error) {
    logDocumentProcessingDispatchError('process documents', error);
  }
}

function isAbortError(err: unknown): boolean {
  return (
    err !== null &&
    err !== undefined &&
    typeof err === "object" &&
    (err as Record<string, unknown>).name === "AbortError"
  );
}

function waitBeforeRetry(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function saveUserMessage(
  conversationId: string,
  content: string | MessageContentPart[],
  attachments?: Attachment[],
  signal?: AbortSignal,
  clientMessageId?: string
): Promise<string | null> {
  const contentToSave = extractTextFromContent(content);
  const payload = {
    role: "USER",
    content: contentToSave,
    attachments: attachments || [],
    ...(clientMessageId && { id: clientMessageId }),
  };

  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) {
      try {
        await waitBeforeRetry(500, signal);
      } catch (err) {
        if (isAbortError(err)) throw err;
      }
    }

    try {
      const response = await fetch(apiRoutes.conversationMessages(conversationId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal,
      });

      if (!response.ok) {
        let serverMessage = response.statusText;
        try {
          const errorData = await response.json();
          if (typeof errorData?.message === "string") serverMessage = errorData.message;
          else if (typeof errorData?.error === "string") serverMessage = errorData.error;
        } catch {
          // Non-JSON error body — keep statusText
        }
        lastError = new Error(`Failed to save message (${response.status}): ${serverMessage}`);
        if (response.status < 500) {
          break;
        }
        continue;
      }

      const savedMessage: SavedMessageWithAttachments = await response.json();

      if (response.status === 201 && savedMessage.attachments && savedMessage.attachments.length > 0) {
        const documentAttachmentIds = savedMessage.attachments
          .flatMap((att) => isSupportedForRAG(att.fileType) ? [att.id] : []);

        if (documentAttachmentIds.length > 0) {
          await processDocumentsAsync(documentAttachmentIds);
        }
      }

      return savedMessage.id;
    } catch (err) {
      if (isAbortError(err)) {
        throw err;
      }
      lastError = err;
    }
  }

  try {
    logger.error("Failed to save user message:", lastError);
  } catch {
    // Swallow — logging must never crash the application
  }
  return null;
}

export async function saveAssistantMessage(
  conversationId: string,
  content: string,
  metadata?: MessageMetadata
): Promise<string | null> {
  try {
    const body = {
      role: "ASSISTANT" as const,
      content,
      ...(metadata && { metadata }),
    };

    const response = await fetch(apiRoutes.conversationMessages(conversationId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Failed to save message: ${response.statusText}`);
    }

    const savedMessage = await response.json();
    return savedMessage.id;
  } catch (err) {
    try {
      logger.error("Failed to save assistant message:", err);
    } catch {
      // Swallow — logging must never crash the application
    }
    return null;
  }
}

export async function finalizeEditedMessage(
  conversationId: string,
  messageId: string,
  content: string | MessageContentPart[],
  assistantContent: string,
  assistantMessageId?: string,
  attachments?: Attachment[],
  assistantMetadata?: MessageMetadata,
  signal?: AbortSignal
): Promise<FinalizeEditedMessageResponse> {
  const contentToSave = extractTextFromContent(content);

  const response = await fetch(apiRoutes.conversationMessage(conversationId, messageId), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: contentToSave,
      attachments: attachments || [],
      assistantContent,
      assistantMessageId,
      assistantMetadata,
    }),
    signal,
  });

  if (!response.ok) {
    let errorMessage = `Failed to finalize edited message: ${response.statusText}`;
    try {
      const errorData = await response.json();
      if (errorData?.error && typeof errorData.error === "string") {
        errorMessage = errorData.error;
      } else if (errorData?.message && typeof errorData.message === "string") {
        errorMessage = errorData.message;
      }
    } catch (error) {
      try {
        logger.warn("Failed to parse finalize edited message error response:", error);
      } catch {
        // Swallow — logging must never crash the application
      }
    }
    throw new Error(errorMessage);
  }

  const finalized: FinalizeEditedMessageResponse = await response.json();

  if (finalized.updatedMessage.attachments && finalized.updatedMessage.attachments.length > 0) {
    const documentAttachmentIds = finalized.updatedMessage.attachments
      .flatMap((att) => typeof att.id === "string" && isSupportedForRAG(att.fileType) ? [att.id] : []);

    if (documentAttachmentIds.length > 0) {
      await processDocumentsAsync(documentAttachmentIds);
    }
  }

  return finalized;
}

export async function updateAssistantMessage(
  conversationId: string,
  messageId: string,
  content: string,
  metadata?: MessageMetadata,
  inPlace?: boolean
): Promise<UpdateMessageResponse> {
  const body = {
    content,
    ...(inPlace && { inPlace: true }),
    ...(metadata && { metadata }),
  };

  const response = await fetch(apiRoutes.conversationMessage(conversationId, messageId), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Failed to update assistant message: ${response.statusText}`);
  }

  return await response.json();
}
