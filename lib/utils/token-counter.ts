import { encoding_for_model, type TiktokenModel } from 'tiktoken';
import type { Message, MessageContentPart } from '@/lib/schemas/chat';
import type { TokenUsage } from '@/types/chat';
import { OPENAI_MODELS } from '@/constants/openai-models';

const MODEL_TOKEN_LIMITS: Record<string, number> = Object.fromEntries(
  OPENAI_MODELS.map(model => [model.id, model.contextWindow])
);

const IMAGE_TOKEN_COST = 1700;
const TOKENS_PER_MESSAGE = 3;

const encoderCache = new Map<string, ReturnType<typeof encoding_for_model>>();

function getEncoder(model: string) {
  if (!encoderCache.has(model)) {
    try {
      const tiktokenModel = model.startsWith('gpt-5')
        ? 'gpt-4o'
        : model.startsWith('gpt-4')
        ? 'gpt-4o'
        : 'gpt-4o';

      encoderCache.set(model, encoding_for_model(tiktokenModel as TiktokenModel));
    } catch {
      encoderCache.set(model, encoding_for_model('gpt-4o' as TiktokenModel));
    }
  }
  return encoderCache.get(model)!;
}

function countTokens(text: string, model: string): number {
  const encoder = getEncoder(model);
  return encoder.encode(text).length;
}

function countContentTokens(
  content: string | MessageContentPart[],
  model: string
): { textTokens: number; imageCount: number } {
  if (typeof content === 'string') {
    return { textTokens: countTokens(content, model), imageCount: 0 };
  }

  let textTokens = 0;
  let imageCount = 0;

  for (const part of content) {
    if (part.type === 'text') {
      textTokens += countTokens(part.text, model);
    } else if (part.type === 'image_url') {
      imageCount++;
    }
  }

  return { textTokens, imageCount };
}

function getModelContextWindow(model: string): number {
  return MODEL_TOKEN_LIMITS[model] || 128000;
}

export function calculateTokenUsage(
  messages: Message[],
  model: string
): TokenUsage {
  const limit = getModelContextWindow(model);
  let conversationTokens = 0;
  let imageTokens = 0;

  for (const message of messages) {
    const { textTokens, imageCount } = countContentTokens(message.content, model);
    conversationTokens += textTokens + TOKENS_PER_MESSAGE;
    imageTokens += imageCount * IMAGE_TOKEN_COST;
  }

  conversationTokens += 3;
  const used = conversationTokens + imageTokens;
  const remaining = Math.max(0, limit - used);
  const percentage = Math.min(100, (used / limit) * 100);

  return {
    used,
    limit,
    remaining,
    percentage,
    breakdown: {
      conversation: conversationTokens,
      images: imageTokens,
    },
  };
}
