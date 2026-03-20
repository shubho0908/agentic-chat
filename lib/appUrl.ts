const LOCAL_APP_URL = "http://localhost:3000";

function withScheme(value: string) {
  return value.includes("://") ? value : `https://${value}`;
}

export function normalizeOrigin(value?: string | null) {
  if (!value) {
    return null;
  }

  try {
    return new URL(withScheme(value)).origin;
  } catch {
    return null;
  }
}

export function resolveAppBaseUrl(
  env: Partial<NodeJS.ProcessEnv> = process.env,
) {
  if (env.NODE_ENV !== "production") {
    return LOCAL_APP_URL;
  }

  const candidates = [
    env.NEXT_PUBLIC_APP_URL,
    env.BETTER_AUTH_URL,
    env.VERCEL_PROJECT_PRODUCTION_URL,
    env.VERCEL_URL,
  ];

  for (const candidate of candidates) {
    const normalizedOrigin = normalizeOrigin(candidate);

    if (normalizedOrigin) {
      return normalizedOrigin;
    }
  }

  return LOCAL_APP_URL;
}

export function resolveTrustedOrigins(
  env: Partial<NodeJS.ProcessEnv> = process.env,
) {
  return Array.from(
    new Set(
      [
        env.NEXT_PUBLIC_APP_URL,
        env.BETTER_AUTH_URL,
        env.VERCEL_PROJECT_PRODUCTION_URL,
        env.VERCEL_URL,
        LOCAL_APP_URL,
        "http://127.0.0.1:3000",
      ]
        .map((value) => normalizeOrigin(value))
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

export const appBaseUrl = resolveAppBaseUrl();

export const trustedOrigins = resolveTrustedOrigins();
