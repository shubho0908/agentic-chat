import { type Message, type Attachment, type MessageContentPart } from "@/lib/schemas/chat";

export interface VersionData {
  id: string;
  role: string;
  content: string;
  createdAt: string;
  siblingIndex: number;
  attachments?: Attachment[];
}

export interface UseChatOptions {
  initialMessages?: Message[];
  conversationId?: string | null;
}

export interface UseChatReturn {
  messages: Message[];
  isLoading: boolean;
  sendMessage: (content: string, session?: { user: { id: string } }, attachments?: Attachment[]) => Promise<void>;
  editMessage: (messageId: string, newContent: string, attachments?: Attachment[]) => Promise<void>;
  regenerateResponse: (messageId: string) => Promise<void>;
  clearChat: () => void;
  stopGeneration: () => void;
  memoryStatus?: MemoryStatus;
}

export interface UpdateMessageResponse {
  id: string;
  role: string;
  content: string;
  createdAt: string;
  conversationId: string;
  parentMessageId: string | null;
  siblingIndex: number;
  attachments: Attachment[];
}

export interface ConversationResult {
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
}

export interface CacheCheckResult {
  cached: boolean;
  response?: string;
}

export interface MemoryStatus {
  hasMemories: boolean;
  hasDocuments: boolean;
  memoryCount: number;
  documentCount: number;
  hasImages: boolean;
  imageCount: number;
  routingDecision?: 'vision-only' | 'documents-only' | 'memory-only' | 'hybrid';
  skippedMemory?: boolean;
}

export interface StreamConfig {
  messages: Array<{ role: "user" | "assistant" | "system"; content: string | MessageContentPart[] }>;
  model: string;
  signal: AbortSignal;
  onChunk: (fullContent: string) => void;
  conversationId?: string | null;
  onMemoryStatus?: (status: MemoryStatus) => void;
}
