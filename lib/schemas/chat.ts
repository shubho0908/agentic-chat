import { z } from "zod";

export const messageRoleSchema = z.enum(["user", "assistant", "system"]);

export const toolStatusSchema = z.enum(["calling", "completed", "error"]);

export const attachmentSchema = z.object({
  id: z.string().optional(),
  fileUrl: z.url(),
  fileName: z.string(),
  fileType: z.string(),
  fileSize: z.number().int(),
});

export const attachmentInputSchema = z.object({
  fileUrl: z.url(),
  fileName: z.string().min(1).max(255),
  fileType: z.string().min(1).max(100),
  fileSize: z.number().int().min(0).max(16 * 1024 * 1024),
});

export const messageContentPartSchema = z.union([
  z.object({
    type: z.literal("text"),
    text: z.string(),
  }),
  z.object({
    type: z.literal("image_url"),
    image_url: z.object({
      url: z.string(),
    }),
  }),
]);

export const messageHistoryEntrySchema = z.object({
  content: z.union([z.string(), z.array(messageContentPartSchema)]),
  attachments: z.array(attachmentSchema).optional(),
  editedAt: z.number(),
});

export const toolActivitySchema = z.object({
  toolCallId: z.string(),
  toolName: z.string(),
  status: toolStatusSchema,
  args: z.record(z.string(), z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(z.union([z.string(), z.number(), z.boolean()])),
  ])),
  result: z.string().optional(),
  error: z.string().optional(),
  timestamp: z.number(),
});

const messageMetadataBaseSchema = z.object({
  citations: z.array(z.object({
    id: z.string(),
    source: z.string(),
    author: z.string().optional(),
    year: z.string().optional(),
    url: z.string().optional(),
    relevance: z.string(),
  })).optional(),
  followUpQuestions: z.array(z.string()).optional(),
  sources: z.array(z.object({
    position: z.number().optional(),
    title: z.string(),
    url: z.string(),
    domain: z.string(),
    snippet: z.string().optional(),
    score: z.number().optional(),
  })).optional(),
  images: z.array(z.object({
    url: z.string(),
    description: z.string().optional(),
  })).optional(),
  researchTask: z.object({
    gateDecision: z.object({
      shouldResearch: z.boolean(),
      reason: z.string(),
      confidence: z.enum(['low', 'medium', 'high']),
    }).optional(),
    totalTasks: z.number().optional(),
    completedTasks: z.number().optional(),
  }).optional(),
});

export const messageMetadataSchema = messageMetadataBaseSchema.optional();

const baseMessageSchema = z.object({
  role: messageRoleSchema,
  content: z.union([z.string(), z.array(messageContentPartSchema)]),
  id: z.string().optional(),
  timestamp: z.number().optional(),
  model: z.string().optional(),
  attachments: z.array(attachmentSchema).optional(),
  metadata: messageMetadataSchema,
  editHistory: z.array(messageHistoryEntrySchema).optional(),
  parentMessageId: z.string().nullable().optional(),
  siblingIndex: z.number().optional(),
  toolActivities: z.array(toolActivitySchema).optional(),
});

type MessageType = z.infer<typeof baseMessageSchema> & {
  versions?: MessageType[];
};

export const messageSchema: z.ZodType<MessageType> = baseMessageSchema.extend({
  versions: z.array(z.lazy(() => messageSchema)).optional(),
});

export const chatRequestSchema = z.object({
  messages: z.array(messageSchema),
});

export const chatErrorSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  details: z.union([z.string(), z.number(), z.record(z.string(), z.string())]).optional(),
});

export type MessageRole = z.infer<typeof messageRoleSchema>;
export type ToolStatus = z.infer<typeof toolStatusSchema>;
export type Attachment = z.infer<typeof attachmentSchema>;
export type AttachmentInput = z.infer<typeof attachmentInputSchema>;
export type MessageContentPart = z.infer<typeof messageContentPartSchema>;
export type MessageHistoryEntry = z.infer<typeof messageHistoryEntrySchema>;
export type ToolActivity = z.infer<typeof toolActivitySchema>;
export type Message = z.infer<typeof messageSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatError = z.infer<typeof chatErrorSchema>;
export type MessageMetadata = z.infer<typeof messageMetadataBaseSchema>;

export const MessageRole = {
  USER: 'user' as const,
  ASSISTANT: 'assistant' as const,
  SYSTEM: 'system' as const,
} as const;

export const ToolStatus = {
  Calling: 'calling' as const,
  Completed: 'completed' as const,
  Error: 'error' as const,
} as const;

export type ToolArgValue = string | number | boolean | null | Array<string | number | boolean>;
export type ToolArgs = Record<string, ToolArgValue>;
