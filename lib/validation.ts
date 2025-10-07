import { VALIDATION_LIMITS } from '@/constants/validation';

export function isValidCuid(id: string): boolean {
  if (!id || typeof id !== 'string') {
    return false;
  }

  const cuidPattern = /^c[a-z0-9]{24}$/;
  return cuidPattern.test(id);
}

export function isValidConversationId(id: string): boolean {
  return isValidCuid(id);
}

export interface ValidationResult {
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

export function validateChatMessage(message: Record<string, string>): ValidationResult {
  if (!message.role || !message.content) {
    return { valid: false, error: 'Each message must have role and content' };
  }

  if (typeof message.role !== 'string') {
    return { valid: false, error: 'Message role must be a string' };
  }

  if (!isValidChatRole(message.role)) {
    return { valid: false, error: 'Invalid message role. Must be user, assistant, or system' };
  }

  if (typeof message.content !== 'string') {
    return { valid: false, error: 'Message content must be a string' };
  }

  if (!message.content.trim()) {
    return { valid: false, error: 'Message content cannot be empty or whitespace-only' };
  }

  if (message.content.length > VALIDATION_LIMITS.CHAT_MESSAGE_MAX_LENGTH) {
    return { valid: false, error: 'Message content is too long' };
  }

  return { valid: true };
}

export function validateChatMessages(messages: Array<Record<string, string>>): ValidationResult {
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
