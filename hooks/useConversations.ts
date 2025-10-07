"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { HOOK_ERROR_MESSAGES, TOAST_ERROR_MESSAGES, TOAST_SUCCESS_MESSAGES } from "@/constants/errors";

export interface Conversation {
  id: string;
  title: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

async function fetchConversations(): Promise<Conversation[]> {
  const response = await fetch("/api/conversations");
  if (!response.ok) {
    throw new Error(HOOK_ERROR_MESSAGES.FAILED_FETCH_CONVERSATIONS);
  }
  const data = await response.json();
  return data.items || [];
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

  const { data: conversations = [], isLoading, error } = useQuery({
    queryKey: ["conversations"],
    queryFn: fetchConversations,
  });

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

      const previousConversations = queryClient.getQueryData<Conversation[]>(["conversations"]);

      queryClient.setQueryData<Conversation[]>(["conversations"], (old) => 
        old ? old.filter((conv) => conv.id !== deletedId) : []
      );

      return { previousConversations };
    },
    onSuccess: () => {
      toast.success(TOAST_SUCCESS_MESSAGES.CONVERSATION_DELETED);
    },
    onError: (_error, _deletedId, context) => {
      if (context?.previousConversations) {
        queryClient.setQueryData(["conversations"], context.previousConversations);
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
      queryClient.setQueryData<Conversation[]>(["conversations"], (old) => 
        old ? old.map((conv) => conv.id === updatedConversation.id ? updatedConversation : conv) : []
      );
      toast.success(TOAST_SUCCESS_MESSAGES.CONVERSATION_RENAMED);
    },
    onError: () => {
      toast.error(TOAST_ERROR_MESSAGES.CONVERSATION.FAILED_RENAME);
    },
  });

  const toggleSharingMutation = useMutation({
    mutationFn: ({ id, isPublic }: { id: string; isPublic: boolean }) => toggleConversationSharing(id, isPublic),
    onSuccess: (updatedConversation) => {
      queryClient.setQueryData<Conversation[]>(["conversations"], (old) => 
        old ? old.map((conv) => conv.id === updatedConversation.id ? updatedConversation : conv) : []
      );
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

  return {
    conversations,
    isLoading,
    error,
    createConversation: createMutation.mutate,
    deleteConversation: deleteMutation.mutate,
    renameConversation: renameMutation.mutate,
    toggleSharing: toggleSharingMutation.mutate,
    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isRenaming: renameMutation.isPending,
    isToggling: toggleSharingMutation.isPending,
  };
}
