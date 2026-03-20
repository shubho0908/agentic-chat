"use client";

import { createAuthClient } from "better-auth/react";
import { ALL_GOOGLE_SUITE_SCOPES } from "./tools/google-suite/scopes";

const clientBaseUrl =
  typeof window !== "undefined"
    ? window.location.origin
    : process.env.NEXT_PUBLIC_APP_URL;

const authClient = createAuthClient({
  baseURL: clientBaseUrl,
  fetchOptions: {
    timeout: 10_000,
    retry: {
      type: "linear",
      attempts: 2,
      delay: 500,
    },
  },
});

const { signIn, signOut, useSession } = authClient;
export { signOut, useSession };

export async function signInWithGoogle(callbackURL: string) {
  return signIn.social({
    provider: "google",
    callbackURL,
  });
}

export async function authorizeGoogleWorkspace(callbackURL: string, scopes: string[] = ALL_GOOGLE_SUITE_SCOPES) {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL("/api/google-suite/auth/connect", window.location.origin);
  url.searchParams.set("returnTo", callbackURL);

  for (const scope of scopes) {
    url.searchParams.append("scope", scope);
  }

  window.location.assign(url.toString());
}
