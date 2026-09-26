import type { Message } from "@/lib/schemas/chat";
import { prisma } from "@/lib/prisma";
import type { ResourceCandidate } from "./resourceSelection";

export async function getConversationResourceCatalog(options: {
  conversationId: string;
  userId: string;
  currentMessageId: string;
  visibleMessages: Message[];
  branchId?: string;
}): Promise<{ foundCurrent: boolean; complete: boolean; resources: ResourceCandidate[] }> {
  const current = await prisma.message.findFirst({
    where: {
      id: options.currentMessageId,
      conversationId: options.conversationId,
      conversation: { userId: options.userId },
      role: "USER",
      isDeleted: false,
    },
    select: {
      id: true,
      createdAt: true,
      parentMessageId: true,
      attachments: {
        select: {
          id: true,
          fileName: true,
          fileUrl: true,
          fileType: true,
          fileSize: true,
          kind: true,
        },
      },
    },
  });
  if (!current) return { foundCurrent: false, complete: true, resources: [] };

  // Ordinary message rows do not carry a durable branch ID. Client-provided
  // visible IDs are not proof that a historical resource belongs to this branch.
  // Fail closed on historical recall until branch membership is persisted.
  const branchScoped = Boolean(options.branchId || current.parentMessageId !== null);
  if (branchScoped) {
    return {
      foundCurrent: true,
      complete: true,
      resources: current.attachments.map((attachment) => ({
        ...attachment, messageId: current.id, current: true,
      })),
    };
  }
  const history = await prisma.message.findMany({
    where: {
      conversationId: options.conversationId,
      conversation: { userId: options.userId },
      role: "USER",
      isDeleted: false,
      OR: [
        { createdAt: { lt: current.createdAt } },
        { createdAt: current.createdAt, id: { lt: current.id } },
      ],
      attachments: { some: {} },
      parentMessageId: null,
    },
    // A hard ceiling prevents a large conversation from exhausting the request.
    // Overflow is reported as incomplete, never silently treated as an exhaustive search.
    take: 501,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      attachments: {
        select: {
          id: true,
          fileName: true,
          fileUrl: true,
          fileType: true,
          fileSize: true,
          kind: true,
        },
      },
    },
  });
  const resources = [
    current,
    ...history.slice(0, 500).filter((message) => message.id !== current.id),
  ].flatMap((message) =>
    message.attachments.map((attachment) => ({
      ...attachment,
      messageId: message.id,
      current: message.id === current.id,
    })),
  );
  return { foundCurrent: true, complete: history.length <= 500, resources };
}
