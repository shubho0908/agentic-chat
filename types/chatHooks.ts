import type { Message } from "@/lib/schemas/chat";
import type { ReasoningEffortLevel } from "@/constants/openai-models";
import type { MemoryStatus } from "./chat";
import type { ArtifactEvent } from "./artifact";
import type { QueryClient } from "@tanstack/react-query";

export interface BaseChatContext {
  messages: Message[];
  conversationId: string | null;
  abortSignal: AbortSignal;
  queryClient: QueryClient;
  session?: { user: { id: string } };
  onMessagesUpdate: (updater: (prev: Message[]) => Message[]) => void;
  saveToCacheMutate: (data: { query: string; response: string; model: string; reasoningEffort?: ReasoningEffortLevel | null }) => void;
  onMemoryStatusUpdate?: (status: MemoryStatus) => void;
  onArtifact?: (event: ArtifactEvent) => void;
  branchId?: string;
  onBranchIdUpdate?: (branchId: string) => void;
}

export interface SendMessageContext extends BaseChatContext {
  onConversationIdUpdate: (id: string) => void;
  onNavigate: (path: string) => void;
}

export type EditMessageContext = BaseChatContext;
export type RegenerateContext = BaseChatContext;
