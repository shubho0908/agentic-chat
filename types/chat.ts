import type { Attachment, Message, ToolArgs, MessageContentPart } from '@/lib/schemas/chat';
import type { WebSearchSource, YouTubeVideo, ResearchTask } from './tools';
import type { GateDecision, EvaluationResult, Citation } from './deep-research';
import type { SearchDepth } from '@/lib/schemas/web-search.tools';

export enum RoutingDecision {
  VisionOnly = 'vision-only',
  DocumentsOnly = 'documents-only',
  MemoryOnly = 'memory-only',
  Hybrid = 'hybrid',
  ToolOnly = 'tool-only',
  UrlContent = 'url-content',
}

export enum ToolProgressStatus {
  Searching = 'searching',
  Found = 'found',
  ProcessingSources = 'processing_sources',
  Completed = 'completed',
}

export interface TokenUsage {
  used: number;
  limit: number;
  remaining: number;
  percentage: number;
  breakdown: {
    conversation: number;
    images: number;
  };
}

export interface MemoryStatus {
  hasMemories: boolean;
  hasDocuments: boolean;
  memoryCount: number;
  documentCount: number;
  hasImages: boolean;
  imageCount: number;
  hasUrls: boolean;
  urlCount: number;
  routingDecision?: RoutingDecision;
  skippedMemory?: boolean;
  activeToolName?: string;
  tokenUsage?: TokenUsage;
  toolProgress?: {
    status: ToolProgressStatus | string;
    message: string;
    details?: {
      // Web search fields
      query?: string;
      resultsCount?: number;
      responseTime?: number;
      sources?: WebSearchSource[];
      currentSource?: WebSearchSource;
      processedCount?: number;
      searchDepth?: SearchDepth;
      phase?: number;
      totalPhases?: number;

      // YouTube fields
      videoCount?: number;
      videos?: YouTubeVideo[];
      failedCount?: number;
      currentVideo?: YouTubeVideo;

      // Google Suite fields
      operation?: string;
      tool?: string;
      error?: string;

      // Deep research fields
      status?: string; // Deep research status
      gateDecision?: GateDecision;
      skipped?: boolean;
      researchPlan?: ResearchTask[];
      currentTaskIndex?: number;
      totalTasks?: number;
      completedTasks?: ResearchTask[];
      evaluationResult?: EvaluationResult;
      currentAttempt?: number;
      maxAttempts?: number;
      strictnessLevel?: 0 | 1 | 2;
      citations?: Citation[];
      followUpQuestions?: string[];
      wordCount?: number;
      toolProgress?: {
        toolName: string;
        status: string;
        message: string;
      };
    };
  };
}

export interface VersionData {
  id: string;
  role: string;
  content: string;
  metadata?: Record<string, unknown>;
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
  memoryEnabled?: boolean;
  deepResearchEnabled?: boolean;
  searchDepth?: SearchDepth;
}

export type MessageSendHandler = (
  content: string,
  attachments?: Attachment[],
  activeTool?: string | null,
  memoryEnabled?: boolean,
  deepResearchEnabled?: boolean,
  searchDepth?: SearchDepth
) => Promise<void> | void;

export interface EditMessageOptions {
  messageId: string;
  content: string;
  attachments?: Attachment[];
  activeTool?: string | null;
  memoryEnabled?: boolean;
  deepResearchEnabled?: boolean;
  searchDepth?: SearchDepth;
}

export interface RegenerateMessageOptions {
  messageId: string;
  activeTool?: string | null;
  memoryEnabled?: boolean;
  deepResearchEnabled?: boolean;
  searchDepth?: SearchDepth;
}

export interface ContinueConversationOptions {
  userMessage: Message;
  session?: { user: { id: string } };
  activeTool?: string | null;
  memoryEnabled?: boolean;
  deepResearchEnabled?: boolean;
  searchDepth?: SearchDepth;
}

export interface UseChatReturn {
  messages: Message[];
  isLoading: boolean;
  sendMessage: (options: SendMessageOptions) => Promise<void>;
  editMessage: (options: EditMessageOptions) => Promise<void>;
  regenerateResponse: (options: RegenerateMessageOptions) => Promise<void>;
  continueConversation: (options: ContinueConversationOptions) => Promise<void>;
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
  onUsageUpdated?: (usage: { usageCount: number; remaining: number; limit: number }) => void;
  activeTool?: string | null;
  memoryEnabled?: boolean;
  deepResearchEnabled?: boolean;
  searchDepth?: SearchDepth;
}
