import { z } from "zod";

export const messageRoleSchema = z.enum(["user", "assistant", "system"]);

const attachmentSchema = z.object({
  id: z.string().optional(),
  fileUrl: z.string(),
  fileName: z.string(),
  fileType: z.string(),
  fileSize: z.number(),
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

const messageSchema = z.object({
  role: messageRoleSchema,
  content: z.union([z.string(), z.array(messageContentPartSchema)]),
  id: z.string().optional(),
  timestamp: z.number().optional(),
  model: z.string().optional(),
  attachments: z.array(attachmentSchema).optional(),
});

export const chatRequestSchema = z.object({
  messages: z.array(messageSchema),
});

export const chatErrorSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  details: z.unknown().optional(),
});

export type MessageRole = z.infer<typeof messageRoleSchema>;
export type Attachment = z.infer<typeof attachmentSchema>;
export type AttachmentInput = z.infer<typeof attachmentInputSchema>;
export type MessageContentPart = z.infer<typeof messageContentPartSchema>;
export type Message = z.infer<typeof messageSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatError = z.infer<typeof chatErrorSchema>;
