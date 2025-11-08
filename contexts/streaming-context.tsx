"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface StreamingState {
  isStreaming: boolean;
  conversationId: string | null;
  abortController: AbortController | null;
}

interface StreamingContextValue {
  isStreaming: boolean;
  streamingConversationId: string | null;
  startStreaming: (conversationId: string | null, abortController: AbortController) => void;
  stopStreaming: () => void;
  isStreamingInConversation: (conversationId: string) => boolean;
}

const StreamingContext = createContext<StreamingContextValue | undefined>(undefined);

export function StreamingProvider({ children }: { children: ReactNode }) {
  const [streamingState, setStreamingState] = useState<StreamingState>({
    isStreaming: false,
    conversationId: null,
    abortController: null,
  });

  const startStreaming = useCallback((conversationId: string | null, abortController: AbortController) => {
    setStreamingState({
      isStreaming: true,
      conversationId,
      abortController,
    });
  }, []);

  const stopStreaming = useCallback(() => {
    setStreamingState((prev) => {
      if (prev.abortController) {
        prev.abortController.abort();
      }
      return {
        isStreaming: false,
        conversationId: null,
        abortController: null,
      };
    });
  }, []);

  const isStreamingInConversation = useCallback(
    (conversationId: string) => {
      return streamingState.isStreaming && streamingState.conversationId === conversationId;
    },
    [streamingState]
  );

  return (
    <StreamingContext.Provider
      value={{
        isStreaming: streamingState.isStreaming,
        streamingConversationId: streamingState.conversationId,
        startStreaming,
        stopStreaming,
        isStreamingInConversation,
      }}
    >
      {children}
    </StreamingContext.Provider>
  );
}

export function useStreaming() {
  const context = useContext(StreamingContext);
  if (context === undefined) {
    throw new Error("useStreaming must be used within a StreamingProvider");
  }
  return context;
}
