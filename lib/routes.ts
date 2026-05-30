function pathSegment(value: string): string {
  return encodeURIComponent(value);
}

export const appRoutePrefixes = {
  api: "/api/",
  conversation: "/c/",
  settings: "/settings/",
  share: "/share/",
} as const;

export const appRoutes = {
  conversation: (conversationId: string) => `${appRoutePrefixes.conversation}${pathSegment(conversationId)}`,
  home: "/",
  notFound: "/not-found",
  privacy: "/privacy",
  share: (conversationId: string) => `${appRoutePrefixes.share}${pathSegment(conversationId)}`,
  terms: "/terms",
} as const;

export const apiRoutes = {
  upload: "/api/upload",
  chatCompletions: "/api/chat/completions",
  conversations: "/api/conversations",
  conversation: (conversationId: string) => `/api/conversations/${pathSegment(conversationId)}`,
  conversationExport: (conversationId: string) => `/api/conversations/${pathSegment(conversationId)}/export`,
  conversationMessages: (conversationId: string) => `/api/conversations/${pathSegment(conversationId)}/messages`,
  conversationMessage: (conversationId: string, messageId: string) =>
    `/api/conversations/${pathSegment(conversationId)}/messages/${pathSegment(messageId)}`,
  conversationMessageVersions: (conversationId: string, messageId: string) =>
    `/api/conversations/${pathSegment(conversationId)}/messages/${pathSegment(messageId)}/versions`,
  conversationMessagesDeleteAfter: (conversationId: string) =>
    `/api/conversations/${pathSegment(conversationId)}/messages/delete-after`,
  conversationsBulkDelete: "/api/conversations/bulk-delete",
  documentsProcess: "/api/documents/process",
  documentsProcessBatch: "/api/documents/process-batch",
  linkPreview: (url: string) => `/api/link-preview?url=${encodeURIComponent(url)}`,
  og: "/api/og",
  ogHome: "/api/og/home",
  settingsApiKey: "/api/settings/api-key",
  share: (conversationId: string) => `/api/share/${pathSegment(conversationId)}`,
} as const;

export function getConversationIdFromPathname(pathname: string | null | undefined): string | null {
  if (!pathname?.startsWith(appRoutePrefixes.conversation)) {
    return null;
  }

  const [conversationId] = pathname.slice(appRoutePrefixes.conversation.length).split("/");
  return conversationId ? decodeURIComponent(conversationId) : null;
}

export function isSharePathname(pathname: string | null | undefined): boolean {
  return pathname?.startsWith(appRoutePrefixes.share) ?? false;
}
