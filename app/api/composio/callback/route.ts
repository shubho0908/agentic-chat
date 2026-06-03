import { NextRequest, NextResponse } from "next/server";
import { appBaseUrl } from "@/lib/appUrl";
import { logger } from "@/lib/logger";
import { getComposioClient, clearToolCache } from "@/lib/tools/composio";

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

  let isSuccess = !explicitFailure && hasPositiveEvidence;

  if (isSuccess && connectionId) {
    try {
      const client = getComposioClient();
      if (client) {
        const account = await client.connectedAccounts.get(connectionId);
        if (account.status !== "ACTIVE") {
          isSuccess = false;
          logger.warn("[Composio Callback] Connection not ACTIVE after OAuth", {
            connectionId,
            actualStatus: account.status,
          });
        } else {
          const userId: string | undefined = (account as Record<string, unknown>).clientUserId as string | undefined;
          if (userId) {
            clearToolCache(userId);
            logger.log("[Composio Callback] Cleared tool cache for user", { userId, connectionId });
          }
        }
      }
    } catch (error) {
      logger.warn("[Composio Callback] Could not verify connection status:", error);
    }
  }

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
