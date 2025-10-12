import { type Message, type Attachment, type ToolActivity } from "@/lib/schemas/chat";
import { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { buildMultimodalContent, extractTextFromContent } from "@/lib/content-utils";
import { getModel } from "@/lib/storage";
import { DEFAULT_ASSISTANT_PROMPT } from "@/lib/prompts";
import { TOAST_ERROR_MESSAGES, HOOK_ERROR_MESSAGES } from "@/constants/errors";
import { saveUserMessage, storeMemory } from "./message-api";
import { streamChatCompletion } from "./streaming-api";
import { performCacheCheck } from "./cache-handler";
import { handleConversationSaving, buildMessagesForAPI, generateTitle } from "./conversation-manager";
import { type ConversationResult, type MemoryStatus, ToolStatus } from "./types";

interface SendMessageContext {
  messages: Message[];
  conversationId: string | null;
  abortSignal: AbortSignal;
  queryClient: QueryClient;
  onMessagesUpdate: (updater: (prev: Message[]) => Message[]) => void;
  onConversationIdUpdate: (id: string) => void;
  onNavigate: (path: string) => void;
  saveToCacheMutate: (data: { query: string; response: string }) => void;
  onMemoryStatusUpdate?: (status: MemoryStatus) => void;
}

export async function handleSendMessage(
  content: string,
  attachments: Attachment[] | undefined,
  context: SendMessageContext,
  session?: { user: { id: string } },
  activeTool?: string | null
): Promise<{ success: boolean; error?: string }> {
  const {
    messages,
    conversationId,
    abortSignal,
    queryClient,
    onMessagesUpdate,
    onConversationIdUpdate,
    onNavigate,
    saveToCacheMutate,
    onMemoryStatusUpdate,
  } = context;
  
  let shouldNavigate = false;
  let navigationPath = '';
  
  const model = getModel();
  if (!model) {
    toast.error(TOAST_ERROR_MESSAGES.MODEL.NOT_SELECTED);
    return { success: false, error: "No model selected" };
  }

  const messageContent = buildMultimodalContent(content.trim(), attachments);

  const userMessage: Message = {
    role: "user",
    content: messageContent,
    id: `user-${Date.now()}`,
    timestamp: Date.now(),
    attachments,
  };

  const assistantMessageId = `assistant-${Date.now()}`;
  let assistantContent = "";
  let savedUserMessageId = userMessage.id;
  const toolActivities: ToolActivity[] = [];
  let currentMemoryStatus: MemoryStatus | undefined;

  onMessagesUpdate((prev) => [
    ...prev,
    userMessage,
    {
      role: "assistant",
      content: "",
      id: assistantMessageId,
      timestamp: Date.now(),
      model: model,
      toolActivities: [],
    },
  ]);

  try {
    let currentConversationId = conversationId;
    const isNewConversation = !currentConversationId;
    
    if (isNewConversation) {
      await handleConversationSaving(
        true,
        null,
        messageContent,
        "",
        userMessage.timestamp ?? Date.now(),
        queryClient,
        (data: ConversationResult) => {
          currentConversationId = data.conversationId;
          savedUserMessageId = data.userMessageId;
          onConversationIdUpdate(data.conversationId);
          onMessagesUpdate((prev) =>
            prev.map((msg) => {
              if (msg.id === userMessage.id) {
                return { ...msg, id: data.userMessageId };
              }
              return msg;
            })
          );
          shouldNavigate = true;
          navigationPath = `/c/${data.conversationId}`;
        },
        attachments,
        true,
        abortSignal
      );
      
      if (!currentConversationId) {
        throw new Error("Failed to create conversation");
      }
    } else if (currentConversationId) {
      const savedMsgId = await saveUserMessage(currentConversationId, messageContent, attachments, abortSignal);
      if (savedMsgId) {
        savedUserMessageId = savedMsgId;
        onMessagesUpdate((prev) =>
          prev.map((msg) => {
            if (msg.id === userMessage.id) {
              return { ...msg, id: savedMsgId };
            }
            return msg;
          })
        );
      }
    }

    const { cacheQuery, cacheData } = await performCacheCheck({
      messages,
      content: messageContent,
      attachments,
      abortSignal,
      activeTool,
    });

    if (cacheData.cached && cacheData.response && typeof cacheData.response === 'string') {
      assistantContent = cacheData.response;
      onMessagesUpdate((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? { ...msg, content: assistantContent }
            : msg
        )
      );

      if (currentConversationId) {
        await handleConversationSaving(
          false,
          currentConversationId,
          messageContent,
          assistantContent,
          userMessage.timestamp ?? Date.now(),
          queryClient,
          (data: ConversationResult) => {
            onMessagesUpdate((prev) =>
              prev.map((msg) => {
                if (msg.id === assistantMessageId) {
                  return { ...msg, id: data.assistantMessageId };
                }
                return msg;
              })
            );
          }
        );
      }

      return { success: true };
    }

    const messagesForAPI = buildMessagesForAPI(messages, messageContent, DEFAULT_ASSISTANT_PROMPT);

    const responseContent = await streamChatCompletion({
      messages: messagesForAPI,
      model,
      signal: abortSignal,
      onChunk: (fullContent) => {
        console.log('[Message Sender] onChunk called, content length:', fullContent.length);
        onMessagesUpdate((prev) => {
          const updated = prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, content: fullContent }
              : msg
          );
          const assistantMsg = updated.find(m => m.id === assistantMessageId);
          const contentPreview = typeof assistantMsg?.content === 'string' 
            ? assistantMsg.content.substring(0, 50) 
            : '[multimodal content]';
          console.log('[Message Sender] Messages updated, assistant message:', contentPreview);
          return updated;
        });
      },
      conversationId: currentConversationId,
      onMemoryStatus: (status) => {
        currentMemoryStatus = status;
        onMemoryStatusUpdate?.(status);
      },
      onToolCall: (toolCall) => {
        console.log('[Tool Call]', toolCall.toolName, toolCall.args);
        
        const activity: ToolActivity = {
          toolCallId: toolCall.toolCallId,
          toolName: toolCall.toolName,
          status: ToolStatus.Calling,
          args: toolCall.args,
          timestamp: Date.now(),
        };
        
        toolActivities.push(activity);
        
        onMessagesUpdate((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, toolActivities: [...toolActivities] }
              : msg
          )
        );
      },
      onToolResult: (toolResult) => {
        console.log('[Tool Result]', toolResult.toolName, toolResult.result.substring(0, 200));
        
        const activityIndex = toolActivities.findIndex(
          (a) => a.toolCallId === toolResult.toolCallId
        );
        
        if (activityIndex !== -1) {
          toolActivities[activityIndex] = {
            ...toolActivities[activityIndex],
            status: ToolStatus.Completed,
            result: toolResult.result,
            timestamp: Date.now(),
          };
          
          onMessagesUpdate((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, toolActivities: [...toolActivities] }
                : msg
            )
          );
        }
      },
      onToolProgress: (progress) => {
        console.log('[Tool Progress]', progress.toolName, progress.message);
        
        if (currentMemoryStatus && onMemoryStatusUpdate) {
          const updatedStatus: MemoryStatus = {
            ...currentMemoryStatus,
            toolProgress: {
              status: progress.status,
              message: progress.message,
              details: progress.details,
            },
          };
          currentMemoryStatus = updatedStatus;
          onMemoryStatusUpdate(updatedStatus);
        }
      },
      activeTool,
    });

    assistantContent = responseContent;

    if (assistantContent && !abortSignal.aborted) {
      if (cacheQuery) {
        saveToCacheMutate({
          query: cacheQuery,
          response: assistantContent,
        });
      }

      if (currentConversationId) {
        await handleConversationSaving(
          false,
          currentConversationId,
          messageContent,
          assistantContent,
          userMessage.timestamp ?? Date.now(),
          queryClient,
          (data: ConversationResult) => {
            onMessagesUpdate((prev) =>
              prev.map((msg) => {
                if (msg.id === assistantMessageId) {
                  return { ...msg, id: data.assistantMessageId };
                }
                return msg;
              })
            );
          }
        );
      }

      if (session?.user?.id) {
        const textContent = extractTextFromContent(messageContent);
        await storeMemory(textContent, assistantContent, currentConversationId);
      }
    }

    if (shouldNavigate && navigationPath && currentConversationId) {
      const textContent = extractTextFromContent(messageContent);
      queryClient.setQueryData(["conversation", currentConversationId], {
        pages: [{
          conversation: {
            id: currentConversationId,
            title: generateTitle(messageContent),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isPublic: false,
          },
          messages: {
            items: [
              {
                id: assistantMessageId,
                role: "assistant" as const,
                content: assistantContent,
                createdAt: new Date().toISOString(),
              },
              {
                id: savedUserMessageId,
                role: "user" as const,
                content: textContent,
                createdAt: new Date(userMessage.timestamp ?? Date.now()).toISOString(),
                attachments: attachments || [],
              },
            ],
          },
        }],
        pageParams: [undefined],
      });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      onNavigate(navigationPath);
    }

    return { success: true };
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      onMessagesUpdate((prev) => prev.filter((msg) => msg.id !== assistantMessageId));
      return { success: false, error: "aborted" };
    }
    
    const errorMessage = err instanceof Error ? err.message : HOOK_ERROR_MESSAGES.UNKNOWN_ERROR_OCCURRED;
    toast.error(TOAST_ERROR_MESSAGES.CHAT.FAILED_SEND, {
      description: errorMessage,
    });
    
    onMessagesUpdate((prev) => prev.filter((msg) => msg.id !== assistantMessageId));
    return { success: false, error: errorMessage };
  }
}
