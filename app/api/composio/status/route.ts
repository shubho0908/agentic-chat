import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { getAuthenticatedUser, errorResponse, jsonResponse } from "@/lib/apiUtils";
import { getConnectedServices, disconnectService } from "@/lib/tools/composio/auth";
import { clearToolCache } from "@/lib/tools/composio/index";
import { HTTP_STATUS } from "@/constants/errors";
import { isRecord } from "@/lib/typeGuards";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    const { user, error } = await getAuthenticatedUser(await headers());
    if (error) return error;

    const services = await getConnectedServices(user.id);
    return jsonResponse({ services });
  } catch (error) {
    logger.error("[Composio Status] Failed to list services:", error);
    return errorResponse("Internal server error", undefined, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

export async function DELETE(request: NextRequest) {
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

    const { connectedAccountId } = body;

    if (!connectedAccountId || typeof connectedAccountId !== "string") {
      return errorResponse("Missing connectedAccountId", undefined, HTTP_STATUS.BAD_REQUEST);
    }

    const success = await disconnectService(user.id, connectedAccountId);
    if (!success) {
      return errorResponse("Failed to disconnect", undefined, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }

    clearToolCache(user.id);
    return jsonResponse({ success: true });
  } catch (error) {
    logger.error("[Composio Status] Failed to disconnect service:", error);
    return errorResponse("Internal server error", undefined, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}
