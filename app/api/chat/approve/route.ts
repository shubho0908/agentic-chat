import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { getAuthenticatedUser, errorResponse, getUserApiKey, verifyConversationOwnership } from "@/lib/apiUtils";
import { HTTP_STATUS } from "@/constants/errors";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rateLimit";
import { Command } from "@langchain/langgraph";
import { getConnectedToolkits } from "@/lib/tools/composio/auth";
import { createAgentGraph } from "@/lib/orchestrator/graph";
import { HUMAN_IN_THE_LOOP_APPROVED, HUMAN_IN_THE_LOOP_DENIED } from "@/lib/orchestrator/constants";
import { createStreamEventMapper, handleGraphEnd, handleGraphInterrupt } from "@/lib/orchestrator/streaming";
import { encodeDone, encodeError } from "@/lib/chat/streamingHelpers";
import { DEFAULT_MODEL } from "@/constants/openai-models";
import { validateRequestedModel } from "@/lib/modelPolicy";
import { logger } from "@/lib/logger";
import { toUserFriendlyError } from "@/lib/errorMessages";
import { isRecord } from "@/lib/typeGuards";
import { createRequestId, logError } from "@/lib/observability";
import { isValidConversationId } from "@/lib/validation";

function deriveThreadIdFromConversation(conversationId: string): string {
  return `conv-${conversationId}`;
}

export async function POST(request: NextRequest) {
  const requestId = createRequestId("chat-approve");
  try {
    const { user, error } = await getAuthenticatedUser(await headers());
    if (error) return error;

    const rateLimited = checkRateLimit(user.id, "approval", RATE_LIMITS.approval);
    if (rateLimited) return rateLimited;

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return errorResponse("Request body must be valid JSON.", undefined, HTTP_STATUS.BAD_REQUEST);
    }

    if (!isRecord(rawBody)) {
      return errorResponse("Request body must be a JSON object.", undefined, HTTP_STATUS.BAD_REQUEST);
    }

    const body = rawBody;
    const { conversationId, approved, response } = body;
    const requestedModel = typeof body.model === "string" ? body.model.trim() : DEFAULT_MODEL;
    const model = validateRequestedModel(requestedModel) ?? DEFAULT_MODEL;

    if (!conversationId || typeof conversationId !== "string") {
      return errorResponse("Missing conversationId", undefined, HTTP_STATUS.BAD_REQUEST);
    }
    if (!isValidConversationId(conversationId)) {
      return errorResponse("Invalid conversationId", undefined, HTTP_STATUS.BAD_REQUEST);
    }
    if (typeof response !== "string" && typeof approved !== "boolean") {
      return errorResponse("approved must be a boolean or response must be a string", undefined, HTTP_STATUS.BAD_REQUEST);
    }

    const { error: ownershipError } = await verifyConversationOwnership(conversationId, user.id);
    if (ownershipError) return ownershipError;

    const explicitThreadId =
      typeof body.threadId === "string" && body.threadId.trim()
        ? body.threadId.trim()
        : null;
    const expectedThreadId = deriveThreadIdFromConversation(conversationId);
    if (explicitThreadId && explicitThreadId !== expectedThreadId) {
      return errorResponse("threadId does not match conversationId", undefined, HTTP_STATUS.BAD_REQUEST);
    }
    const threadId = expectedThreadId;

    const apiKey = await getUserApiKey(user.id);
    const connectedToolkits = await getConnectedToolkits(user.id);
    const graph = await createAgentGraph(user.id, apiKey, model, { thinkingEnabled: true, connectedToolkits });

    const existingState = await graph.getState({ configurable: { thread_id: threadId } });
    const hasPendingInterrupt = (existingState.tasks ?? []).some(
      (task) => (task.interrupts ?? []).length > 0
    );
    if (!hasPendingInterrupt) {
      logger.warn("[Approve] No pending interrupt for thread", { threadId, conversationId });
      return errorResponse(
        "This action has already been resolved or the session has expired.",
        undefined,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const resumeValue = typeof response === "string"
      ? response
      : approved
        ? HUMAN_IN_THE_LOOP_APPROVED
        : HUMAN_IN_THE_LOOP_DENIED;

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          const eventStream = await graph.streamEvents(
            new Command({ resume: resumeValue }),
            {
              configurable: { thread_id: threadId },
              version: "v2",
            }
          );

          const mapper = createStreamEventMapper();
          for await (const event of eventStream) {
            mapper.map(controller, event as Record<string, unknown>);
          }

          const finalState = await graph.getState({ configurable: { thread_id: threadId } });
          const pendingInterrupts = (finalState.tasks ?? [])
            .flatMap((task) => task.interrupts ?? []);

          if (pendingInterrupts.length > 0) {
            const firstValue = pendingInterrupts[0].value;
            const interruptData = {
              ...(typeof firstValue === "object" && firstValue !== null
                ? firstValue as Record<string, unknown>
                : {}),
              threadId,
            };
            handleGraphInterrupt(controller, interruptData);
            controller.enqueue(encodeDone());
            controller.close();
            return;
          }

          handleGraphEnd(controller);
          controller.close();
        } catch (err) {
          logger.error("[Approve] Error resuming graph:", err);
          try {
            controller.enqueue(encodeError(toUserFriendlyError(err)));
            controller.enqueue(encodeDone());
          } finally {
            controller.close();
          }
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    logError({
      event: "chat_approval_route_failed",
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse("Internal server error", undefined, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}
