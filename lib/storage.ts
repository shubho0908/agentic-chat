const STORAGE_KEYS = {
  OPENAI_MODEL: 'openai_model',
  MEMORY_ENABLED: 'agentic-chat-memory-enabled',
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

export { STORAGE_KEYS };