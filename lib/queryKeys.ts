export const queryKeys = {
  apiKey: ["api-key"] as const,
  conversations: ["conversations"] as const,
  conversation: (conversationId: string | null | undefined) => ["conversation", conversationId] as const,
  linkPreview: (url: string) => ["link-preview", url] as const,
  semanticCache: (query: string) => ["agentic-chat-cache", query] as const,
  sharedConversation: (id: string) => ["shared-conversation", id] as const,
  textFileContent: (fileUrl: string) => ["textFileContent", fileUrl] as const,
};
