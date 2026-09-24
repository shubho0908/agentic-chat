import type { ReasoningEffortLevel } from "@/constants/openai-models";
import type { BaseMessage } from "@langchain/core/messages";
import type { Message } from "@/lib/schemas/chat";
import { convertToLangChainMessages } from "./messageConversion";
import type { MemoryStatus } from "@/types/chat";
import { routeContext } from "@/lib/contextRouter";
import { injectContextToMessages } from "@/lib/chat/messageHelpers";
import { getConnectedToolkits } from "@/lib/tools/composio/auth";
import { createAgentGraph } from "./graph";
import { createFinalAnswerNode } from "./nodes/agent";
import { shouldBypassSemanticCacheForMessageContext } from "./tools";
import { createStreamEventMapper, handleGraphInterrupt } from "./streaming";
import {
  encodeMemoryStatus,
  encodeError,
  encodeDone,
  encodeChatChunk,
} from "@/lib/chat/streamingHelpers";
import { createSafeStream } from "@/lib/chat/safeStream";
import { checkTokenBudget } from "@/lib/chat/tokenBudget";
import { isGraphInterrupt } from "@langchain/langgraph";
import {
  MIN_CACHEABLE_QUERY_LENGTH,
  ORCHESTRATOR_STREAM_DEADLINE_MS,
  STREAM_HEARTBEAT_INTERVAL_MS,
} from "./constants";
import { logger } from "@/lib/logger";
import { toUserFriendlyError } from "@/lib/errorMessages";
import {
  generateEmbedding,
  searchSemanticCacheEntry,
} from "@/lib/rag/storage/cache";
import {
  SIMILARITY_THRESHOLD,
  CACHE_TTL_SECONDS,
} from "@/lib/rag/storage/pgvectorClient";
import { gateCacheHit } from "@/lib/jev/cacheGate";
import { extractTextFromMessage } from "@/lib/chat/messageContent";
import { deriveThreadId } from "./threadIdentity";
import { logError, logInfo, logWarn } from "@/lib/observability";
import {
  acquireThreadLock,
  ThreadLockTimeoutError,
  type ThreadLock,
} from "./threadLock";
import { messageFingerprint } from "./messageIdentity";
import { abortAware } from "./abortAware";
import {
  GRAPH_RUN_LIMITS,
  closeTurnAtStepLimit,
  isGraphRecursionError,
} from "./stepLimit";

interface OrchestratorStreamOptions {
  messages: Message[];
  model: string;
  apiKey: string;
  userId: string;
  conversationId: string;
  branchId?: string;
  documentAttachmentIds?: string[];
  memoryEnabled?: boolean;
  reasoningEffort?: ReasoningEffortLevel | null;
  abortSignal?: AbortSignal;
}

