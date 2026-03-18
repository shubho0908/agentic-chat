import type { Attachment, Message } from "@/lib/schemas/chat";
import type { MemoryStatus } from "@/types/chat";
import { extractTextFromContent } from "@/lib/contentUtils";
import { storeConversationMemory } from "@/lib/memory";
import {
  shouldPersistConversationMemory,
  type MemoryPersistenceFlow,
} from "@/lib/chat/memoryPolicy";

interface PersistConversationMemoryArgs {
  userMessageContent: string | Message["content"];
  assistantContent: string;
  userId?: string;
  memoryEnabled?: boolean;
  activeTool?: string | null;
  deepResearchEnabled?: boolean;
  userAttachments?: Attachment[];
  memoryStatus?: Pick<MemoryStatus, "routingDecision">;
  flow?: MemoryPersistenceFlow;
}

export function persistConversationMemoryIfEligible({
  userMessageContent,
  assistantContent,
  userId,
  memoryEnabled = true,
  activeTool,
  deepResearchEnabled = false,
  userAttachments,
  memoryStatus,
  flow = "send",
}: PersistConversationMemoryArgs): void {
  if (!userId || !memoryEnabled) {
    return;
  }

  const userMessage = extractTextFromContent(userMessageContent);
  if (
    !shouldPersistConversationMemory({
      userMessage,
      assistantMessage: assistantContent,
      activeTool,
      deepResearchEnabled,
      userAttachments,
      memoryStatus,
      flow,
    })
  ) {
    return;
  }

  storeConversationMemory(userMessage, assistantContent, userId).catch((error) => {
    console.error("[Memory] Failed to store conversation memory:", error);
  });
}
