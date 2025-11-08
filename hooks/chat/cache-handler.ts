import { type Message, type Attachment, type MessageContentPart } from "@/lib/schemas/chat";
import { extractTextFromContent } from "@/lib/content-utils";
import type { CacheCheckResult } from "@/types/chat";
import { checkSemanticCacheAction } from "@/lib/rag/storage/cache-actions";

interface CacheCheckContext {
  messages: Message[];
  content: string | MessageContentPart[];
  attachments?: Attachment[];
  abortSignal: AbortSignal;
  activeTool?: string | null;
  deepResearchEnabled?: boolean;
}

export function shouldUseSemanticCache(
  attachments?: Attachment[], 
  activeTool?: string | null,
  deepResearchEnabled?: boolean
): boolean {
  if (attachments && attachments.length > 0) {
    return false;
  }
  
  if (activeTool) {
    return false;
  }
  
  if (deepResearchEnabled) {
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
    if (signal.aborted) {
      return { cached: false };
    }

    const startTime = Date.now();
    const CACHE_TIMEOUT_MS = 5000;
    const timeoutPromise = new Promise<CacheCheckResult>((resolve) => {
      setTimeout(() => {
        resolve({ cached: false });
      }, CACHE_TIMEOUT_MS);
    });

    const cachePromise = checkSemanticCacheAction(query);
    const result = await Promise.race([cachePromise, timeoutPromise]);
    const duration = Date.now() - startTime;
    if (result.cached) {
      console.log(`[Cache] ✅ HIT in ${duration}ms - using cached response`);
    } else if (duration < CACHE_TIMEOUT_MS) {
      console.log(`[Cache] ❌ MISS in ${duration}ms - generating new response`);
    }

    return result;

  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      console.log('[Cache] Aborted by user');
      return { cached: false };
    }
    console.error('[Cache] Error:', err);
    return { cached: false };
  }
}

export async function performCacheCheck(
  context: CacheCheckContext
): Promise<{ cacheQuery: string; cacheData: CacheCheckResult }> {
  const { messages, content, attachments, abortSignal, activeTool, deepResearchEnabled } = context;
  
  const useCaching = shouldUseSemanticCache(attachments, activeTool, deepResearchEnabled);
  let cacheQuery = '';
  let cacheData: CacheCheckResult = { cached: false };

  if (useCaching) {
    cacheQuery = buildCacheQuery(messages, content);
    cacheData = await checkCache(cacheQuery, abortSignal);
  }

  return { cacheQuery, cacheData };
}
