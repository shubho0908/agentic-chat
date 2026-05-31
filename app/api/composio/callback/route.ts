import { NextRequest, NextResponse } from "next/server";
import { appBaseUrl } from "@/lib/appUrl";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const status = params.get("status");
  const errorParam = params.get("error");
  const code = params.get("code");
  const connectionId = params.get("connection_id") ?? params.get("connectedAccountId");

  const explicitFailure =
    Boolean(errorParam) ||
    status === "error" ||
    status === "failed" ||
    status === "cancelled" ||
    status === "denied";

  const explicitSuccess = status === "success";

  const hasPositiveEvidence = explicitSuccess || Boolean(code) || Boolean(connectionId);

  const isSuccess = !explicitFailure && hasPositiveEvidence;

  if (!isSuccess) {
    logger.warn("[Composio Callback] OAuth flow did not complete successfully", {
      status,
      errorParam,
      hasCode: Boolean(code),
      hasConnectionId: Boolean(connectionId),
    });
  }

  const redirectPath = isSuccess ? "/?connected=true" : "/?error=connection_failed";
  return NextResponse.redirect(new URL(redirectPath, appBaseUrl));
}
