import { VALIDATION_LIMITS } from "@/constants/validation";
import { isTrustedAttachmentUrl } from "@/lib/network/ssrf";
import {
  attachmentInputSchema,
  messageSchema,
  type AttachmentInput,
  type Message,
} from "@/lib/schemas/chat";
import { isRecord } from "@/lib/typeGuards";

function isValidCuid(id: string): boolean {
  if (!id || typeof id !== "string") {
    return false;
  }

  const cuidPattern = /^c[a-z0-9]{24}$/;
  return cuidPattern.test(id);
}

export function isValidConversationId(id: string): boolean {
  return isValidCuid(id);
}

export function isValidMessageId(id: string): boolean {
  return isValidCuid(id);
}

export function isValidAttachmentId(id: string): boolean {
  return isValidCuid(id);
}

interface ValidationResult {
  valid: boolean;
  error?: string;
}

const VALID_DB_ROLES = ["USER", "ASSISTANT", "SYSTEM"] as const;
const VALID_CHAT_ROLES = ["user", "assistant", "system"] as const;

function isValidDBRole(role: string): boolean {
  return (VALID_DB_ROLES as readonly string[]).includes(role);
}

function isValidChatRole(role: string): boolean {
  return (VALID_CHAT_ROLES as readonly string[]).includes(role);
}

export function validateMessageData(
  role: string | null | undefined,
  content: string | null | undefined,
): ValidationResult {
  if (typeof role !== "string") {
    return { valid: false, error: "Role must be a string" };
  }

  if (!isValidDBRole(role)) {
    return {
      valid: false,
      error: "Invalid role. Must be USER, ASSISTANT, or SYSTEM",
    };
  }

  if (typeof content !== "string") {
    return { valid: false, error: "Content must be a string" };
  }

  if (!content.trim()) {
    return {
      valid: false,
      error: "Content cannot be empty or whitespace-only",
    };
  }

  if (content.length > VALIDATION_LIMITS.MESSAGE_CONTENT_MAX_LENGTH) {
    return { valid: false, error: "Content is too long" };
  }

  return { valid: true };
}

function validateChatMessage(message: unknown): ValidationResult {
  if (!isRecord(message)) {
    return { valid: false, error: "Each message must be an object" };
  }

  if (!message.role || !message.content) {
    return { valid: false, error: "Each message must have role and content" };
  }

  if (typeof message.role !== "string") {
    return { valid: false, error: "Message role must be a string" };
  }

  if (!isValidChatRole(message.role)) {
    return {
      valid: false,
      error: "Invalid message role. Must be user, assistant, or system",
    };
  }

  if (typeof message.content === "string") {
    if (!message.content.trim()) {
      return {
        valid: false,
        error: "Message content cannot be empty or whitespace-only",
      };
    }

    if (message.content.length > VALIDATION_LIMITS.CHAT_MESSAGE_MAX_LENGTH) {
      return { valid: false, error: "Message content is too long" };
    }
  } else if (Array.isArray(message.content)) {
    if (message.content.length === 0) {
      return { valid: false, error: "Message content array cannot be empty" };
    }

    for (const part of message.content) {
      if (!isRecord(part)) {
        return { valid: false, error: "Content parts must be objects" };
      }

      if (!part.type) {
        return { valid: false, error: "Content part must have a type" };
      }

      if (part.type === "text") {
        if (typeof part.text !== "string" || !part.text.trim()) {
          return {
            valid: false,
            error: "Text content part must have non-empty text",
          };
        }
      } else if (part.type === "image_url") {
        const imageUrl = part.image_url;
        if (
          !isRecord(imageUrl) ||
          typeof imageUrl.url !== "string" ||
          !imageUrl.url.trim()
        ) {
          return {
            valid: false,
            error: "Image content part must have a valid URL",
          };
        }
        if (!isTrustedAttachmentUrl(imageUrl.url)) {
          return {
            valid: false,
            error:
              "Image content part URL must point to trusted uploaded storage",
          };
        }
      } else {
        return {
          valid: false,
          error: "Invalid content part type. Must be text or image_url",
        };
      }
    }
  } else {
    return { valid: false, error: "Message content must be a string or array" };
  }

  return { valid: true };
}

