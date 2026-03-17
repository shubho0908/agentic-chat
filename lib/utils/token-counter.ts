import { encoding_for_model, get_encoding, type TiktokenModel } from 'tiktoken';
import type { Message, MessageContentPart } from '@/lib/schemas/chat';
import type { TokenUsage } from '@/types/chat';
import { OPENAI_MODELS } from '@/constants/openai-models';
import { getResponseTokenReserve } from '@/lib/model-policy';

const MODEL_TOKEN_LIMITS: Record<string, number> = Object.fromEntries(
  OPENAI_MODELS.map(model => [model.id, model.contextWindow])
);

const IMAGE_TOKEN_COST = 850;
const TOKENS_PER_MESSAGE = 4;

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
      encoderCache.set(model, get_encoding('o200k_base'));
    }
  }
  return encoderCache.get(model)!;
}

function countTokens(text: string, model: string): number {
  const encoder = getEncoder(model);
  return encoder.encode(text).length;
}

export function countTextTokens(text: string, model: string): number {
  return countTokens(text, model);
}

export function truncateTextToTokenLimit(
  text: string,
  model: string,
  maxTokens: number,
  suffix = '\n\n[Context truncated to fit budget.]'
): string {
  if (maxTokens <= 0) {
    return '';
  }

  const encoder = getEncoder(model);
  const encoded = encoder.encode(text);

  if (encoded.length <= maxTokens) {
    return text;
  }

  const suffixTokens = encoder.encode(suffix);
  if (suffixTokens.length >= maxTokens) {
    return new TextDecoder().decode(encoder.decode(suffixTokens.slice(0, maxTokens)));
  }
  const availableTokens = Math.max(0, maxTokens - suffixTokens.length);
  const truncatedTokens = encoded.slice(0, availableTokens);
  const decoded = new TextDecoder().decode(encoder.decode(truncatedTokens));
  return `${decoded}${suffix}`;
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
  const responseReserve = getResponseTokenReserve(model);
  const effectiveUsed = used + responseReserve;
  const remaining = Math.max(0, limit - effectiveUsed);
  const percentage = Math.min(100, (effectiveUsed / limit) * 100);

  return {
    used,
    limit,
    remaining,
    percentage,
    responseReserve,
    breakdown: {
      conversation: conversationTokens,
      images: imageTokens,
    },
  };
}
