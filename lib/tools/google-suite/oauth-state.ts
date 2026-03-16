import { createHmac, timingSafeEqual } from "node:crypto";
import { getRequiredEnv } from '@/lib/env';

const GOOGLE_WORKSPACE_STATE_TTL_MS = 10 * 60 * 1000;

interface GoogleWorkspaceOAuthStatePayload {
  userId: string;
  returnTo: string;
  issuedAt: number;
}

function getGoogleWorkspaceStateSecret(): string {
  return getRequiredEnv("BETTER_AUTH_SECRET", {
    fallback: process.env.NODE_ENV !== 'production' ? 'development-insecure-secret' : undefined,
    description: "Better Auth secret",
  });
}

function toBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signStatePayload(encodedPayload: string): string {
  return createHmac("sha256", getGoogleWorkspaceStateSecret())
    .update(encodedPayload)
    .digest("base64url");
}

export function createGoogleWorkspaceOAuthState(userId: string, returnTo: string): string {
  const payload: GoogleWorkspaceOAuthStatePayload = {
    userId,
    returnTo,
    issuedAt: Date.now(),
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = signStatePayload(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

export function verifyGoogleWorkspaceOAuthState(state: string): GoogleWorkspaceOAuthStatePayload {
  const [encodedPayload, signature] = state.split(".");

  if (!encodedPayload || !signature) {
    throw new Error("Invalid Google Workspace OAuth state");
  }

  const expectedSignature = signStatePayload(encodedPayload);
  const provided = Buffer.from(signature, "utf8");
  const expected = Buffer.from(expectedSignature, "utf8");

  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new Error("Invalid Google Workspace OAuth state signature");
  }

  const payload = JSON.parse(fromBase64Url(encodedPayload)) as GoogleWorkspaceOAuthStatePayload;

  if (!payload.userId || !payload.returnTo || !payload.issuedAt) {
    throw new Error("Incomplete Google Workspace OAuth state");
  }

  if (Date.now() - payload.issuedAt > GOOGLE_WORKSPACE_STATE_TTL_MS) {
    throw new Error("Google Workspace OAuth state expired");
  }

  return payload;
}
