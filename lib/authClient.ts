"use client";

import { createAuthClient } from "better-auth/react";

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


