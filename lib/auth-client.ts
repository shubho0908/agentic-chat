"use client";

import { createAuthClient } from "better-auth/react";
import { ALL_GOOGLE_SUITE_SCOPES } from "./tools/google-suite/scopes";

const clientBaseUrl =
  typeof window !== "undefined"
    ? window.location.origin
    : process.env.NEXT_PUBLIC_APP_URL;

export const authClient = createAuthClient({
  baseURL: clientBaseUrl,
});

export const { signIn, signOut, useSession, linkSocial } = authClient;

export async function signInWithGoogle(callbackURL: string) {
  return signIn.social({
    provider: "google",
    callbackURL,
  });
}

export async function authorizeGoogleWorkspace(callbackURL: string) {
  return linkSocial({
    provider: "google",
    callbackURL,
    scopes: ALL_GOOGLE_SUITE_SCOPES,
  });
}
