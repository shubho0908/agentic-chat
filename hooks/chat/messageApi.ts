import { type Attachment, type MessageContentPart, type MessageMetadata } from "@/lib/schemas/chat";
import { extractTextFromContent } from "@/lib/contentUtils";
import type { FinalizeEditedMessageResponse, UpdateMessageResponse } from "@/types/chat";
import { isSupportedForRAG } from "@/lib/rag/utils";


import { logger } from "@/lib/logger";
interface SavedMessageWithAttachments {
  id: string;
  attachments?: Array<{
    id: string;
    fileType: string;
  }>;
}

function logDocumentProcessingDispatchError(context: string, error: unknown): void {
  logger.warn(`[Message API] Failed to ${context}:`, error);
}

async function processDocumentsAsync(attachmentIds: string[]): Promise<void> {
  if (attachmentIds.length === 0) return;

  try {
    if (attachmentIds.length === 1) {
      fetch('/api/documents/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attachmentId: attachmentIds[0] }),
        keepalive: true,
      }).catch((error) => {
        logDocumentProcessingDispatchError('dispatch single document processing', error);
      });
    } else {
      fetch('/api/documents/process-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attachmentIds }),
        keepalive: true,
      }).catch((error) => {
        logDocumentProcessingDispatchError('dispatch batch document processing', error);
      });
    }
  } catch (error) {
    logDocumentProcessingDispatchError('schedule document processing', error);
  }
}

export async function saveUserMessage(
  conversationId: string,
  content: string | MessageContentPart[],
  attachments?: Attachment[],
  signal?: AbortSignal
): Promise<string | null> {
  try {
    const contentToSave = extractTextFromContent(content);

    const response = await fetch(`/api/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role: "USER",
        content: contentToSave,
        attachments: attachments || [],
      }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to save message: ${response.statusText}`);
    }

    const savedMessage: SavedMessageWithAttachments = await response.json();
    
    if (savedMessage.attachments && savedMessage.attachments.length > 0) {
      const documentAttachmentIds = savedMessage.attachments
        .filter((att) => isSupportedForRAG(att.fileType))
        .map((att) => att.id);
      
      if (documentAttachmentIds.length > 0) {
        processDocumentsAsync(documentAttachmentIds);
      }
    }
    
    return savedMessage.id;
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw err;
    }
    logger.error("Failed to save user message:", err);
    return null;
  }
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

    const response = await fetch(`/api/conversations/${conversationId}/messages`, {
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
    logger.error("Failed to save assistant message:", err);
    return null;
  }
}

export async function finalizeEditedMessage(
  conversationId: string,
  messageId: string,
  content: string | MessageContentPart[],
  assistantContent: string,
  attachments?: Attachment[],
  assistantMetadata?: MessageMetadata,
  signal?: AbortSignal
): Promise<FinalizeEditedMessageResponse> {
  const contentToSave = extractTextFromContent(content);

  const response = await fetch(`/api/conversations/${conversationId}/messages/${messageId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: contentToSave,
      attachments: attachments || [],
      assistantContent,
      assistantMetadata,
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Failed to finalize edited message: ${response.statusText}`);
  }

  const finalized: FinalizeEditedMessageResponse = await response.json();

  if (finalized.updatedMessage.attachments && finalized.updatedMessage.attachments.length > 0) {
    const documentAttachmentIds = finalized.updatedMessage.attachments
      .filter((att) => att.id && isSupportedForRAG(att.fileType))
      .map((att) => att.id as string);

    if (documentAttachmentIds.length > 0) {
      processDocumentsAsync(documentAttachmentIds);
    }
  }

  return finalized;
}

export async function updateAssistantMessage(
  conversationId: string,
  messageId: string,
  content: string,
  metadata?: MessageMetadata
): Promise<UpdateMessageResponse> {
  const body = {
    content,
    ...(metadata && { metadata }),
  };

  const response = await fetch(`/api/conversations/${conversationId}/messages/${messageId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Failed to update assistant message: ${response.statusText}`);
  }

  return await response.json();
}