export function validateChatMessages(
  messages: unknown,
): { valid: true; messages: Message[] } | { valid: false; error: string } {
  if (!Array.isArray(messages)) {
    return { valid: false, error: "Messages must be an array" };
  }

  if (messages.length === 0) {
    return { valid: false, error: "Messages array cannot be empty" };
  }

  if (messages.length > VALIDATION_LIMITS.CHAT_MESSAGES_MAX_COUNT) {
    return {
      valid: false,
      error: `Too many messages. Maximum ${VALIDATION_LIMITS.CHAT_MESSAGES_MAX_COUNT} allowed`,
    };
  }

  for (let i = 0; i < messages.length; i++) {
    const result = validateChatMessage(messages[i]);
    if (!result.valid) {
      return { valid: false, error: `Message ${i + 1}: ${result.error}` };
    }
  }

  const parsedMessages = messageSchema.array().safeParse(messages);
  if (!parsedMessages.success) {
    return {
      valid: false,
      error: "Messages do not match the chat message contract",
    };
  }

  return { valid: true, messages: parsedMessages.data };
}

function isValidUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return (
      (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") &&
      !parsedUrl.username &&
      !parsedUrl.password
    );
  } catch {
    return false;
  }
}

type AttachmentValidationResult =
  | { valid: true; attachment: AttachmentInput }
  | { valid: false; error: string };

function validateAttachment(attachment: unknown): AttachmentValidationResult {
  if (!isRecord(attachment)) {
    return { valid: false, error: "Attachment must be an object" };
  }

  if (typeof attachment.fileUrl !== "string" || !attachment.fileUrl.trim()) {
    return {
      valid: false,
      error: "Attachment fileUrl is required and must be a non-empty string",
    };
  }
  if (!isValidUrl(attachment.fileUrl)) {
    return {
      valid: false,
      error: "Attachment fileUrl must be a valid HTTP/HTTPS URL",
    };
  }
  if (!isTrustedAttachmentUrl(attachment.fileUrl)) {
    return {
      valid: false,
      error: "Attachment fileUrl must point to trusted uploaded storage",
    };
  }
  if (typeof attachment.fileName !== "string" || !attachment.fileName.trim()) {
    return {
      valid: false,
      error: "Attachment fileName is required and must be a non-empty string",
    };
  }

  if (
    attachment.fileName.length >
    VALIDATION_LIMITS.ATTACHMENT_FILE_NAME_MAX_LENGTH
  ) {
    return {
      valid: false,
      error: `Attachment fileName exceeds maximum length of ${VALIDATION_LIMITS.ATTACHMENT_FILE_NAME_MAX_LENGTH}`,
    };
  }

  if (typeof attachment.fileType !== "string" || !attachment.fileType.trim()) {
    return {
      valid: false,
      error: "Attachment fileType is required and must be a non-empty string",
    };
  }

  if (
    attachment.fileType.length >
    VALIDATION_LIMITS.ATTACHMENT_FILE_TYPE_MAX_LENGTH
  ) {
    return {
      valid: false,
      error: `Attachment fileType exceeds maximum length of ${VALIDATION_LIMITS.ATTACHMENT_FILE_TYPE_MAX_LENGTH}`,
    };
  }

  if (typeof attachment.fileSize !== "number" || attachment.fileSize < 0) {
    return {
      valid: false,
      error: "Attachment fileSize must be a non-negative number",
    };
  }

  if (attachment.fileSize > VALIDATION_LIMITS.ATTACHMENT_MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `Attachment fileSize exceeds maximum of ${VALIDATION_LIMITS.ATTACHMENT_MAX_FILE_SIZE} bytes`,
    };
  }

  const parsedAttachment = attachmentInputSchema.safeParse(attachment);
  if (!parsedAttachment.success) {
    return {
      valid: false,
      error: "Attachment shape does not match the attachment input contract",
    };
  }

  return { valid: true, attachment: parsedAttachment.data };
}

export function validateAttachmentInputs(
  attachments: unknown,
):
  | { valid: true; attachments: AttachmentInput[] }
  | { valid: false; error: string } {
  if (!Array.isArray(attachments)) {
    return { valid: false, error: "Attachments must be an array" };
  }

  if (attachments.length > VALIDATION_LIMITS.ATTACHMENT_MAX_COUNT) {
    return {
      valid: false,
      error: `Too many attachments. Maximum ${VALIDATION_LIMITS.ATTACHMENT_MAX_COUNT} allowed`,
    };
  }

  const validated: AttachmentInput[] = [];

  for (let i = 0; i < attachments.length; i++) {
    const attachment = attachments[i];
    const result = validateAttachment(attachment);
    if (!result.valid) {
      return { valid: false, error: `Attachment ${i + 1}: ${result.error}` };
    }

    validated.push(result.attachment);
  }

  return { valid: true, attachments: validated };
}
