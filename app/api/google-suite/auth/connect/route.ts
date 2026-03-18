import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { getAuthenticatedUser } from "@/lib/apiUtils";
import { createGoogleOAuth2Client } from "@/lib/tools/google-suite/client";
import { ALL_GOOGLE_SUITE_SCOPES, GOOGLE_CONNECTOR_SCOPES } from "@/lib/tools/google-suite/scopes";
import { createGoogleWorkspaceOAuthState } from "@/lib/tools/google-suite/oauthState";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeReturnTo(value: string | null): string {
  if (!value || !value.startsWith("/")) {
    return "/settings/google-workspace";
  }

  return value;
}

function normalizeScopes(scopes: string[]): string[] {
  const allowedScopes = new Set<string>(ALL_GOOGLE_SUITE_SCOPES);

  return Array.from(
    new Set(
      [...GOOGLE_CONNECTOR_SCOPES, ...scopes.filter((scope) => allowedScopes.has(scope))]
    )
  ).sort();
}

export async function GET(request: NextRequest) {
  const { user, error } = await getAuthenticatedUser(await headers());
  if (error) {
    return error;
  }

  const requestUrl = new URL(request.url);
  const returnTo = normalizeReturnTo(requestUrl.searchParams.get("returnTo"));
  const requestedScopes = normalizeScopes(requestUrl.searchParams.getAll("scope"));
  const redirectUri = `${requestUrl.origin}/api/google-suite/auth/callback`;
  const oauth2Client = createGoogleOAuth2Client(redirectUri);
  const state = createGoogleWorkspaceOAuthState(user.id, returnTo);

  const authorizationUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    include_granted_scopes: true,
    prompt: "consent select_account",
    scope: requestedScopes,
    state,
  });

  return NextResponse.redirect(authorizationUrl);
}
