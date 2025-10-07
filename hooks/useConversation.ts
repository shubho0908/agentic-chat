"use client";

import { useQuery } from "@tanstack/react-query";
import { ERROR_CODES, HOOK_ERROR_MESSAGES } from "@/constants/errors";

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface ConversationDetails {
  id: string;
  title: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationData {
  conversation: ConversationDetails;
  messages: {
    items: ConversationMessage[];
    nextCursor?: string;
  };
}

async function fetchConversation(conversationId: string): Promise<ConversationData> {
  const response = await fetch(`/api/conversations/${conversationId}`);
  
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(ERROR_CODES.CONVERSATION_NOT_FOUND);
    }
    if (response.status === 401) {
      throw new Error(ERROR_CODES.UNAUTHORIZED);
    }
    throw new Error(HOOK_ERROR_MESSAGES.FAILED_FETCH_CONVERSATION);
  }
  
  return response.json();
}

export function useConversation(conversationId: string | null) {
  return useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: () => fetchConversation(conversationId!),
    enabled: !!conversationId,
    retry: (failureCount, error) => {
      if (error.message === ERROR_CODES.CONVERSATION_NOT_FOUND || error.message === ERROR_CODES.UNAUTHORIZED) {
        return false;
      }
      return failureCount < 2;
    },
  });
}
