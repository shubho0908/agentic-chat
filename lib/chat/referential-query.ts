import type { MessageContentPart } from '@/lib/schemas/chat';

const REFERENTIAL_PATTERNS = [
  /\b(this|that|the|attached)\s+(doc|document|file|pdf|attachment|image|picture)/i,
  /\bwhat('s|\s+is)?\s+(in|about)\s+(this|that|the|it)/i,
  /\b(summarize|explain|analyze|describe)\s+(this|that|the|it)/i,
  /^(summarize|summary|explain|analyze|describe)$/i,
] as const;

export function extractTextQuery(
  query: string | Array<{ type: string; text?: string; image_url?: { url: string } }> | MessageContentPart[]
): string {
  return typeof query === 'string'
    ? query
    : query
        .filter((part): part is { type: 'text'; text: string } => part.type === 'text' && typeof part.text === 'string')
        .map((part) => part.text)
        .join(' ');
}

export function isReferentialQuery(query: string): boolean {
  const normalized = query.toLowerCase().trim();
  return REFERENTIAL_PATTERNS.some((pattern) => pattern.test(normalized));
}
