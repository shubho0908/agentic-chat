import { z } from "zod";
import { VALIDATION_LIMITS } from "@/constants/validation";
import { HumanInTheLoopRequestKind } from "@/lib/tools/constants";
import { HUMAN_IN_THE_LOOP_REQUEST_TYPE } from "../orchestrator/constants";
import { ArtifactType } from "@/types/artifact";

const messageRoleSchema = z.enum(["user", "assistant", "system"]);

const toolStatusSchema = z.enum(["calling", "completed", "error"]);

const attachmentSchema = z.object({
  id: z.string().optional(),
  fileUrl: z.url(),
  fileName: z.string(),
  fileType: z.string(),
  fileSize: z.number().int(),
});

export const attachmentInputSchema = z.object({
  fileUrl: z.url(),
  fileName: z.string().min(1).max(VALIDATION_LIMITS.ATTACHMENT_FILE_NAME_MAX_LENGTH),
  fileType: z.string().min(1).max(VALIDATION_LIMITS.ATTACHMENT_FILE_TYPE_MAX_LENGTH),
  fileSize: z.number().int().min(0).max(VALIDATION_LIMITS.ATTACHMENT_MAX_FILE_SIZE),
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

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ])
);

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
  result: jsonValueSchema.optional(),
  error: z.string().optional(),
  timestamp: z.number(),
});

const artifactMetadataSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    ArtifactType.HTML,
    ArtifactType.REACT,
    ArtifactType.SVG,
    ArtifactType.MERMAID,
    ArtifactType.CODE,
    ArtifactType.MARKDOWN,
  ]),
  title: z.string().min(1),
  language: z.string().min(1).optional(),
  content: z.string(),
  createdAt: z.number(),
});

const messageMetadataBaseSchema = z.object({
  thinking: z.string().optional(),
  thinkingDurationMs: z.number().optional(),
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
    searchIndex: z.number().optional(),
    searchQuery: z.string().optional(),
  })).optional(),
  images: z.array(z.object({
    url: z.string(),
    description: z.string().optional(),
    searchIndex: z.number().optional(),
    searchQuery: z.string().optional(),
  })).optional(),
  humanInTheLoopRequest: z.object({
    type: z.literal(HUMAN_IN_THE_LOOP_REQUEST_TYPE).optional(),
    requestKind: z.enum([HumanInTheLoopRequestKind.APPROVAL, HumanInTheLoopRequestKind.ASK_USER]).optional(),
    requestId: z.string().optional(),
    threadId: z.string().optional(),
    toolCallId: z.string().optional(),
    question: z.string().optional(),
    reason: z.string().optional(),
    title: z.string().optional(),
    context: z.string().optional(),
    options: z.array(z.object({
      label: z.string(),
      description: z.string(),
    })).optional(),
    recommendation: z.string().optional(),
    toolCalls: z.array(z.object({
      id: z.string().optional(),
      name: z.string(),
      args: z.record(z.string(), jsonValueSchema).optional(),
    })).optional(),
  }).optional(),
  humanInTheLoopStatus: z.enum(["pending", "approved", "denied"]).optional(),
  toolActivities: z.array(toolActivitySchema).optional(),
  artifacts: z.array(artifactMetadataSchema).optional(),
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
  thinking: z.string().optional(),
});

type MessageType = z.infer<typeof baseMessageSchema> & {
  versions?: MessageType[];
};

export const messageSchema: z.ZodType<MessageType> = baseMessageSchema.extend({
  versions: z.array(z.lazy(() => messageSchema)).optional(),
});

export type MessageRole = z.infer<typeof messageRoleSchema>;
export type ToolStatus = z.infer<typeof toolStatusSchema>;
export type Attachment = z.infer<typeof attachmentSchema>;
export type AttachmentInput = z.infer<typeof attachmentInputSchema>;
export type MessageContentPart = z.infer<typeof messageContentPartSchema>;
export type ToolActivity = z.infer<typeof toolActivitySchema>;
export type Message = z.infer<typeof messageSchema>;
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

type ToolArgValue = string | number | boolean | null | Array<string | number | boolean>;
export type ToolArgs = Record<string, ToolArgValue>;
