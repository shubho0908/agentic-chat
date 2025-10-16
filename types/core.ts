/**
 * Core domain types for messages, attachments, and content
 * Single source of truth for all core data structures
 */

export interface Attachment {
  id?: string;
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}

export const MessageRole = {
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system',
} as const;

export type MessageRole = typeof MessageRole[keyof typeof MessageRole];

export interface MessageContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;
  };
}

export type MessageContent = string | MessageContentPart[];

export interface MessageHistoryEntry {
  content: MessageContent;
  attachments?: Attachment[];
  editedAt: number;
}

export interface MessageMetadata {
  citations?: Array<{
    id: string;
    source: string;
    author?: string;
    year?: string;
    url?: string;
    relevance: string;
  }>;
  followUpQuestions?: string[];
  sources?: Array<{
    position?: number;
    title: string;
    url: string;
    domain: string;
    snippet?: string;
    score?: number;
  }>;
  researchTask?: {
    gateDecision?: {
      shouldResearch: boolean;
      reason: string;
      confidence: 'low' | 'medium' | 'high';
    };
    totalTasks?: number;
    completedTasks?: number;
  };
}

export interface Message {
  id?: string;
  role: MessageRole;
  content: MessageContent;
  timestamp?: number;
  model?: string;
  attachments?: Attachment[];
  metadata?: MessageMetadata;
  editHistory?: MessageHistoryEntry[];
  parentMessageId?: string | null;
  siblingIndex?: number;
  toolActivities?: ToolActivity[];
  versions?: Message[];
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

export type ToolArgValue = string | number | boolean | null | Array<string | number | boolean>;
export type ToolArgs = Record<string, ToolArgValue>;

export enum ToolStatus {
  Calling = 'calling',
  Completed = 'completed',
  Error = 'error',
}

export interface ChatRequest {
  messages: Message[];
}

export interface ChatError {
  error: string;
  message?: string;
  details?: string | number | Record<string, string>;
}
