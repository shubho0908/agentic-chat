import { type Message, type Attachment, type MessageContentPart } from "@/lib/schemas/chat";

export enum RoutingDecision {
  VisionOnly = 'vision-only',
  DocumentsOnly = 'documents-only',
  MemoryOnly = 'memory-only',
  Hybrid = 'hybrid',
  ToolOnly = 'tool-only',
}

export enum ToolStatus {
  Calling = 'calling',
  Completed = 'completed',
  Error = 'error',
}

export enum ToolProgressStatus {
  Searching = 'searching',
  Found = 'found',
  ProcessingSources = 'processing_sources',
  Completed = 'completed',
}

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

export interface SendMessageOptions {
  content: string;
  session?: { user: { id: string } };
  attachments?: Attachment[];
  activeTool?: string | null;
}

export interface EditMessageOptions {
  messageId: string;
  content: string;
  attachments?: Attachment[];
  activeTool?: string | null;
}

export interface RegenerateMessageOptions {
  messageId: string;
  activeTool?: string | null;
}

export interface UseChatReturn {
  messages: Message[];
  isLoading: boolean;
  sendMessage: (options: SendMessageOptions) => Promise<void>;
  editMessage: (options: EditMessageOptions) => Promise<void>;
  regenerateResponse: (options: RegenerateMessageOptions) => Promise<void>;
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
  routingDecision?: RoutingDecision;
  skippedMemory?: boolean;
  activeToolName?: string;
  toolProgress?: {
    status: ToolProgressStatus;
    message: string;
    details?: {
      query?: string;
      resultsCount?: number;
      responseTime?: number;
      sources?: WebSearchSource[];
      currentSource?: WebSearchSource;
      processedCount?: number;
    };
  };
}

export type ToolArgValue = string | number | boolean | null | Array<string | number | boolean>;
export type ToolArgs = Record<string, ToolArgValue>;

export interface ToolCallEvent {
  toolName: string;
  toolCallId: string;
  args: ToolArgs;
}

export interface ToolResultEvent {
  toolName: string;
  toolCallId: string;
  result: string;
}

export interface WebSearchSource {
  title: string;
  url: string;
  domain: string;
  snippet: string;
  score: number;
  position: number;
}

export interface ToolProgressEvent {
  toolName: string;
  status: ToolProgressStatus;
  message: string;
  details?: {
    query?: string;
    resultsCount?: number;
    responseTime?: number;
    sources?: WebSearchSource[];
    currentSource?: WebSearchSource;
    processedCount?: number;
  };
}

export interface ToolActivity {
  toolCallId: string;
  toolName: string;
  status: ToolStatus;
  args: ToolArgs;
  result?: string;
  error?: string;
  timestamp: number;
}

export interface StreamConfig {
  messages: Array<{ role: "user" | "assistant" | "system"; content: string | MessageContentPart[] }>;
  model: string;
  signal: AbortSignal;
  onChunk: (fullContent: string) => void;
  conversationId?: string | null;
  onMemoryStatus?: (status: MemoryStatus) => void;
  onToolCall?: (toolCall: ToolCallEvent) => void;
  onToolResult?: (toolResult: ToolResultEvent) => void;
  onToolProgress?: (progress: ToolProgressEvent) => void;
  activeTool?: string | null;
}
