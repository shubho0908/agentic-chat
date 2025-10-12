import { type Attachment, type MessageContentPart } from "@/lib/schemas/chat";
import { extractTextFromContent } from "@/lib/content-utils";
import { type UpdateMessageResponse } from "./types";

interface SavedMessageWithAttachments {
  id: string;
  attachments?: Array<{
    id: string;
    fileType: string;
  }>;
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
      }).catch(() => {
        // Silent failure - processing will be retried if needed
      });
    } else {
      fetch('/api/documents/process-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attachmentIds }),
        keepalive: true,
      }).catch(() => {
        // Silent failure - processing will be retried if needed
      });
    }
  } catch {
    // Silent failure - processing will be retried if needed
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
        .filter((att) => !att.fileType.startsWith('image/'))
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
    console.error("Failed to save user message:", err);
    return null;
  }
}

export async function saveAssistantMessage(
  conversationId: string,
  content: string
): Promise<string | null> {
  try {
    const response = await fetch(`/api/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role: "ASSISTANT",
        content,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to save message: ${response.statusText}`);
    }

    const savedMessage = await response.json();
    return savedMessage.id;
  } catch (err) {
    console.error("Failed to save assistant message:", err);
    return null;
  }
}

export async function updateUserMessage(
  conversationId: string,
  messageId: string,
  content: string | MessageContentPart[],
  attachments?: Attachment[],
  signal?: AbortSignal
): Promise<UpdateMessageResponse> {
  try {
    const contentToSave = extractTextFromContent(content);

    const response = await fetch(`/api/conversations/${conversationId}/messages/${messageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: contentToSave,
        attachments: attachments || [],
      }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to update message: ${response.statusText}`);
    }

    const updatedMessage: UpdateMessageResponse = await response.json();
    
    if (updatedMessage.attachments && updatedMessage.attachments.length > 0) {
      const documentAttachmentIds = updatedMessage.attachments
        .filter((att) => att.id && !att.fileType.startsWith('image/'))
        .map((att) => att.id as string);
      
      if (documentAttachmentIds.length > 0) {
        processDocumentsAsync(documentAttachmentIds);
      }
    }

    return updatedMessage;
  } catch (err) {
    console.error("Failed to update user message:", err);
    throw err;
  }
}

export async function updateAssistantMessage(
  conversationId: string,
  messageId: string,
  content: string
): Promise<UpdateMessageResponse | null> {
  try {
    const response = await fetch(`/api/conversations/${conversationId}/messages/${messageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content,
        attachments: [],
      }),
    });
    
    if (response.ok) {
      return await response.json();
    }
    return null;
  } catch (err) {
    console.error("Failed to update assistant message:", err);
    return null;
  }
}

export async function deleteMessagesAfter(
  conversationId: string,
  messageId: string
): Promise<void> {
  try {
    await fetch(`/api/conversations/${conversationId}/messages/delete-after`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId }),
    });
  } catch (err) {
    console.error("Failed to delete messages:", err);
  }
}

export async function storeMemory(
  userMessage: string,
  assistantMessage: string,
  conversationId: string | null
): Promise<void> {
  try {
    await fetch('/api/memory/store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userMessage,
        assistantMessage,
        conversationId,
      }),
    });
  } catch (err) {
    console.error('[Memory] Storage failed:', err);
  }
}
