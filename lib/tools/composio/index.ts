import { Composio } from "@composio/core";
import { LangchainProvider } from "@composio/langchain";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import { COMPOSIO_TOOLKITS, type ComposioToolkit } from "./config";
import { logger } from "@/lib/logger";

let composioInstance: Composio<LangchainProvider> | null = null;

export function getComposioClient(): Composio<LangchainProvider> | null {
  if (composioInstance) return composioInstance;
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) return null;
  composioInstance = new Composio({
    apiKey,
    provider: new LangchainProvider(),
    allowTracking: false,
  });
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
    const tools = await client.tools.get(userId, { toolkits });
    toolCache.set(cacheKey, { tools, expiry: Date.now() + CACHE_TTL_MS });
    return tools;
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
