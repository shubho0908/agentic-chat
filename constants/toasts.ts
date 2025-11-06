export const TOAST_SUCCESS_MESSAGES = {
  SETTINGS_SAVED: "Settings saved successfully",
  SETTINGS_CLEARED: "Settings cleared",
  CHAT_CLEARED: "Chat cleared",
  CONVERSATION_CREATED: "New conversation created",
  CONVERSATION_DELETED: "Conversation deleted",
  CONVERSATIONS_DELETED: (count: number) => `${count} conversation${count === 1 ? '' : 's'} deleted`,
  CONVERSATION_RENAMED: "Conversation renamed",
  CONVERSATION_SHARED: "Conversation is now public",
  CONVERSATION_UNSHARED: "Conversation is now private",
  LOGGED_OUT: "Logged out successfully",
  GENERATION_STOPPED: "Generation stopped",
} as const;
