import { Client } from 'langsmith';
import { wrapOpenAI } from 'langsmith/wrappers';
import { traceable } from 'langsmith/traceable';
import type OpenAI from 'openai';

const LANGSMITH_CONFIG = {
  tracing: process.env.LANGSMITH_TRACING === 'true',
  endpoint: process.env.LANGSMITH_ENDPOINT,
  apiKey: process.env.LANGSMITH_API_KEY,
  project: process.env.LANGSMITH_PROJECT,
} as const;

let langsmithClient: Client | null = null;

export function initializeLangSmith(): void {
  if (!LANGSMITH_CONFIG.tracing || !LANGSMITH_CONFIG.apiKey) {
    console.error('[LangSmith] Tracing disabled or API key not configured');
    return;
  }

  try {
    langsmithClient = new Client({
      apiUrl: LANGSMITH_CONFIG.endpoint,
      apiKey: LANGSMITH_CONFIG.apiKey,
    });
  } catch (error) {
    console.error('[LangSmith] Failed to initialize:', error);
  }
}

export function getLangSmithClient(): Client | null {
  return langsmithClient;
}

export function isLangSmithEnabled(): boolean {
  return LANGSMITH_CONFIG.tracing && !!LANGSMITH_CONFIG.apiKey;
}

export function wrapOpenAIWithLangSmith<T extends OpenAI>(client: T): T {
  if (!isLangSmithEnabled()) {
    return client;
  }

  try {
    return wrapOpenAI(client) as T;
  } catch (error) {
    console.error('[LangSmith] Failed to wrap OpenAI client:', error);
    return client;
  }
}

export function traceWithLangSmith<T extends (...args: unknown[]) => unknown>(
  fn: T,
  options?: {
    name?: string;
    metadata?: Record<string, unknown>;
    tags?: string[];
  }
): T {
  if (!isLangSmithEnabled()) {
    return fn;
  }

  const tracedFn = traceable(fn, {
    name: options?.name || fn.name || 'unnamed-function',
    metadata: options?.metadata,
    tags: options?.tags,
    project_name: LANGSMITH_CONFIG.project,
  });

  return tracedFn as T;
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

export function configureLangChainTracing(): void {
  if (!LANGSMITH_CONFIG.tracing || !LANGSMITH_CONFIG.apiKey) {
    return;
  }

  process.env.LANGCHAIN_TRACING_V2 = 'true';
  process.env.LANGCHAIN_ENDPOINT = LANGSMITH_CONFIG.endpoint;
  process.env.LANGCHAIN_API_KEY = LANGSMITH_CONFIG.apiKey;
  process.env.LANGCHAIN_PROJECT = LANGSMITH_CONFIG.project;

  if (process.env.NODE_ENV !== 'production') {
    process.env.LANGCHAIN_CALLBACKS_BACKGROUND = 'true';
  }
}

if (typeof window === 'undefined') {
  configureLangChainTracing();
  initializeLangSmith();
}