import type { Prisma } from "@prisma/client";

interface SharedMessageInput {
  id: string;
  role: string;
  content: string;
  metadata?: Prisma.JsonValue;
  createdAt: Date;
  siblingIndex: number;
  attachments?: { id: string; fileUrl: string; fileName: string; fileType: string; fileSize: number }[];
  versions?: SharedMessageInput[];
}

interface SharedConversationInput {
  id: string;
  title: string | null;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
  messages: SharedMessageInput[];
}

const SAFE_METADATA_KEYS = new Set([
  "thinking",
  "thinkingDurationMs",
  "toolActivities",
  "images",
  "citations",
  "sources",
  "followUpQuestions",
]);

function redactMetadata(metadata: Prisma.JsonValue | undefined): Record<string, unknown> | undefined {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return undefined;
  const safe: Record<string, unknown> = {};
  for (const key of SAFE_METADATA_KEYS) {
    if (key in metadata && metadata[key] !== undefined) {
      safe[key] = metadata[key];
    }
  }
  return Object.keys(safe).length > 0 ? safe : undefined;
}

interface RedactedMessage {
  id: string;
  role: string;
  content: string;
  metadata: Record<string, unknown> | undefined;
  createdAt: Date;
  siblingIndex: number;
  attachments: { id: string; fileUrl: string; fileName: string; fileType: string; fileSize: number }[];
  versions: RedactedMessage[];
}

function redactMessage(msg: SharedMessageInput): RedactedMessage {
  return {
    id: msg.id,
    role: msg.role.toLowerCase(),
    content: msg.content,
    metadata: redactMetadata(msg.metadata),
    createdAt: msg.createdAt,
    siblingIndex: msg.siblingIndex,
    attachments: msg.attachments || [],
    versions: (msg.versions || []).map(redactMessage),
  };
}

export function redactSharedConversation(conversation: SharedConversationInput) {
  return {
    id: conversation.id,
    title: conversation.title,
    isPublic: conversation.isPublic,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messages: conversation.messages.map(redactMessage),
  };
}
