"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { ERROR_CODES } from "@/constants/errors";
import { getModel } from "@/lib/storage";
import { orderConversationMessagesAsc } from "@/lib/conversationMessageOrder";
import { queryKeys } from "@/lib/queryKeys";
import { apiRoutes } from "@/lib/routes";
import type { Attachment } from "@/lib/schemas/chat";
import type { TokenUsage } from "@/types/chat";

interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  attachments?: Attachment[];
  siblingIndex?: number;
  versions?: ConversationMessage[];
  versionCount?: number;
}

interface ConversationDetails {
  id: string;
  title: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

interface MessagesPage {
  items: ConversationMessage[];
  nextCursor?: string;
}

interface ConversationData {
  conversation: ConversationDetails;
  messages: MessagesPage;
  tokenUsage?: TokenUsage;
}

const FIRST_MESSAGES_CURSOR: string | undefined = undefined;

async function fetchConversation(
  conversationId: string,
  cursor?: string
): Promise<ConversationData> {
  try {
    const model = getModel();
    const url = new URL(
      apiRoutes.conversation(conversationId),
      window.location.origin
    );
    url.searchParams.set("versions", "true");
    url.searchParams.set("limit", "30");
    if (model) {
      url.searchParams.set("model", model);
    }
    if (cursor) {
      url.searchParams.set("cursor", cursor);
    }

    const response = await fetch(url.toString());

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
    if (
      error instanceof Error &&
      (error.message === ERROR_CODES.CONVERSATION_NOT_FOUND ||
        error.message === ERROR_CODES.UNAUTHORIZED)
    ) {
      throw error;
    }
    throw new Error(ERROR_CODES.CONVERSATION_NOT_FOUND);
  }
}

export function useConversation(conversationId: string | null) {
  const query = useInfiniteQuery({
    queryKey: queryKeys.conversation(conversationId),
    queryFn: ({ pageParam }) =>
      fetchConversation(conversationId!, pageParam),
    getNextPageParam: (lastPage) => lastPage.messages.nextCursor,
    initialPageParam: FIRST_MESSAGES_CURSOR,
    enabled: !!conversationId,
    retry: (failureCount, error) => {
      if (
        error instanceof Error &&
        (error.message === ERROR_CODES.CONVERSATION_NOT_FOUND ||
          error.message === ERROR_CODES.UNAUTHORIZED)
      ) {
        return false;
      }
      return failureCount < 2;
    },
    staleTime: 60000,
  });

  const flattenedData = useMemo(() => {
    if (!query.data) return undefined;

    const firstPage = query.data.pages[0];
    const allMessages = orderConversationMessagesAsc(
      query.data.pages.flatMap((page) => page.messages.items)
    );

    return {
      conversation: firstPage.conversation,
      messages: {
        items: allMessages,
        nextCursor: query.data.pages[query.data.pages.length - 1]?.messages.nextCursor,
      },
      tokenUsage: firstPage.tokenUsage,
    };
  }, [query.data]);

  return {
    ...query,
    data: flattenedData,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
  };
}
