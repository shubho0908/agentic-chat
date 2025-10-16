import type { Message } from "@/lib/schemas/chat";
import type { MemoryStatus } from "./chat";
import type { QueryClient } from "@tanstack/react-query";

export interface BaseChatContext {
  messages: Message[];
  conversationId: string | null;
  abortSignal: AbortSignal;
  queryClient: QueryClient;
  onMessagesUpdate: (updater: (prev: Message[]) => Message[]) => void;
  saveToCacheMutate: (data: { query: string; response: string }) => void;
  onMemoryStatusUpdate?: (status: MemoryStatus) => void;
}

export interface SendMessageContext extends BaseChatContext {
  onConversationIdUpdate: (id: string) => void;
  onNavigate: (path: string) => void;
}

export type EditMessageContext = BaseChatContext;
export type RegenerateContext = BaseChatContext;
