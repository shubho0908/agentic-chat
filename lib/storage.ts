const STORAGE_KEYS = {
  OPENAI_MODEL: 'openai_model',
  ACTIVE_TOOL: 'agentic-chat-active-tool',
  MEMORY_ENABLED: 'agentic-chat-memory-enabled',
  DEEP_RESEARCH_ENABLED: 'agentic-chat-deep-research-enabled',
} as const;

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
    return localStorage.getItem(STORAGE_KEYS.OPENAI_MODEL);
  } catch {
    return null;
  }
}

export function removeModel(): void {
  if (!isLocalStorageAvailable()) return;
  try {
    localStorage.removeItem(STORAGE_KEYS.OPENAI_MODEL);
  } catch {
  }
}

export function getMemoryEnabled(): boolean {
  if (!isLocalStorageAvailable()) return false;
  try {
    return localStorage.getItem(STORAGE_KEYS.MEMORY_ENABLED) === 'true';
  } catch {
    return false;
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

export function getActiveTool(): string | null {
  if (!isLocalStorageAvailable()) return null;
  try {
    return localStorage.getItem(STORAGE_KEYS.ACTIVE_TOOL);
  } catch {
    return null;
  }
}

export function setActiveTool(toolId: string): boolean {
  if (!isLocalStorageAvailable()) return false;
  try {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_TOOL, toolId);
    return true;
  } catch {
    return false;
  }
}

export function removeActiveTool(): void {
  if (!isLocalStorageAvailable()) return;
  try {
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_TOOL);
  } catch {
  }
}

export function getDeepResearchEnabled(): boolean {
  if (!isLocalStorageAvailable()) return false;
  try {
    return localStorage.getItem(STORAGE_KEYS.DEEP_RESEARCH_ENABLED) === 'true';
  } catch {
    return false;
  }
}

export function setDeepResearchEnabled(enabled: boolean): boolean {
  if (!isLocalStorageAvailable()) return false;
  try {
    localStorage.setItem(STORAGE_KEYS.DEEP_RESEARCH_ENABLED, String(enabled));
    return true;
  } catch {
    return false;
  }
}

export function clearUserStorage(): void {
  if (!isLocalStorageAvailable()) return;
  try {
    localStorage.removeItem(STORAGE_KEYS.MEMORY_ENABLED);
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_TOOL);
    localStorage.removeItem(STORAGE_KEYS.DEEP_RESEARCH_ENABLED);
  } catch (error) {
    console.error('Error clearing user storage:', error);
  }
}

export { STORAGE_KEYS };


