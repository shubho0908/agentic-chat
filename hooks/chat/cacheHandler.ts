import { type Message, type Attachment, type MessageContentPart } from "@/lib/schemas/chat";
import { extractTextFromContent } from "@/lib/contentUtils";
import type { CacheCheckResult } from "@/types/chat";
import { checkSemanticCacheAction } from "@/lib/rag/storage/cacheActions";
import { isSupportedForRAG } from "@/lib/rag/utils";


interface CacheCheckContext {
  messages: Message[];
  content: string | MessageContentPart[];
  attachments?: Attachment[];
  abortSignal: AbortSignal;
  activeTool?: string | null;
  deepResearchEnabled?: boolean;
}

export function shouldUseSemanticCache(
  messages: Message[],
  attachments?: Attachment[], 
  activeTool?: string | null,
  deepResearchEnabled?: boolean
): boolean {
  const hasCurrentDocument = attachments?.some((attachment) =>
    isSupportedForRAG(attachment.fileType)
  );
  const hasConversationDocuments = messages.some((message) =>
    message.attachments?.some((attachment) => isSupportedForRAG(attachment.fileType))
  );

  // Document-grounded conversations should always re-run retrieval.
  if (hasCurrentDocument || hasConversationDocuments) {
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

async function checkCache(
  query: string,
  signal: AbortSignal
): Promise<CacheCheckResult> {
  try {
    if (signal.aborted) {
      return { cached: false };
    }

    const startTime = Date.now();
    const CACHE_TIMEOUT_MS = 5000;
    
    const abortPromise = new Promise<CacheCheckResult>((_, reject) => {
      if (signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
      }
      signal.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'));
      });
    });
    
    const timeoutPromise = new Promise<CacheCheckResult>((resolve) => {
      setTimeout(() => {
        resolve({ cached: false });
      }, CACHE_TIMEOUT_MS);
    });

    const cachePromise = checkSemanticCacheAction(query);
    const result = await Promise.race([cachePromise, timeoutPromise, abortPromise]);
    const duration = Date.now() - startTime;
    if (result.cached) {
      logger.log(`[Cache] ✅ HIT in ${duration}ms - using cached response`);
    } else if (duration < CACHE_TIMEOUT_MS) {
      logger.log(`[Cache] ❌ MISS in ${duration}ms - generating new response`);
    }

    return result;

  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      logger.log('[Cache] Aborted by user');
      return { cached: false };
    }
    logger.error('[Cache] Error:', err);
    return { cached: false };
  }
}

export async function performCacheCheck(
  context: CacheCheckContext
): Promise<{ cacheQuery: string; cacheData: CacheCheckResult }> {
  const { messages, content, attachments, abortSignal, activeTool, deepResearchEnabled } = context;
  
  const useCaching = shouldUseSemanticCache(messages, attachments, activeTool, deepResearchEnabled);
  let cacheQuery = '';
  let cacheData: CacheCheckResult = { cached: false };

  if (useCaching) {
    cacheQuery = buildCacheQuery(messages, content);
    cacheData = await checkCache(cacheQuery, abortSignal);
  }

  return { cacheQuery, cacheData };
}

import { logger } from "@/lib/logger";