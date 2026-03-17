import type { Message } from '@/lib/schemas/chat';
import type { TokenUsage } from '@/types/chat';
import { calculateTokenUsage } from '@/lib/utils/token-counter';

interface TokenBudgetCheckResult {
  ok: boolean;
  tokenUsage: TokenUsage;
  errorMessage?: string;
}

export function checkTokenBudget(
  messages: Message[],
  model: string
): TokenBudgetCheckResult {
  const tokenUsage = calculateTokenUsage(messages, model);

  if (tokenUsage.used + tokenUsage.responseReserve > tokenUsage.limit) {
    return {
      ok: false,
      tokenUsage,
      errorMessage:
        'Request exceeds the server token budget. Please shorten the conversation or attachments and try again.',
    };
  }

  return {
    ok: true,
    tokenUsage,
  };
}
