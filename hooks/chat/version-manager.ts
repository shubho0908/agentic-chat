import { type Message, type MessageContentPart } from "@/lib/schemas/chat";
import { type VersionData } from "./types";

export function createNewVersion(
  existingVersions: Message[],
  role: "user" | "assistant",
  content: string | MessageContentPart[],
  messageId: string,
  model?: string
): Message {
  const cleanedVersions = existingVersions.filter(v => v.id && !v.id.startsWith('temp-'));
  
  const maxSiblingIndex = cleanedVersions.length > 0 
    ? Math.max(...cleanedVersions.map(v => v.siblingIndex ?? 0))
    : 0;
  
  const newVersion: Message = {
    id: messageId,
    role,
    content,
    timestamp: Date.now(),
    siblingIndex: maxSiblingIndex + 1,
  };

  if (model) {
    newVersion.model = model;
  }

  return newVersion;
}

export function getCleanedVersions(message: Message): Message[] {
  const existingVersions = message.versions || [];
  return existingVersions.filter(v => v.id && !v.id.startsWith('temp-'));
}

export function buildUpdatedVersionsList(
  message: Message,
  newVersion: Message
): Message[] {
  const cleanedVersions = getCleanedVersions(message);
  return [...cleanedVersions, newVersion];
}

export async function fetchMessageVersions(
  conversationId: string,
  parentMessageId: string
): Promise<Message[]> {
  try {
    const versionsResponse = await fetch(
      `/api/conversations/${conversationId}/messages/${parentMessageId}/versions`
    );
    
    if (!versionsResponse.ok) {
      return [];
    }

    const versionsData = await versionsResponse.json();
    if (versionsData?.versions && Array.isArray(versionsData.versions)) {
      return versionsData.versions.map((v: VersionData) => ({
        id: v.id,
        role: v.role as 'user' | 'assistant',
        content: v.content,
        timestamp: new Date(v.createdAt).getTime(),
        attachments: v.attachments || [],
        siblingIndex: v.siblingIndex,
      }));
    }

    return [];
  } catch (err) {
    console.error("Failed to fetch message versions:", err);
    return [];
  }
}

export function updateMessageWithVersions(
  message: Message,
  newMessageId: string,
  versions: Message[]
): Message {
  return { 
    ...message, 
    id: newMessageId,
    versions: versions.length > 0 ? versions : message.versions 
  };
}
