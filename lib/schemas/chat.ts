import { z } from "zod";

export const messageRoleSchema = z.enum(["user", "assistant", "system"]);

export const messageSchema = z.object({
  role: messageRoleSchema,
  content: z.string(),
  id: z.string().optional(),
  timestamp: z.number().optional(),
  model: z.string().optional(),
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
export type Message = z.infer<typeof messageSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatError = z.infer<typeof chatErrorSchema>;
