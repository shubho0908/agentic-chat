import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import type { ReasoningEffortLevel } from "@/constants/openai-models";
import type { BaseMessage } from "@langchain/core/messages";
import type { Message, MessageContentPart } from "@/lib/schemas/chat";
import type { MemoryStatus } from "@/types/chat";
import { routeContext } from "@/lib/contextRouter";
import { injectContextToMessages } from "@/lib/chat/messageHelpers";
import { getConnectedToolkits } from "@/lib/tools/composio/auth";
import { createAgentGraph } from "./graph";
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
import { RECURSION_LIMIT, MIN_CACHEABLE_QUERY_LENGTH } from "./constants";
import { logger } from "@/lib/logger";
import { toUserFriendlyError } from "@/lib/errorMessages";
import { generateEmbedding, searchSemanticCacheEntry } from "@/lib/rag/storage/cache";
import { SIMILARITY_THRESHOLD, CACHE_TTL_SECONDS } from "@/lib/rag/storage/pgvectorClient";
import { gateCacheHit } from "@/lib/jev/cacheGate";
import { extractTextFromMessage } from "@/lib/chat/messageContent";

interface OrchestratorStreamOptions {
  messages: Message[];
  model: string;
  apiKey: string;
  userId: string;
  conversationId?: string;
  documentAttachmentIds?: string[];
  memoryEnabled?: boolean;
  reasoningEffort?: ReasoningEffortLevel | null;
  abortSignal?: AbortSignal;
}

function toLangChainContent(content: Message["content"]) {
  if (typeof content === "string") {
    return content;
  }

  return content.map((part: MessageContentPart) => {
    if (part.type === "text") {
      return { type: "text", text: part.text };
    }

    return {
      type: "image_url",
      image_url: { url: part.image_url.url },
    };
  });
}

function convertToLangChainMessages(messages: Message[]): BaseMessage[] {
  return messages.map((msg) => {
    const content = toLangChainContent(msg.content);
    const textOnlyContent = typeof content === "string"
      ? content
      : content.map((p) => (p.type === "text" ? p.text : "")).join(" ");

    switch (msg.role) {
      case "assistant":
        return new AIMessage(textOnlyContent);
      case "system":
        return new SystemMessage(textOnlyContent);
      default:
        return new HumanMessage({ content });
    }
  });
}

function deriveThreadId(conversationId: string | undefined, userId: string): string {
  if (conversationId) {
    return `conv-${conversationId}`;
  }
  return `user-${userId}-ephemeral`;
}