export function createOrchestratorStreamHandler(
  options: OrchestratorStreamOptions,
) {
  const {
    messages,
    model,
    apiKey,
    userId,
    conversationId,
    branchId,
    documentAttachmentIds,
    memoryEnabled = true,
    reasoningEffort,
    abortSignal,
  } = options;

  return {
    async start(controller: ReadableStreamDefaultController) {
      const stream = createSafeStream(controller, {
        abortSignal,
        label: "Orchestrator",
        heartbeatIntervalMs: STREAM_HEARTBEAT_INTERVAL_MS,
      });
      const threadId = deriveThreadId(conversationId, branchId);
      let memoryStatusInfo: MemoryStatus = {
        hasMemories: false,
        attemptedMemory: false,
        hasDocuments: false,
        memoryCount: 0,
        documentCount: 0,
        hasImages: false,
        imageCount: 0,
        skippedMemory: false,
      };

      const mapper = createStreamEventMapper();

      // Overall deadline aligned under this route's Vercel maxDuration (300s):
      // abort downstream work and terminate the stream gracefully with a
      // terminal SSE error instead of letting the platform hard-kill the
      // invocation mid-stream with no client-visible outcome.
      const deadlineController = new AbortController();
      const deadlineTimer = setTimeout(() => {
        deadlineController.abort(
          new Error("Orchestrator stream deadline exceeded"),
        );
      }, ORCHESTRATOR_STREAM_DEADLINE_MS);
      (deadlineTimer as { unref?: () => void }).unref?.();
      const workSignal = AbortSignal.any(
        abortSignal
          ? [abortSignal, deadlineController.signal]
          : [deadlineController.signal],
      );
      const isDeadlineExceeded = () => deadlineController.signal.aborted;

      const closeStream = () => {
        stream.finish({
          done: encodeDone(),
          flush: (writer) => mapper.flush(writer),
        });
      };

      const failStream = (error: unknown) => {
        if (stream.isAborted) {
          return;
        }

        const friendly = toUserFriendlyError(error);

        logError({
          event: "orchestrator_sse_error",
          conversationId,
          threadId,
          branchId,
          error: error instanceof Error ? error.name : "unknown",
        });
        stream.enqueue(encodeError(friendly));
        closeStream();
      };

      const abortStream = () => {
        stream.abort();
      };

      const timeoutStream = () => {
        if (stream.isAborted) return;
        logWarn({
          event: "orchestrator_stream_deadline",
          conversationId,
          threadId,
          branchId,
          deadlineMs: ORCHESTRATOR_STREAM_DEADLINE_MS,
        });
        stream.enqueue(
          encodeError(
            "This response took too long and was stopped. Please try again, or break the request into smaller parts.",
          ),
        );
        closeStream();
      };

      // Client-disconnect abort: cancel the work only. No durable stop
      // marker is written on this path - refresh, tab close and network
      // loss must stay resumable by auto-continue. Only an explicit stop
      // records a marker (the /api/chat/stop endpoint or the client's
      // scoped marker save).
      const handleWorkAbort = async () => {
        if (isDeadlineExceeded()) {
          timeoutStream();
          return;
        }
        abortStream();
      };

      try {
        if (workSignal.aborted) {
          await handleWorkAbort();
          return;
        }

        const requestBudgetCheck = checkTokenBudget(messages, model);
        if (!requestBudgetCheck.ok) {
          logWarn({
            event: "orchestrator_client_budget_exceeded",
            conversationId,
            threadId,
            used: requestBudgetCheck.tokenUsage.used,
            limit: requestBudgetCheck.tokenUsage.limit,
          });
          stream.enqueue(
            encodeError(
              requestBudgetCheck.errorMessage ??
                "Request exceeds the server token budget.",
            ),
          );
          closeStream();
          return;
        }

        let enhancedMessages = messages;
        const lastUserMessage = messages[messages.length - 1]?.content || "";

        try {
          const contextResult = await routeContext(
            lastUserMessage,
            userId,
            messages.slice(0, -1),
            conversationId,
            null,
            memoryEnabled,
            {
              apiKey,
              signal: workSignal,
              currentDocumentAttachmentIds: documentAttachmentIds,
            },
          );
          memoryStatusInfo = { ...memoryStatusInfo, ...contextResult.metadata };
          if (contextResult.context) {
            enhancedMessages = injectContextToMessages(
              enhancedMessages,
              contextResult.context,
              model,
            );
          }
        } catch (error) {
          if (
            workSignal.aborted ||
            (error instanceof Error && error.name === "AbortError")
          )
            throw error;
          logger.error("[Orchestrator] Context routing failed:", error);
        }

        if (workSignal.aborted) {
          await handleWorkAbort();
          return;
        }

        stream.enqueue(encodeMemoryStatus(memoryStatusInfo));

        const budgetCheck = checkTokenBudget(enhancedMessages, model);
        memoryStatusInfo.tokenUsage = budgetCheck.tokenUsage;
        stream.enqueue(encodeMemoryStatus(memoryStatusInfo));

        if (!budgetCheck.ok) {
          logWarn({
            event: "orchestrator_enhanced_budget_exceeded",
            conversationId,
            threadId,
            used: budgetCheck.tokenUsage.used,
            limit: budgetCheck.tokenUsage.limit,
          });
          stream.enqueue(
            encodeError(
              budgetCheck.errorMessage ??
                "Request exceeds the server token budget.",
            ),
          );
          closeStream();
          return;
        }

        const connectedToolkits = await abortAware(
          getConnectedToolkits(userId),
          workSignal,
        );

        const queryText = extractTextFromMessage(lastUserMessage);
        const bypassSemanticCache = shouldBypassSemanticCacheForMessageContext(
          messages,
          queryText,
          connectedToolkits,
        );
        if (
          queryText &&
          !bypassSemanticCache &&
          queryText.trim().length >= MIN_CACHEABLE_QUERY_LENGTH
        ) {
          try {
            const embedding = await generateEmbedding(
              `user: ${queryText}`,
              userId,
              workSignal,
            );
            const entry = await abortAware(
              searchSemanticCacheEntry(
                embedding,
                userId,
                conversationId,
                model,
                reasoningEffort ?? null,
              ),
              workSignal,
            );
            if (entry) {
              // Jev cache gate (structural signals only): shadow logs and
              // serves, active vetoes confident no-serve verdicts and refuses
              // hits the gate could not evaluate.
              const round4 = (value: number) =>
                Math.round(value * 10_000) / 10_000;
              const gate = await abortAware(
                gateCacheHit(
                  {
                    similarityScore: round4(entry.score),
                    similarityThreshold: SIMILARITY_THRESHOLD,
                    scoreMargin: round4(entry.score - SIMILARITY_THRESHOLD),
                    cacheAgeSeconds: Math.max(
                      0,
                      Math.round(
                        (Date.now() - entry.createdAt.getTime()) / 1000,
                      ),
                    ),
                    cacheTtlSeconds: CACHE_TTL_SECONDS,
                    entryScopedToConversation: entry.conversationId !== null,
                    queryLengthChars: queryText.length,
                    answerLengthChars: entry.answer.length,
                  },
                  conversationId,
                ),
                workSignal,
              );
              if (gate.serve) {
                logger.log("[Orchestrator] Semantic cache HIT");
                stream.enqueue(encodeChatChunk(entry.answer));
                closeStream();
                return;
              }
              logger.log(
                "[Orchestrator] Semantic cache HIT vetoed by Jev gate",
              );
            }
          } catch (cacheErr) {
            if (
              workSignal.aborted ||
              (cacheErr instanceof Error && cacheErr.name === "AbortError")
            )
              throw cacheErr;
            logger.warn(
              "[Orchestrator] Cache check failed, proceeding:",
              cacheErr,
            );
          }
        }

        // Only durable dialogue enters MessagesAnnotation. Retrieval and document
        // context stays in this request's graph-node closures and is never checkpointed.
        const durableMessages = convertToLangChainMessages(messages);
        const enhancedLangChainMessages =
          convertToLangChainMessages(enhancedMessages);
        const ephemeralContext = enhancedLangChainMessages.filter(
          (candidate) =>
            !durableMessages.some((durable) => durable.id === candidate.id),
        );
        const graph = await createAgentGraph(userId, apiKey, model, {
          reasoningEffort,
          connectedToolkits,
          ephemeralContext,
        });
        const graphConfig = { configurable: { thread_id: threadId } };
        let threadLock: ThreadLock;
        try {
          threadLock = await acquireThreadLock(threadId, {
            signal: workSignal,
          });
        } catch (lockError) {
          if (lockError instanceof ThreadLockTimeoutError) {
            logWarn({
              event: "orchestrator_thread_lock_timeout",
              conversationId,
              threadId,
              branchId,
            });
            stream.enqueue(
              encodeError(
                "Another response is still being generated for this chat. Please wait for it to finish, then send your message again.",
              ),
            );
            closeStream();
            return;
          }
          throw lockError;
        }
        try {
          const existingState = await abortAware(
            graph.getState(graphConfig),
            workSignal,
          );
          const storedById = new Map<string, string>(
            (existingState.values?.messages ?? []).flatMap(
              (message: BaseMessage) =>
                message.id
                  ? [[message.id, messageFingerprint(message)] as const]
                  : [],
            ),
          );
          const checkpointExists =
            (existingState.values?.messages?.length ?? 0) > 0;
          const incrementalMessages = checkpointExists
            ? durableMessages.filter(
                (message) =>
                  !message.id ||
                  storedById.get(message.id) !== messageFingerprint(message),
              )
            : durableMessages;
          logInfo({
            event: "orchestrator_checkpoint_input",
            conversationId,
            threadId,
            branchId,
            checkpointExists,
            incomingCount: durableMessages.length,
            submittedCount: incrementalMessages.length,
          });
          if (checkpointExists && incrementalMessages.length === 0) {
            if (
              mapper.ensureTerminalAnswer(stream, existingState.values?.messages)
            ) {
              logInfo({
                event: "orchestrator_completed_turn_replayed",
                conversationId,
                threadId,
                branchId,
              });
              closeStream();
              return;
            }
            stream.enqueue(
              encodeError(
                "This request was already completed. Please send a new message.",
              ),
            );
            closeStream();
            return;
          }

          const input = {
            messages: incrementalMessages,
            userId,
            conversationId,
            connectedServices: connectedToolkits,
          };

          const config = {
            configurable: { thread_id: threadId },
            signal: workSignal,
          };

          const eventStream = await graph.streamEvents(input, {
            ...config,
            ...GRAPH_RUN_LIMITS,
            version: "v2",
          });

          for await (const event of eventStream) {
            if (workSignal.aborted) break;
            mapper.map(stream, event as Record<string, unknown>);
          }

          if (workSignal.aborted) {
            await handleWorkAbort();
            return;
          }

          const finalState = await abortAware(
            graph.getState({
              configurable: { thread_id: threadId },
            }),
            workSignal,
          );
          const pendingInterrupts = (finalState.tasks ?? []).flatMap(
            (task) => task.interrupts ?? [],
          );

          if (pendingInterrupts.length > 0) {
            const firstValue = pendingInterrupts[0].value;
            const interruptData = {
              ...(typeof firstValue === "object" && firstValue !== null
                ? (firstValue as Record<string, unknown>)
                : {}),
              threadId,
            };
            handleGraphInterrupt(stream, interruptData);
            closeStream();
            return;
          }

          mapper.ensureTerminalAnswer(stream, finalState.values?.messages);
          closeStream();
        } catch (error) {
          if (!isGraphRecursionError(error) || workSignal.aborted) throw error;
          await closeTurnAtStepLimit(
            graph,
            createFinalAnswerNode(apiKey, model, { reasoningEffort, ephemeralContext }),
            threadId,
            stream,
            mapper,
            workSignal,
            { conversationId, branchId },
          );
          closeStream();
        } finally {
          await threadLock.release();
        }
      } catch (error) {
        if (isGraphInterrupt(error)) {
          const interruptValue = (error as { value?: unknown }).value;
          const interruptData =
            typeof interruptValue === "object" && interruptValue !== null
              ? { ...(interruptValue as Record<string, unknown>), threadId }
              : { threadId };
          handleGraphInterrupt(stream, interruptData);
          closeStream();
          return;
        }

        if (isDeadlineExceeded()) {
          timeoutStream();
          return;
        }

        if (
          workSignal.aborted ||
          (error instanceof Error && error.name === "AbortError")
        ) {
          logger.warn("[Orchestrator] Stream aborted by user");
          abortStream();
          return;
        } else {
          logger.error("[Orchestrator] Stream error:", error);
        }
        failStream(error);
      } finally {
        clearTimeout(deadlineTimer);
      }
    },
  };
}
