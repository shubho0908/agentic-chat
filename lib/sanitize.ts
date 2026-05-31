const DIRECTIVE_FRAGMENT =
  "(?:ignore|disregard|forget|override|you\\s+are\\s+now|new\\s+instructions?|your\\s+(?:new|real)\\s+task|repeat\\s+(?:the\\s+)?(?:system|prompt|instructions?))";

const INJECTION_PATTERNS: RegExp[] = [
  new RegExp(
    `(^|\\r?\\n)\\s*(?:system|assistant|human|user)\\s*:\\s*${DIRECTIVE_FRAGMENT}`,
    "gi"
  ),
  /<\|?(?:im_start|im_end|system|endoftext)\|?>/gi,
  /\[INST\]|\[\/INST\]|\[SYS\]|\[\/SYS\]/gi,
  /ignore\s+(?:all\s+)?(?:previous|prior|above)\s+(?:instructions?|prompts?|rules?)/gi,
  /disregard\s+(?:all\s+)?(?:previous|prior|above)\s+(?:instructions?|prompts?|rules?)/gi,
  /you\s+are\s+now\s+(?:a|an|the)?\s*(?:assistant|system|admin|developer|jailbroken)/gi,
  /new\s+instructions?:\s*(?:ignore|disregard|forget|override)/gi,
  /override\s+(?:system|safety|instructions?)/gi,
  /repeat\s+(?:the\s+)?(?:system\s+)?(?:prompt|instructions?|rules?)\s*(?:above|back|verbatim)?/gi,
  /output\s+(?:your|the)\s+(?:system\s+)?(?:prompt|instructions?)/gi,
];

const MAX_TOOL_OUTPUT_LENGTH = 32_000;

export function sanitizeToolOutput(output: string): string {
  let sanitized = output;

  for (const pattern of INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[filtered]");
  }

  if (sanitized.length > MAX_TOOL_OUTPUT_LENGTH) {
    sanitized = sanitized.slice(0, MAX_TOOL_OUTPUT_LENGTH) + "\n[truncated]";
  }

  return sanitized;
}
