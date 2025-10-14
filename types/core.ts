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

export enum MessageRole {
  User = 'user',
  Assistant = 'assistant',
  System = 'system',
}

export type MessageRoleType = 'user' | 'assistant' | 'system';

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

export interface Message {
  id?: string;
  role: MessageRoleType;
  content: MessageContent;
  timestamp?: number;
  model?: string;
  attachments?: Attachment[];
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
