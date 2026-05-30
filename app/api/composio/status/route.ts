import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { getAuthenticatedUser, errorResponse, jsonResponse } from "@/lib/apiUtils";
import { getConnectedServices, disconnectService } from "@/lib/tools/composio/auth";
import { clearToolCache } from "@/lib/tools/composio/index";
import { HTTP_STATUS } from "@/constants/errors";

export async function GET() {
  try {
    const { user, error } = await getAuthenticatedUser(await headers());
    if (error) return error;

    const services = await getConnectedServices(user.id);
    return jsonResponse({ services });
  } catch {
    return errorResponse("Internal server error", undefined, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { user, error } = await getAuthenticatedUser(await headers());
    if (error) return error;

    const body = await request.json();
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
  } catch {
    return errorResponse("Internal server error", undefined, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}
