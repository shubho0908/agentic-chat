import {
  DEFAULT_MODEL,
  DEFAULT_REASONING_EFFORT,
  OPENAI_MODELS,
  getDefaultReasoningEffort,
  isReasoningEffortSupported,
  isReasoningEffortLevel,
  type ReasoningEffortLevel,
} from '@/constants/openai-models';

import { logger } from "@/lib/logger";
const STORAGE_KEYS = {
  OPENAI_MODEL: 'openai_model',
  MEMORY_ENABLED: 'agentic-chat-memory-enabled',
  THINKING_ENABLED: 'agentic-chat-thinking-enabled',
  REASONING_EFFORT: 'agentic-chat-reasoning-effort',
} as const;

const VALID_OPENAI_MODELS = new Set(OPENAI_MODELS.map((model) => model.id));

function logStorageError(operation: string, error: unknown): void {
  logger.warn(`[Storage] Failed to ${operation}:`, error);
}

function isLocalStorageAvailable(): boolean {
  try {
    const test = '__localStorage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}

export function saveModel(model: string): boolean {
  if (!isLocalStorageAvailable()) {
    return false;
  }
  try {
    localStorage.setItem(STORAGE_KEYS.OPENAI_MODEL, model);
    return true;
  } catch {
    return false;
  }
}

export function getModel(): string | null {
  if (!isLocalStorageAvailable()) {
    return null;
  }
  try {
    const storedModel = localStorage.getItem(STORAGE_KEYS.OPENAI_MODEL);

    if (!storedModel) {
      return null;
    }

    if (!VALID_OPENAI_MODELS.has(storedModel)) {
      localStorage.setItem(STORAGE_KEYS.OPENAI_MODEL, DEFAULT_MODEL);
      return DEFAULT_MODEL;
    }

    return storedModel;
  } catch {
    return null;
  }
}

export function removeModel(): void {
  if (!isLocalStorageAvailable()) return;
  try {
    localStorage.removeItem(STORAGE_KEYS.OPENAI_MODEL);
  } catch (error) {
    logStorageError('remove stored model', error);
  }
}

export function getMemoryEnabled(): boolean {
  if (!isLocalStorageAvailable()) return true;
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.MEMORY_ENABLED);
    return stored === null ? true : stored === 'true';
  } catch {
    return true;
  }
}

export function setMemoryEnabled(enabled: boolean): boolean {
  if (!isLocalStorageAvailable()) return false;
  try {
    localStorage.setItem(STORAGE_KEYS.MEMORY_ENABLED, String(enabled));
    return true;
  } catch {
    return false;
  }
}

export function clearUserStorage(): void {
  if (!isLocalStorageAvailable()) return;
  try {
    localStorage.removeItem(STORAGE_KEYS.MEMORY_ENABLED);
    localStorage.removeItem(STORAGE_KEYS.THINKING_ENABLED);
    localStorage.removeItem(STORAGE_KEYS.REASONING_EFFORT);
  } catch (error) {
    logger.error('Error clearing user storage:', error);
  }
}

export type ReasoningEffortMap = Partial<Record<string, ReasoningEffortLevel>>;

/**
 * Reasoning effort is stored per model: a JSON map of model id to effort.
 * One-time migrations: a legacy plain-string effort value, or the older
 * Thinking toggle (ON), applies to every model.
 */
export function getReasoningEffortMap(): ReasoningEffortMap {
  if (!isLocalStorageAvailable()) return {};
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.REASONING_EFFORT);
    if (stored) {
      if (isReasoningEffortLevel(stored)) {
        const map: ReasoningEffortMap = Object.fromEntries(
          OPENAI_MODELS.filter((m) => isReasoningEffortSupported(m.id, stored)).map(
            (m) => [m.id, stored]
          )
        );
        localStorage.setItem(STORAGE_KEYS.REASONING_EFFORT, JSON.stringify(map));
        return map;
      }
      const parsed: unknown = JSON.parse(stored);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const map: ReasoningEffortMap = {};
        for (const [key, value] of Object.entries(parsed)) {
          if (isReasoningEffortLevel(value) && isReasoningEffortSupported(key, value)) {
            map[key] = value;
          }
        }
        return map;
      }
    }

    const legacyThinking = localStorage.getItem(STORAGE_KEYS.THINKING_ENABLED);
    const migrated: ReasoningEffortLevel =
      legacyThinking === 'true' ? 'high' : DEFAULT_REASONING_EFFORT;
    const map: ReasoningEffortMap = Object.fromEntries(
      OPENAI_MODELS.filter((m) => isReasoningEffortSupported(m.id, migrated)).map(
        (m) => [m.id, migrated]
      )
    );
    localStorage.setItem(STORAGE_KEYS.REASONING_EFFORT, JSON.stringify(map));
    localStorage.removeItem(STORAGE_KEYS.THINKING_ENABLED);
    return map;
  } catch {
    return {};
  }
}

export function getReasoningEffortForModel(model: string): ReasoningEffortLevel {
  const stored = getReasoningEffortMap()[model];
  return stored && isReasoningEffortSupported(model, stored)
    ? stored
    : getDefaultReasoningEffort(model);
}

export function setReasoningEffortForModel(
  model: string,
  effort: ReasoningEffortLevel
): boolean {
  if (!isLocalStorageAvailable()) return false;
  if (!isReasoningEffortSupported(model, effort)) return false;
  try {
    const map = getReasoningEffortMap();
    map[model] = effort;
    localStorage.setItem(STORAGE_KEYS.REASONING_EFFORT, JSON.stringify(map));
    localStorage.removeItem(STORAGE_KEYS.THINKING_ENABLED);
    return true;
  } catch {
    return false;
  }
}

/** Effort for the currently selected model. */
export function getReasoningEffort(): ReasoningEffortLevel {
  return getReasoningEffortForModel(getModel() ?? DEFAULT_MODEL);
}
