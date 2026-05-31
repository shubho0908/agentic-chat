import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { getAuthenticatedUser, errorResponse, jsonResponse } from "@/lib/apiUtils";
import { appBaseUrl } from "@/lib/appUrl";
import { initiateConnection } from "@/lib/tools/composio/auth";
import { COMPOSIO_TOOLKITS, type ComposioToolkit } from "@/lib/tools/composio/config";
import { HTTP_STATUS } from "@/constants/errors";
import { isRecord } from "@/lib/typeGuards";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const { user, error } = await getAuthenticatedUser(await headers());
    if (error) return error;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("Request body must be valid JSON", undefined, HTTP_STATUS.BAD_REQUEST);
    }

    if (!isRecord(body)) {
      return errorResponse("Invalid request body", undefined, HTTP_STATUS.BAD_REQUEST);
    }

    const { toolkit } = body;

    if (typeof toolkit !== "string" || !COMPOSIO_TOOLKITS.includes(toolkit as ComposioToolkit)) {
      return errorResponse("Invalid toolkit", undefined, HTTP_STATUS.BAD_REQUEST);
    }

    const validatedToolkit = toolkit as ComposioToolkit;
    const callbackUrl = `${appBaseUrl}/api/composio/callback`;
    const result = await initiateConnection(user.id, validatedToolkit, callbackUrl);

    if (!result) {
      return errorResponse("Failed to initiate connection", undefined, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }

    return jsonResponse({ redirectUrl: result.redirectUrl, connectionId: result.connectionId });
  } catch (error) {
    logger.error("[Composio Connect] Route failed:", error);
    return errorResponse("Internal server error", undefined, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}
