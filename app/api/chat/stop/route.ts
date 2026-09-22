import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import {
  getAuthenticatedUser,
  errorResponse,
  jsonResponse,
} from "@/lib/apiUtils";
import { API_ERROR_MESSAGES, HTTP_STATUS } from "@/constants/errors";
import { isValidConversationId } from "@/lib/validation";
import { isRecord } from "@/lib/typeGuards";
import { markStreamStoppedByUser } from "@/lib/chat/streamStopped";

export const dynamic = "force-dynamic";

/**
 * Lock-free stop signal: records that the user stopped the current turn so a
 * later refresh or auto-continue can never retry it. Never touches the thread
 * lease - stop stays instant. The stream-abort path writes the same marker
 * when the disconnect reaches the server; this endpoint covers the window
 * before the stream request exists (e.g. stop while the user message is still
 * saving) and any abort the server never sees.
 */
export async function POST(request: NextRequest) {
  try {
    const { user, error } = await getAuthenticatedUser(await headers());
    if (error) return error;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse(
        "Request body must be valid JSON",
        undefined,
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    if (!isRecord(body) || typeof body.conversationId !== "string") {
      return errorResponse(
        "Missing conversationId",
        undefined,
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    const { conversationId } = body;
    if (!isValidConversationId(conversationId)) {
      return errorResponse(
        API_ERROR_MESSAGES.INVALID_CONVERSATION_ID,
        undefined,
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    try {
      await prisma.conversation.update({
        where: { id: conversationId, userId: user.id },
        data: { updatedAt: new Date() },
        select: { id: true },
      });
    } catch (updateErr) {
      if (isRecord(updateErr) && updateErr.code === "P2025") {
        return errorResponse(
          API_ERROR_MESSAGES.CONVERSATION_NOT_FOUND,
          undefined,
          HTTP_STATUS.NOT_FOUND,
        );
      }
      throw updateErr;
    }

    const expectedUserMessageId =
      typeof body.userMessageId === "string" && body.userMessageId.length > 0
        ? body.userMessageId
        : undefined;
    const result = await markStreamStoppedByUser(
      conversationId,
      expectedUserMessageId,
    );
    return jsonResponse(result, HTTP_STATUS.OK);
  } catch (error) {
    return errorResponse(
      "Failed to record stop",
      error instanceof Error ? error.message : undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  }
}
