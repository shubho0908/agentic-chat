import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { Message, MessageContentPart } from "@/lib/schemas/chat";
import type { MemoryStatus } from "@/types/chat";
import { routeContext } from "@/lib/contextRouter";
import { injectContextToMessages } from "@/lib/chat/messageHelpers";
import { getConnectedToolkits } from "@/lib/tools/composio/auth";
import { createAgentGraph } from "./graph";
import { shouldBypassSemanticCacheForToolIntent } from "./tools";
import { createStreamEventMapper, handleGraphInterrupt } from "./streaming";
import {
  encodeMemoryStatus,
  encodeError,
  encodeDone,
  encodeChatChunk,
} from "@/lib/chat/streamingHelpers";
import { checkTokenBudget } from "@/lib/chat/tokenBudget";
import { isGraphInterrupt } from "@langchain/langgraph";
import { RECURSION_LIMIT, MIN_CACHEABLE_QUERY_LENGTH } from "./constants";
import { logger } from "@/lib/logger";
import { toUserFriendlyError } from "@/lib/errorMessages";
import { generateEmbedding, searchSemanticCache } from "@/lib/rag/storage/cache";
import { extractTextFromMessage } from "@/lib/chat/messageContent";

interface OrchestratorStreamOptions {
  messages: Message[];
  model: string;
  apiKey: string;
  userId: string;
  conversationId?: string;
  memoryEnabled?: boolean;
  thinkingEnabled?: boolean;
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

const ARTIFACT_TAG_PATTERN = /<artifact\b/i;

function conversationHasPriorArtifacts(messages: Message[]): boolean {
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    const text = extractTextFromMessage(message.content);
    if (text && ARTIFACT_TAG_PATTERN.test(text)) {
      return true;
    }
  }
  return false;
}

export function createOrchestratorStreamHandler(options: OrchestratorStreamOptions) {
  const {
    messages,
    model,
    apiKey,
    userId,
    conversationId,
    memoryEnabled = true,
    thinkingEnabled = false,
    abortSignal,
  } = options;

  return {
    async start(controller: ReadableStreamDefaultController) {
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
        try {
          mapper.flush(controller);
        } catch (flushError) {
          logger.warn("[Orchestrator] Failed to flush artifact parser before close:", flushError);
        }
        try {
          controller.enqueue(encodeDone());
        } catch (doneError) {
          logger.warn("[Orchestrator] Failed to enqueue done event:", doneError);
        }
        try {
          controller.close();
        } catch (closeError) {
          logger.warn("[Orchestrator] Failed to close stream controller:", closeError);
        }
      };

      const failStream = (error: unknown) => {
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

        try {
          controller.enqueue(encodeError(friendly));
        } finally {
          closeStream();
        }
      };

      const abortStream = () => {
        const abortError = new Error("Request aborted");
        abortError.name = "AbortError";
        failStream(abortError);
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
            { apiKey }
          );
          memoryStatusInfo = { ...memoryStatusInfo, ...contextResult.metadata };
          if (contextResult.context) {
            enhancedMessages = injectContextToMessages(enhancedMessages, contextResult.context, model);
          }
        } catch (error) {
          logger.error("[Orchestrator] Context routing failed:", error);
        }

        if (abortSignal?.aborted) {
          abortStream();
          return;
        }

        controller.enqueue(encodeMemoryStatus(memoryStatusInfo));

        const budgetCheck = checkTokenBudget(enhancedMessages, model);
        memoryStatusInfo.tokenUsage = budgetCheck.tokenUsage;
        controller.enqueue(encodeMemoryStatus(memoryStatusInfo));

        if (!budgetCheck.ok) {
          controller.enqueue(encodeError(budgetCheck.errorMessage ?? "Token budget exceeded."));
          closeStream();
          return;
        }

        const connectedToolkits = await getConnectedToolkits(userId);

        const queryText = extractTextFromMessage(lastUserMessage);
        const bypassSemanticCache =
          shouldBypassSemanticCacheForToolIntent(queryText, connectedToolkits) ||
          conversationHasPriorArtifacts(messages);
        if (queryText && !bypassSemanticCache && queryText.length >= MIN_CACHEABLE_QUERY_LENGTH) {
          try {
            const embedding = await generateEmbedding(queryText, userId);
            const cached = await searchSemanticCache(embedding, userId, conversationId);
            if (cached) {
              logger.log("[Orchestrator] Semantic cache HIT");
              controller.enqueue(encodeChatChunk(cached));
              closeStream();
              return;
            }
          } catch (cacheErr) {
            logger.warn("[Orchestrator] Cache check failed, proceeding:", cacheErr);
          }
        }

        const graph = await createAgentGraph(userId, apiKey, model, {
          thinkingEnabled,
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
          mapper.map(controller, event as Record<string, unknown>);
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
          handleGraphInterrupt(controller, interruptData);
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
          handleGraphInterrupt(controller, interruptData);
          closeStream();
          return;
        }

        if (abortSignal?.aborted || (error instanceof Error && error.name === "AbortError")) {
          logger.warn("[Orchestrator] Stream aborted by user");
        } else {
          logger.error("[Orchestrator] Stream error:", error);
        }
        failStream(error);
      }
    },
  };
}
