import { Composio } from "@composio/core";
import { LangchainProvider } from "@composio/langchain";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import {
  COMPOSIO_TOOLKITS,
  getEssentialComposioToolSlugs,
  type ComposioToolkit,
} from "./config";
import { logger } from "@/lib/logger";
import { withRetry } from "@/lib/retry";

let composioInstance: Composio<LangchainProvider> | null = null;
let cachedApiKey: string | undefined;

export function getComposioClient(): Composio<LangchainProvider> | null {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) return null;
  if (composioInstance && cachedApiKey === apiKey) return composioInstance;
  if (cachedApiKey && cachedApiKey !== apiKey) {
    clearToolCache();
  }
  composioInstance = new Composio({
    apiKey,
    provider: new LangchainProvider(),
    allowTracking: false,
  });
  cachedApiKey = apiKey;
  return composioInstance;
}

const toolCache = new Map<string, { tools: DynamicStructuredTool[]; expiry: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function getToolsForUser(
  userId: string,
  connectedToolkits?: ComposioToolkit[]
): Promise<DynamicStructuredTool[]> {
  const client = getComposioClient();
  if (!client) return [];

  const toolkits = connectedToolkits ?? [...COMPOSIO_TOOLKITS];
  const cacheKey = `${userId}:${[...toolkits].sort().join(",")}`;
  const cached = toolCache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) return cached.tools;

  try {
    const importantTools = await withRetry(
      () => client.tools.get(userId, { toolkits: [...toolkits], important: true }),
      { retries: 2, initialDelayMs: 300, timeoutMs: 15_000 }
    );

    logger.log(`[Composio] Loaded ${importantTools.length} important tools for toolkits: ${toolkits.join(", ")}`);

    const essentialSlugs = getEssentialComposioToolSlugs(toolkits);
    let allTools = importantTools;

    if (essentialSlugs.length > 0) {
      const existingSlugs = new Set(importantTools.map((t) => t.name));
      const missingSlugs = essentialSlugs.filter((s) => !existingSlugs.has(s));
      if (missingSlugs.length > 0) {
        logger.log(`[Composio] Fetching ${missingSlugs.length} essential tools not in important set: ${missingSlugs.join(", ")}`);
        try {
          const extra = await withRetry(
            () => client.tools.get(userId, { tools: missingSlugs }),
            { retries: 1, initialDelayMs: 300, timeoutMs: 10_000 }
          );
          allTools = [...importantTools, ...extra];
        } catch (error) {
          logger.warn("[Composio] Failed to load essential supplemental tools; using important tools only:", error);
        }
      }
    }

    logger.log(`[Composio] Total tools available for user ${userId}: ${allTools.length} (${allTools.map(t => t.name).join(", ")})`);
    toolCache.set(cacheKey, { tools: allTools, expiry: Date.now() + CACHE_TTL_MS });
    return allTools;
  } catch (error) {
    logger.error("[Composio] Failed to load tools:", error);
    return [];
  }
}

export function clearToolCache(userId?: string): void {
  if (userId) {
    for (const key of toolCache.keys()) {
      if (key.startsWith(`${userId}:`)) toolCache.delete(key);
    }
  } else {
    toolCache.clear();
  }
}
