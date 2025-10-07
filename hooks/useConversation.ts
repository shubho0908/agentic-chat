"use client";

import { useQuery } from "@tanstack/react-query";
import { ERROR_CODES } from "@/constants/errors";

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
  try {
    const response = await fetch(`/api/conversations/${conversationId}`);
    
    if (!response) {
      throw new Error(ERROR_CODES.CONVERSATION_NOT_FOUND);
    }
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(ERROR_CODES.CONVERSATION_NOT_FOUND);
      }
      if (response.status === 401 || response.status === 403) {
        throw new Error(ERROR_CODES.UNAUTHORIZED);
      }
      throw new Error(ERROR_CODES.CONVERSATION_NOT_FOUND);
    }
    
    const data = await response.json();
    if (!data) {
      throw new Error(ERROR_CODES.CONVERSATION_NOT_FOUND);
    }
    
    return data;
  } catch (error) {
    if (error instanceof Error && (
      error.message === ERROR_CODES.CONVERSATION_NOT_FOUND || 
      error.message === ERROR_CODES.UNAUTHORIZED
    )) {
      throw error;
    }
    throw new Error(ERROR_CODES.CONVERSATION_NOT_FOUND);
  }
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
