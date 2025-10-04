const STORAGE_KEYS = {
  OPENAI_API_KEY: 'openai_api_key',
  OPENAI_MODEL: 'openai_model',
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

function encodeValue(value: string): string {
  return btoa(encodeURIComponent(value));
}

function decodeValue(encoded: string): string {
  try {
    return decodeURIComponent(atob(encoded));
  } catch {
    return '';
  }
}

export function saveApiKey(apiKey: string): boolean {
  if (!isLocalStorageAvailable()) {
    return false;
  }
  try {
    const encoded = encodeValue(apiKey);
    localStorage.setItem(STORAGE_KEYS.OPENAI_API_KEY, encoded);
    return true;
  } catch {
    return false;
  }
}

export function getApiKey(): string | null {
  if (!isLocalStorageAvailable()) {
    return null;
  }
  try {
    const encoded = localStorage.getItem(STORAGE_KEYS.OPENAI_API_KEY);
    if (!encoded) return null;
    return decodeValue(encoded);
  } catch {
    return null;
  }
}

export function getEncodedApiKey(): string | null {
  if (!isLocalStorageAvailable()) {
    return null;
  }
  try {
    return localStorage.getItem(STORAGE_KEYS.OPENAI_API_KEY);
  } catch {
    return null;
  }
}

export async function hashApiKey(apiKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function removeApiKey(): void {
  if (!isLocalStorageAvailable()) return;
  try {
    localStorage.removeItem(STORAGE_KEYS.OPENAI_API_KEY);
  } catch {
    // Silent fail
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
    // Silent fail
  }
}

export function clearAllSettings(): void {
  removeApiKey();
  removeModel();
}
