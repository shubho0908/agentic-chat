import { z } from "zod";
import { ToolStatus } from "@/types/core";

export const messageRoleSchema = z.enum(["user", "assistant", "system"]);

export const toolStatusSchema = z.enum(ToolStatus);

const attachmentSchema = z.object({
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

const messageContentPartSchema = z.union([
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

const messageHistoryEntrySchema = z.object({
  content: z.union([z.string(), z.array(messageContentPartSchema)]),
  attachments: z.array(attachmentSchema).optional(),
  editedAt: z.number(),
});

const toolActivitySchema = z.object({
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

const baseMessageSchema = z.object({
  role: messageRoleSchema,
  content: z.union([z.string(), z.array(messageContentPartSchema)]),
  id: z.string().optional(),
  timestamp: z.number().optional(),
  model: z.string().optional(),
  attachments: z.array(attachmentSchema).optional(),
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

export const messageMetadataSchema = z.object({
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
  researchTask: z.object({
    gateDecision: z.object({
      shouldResearch: z.boolean(),
      reason: z.string(),
      confidence: z.enum(['low', 'medium', 'high']),
    }).optional(),
    totalTasks: z.number().optional(),
    completedTasks: z.number().optional(),
  }).optional(),
}).optional();

export type AttachmentInput = z.infer<typeof attachmentInputSchema>;

// Re-export types from centralized location for backwards compatibility
export type {
  MessageRole,
  Attachment,
  MessageContentPart,
  MessageHistoryEntry,
  ToolActivity,
  Message,
  ChatRequest,
  ChatError,
} from "@/types/core";
