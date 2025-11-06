"use client";

import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";
import { HOOK_ERROR_MESSAGES, TOAST_ERROR_MESSAGES } from "@/constants/errors";
import { TOAST_SUCCESS_MESSAGES } from "@/constants/toasts";

interface Conversation {
  id: string;
  title: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ConversationsResponse {
  items: Conversation[];
  nextCursor?: string;
}

async function fetchConversations({ cursor }: { cursor?: string }): Promise<ConversationsResponse> {
  const url = new URL("/api/conversations", window.location.origin);
  url.searchParams.set("limit", "20");
  if (cursor) {
    url.searchParams.set("cursor", cursor);
  }
  
  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(HOOK_ERROR_MESSAGES.FAILED_FETCH_CONVERSATIONS);
  }
  return response.json();
}

async function createConversation(): Promise<Conversation> {
  const response = await fetch("/api/conversations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title: "New Chat" }),
  });
  if (!response.ok) {
    throw new Error(HOOK_ERROR_MESSAGES.FAILED_CREATE_CONVERSATION);
  }
  return response.json();
}

async function deleteConversation(id: string): Promise<void> {
  const response = await fetch(`/api/conversations/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(HOOK_ERROR_MESSAGES.FAILED_DELETE_CONVERSATION);
  }
}

async function bulkDeleteConversations(ids: string[]): Promise<{ deleted: number; failed: string[] }> {
  const response = await fetch("/api/conversations/bulk-delete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ids }),
  });
  if (!response.ok) {
    throw new Error(HOOK_ERROR_MESSAGES.FAILED_DELETE_CONVERSATIONS);
  }
  return response.json();
}

async function renameConversation(id: string, title: string): Promise<Conversation> {
  const response = await fetch(`/api/conversations/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title }),
  });
  if (!response.ok) {
    throw new Error(HOOK_ERROR_MESSAGES.FAILED_UPDATE_CONVERSATION);
  }
  return response.json();
}

async function toggleConversationSharing(id: string, isPublic: boolean): Promise<Conversation> {
  const response = await fetch(`/api/conversations/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ isPublic }),
  });
  if (!response.ok) {
    throw new Error(HOOK_ERROR_MESSAGES.FAILED_UPDATE_CONVERSATION);
  }
  return response.json();
}

export function useConversations() {
  const queryClient = useQueryClient();

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
  } = useInfiniteQuery({
    queryKey: ["conversations"],
    queryFn: ({ pageParam }) => fetchConversations({ cursor: pageParam }),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined as string | undefined,
    staleTime: 30000,
  });

  const conversations = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data]
  );

  const createMutation = useMutation({
    mutationFn: createConversation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast.success(TOAST_SUCCESS_MESSAGES.CONVERSATION_CREATED);
    },
    onError: () => {
      toast.error(TOAST_ERROR_MESSAGES.CONVERSATION.FAILED_CREATE);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteConversation,
    onMutate: async (deletedId) => {
      await queryClient.cancelQueries({ queryKey: ["conversations"] });

      const previousData = queryClient.getQueryData(["conversations"]);

      queryClient.setQueryData<{
        pages: ConversationsResponse[];
        pageParams: (string | undefined)[];
      }>(["conversations"], (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            items: page.items.filter((conv) => conv.id !== deletedId),
          })),
        };
      });

      return { previousData };
    },
    onSuccess: () => {
      toast.success(TOAST_SUCCESS_MESSAGES.CONVERSATION_DELETED);
    },
    onError: (_error, _deletedId, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["conversations"], context.previousData);
      }
      toast.error(TOAST_ERROR_MESSAGES.CONVERSATION.FAILED_DELETE);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => renameConversation(id, title),
    onSuccess: (updatedConversation) => {
      queryClient.setQueryData<{
        pages: ConversationsResponse[];
        pageParams: (string | undefined)[];
      }>(["conversations"], (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            items: page.items.map((conv) =>
              conv.id === updatedConversation.id ? updatedConversation : conv
            ),
          })),
        };
      });
      toast.success(TOAST_SUCCESS_MESSAGES.CONVERSATION_RENAMED);
    },
    onError: () => {
      toast.error(TOAST_ERROR_MESSAGES.CONVERSATION.FAILED_RENAME);
    },
  });

  const toggleSharingMutation = useMutation({
    mutationFn: ({ id, isPublic }: { id: string; isPublic: boolean }) => toggleConversationSharing(id, isPublic),
    onSuccess: (updatedConversation) => {
      queryClient.setQueryData<{
        pages: ConversationsResponse[];
        pageParams: (string | undefined)[];
      }>(["conversations"], (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            items: page.items.map((conv) =>
              conv.id === updatedConversation.id ? updatedConversation : conv
            ),
          })),
        };
      });
      if (updatedConversation.isPublic) {
        toast.success(TOAST_SUCCESS_MESSAGES.CONVERSATION_SHARED);
      } else {
        toast.success(TOAST_SUCCESS_MESSAGES.CONVERSATION_UNSHARED);
      }
    },
    onError: () => {
      toast.error(TOAST_ERROR_MESSAGES.CONVERSATION.FAILED_SHARE);
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: bulkDeleteConversations,
    onMutate: async (deletedIds) => {
      await queryClient.cancelQueries({ queryKey: ["conversations"] });

      const previousData = queryClient.getQueryData(["conversations"]);

      queryClient.setQueryData<{
        pages: ConversationsResponse[];
        pageParams: (string | undefined)[];
      }>(["conversations"], (old) => {
        if (!old) return old;
        const deletedIdSet = new Set(deletedIds);
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            items: page.items.filter((conv) => !deletedIdSet.has(conv.id)),
          })),
        };
      });

      return { previousData };
    },
    onSuccess: (result) => {
      const count = result.deleted;
      toast.success(TOAST_SUCCESS_MESSAGES.CONVERSATIONS_DELETED(count));

      if (result.failed.length > 0) {
        toast.error(`${result.failed.length} conversation${result.failed.length === 1 ? '' : 's'} could not be deleted`);
      }
    },
    onError: (_error, _deletedIds, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["conversations"], context.previousData);
      }
      toast.error(TOAST_ERROR_MESSAGES.CONVERSATION.FAILED_DELETE_MULTIPLE);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  return {
    conversations,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    createConversation: createMutation.mutate,
    deleteConversation: deleteMutation.mutate,
    bulkDeleteConversations: bulkDeleteMutation.mutate,
    renameConversation: renameMutation.mutate,
    toggleSharing: toggleSharingMutation.mutate,
    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isBulkDeleting: bulkDeleteMutation.isPending,
    isRenaming: renameMutation.isPending,
    isToggling: toggleSharingMutation.isPending,
  };
}
