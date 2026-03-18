import { Client } from 'langsmith';
import { wrapOpenAI } from 'langsmith/wrappers';
import { traceable } from 'langsmith/traceable';
import type OpenAI from 'openai';


import { logger } from "@/lib/logger";
const LANGSMITH_CONFIG = {
  tracing: process.env.LANGSMITH_TRACING !== 'false',
  endpoint: process.env.LANGSMITH_ENDPOINT,
  apiKey: process.env.LANGSMITH_API_KEY,
  project: process.env.LANGSMITH_PROJECT,
} as const;

function initializeLangSmith(): void {
  if (!LANGSMITH_CONFIG.tracing || !LANGSMITH_CONFIG.apiKey) {
    return;
  }

  try {
    void new Client({
      apiUrl: LANGSMITH_CONFIG.endpoint,
      apiKey: LANGSMITH_CONFIG.apiKey,
    });
  } catch (error) {
    logger.error('[LangSmith] Failed to initialize:', error);
  }
}

function isLangSmithEnabled(): boolean {
  return LANGSMITH_CONFIG.tracing && !!LANGSMITH_CONFIG.apiKey;
}

export function wrapOpenAIWithLangSmith<T extends OpenAI>(client: T): T {
  if (!isLangSmithEnabled()) {
    return client;
  }

  try {
    return wrapOpenAI(client) as T;
  } catch (error) {
    logger.error('[LangSmith] Failed to wrap OpenAI client:', error);
    return client;
  }
}

export async function withTrace<T>(
  name: string,
  fn: () => Promise<T>,
  metadata?: {
    userId?: string;
    conversationId?: string;
    model?: string;
    tool?: string;
    [key: string]: unknown;
  }
): Promise<T> {
  if (!isLangSmithEnabled()) {
    return fn();
  }

  const tracedFn = traceable(fn, {
    name,
    metadata,
    project_name: LANGSMITH_CONFIG.project,
  });

  return tracedFn();
}

function configureLangChainTracing(): void {
  if (!LANGSMITH_CONFIG.tracing || !LANGSMITH_CONFIG.apiKey) {
    return;
  }

  process.env.LANGCHAIN_TRACING_V2 = 'true';
  if (LANGSMITH_CONFIG.endpoint) {
    process.env.LANGCHAIN_ENDPOINT = LANGSMITH_CONFIG.endpoint;
  }
  process.env.LANGCHAIN_API_KEY = LANGSMITH_CONFIG.apiKey;
  if (LANGSMITH_CONFIG.project) {
    process.env.LANGCHAIN_PROJECT = LANGSMITH_CONFIG.project;
  }

  if (process.env.NODE_ENV !== 'production') {
    process.env.LANGCHAIN_CALLBACKS_BACKGROUND = 'true';
  }
}

if (typeof window === 'undefined') {
  configureLangChainTracing();
  initializeLangSmith();
}
