interface SharedVersionInput {
  id: string;
  role: string;
  content: string;
  createdAt: Date;
  siblingIndex: number;
}

interface SharedMessageInput extends SharedVersionInput {
  versions?: SharedVersionInput[];
}

interface SharedConversationInput {
  id: string;
  title: string | null;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
  messages: SharedMessageInput[];
}

export function redactSharedConversation(conversation: SharedConversationInput) {
  return {
    id: conversation.id,
    title: conversation.title,
    isPublic: conversation.isPublic,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messages: conversation.messages.map((msg) => ({
      id: msg.id,
      role: msg.role.toLowerCase(),
      content: msg.content,
      metadata: undefined,
      createdAt: msg.createdAt,
      siblingIndex: msg.siblingIndex,
      attachments: [],
      versions: (msg.versions || []).map((version) => ({
        id: version.id,
        role: version.role.toLowerCase(),
        content: version.content,
        metadata: undefined,
        createdAt: version.createdAt,
        siblingIndex: version.siblingIndex,
        attachments: [],
      })),
    })),
  };
}
