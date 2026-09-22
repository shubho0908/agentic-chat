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
 * Lock-free explicit stop signal: records that the user stopped the named
 * turn so a later refresh or auto-continue can never retry it. Never touches
 * the thread lease - stop stays instant. This is one of only two marker
 * writers (the other is the client's scoped marker save in the messages
 * route); a plain transport disconnect writes nothing, so crash, refresh and
 * network-loss resume keep working. The scoped user message id is required:
 * an unscoped stop could finalize the wrong turn.
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
    if (!expectedUserMessageId) {
      return errorResponse(
        "Missing userMessageId",
        undefined,
        HTTP_STATUS.BAD_REQUEST,
      );
    }
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