export function createOrchestratorStreamHandler(options: OrchestratorStreamOptions) {
  const {
    messages,
    model,
    apiKey,
    userId,
    conversationId,
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
      });
      const threadId = deriveThreadId(conversationId, userId);
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

        const isRecursionError =
          (error instanceof Error &&
            (("lc_error_code" in error &&
              (error as { lc_error_code?: string }).lc_error_code ===
                "GRAPH_RECURSION_LIMIT") ||
              error.name === "GraphRecursionError" ||
              /recursion limit/i.test(error.message ?? ""))) ||
          false;

        const friendly = isRecursionError
          ? `I couldn't complete this request in ${RECURSION_LIMIT} reasoning steps. Try breaking it into smaller asks or rephrasing.`
          : toUserFriendlyError(error);

        stream.enqueue(encodeError(friendly));
        closeStream();
      };

      const abortStream = () => {
        stream.abort();
      };

      try {
        if (abortSignal?.aborted) {
          abortStream();
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
            { apiKey, signal: abortSignal, currentDocumentAttachmentIds: documentAttachmentIds }
          );
          memoryStatusInfo = { ...memoryStatusInfo, ...contextResult.metadata };
          if (contextResult.context) {
            enhancedMessages = injectContextToMessages(enhancedMessages, contextResult.context, model);
          }
        } catch (error) {
          if (abortSignal?.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
          logger.error("[Orchestrator] Context routing failed:", error);
        }

        if (abortSignal?.aborted) {
          abortStream();
          return;
        }

        stream.enqueue(encodeMemoryStatus(memoryStatusInfo));

        const budgetCheck = checkTokenBudget(enhancedMessages, model);
        memoryStatusInfo.tokenUsage = budgetCheck.tokenUsage;
        stream.enqueue(encodeMemoryStatus(memoryStatusInfo));

        if (!budgetCheck.ok) {
          stream.enqueue(encodeError(budgetCheck.errorMessage ?? "Token budget exceeded."));
          closeStream();
          return;
        }

        const connectedToolkits = await getConnectedToolkits(userId);

        const queryText = extractTextFromMessage(lastUserMessage);
        const bypassSemanticCache = shouldBypassSemanticCacheForMessageContext(
          messages,
          queryText,
          connectedToolkits,
        );
        if (queryText && !bypassSemanticCache && queryText.trim().length >= MIN_CACHEABLE_QUERY_LENGTH) {
          try {
            const embedding = await generateEmbedding(queryText, userId, abortSignal);
            const entry = await searchSemanticCacheEntry(embedding, userId, conversationId, model, reasoningEffort ?? null);
            if (entry) {
              // Jev cache gate (structural signals only): shadow logs and
              // serves, active vetoes confident no-serve verdicts and refuses
              // hits the gate could not evaluate.
              const round4 = (value: number) => Math.round(value * 10_000) / 10_000;
              const gate = await gateCacheHit(
                {
                  similarityScore: round4(entry.score),
                  similarityThreshold: SIMILARITY_THRESHOLD,
                  scoreMargin: round4(entry.score - SIMILARITY_THRESHOLD),
                  cacheAgeSeconds: Math.max(
                    0,
                    Math.round((Date.now() - entry.createdAt.getTime()) / 1000),
                  ),
                  cacheTtlSeconds: CACHE_TTL_SECONDS,
                  entryScopedToConversation: entry.conversationId !== null,
                  queryLengthChars: queryText.length,
                  answerLengthChars: entry.answer.length,
                },
                conversationId,
              );
              if (gate.serve) {
                logger.log("[Orchestrator] Semantic cache HIT");
                stream.enqueue(encodeChatChunk(entry.answer));
                closeStream();
                return;
              }
              logger.log("[Orchestrator] Semantic cache HIT vetoed by Jev gate");
            }
          } catch (cacheErr) {
            if (abortSignal?.aborted || (cacheErr instanceof Error && cacheErr.name === "AbortError")) throw cacheErr;
            logger.warn("[Orchestrator] Cache check failed, proceeding:", cacheErr);
          }
        }

        const graph = await createAgentGraph(userId, apiKey, model, {
          reasoningEffort,
          connectedToolkits,
        });

        const langChainMessages = convertToLangChainMessages(enhancedMessages);

        const input = {
          messages: langChainMessages,
          userId,
          conversationId,
          connectedServices: connectedToolkits,
        };

        const config = {
          configurable: { thread_id: threadId },
          recursionLimit: RECURSION_LIMIT,
          signal: abortSignal,
        };

        const eventStream = await graph.streamEvents(input, {
          ...config,
          version: "v2",
        });

        for await (const event of eventStream) {
          if (abortSignal?.aborted) break;
          mapper.map(stream, event as Record<string, unknown>);
        }

        if (abortSignal?.aborted) {
          abortStream();
          return;
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
          handleGraphInterrupt(stream, interruptData);
          closeStream();
          return;
        }

        closeStream();
      } catch (error) {
        if (isGraphInterrupt(error)) {
          const interruptValue = (error as { value?: unknown }).value;
          const interruptData = typeof interruptValue === "object" && interruptValue !== null
            ? { ...interruptValue as Record<string, unknown>, threadId }
            : { threadId };
          handleGraphInterrupt(stream, interruptData);
          closeStream();
          return;
        }

        if (abortSignal?.aborted || (error instanceof Error && error.name === "AbortError")) {
          logger.warn("[Orchestrator] Stream aborted by user");
          abortStream();
          return;
        } else {
          logger.error("[Orchestrator] Stream error:", error);
        }
        failStream(error);
      }
    },
  };
}
