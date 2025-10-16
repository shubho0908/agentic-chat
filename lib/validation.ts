import { VALIDATION_LIMITS } from '@/constants/validation';

function isValidCuid(id: string): boolean {
  if (!id || typeof id !== 'string') {
    return false;
  }

  const cuidPattern = /^c[a-z0-9]{24}$/;
  return cuidPattern.test(id);
}

export function isValidConversationId(id: string): boolean {
  return isValidCuid(id);
}

interface ValidationResult {
  valid: boolean;
  error?: string;
}

const VALID_DB_ROLES = ['USER', 'ASSISTANT', 'SYSTEM'] as const;
const VALID_CHAT_ROLES = ['user', 'assistant', 'system'] as const;

function isValidDBRole(role: string): boolean {
  return (VALID_DB_ROLES as readonly string[]).includes(role);
}

function isValidChatRole(role: string): boolean {
  return (VALID_CHAT_ROLES as readonly string[]).includes(role);
}

export function validateMessageData(
  role: string | null | undefined,
  content: string | null | undefined
): ValidationResult {
  if (typeof role !== 'string') {
    return { valid: false, error: 'Role must be a string' };
  }

  if (!isValidDBRole(role)) {
    return { valid: false, error: 'Invalid role. Must be USER, ASSISTANT, or SYSTEM' };
  }

  if (typeof content !== 'string') {
    return { valid: false, error: 'Content must be a string' };
  }

  if (!content.trim()) {
    return { valid: false, error: 'Content cannot be empty or whitespace-only' };
  }

  if (content.length > VALIDATION_LIMITS.MESSAGE_CONTENT_MAX_LENGTH) {
    return { valid: false, error: 'Content is too long' };
  }

  return { valid: true };
}

function validateChatMessage(message: Record<string, unknown>): ValidationResult {
  if (!message.role || !message.content) {
    return { valid: false, error: 'Each message must have role and content' };
  }

  if (typeof message.role !== 'string') {
    return { valid: false, error: 'Message role must be a string' };
  }

  if (!isValidChatRole(message.role)) {
    return { valid: false, error: 'Invalid message role. Must be user, assistant, or system' };
  }

  if (typeof message.content === 'string') {
    if (!message.content.trim()) {
      return { valid: false, error: 'Message content cannot be empty or whitespace-only' };
    }

    if (message.content.length > VALIDATION_LIMITS.CHAT_MESSAGE_MAX_LENGTH) {
      return { valid: false, error: 'Message content is too long' };
    }
  } else if (Array.isArray(message.content)) {
    if (message.content.length === 0) {
      return { valid: false, error: 'Message content array cannot be empty' };
    }

    for (const part of message.content) {
      if (typeof part !== 'object' || part === null) {
        return { valid: false, error: 'Content parts must be objects' };
      }

      const contentPart = part as Record<string, unknown>;
      if (!contentPart.type) {
        return { valid: false, error: 'Content part must have a type' };
      }

      if (contentPart.type === 'text') {
        if (typeof contentPart.text !== 'string' || !contentPart.text.trim()) {
          return { valid: false, error: 'Text content part must have non-empty text' };
        }
      } else if (contentPart.type === 'image_url') {
        const imageUrl = contentPart.image_url as Record<string, unknown>;
        if (!imageUrl || typeof imageUrl.url !== 'string' || !imageUrl.url.trim()) {
          return { valid: false, error: 'Image content part must have a valid URL' };
        }
      } else {
        return { valid: false, error: 'Invalid content part type. Must be text or image_url' };
      }
    }
  } else {
    return { valid: false, error: 'Message content must be a string or array' };
  }

  return { valid: true };
}

export function validateChatMessages(messages: Array<Record<string, unknown>>): ValidationResult {
  if (!Array.isArray(messages)) {
    return { valid: false, error: 'Messages must be an array' };
  }

  if (messages.length === 0) {
    return { valid: false, error: 'Messages array cannot be empty' };
  }

  if (messages.length > VALIDATION_LIMITS.CHAT_MESSAGES_MAX_COUNT) {
    return { valid: false, error: `Too many messages. Maximum ${VALIDATION_LIMITS.CHAT_MESSAGES_MAX_COUNT} allowed` };
  }

  for (let i = 0; i < messages.length; i++) {
    const result = validateChatMessage(messages[i]);
    if (!result.valid) {
      return { valid: false, error: `Message ${i + 1}: ${result.error}` };
    }
  }

  return { valid: true };
}

function isValidUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    // Only allow http and https protocols
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  } catch {
    return false;
  }
}

function validateAttachment(attachment: unknown): ValidationResult {
  if (!attachment || typeof attachment !== 'object') {
    return { valid: false, error: 'Attachment must be an object' };
  }

  const att = attachment as Record<string, unknown>;
  if (typeof att.fileUrl !== 'string' || !att.fileUrl.trim()) {
    return { valid: false, error: 'Attachment fileUrl is required and must be a non-empty string' };
  }
  if (!isValidUrl(att.fileUrl)) {
    return { valid: false, error: 'Attachment fileUrl must be a valid HTTP/HTTPS URL' };
  }
  if (typeof att.fileName !== 'string' || !att.fileName.trim()) {
    return { valid: false, error: 'Attachment fileName is required and must be a non-empty string' };
  }

  if (att.fileName.length > VALIDATION_LIMITS.ATTACHMENT_FILE_NAME_MAX_LENGTH) {
    return { valid: false, error: `Attachment fileName exceeds maximum length of ${VALIDATION_LIMITS.ATTACHMENT_FILE_NAME_MAX_LENGTH}` };
  }

  if (typeof att.fileType !== 'string' || !att.fileType.trim()) {
    return { valid: false, error: 'Attachment fileType is required and must be a non-empty string' };
  }

  if (att.fileType.length > VALIDATION_LIMITS.ATTACHMENT_FILE_TYPE_MAX_LENGTH) {
    return { valid: false, error: `Attachment fileType exceeds maximum length of ${VALIDATION_LIMITS.ATTACHMENT_FILE_TYPE_MAX_LENGTH}` };
  }

  if (typeof att.fileSize !== 'number' || att.fileSize < 0) {
    return { valid: false, error: 'Attachment fileSize must be a non-negative number' };
  }

  if (att.fileSize > VALIDATION_LIMITS.ATTACHMENT_MAX_FILE_SIZE) {
    return { valid: false, error: `Attachment fileSize exceeds maximum of ${VALIDATION_LIMITS.ATTACHMENT_MAX_FILE_SIZE} bytes` };
  }

  return { valid: true };
}

export function validateAttachments(attachments: unknown): ValidationResult {
  if (!Array.isArray(attachments)) {
    return { valid: false, error: 'Attachments must be an array' };
  }

  if (attachments.length > VALIDATION_LIMITS.ATTACHMENT_MAX_COUNT) {
    return { valid: false, error: `Too many attachments. Maximum ${VALIDATION_LIMITS.ATTACHMENT_MAX_COUNT} allowed` };
  }

  for (let i = 0; i < attachments.length; i++) {
    const result = validateAttachment(attachments[i]);
    if (!result.valid) {
      return { valid: false, error: `Attachment ${i + 1}: ${result.error}` };
    }
  }

  return { valid: true };
}
