import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { getAuthenticatedUser, errorResponse, jsonResponse } from "@/lib/apiUtils";
import { appBaseUrl } from "@/lib/appUrl";
import { initiateConnection } from "@/lib/tools/composio/auth";
import { COMPOSIO_TOOLKITS, type ComposioToolkit } from "@/lib/tools/composio/config";
import { HTTP_STATUS } from "@/constants/errors";

export async function POST(request: NextRequest) {
  try {
    const { user, error } = await getAuthenticatedUser(await headers());
    if (error) return error;

    const body = await request.json();
    const { toolkit } = body;

    if (!toolkit || !COMPOSIO_TOOLKITS.includes(toolkit as ComposioToolkit)) {
      return errorResponse("Invalid toolkit", undefined, HTTP_STATUS.BAD_REQUEST);
    }

    const callbackUrl = `${appBaseUrl}/api/composio/callback`;
    const result = await initiateConnection(user.id, toolkit as ComposioToolkit, callbackUrl);

    if (!result) {
      return errorResponse("Failed to initiate connection", undefined, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }

    return jsonResponse({ redirectUrl: result.redirectUrl, connectionId: result.connectionId });
  } catch {
    return errorResponse("Internal server error", undefined, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}
