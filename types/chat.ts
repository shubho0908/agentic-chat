import type { Attachment, Message, ToolArgs, MessageContentPart } from './core';
import type { WebSearchSource, YouTubeVideo } from './tools';
import { WebSearchProgressStatus } from './tools';

export enum RoutingDecision {
  VisionOnly = 'vision-only',
  DocumentsOnly = 'documents-only',
  MemoryOnly = 'memory-only',
  Hybrid = 'hybrid',
  ToolOnly = 'tool-only',
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
  toolProgress?: {
    toolName: string;
    status: WebSearchProgressStatus | string;
    message: string;
    details?: {
      query?: string;
      resultsCount?: number;
      responseTime?: number;
      sources?: WebSearchSource[];
      currentSource?: WebSearchSource;
      processedCount?: number;
      videoCount?: number;
      videos?: YouTubeVideo[];
      failedCount?: number;
      currentVideo?: YouTubeVideo;
    };
  };
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
  memoryEnabled?: boolean;
}

export type MessageSendHandler = (
  content: string,
  attachments?: Attachment[],
  memoryEnabled?: boolean
) => Promise<void> | void;

export interface EditMessageOptions {
  messageId: string;
  content: string;
  attachments?: Attachment[];
  memoryEnabled?: boolean;
}

export interface RegenerateMessageOptions {
  messageId: string;
  memoryEnabled?: boolean;
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

export interface ToolProgressEvent {
  toolName: string;
  status: WebSearchProgressStatus | string;
  message: string;
  details?: {
    query?: string;
    resultsCount?: number;
    responseTime?: number;
    sources?: WebSearchSource[];
    currentSource?: WebSearchSource;
    processedCount?: number;
    videoCount?: number;
    videos?: YouTubeVideo[];
    failedCount?: number;
    currentVideo?: YouTubeVideo;
  };
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
  memoryEnabled?: boolean;
}
