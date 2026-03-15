const LOCAL_APP_URL = "http://localhost:3000";

const isDevelopment = process.env.NODE_ENV !== "production";

export const appBaseUrl =
  isDevelopment
    ? LOCAL_APP_URL
    : process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? LOCAL_APP_URL;

export const trustedOrigins = Array.from(
  new Set(
    [
      process.env.BETTER_AUTH_URL,
      process.env.NEXT_PUBLIC_APP_URL,
      LOCAL_APP_URL,
      "http://127.0.0.1:3000",
    ].filter((value): value is string => Boolean(value))
  )
);
