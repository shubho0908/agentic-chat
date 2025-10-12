import { type Message, type Attachment, type MessageContentPart } from "@/lib/schemas/chat";
import { extractTextFromContent } from "@/lib/content-utils";
import { type CacheCheckResult } from "./types";
import { TOOL_IDS } from "@/lib/tools/config";

interface CacheCheckContext {
  messages: Message[];
  content: string | MessageContentPart[];
  attachments?: Attachment[];
  abortSignal: AbortSignal;
  activeTool?: string | null;
}

export function shouldUseSemanticCache(attachments?: Attachment[], activeTool?: string | null): boolean {
  if (attachments && attachments.length > 0) {
    return false;
  }
  
  if (activeTool === TOOL_IDS.WEB_SEARCH) {
    return false;
  }
  
  return true;
}

export function buildCacheQuery(
  messages: Message[], 
  newContent: string | MessageContentPart[],
  options?: { includeVersionInfo?: boolean }
): string {
  const { includeVersionInfo = true } = options || {};
  
  const textOnlyMessages = messages
    .filter(m => !m.attachments || m.attachments.length === 0)
    .slice(-4);

  const contextParts = textOnlyMessages.map(m => {
    const text = extractTextFromContent(m.content);
    const versionInfo = includeVersionInfo && m.versions && m.versions.length > 0 
      ? `[v${m.siblingIndex || 0}]` 
      : '';
    return `${m.role.toLowerCase()}${versionInfo}: ${text}`;
  });
  
  const newText = extractTextFromContent(newContent);
  contextParts.push(`user: ${newText}`);
  return contextParts.join('\n');
}

export async function checkCache(
  query: string,
  signal: AbortSignal
): Promise<CacheCheckResult> {
  try {
    const response = await fetch("/api/cache/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal,
    });

    if (response.ok) {
      return await response.json();
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw err;
    }
    console.error("Cache check failed:", err);
  }
  return { cached: false };
}

export async function performCacheCheck(
  context: CacheCheckContext
): Promise<{ cacheQuery: string; cacheData: CacheCheckResult }> {
  const { messages, content, attachments, abortSignal, activeTool } = context;
  
  const useCaching = shouldUseSemanticCache(attachments, activeTool);
  let cacheQuery = '';
  let cacheData: CacheCheckResult = { cached: false };

  if (useCaching) {
    cacheQuery = buildCacheQuery(messages, content);
    cacheData = await checkCache(cacheQuery, abortSignal);
  }

  return { cacheQuery, cacheData };
}
