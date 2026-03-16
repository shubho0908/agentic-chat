type EnvSeverity = 'error' | 'warning';

export interface EnvIssue {
  key: string;
  severity: EnvSeverity;
  message: string;
}

const envWarnings = new Set<string>();

function warnOnce(message: string): void {
  if (envWarnings.has(message)) {
    return;
  }

  envWarnings.add(message);
  console.warn(message);
}

function parsePositiveInteger(
  key: string,
  fallback: number,
  issues: EnvIssue[]
): number {
  const rawValue = process.env[key];

  if (!rawValue) {
    issues.push({
      key,
      severity: 'warning',
      message: `${key} is not set. Falling back to ${fallback}.`,
    });
    return fallback;
  }

  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    issues.push({
      key,
      severity: 'warning',
      message: `${key} must be a positive integer. Falling back to ${fallback}.`,
    });
    return fallback;
  }

  return parsed;
}

export function getServerEnvIssues(): EnvIssue[] {
  const issues: EnvIssue[] = [];

  const requiredKeys = [
    'DATABASE_URL',
    'BETTER_AUTH_SECRET',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
  ] as const;

  for (const key of requiredKeys) {
    if (!process.env[key]) {
      issues.push({
        key,
        severity: 'warning',
        message: `${key} is not configured.`,
      });
    }
  }

  parsePositiveInteger('CACHE_TTL_SECONDS', 86400, issues);
  parsePositiveInteger('EMBEDDING_DIMENSIONS', 1536, issues);

  if (!process.env.EMBEDDING_MODEL) {
    issues.push({
      key: 'EMBEDDING_MODEL',
      severity: 'warning',
      message: 'EMBEDDING_MODEL is not configured. Falling back to text-embedding-3-small.',
    });
  }

  return issues;
}

export function logServerEnvIssues(): void {
  if (typeof window !== 'undefined') {
    return;
  }

  const issues = getServerEnvIssues();
  if (issues.length === 0) {
    return;
  }

  const rendered = issues.map((issue) => `- ${issue.message}`).join('\n');
  warnOnce(`[Env] Configuration issues detected:\n${rendered}`);
}

export function getRequiredEnv(
  key: string,
  options?: {
    fallback?: string;
    description?: string;
  }
): string {
  const value = process.env[key];

  if (value && value.trim()) {
    return value;
  }

  const fallback = options?.fallback;
  const description = options?.description ?? key;

  warnOnce(
    `[Env] ${description} is missing${fallback ? `. Using fallback value for non-critical execution paths.` : '.'}`
  );

  if (fallback !== undefined) {
    return fallback;
  }

  throw new Error(`${key} is required`);
}

export function getCacheTtlSeconds(): number {
  return parsePositiveInteger('CACHE_TTL_SECONDS', 86400, []);
}

export function getEmbeddingDimensions(): number {
  return parsePositiveInteger('EMBEDDING_DIMENSIONS', 1536, []);
}

export function getEmbeddingModel(): string {
  return getRequiredEnv('EMBEDDING_MODEL', {
    fallback: 'text-embedding-3-small',
    description: 'Embedding model',
  });
}

logServerEnvIssues();
