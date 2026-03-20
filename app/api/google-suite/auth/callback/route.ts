import { NextRequest, NextResponse } from "next/server";
import {

  getGoogleWorkspaceAuthErrorCode,
  GOOGLE_ACCOUNT_LINKED_ERROR,
  GOOGLE_ACCOUNT_MISMATCH_ERROR,
  persistGoogleWorkspaceGrant,
} from "@/lib/tools/google-suite/client";
import { verifyGoogleWorkspaceOAuthState } from "@/lib/tools/google-suite/oauthState";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

function buildReturnUrl(origin: string, returnTo: string, status: "success" | "error", reason?: string) {
  const url = new URL(returnTo.startsWith("/") ? `${origin}${returnTo}` : `${origin}/settings/google-workspace`);
  url.searchParams.set("google_workspace", status);
  url.searchParams.set("ts", Date.now().toString());

  if (reason) {
    url.searchParams.set("reason", reason);
  }

  return url;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const oauthError = requestUrl.searchParams.get("error");

  if (!state) {
    return NextResponse.redirect(
      buildReturnUrl(origin, "/settings/google-workspace", "error", "missing_state")
    );
  }

  let verifiedState;

  try {
    verifiedState = verifyGoogleWorkspaceOAuthState(state);
  } catch (error) {
    logger.error("[Google Workspace OAuth] Invalid state:", error);
    return NextResponse.redirect(
      buildReturnUrl(origin, "/settings/google-workspace", "error", "invalid_state")
    );
  }

  if (oauthError || !code) {
    return NextResponse.redirect(
      buildReturnUrl(origin, verifiedState.returnTo, "error", oauthError ?? "missing_code")
    );
  }

  try {
    await persistGoogleWorkspaceGrant({
      userId: verifiedState.userId,
      redirectUri: `${origin}/api/google-suite/auth/callback`,
      code,
    });

    return NextResponse.redirect(buildReturnUrl(origin, verifiedState.returnTo, "success"));
  } catch (error) {
    logger.error("[Google Workspace OAuth] Failed to persist grant:", error);
    const errorCode = getGoogleWorkspaceAuthErrorCode(error);
    const reason =
      errorCode === GOOGLE_ACCOUNT_MISMATCH_ERROR
        ? "account_mismatch"
        : errorCode === GOOGLE_ACCOUNT_LINKED_ERROR
          ? "account_linked"
          : "persist_failed";

    return NextResponse.redirect(
      buildReturnUrl(origin, verifiedState.returnTo, "error", reason)
    );
  }
}
