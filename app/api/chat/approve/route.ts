import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { getAuthenticatedUser, errorResponse, getUserApiKey, verifyConversationOwnership } from "@/lib/apiUtils";
import { HTTP_STATUS } from "@/constants/errors";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rateLimit";
import { Command } from "@langchain/langgraph";
import { getConnectedToolkits } from "@/lib/tools/composio/auth";
import { createAgentGraph } from "@/lib/orchestrator/graph";
import { createFinalAnswerNode } from "@/lib/orchestrator/nodes/agent";
import { resolveResumeConfig } from "@/lib/orchestrator/resumeConfig";
import { HUMAN_IN_THE_LOOP_APPROVED, HUMAN_IN_THE_LOOP_DENIED } from "@/lib/orchestrator/constants";
import { createStreamEventMapper, handleGraphInterrupt, terminalAnswerText } from "@/lib/orchestrator/streaming";
import { encodeDone, encodeError } from "@/lib/chat/streamingHelpers";
import { createSafeStream } from "@/lib/chat/safeStream";
import { DEFAULT_MODEL, REASONING_EFFORTS, getSupportedReasoningEfforts, isReasoningEffortSupported } from "@/constants/openai-models";
import { validateRequestedModel, parseReasoningEffortParam } from "@/lib/modelPolicy";
import { logger } from "@/lib/logger";
import { toUserFriendlyError } from "@/lib/errorMessages";
import { isRecord } from "@/lib/typeGuards";
import { createRequestId, logError, logWarn } from "@/lib/observability";
import { isValidConversationId } from "@/lib/validation";
import { deriveThreadId, isThreadIdForConversation } from "@/lib/orchestrator/threadIdentity";
import {
  APPROVAL_LOCK_WAIT_TIMEOUT_MS,
  FINAL_ANSWER_RESERVE_MS,
  ORCHESTRATOR_STREAM_DEADLINE_MS,
  RecoveryReason,
  STREAM_HEARTBEAT_INTERVAL_MS,
  type RecoveryReasonValue,
} from "@/lib/orchestrator/constants";
import {
  acquireThreadLock,
  ThreadLockTimeoutError,
  type ThreadLock,
} from "@/lib/orchestrator/threadLock";
import { abortAware } from "@/lib/orchestrator/abortAware";
import {
  GRAPH_RUN_LIMITS,
  closeTurnAtLimit,
  createAnswerDue,
  limitReason,
} from "@/lib/orchestrator/stepLimit";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
    // HITL interrupts fire on the branch thread when the user is on a branch
    // (conv-<id>:branch:<branchId>), not only on the root thread. Validate the
    // explicit thread id against every thread this conversation owns via the
    // same encoder the orchestrator uses, then resume that exact thread;
    // rejecting branch ids here stranded every branch approval with a 400.
    if (explicitThreadId && !isThreadIdForConversation(explicitThreadId, conversationId)) {
      return errorResponse("threadId does not match conversationId", undefined, HTTP_STATUS.BAD_REQUEST);
    }
    const threadId = explicitThreadId ?? deriveThreadId(conversationId);

    const reasoningEffort = parseReasoningEffortParam(body.reasoningEffort);
    if (body.reasoningEffort !== undefined && reasoningEffort === null) {
      return errorResponse(
        `reasoningEffort must be one of: ${REASONING_EFFORTS.join(", ")}`,
        undefined,
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    if (reasoningEffort && !isReasoningEffortSupported(model, reasoningEffort)) {
      return errorResponse(
        `reasoningEffort "${reasoningEffort}" is not supported by ${model}. Supported: ${getSupportedReasoningEfforts(model).join(", ")}`,
        undefined,
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    const apiKey = await getUserApiKey(user.id);

    const abortController = new AbortController();
    request.signal.addEventListener(
      "abort",
      () => {
        abortController.abort();
      },
      { once: true }
    );

    // Same deadline contract as the chat stream: abort resume work and emit a
    // terminal SSE error before the platform hard-kills this 300s route
    // mid-stream. One agent step can chain three bounded 180s model attempts,
    // so an unbounded resume can outlive maxDuration while heartbeats keep
    // the client watchdog quiet.
    const deadlineController = new AbortController();
    const deadlineTimer = setTimeout(() => {
      deadlineController.abort(new Error("Approval stream deadline exceeded"));
    }, ORCHESTRATOR_STREAM_DEADLINE_MS);
    (deadlineTimer as { unref?: () => void }).unref?.();
    const workSignal = AbortSignal.any([
      abortController.signal,
      deadlineController.signal,
    ]);
    const deadlineAt = Date.now() + ORCHESTRATOR_STREAM_DEADLINE_MS;

    // Resume mutates the same checkpoint thread the chat stream serializes,
    // so it must hold the same lease. Without it two approvals can both
    // observe the pending interrupt and resume concurrently, racing
    // checkpoint writes and replaying side-effecting tool work. The
    // pending-interrupt check below therefore runs only after the lease is
    // held, closing the check-then-act window.
    let threadLock: ThreadLock;
    try {
      threadLock = await acquireThreadLock(threadId, {
        signal: workSignal,
        waitTimeoutMs: APPROVAL_LOCK_WAIT_TIMEOUT_MS,
      });
    } catch (lockError) {
      clearTimeout(deadlineTimer);
      if (lockError instanceof ThreadLockTimeoutError) {
        return errorResponse(
          "Another response is still being generated for this chat. Please wait for it to finish, then try again.",
          undefined,
          HTTP_STATUS.CONFLICT,
        );
      }
      throw lockError;
    }

    let streamOwnsLock = false;
    try {
      const connectedToolkits = await abortAware(
        getConnectedToolkits(user.id),
        workSignal,
      );
      const graph = await createAgentGraph(user.id, apiKey, model, { reasoningEffort, connectedToolkits });

      const existingState = await abortAware(
        graph.getState({ configurable: { thread_id: threadId } }),
        workSignal,
      );
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

    const resumeConfig = resolveResumeConfig(
      model,
      reasoningEffort,
      (existingState.tasks ?? [])
        .flatMap((task) => task.interrupts ?? [])
        .map((pending) => pending.value),
    );
    if (resumeConfig.usedPersisted && (resumeConfig.model !== model || resumeConfig.reasoningEffort !== reasoningEffort)) {
      logger.log("[Approve] Resuming with interrupt-created config over picker config", {
        requestId,
        pickerModel: model,
        resumeModel: resumeConfig.model,
        pickerReasoningEffort: reasoningEffort,
        resumeReasoningEffort: resumeConfig.reasoningEffort,
      });
    }
    const resumeGraph =
      resumeConfig.model === model && resumeConfig.reasoningEffort === reasoningEffort
        ? graph
        : await createAgentGraph(user.id, apiKey, resumeConfig.model, {
            reasoningEffort: resumeConfig.reasoningEffort,
            connectedToolkits,
          });

    const resumeValue = typeof response === "string"
      ? response
      : approved
        ? HUMAN_IN_THE_LOOP_APPROVED
        : HUMAN_IN_THE_LOOP_DENIED;

      let startBegan = false;
      const readableStream = new ReadableStream({
        async start(controller) {
          startBegan = true;
          const stream = createSafeStream(controller, {
            abortSignal: abortController.signal,
            label: "Approve",
            heartbeatIntervalMs: STREAM_HEARTBEAT_INTERVAL_MS,
          });
          const mapper = createStreamEventMapper();
          const answerDue = createAnswerDue(
            deadlineAt - FINAL_ANSWER_RESERVE_MS - Date.now(),
            mapper.isAnswering,
          );
          const finishStream = () => {
            stream.finish({
              done: encodeDone(),
              flush: (writer) => mapper.flush(writer),
            });
          };
          const closeTurn = (reason: RecoveryReasonValue) =>
            closeTurnAtLimit(
              resumeGraph,
              createFinalAnswerNode(apiKey, resumeConfig.model, {
                reasoningEffort: resumeConfig.reasoningEffort,
              }),
              reason,
              threadId,
              stream,
              mapper,
              workSignal,
              deadlineAt,
              { requestId },
            );
          const timeoutStream = () => {
            if (stream.isAborted) return;
            logWarn({
              event: "approval_stream_deadline",
              requestId,
              threadId,
              deadlineMs: ORCHESTRATOR_STREAM_DEADLINE_MS,
            });
            stream.enqueue(
              encodeError(
                "This response took too long and was stopped. Please try again, or break the request into smaller parts.",
              ),
            );
            finishStream();
          };

          try {
            const eventStream = await resumeGraph.streamEvents(
              new Command({ resume: resumeValue }),
              {
                configurable: { thread_id: threadId },
                ...GRAPH_RUN_LIMITS,
                version: "v2",
                signal: AbortSignal.any([workSignal, answerDue.signal]),
              }
            );

            for await (const event of eventStream) {
              if (workSignal.aborted) break;
              mapper.map(stream, event as Record<string, unknown>);
            }

            if (workSignal.aborted) {
              if (deadlineController.signal.aborted) {
                timeoutStream();
              } else {
                stream.abort();
              }
              return;
            }

            const finalState = await abortAware(
              resumeGraph.getState({ configurable: { thread_id: threadId } }),
              workSignal,
            );
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
              handleGraphInterrupt(stream, interruptData);
              finishStream();
              return;
            }

            if (answerDue.signal.aborted && !terminalAnswerText(finalState.values?.messages)) {
              await closeTurn(RecoveryReason.TIME_LIMIT);
            } else {
              mapper.ensureTerminalAnswer(stream, finalState.values?.messages);
            }
            finishStream();
          } catch (err) {
            if (deadlineController.signal.aborted) {
              timeoutStream();
              return;
            }
            const reason = limitReason(err, answerDue.signal);
            if (reason && !abortController.signal.aborted) {
              await closeTurn(reason);
              finishStream();
              return;
            }
            if (abortController.signal.aborted || (err instanceof Error && err.name === "AbortError")) {
              logger.warn("[Approve] Stream aborted by client");
              stream.abort();
              return;
            }
            logger.error("[Approve] Error resuming graph:", err);
            stream.enqueue(encodeError(toUserFriendlyError(err)));
            finishStream();
          } finally {
            answerDue.dispose();
            clearTimeout(deadlineTimer);
            await threadLock.release();
          }
        },
        cancel() {
          abortController.abort();
          // The lease stays with start(): releasing here while streamEvents
          // and its checkpoint writes are still unwinding would let the next
          // acquirer run concurrently with the aborted resume. start()'s
          // finally releases once the unwind settles. Only when start never
          // ran does cancel own the release, so the lease cannot leak.
          if (!startBegan) {
            clearTimeout(deadlineTimer);
            void threadLock.release();
          }
        },
      });

      streamOwnsLock = true;
      return new Response(readableStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          "Connection": "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    } finally {
      if (!streamOwnsLock) {
        clearTimeout(deadlineTimer);
        await threadLock.release();
      }
    }
  } catch (error) {
    logError({
      event: "chat_approval_route_failed",
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse("Internal server error", undefined, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}
