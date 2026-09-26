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
  const pageSize = 250;
  const maxHistoricalMessages = 5000;
  const history: Array<{ id: string; attachments: typeof current.attachments }> = [];
  let cursor: string | undefined;
  let complete = false;
  const seen = new Set<string>();
  while (history.length < maxHistoricalMessages) {
    const page = await prisma.message.findMany({
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
      take: Math.min(pageSize, maxHistoricalMessages - history.length) + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
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
    const accepted = page.slice(0, Math.min(pageSize, maxHistoricalMessages - history.length));
    if (page.length && !accepted.length) break;
    if (accepted.some((message) => seen.has(message.id))) break;
    accepted.forEach((message) => seen.add(message.id));
    history.push(...accepted);
    if (page.length <= accepted.length) {
      complete = true;
      break;
    }
    cursor = accepted.at(-1)?.id;
    if (!cursor) break;
  }
  const resources = [current, ...history.filter((message) => message.id !== current.id)]
    .flatMap((message) => message.attachments.map((attachment) => ({
      ...attachment,
      messageId: message.id,
      current: message.id === current.id,
    })));
  return { foundCurrent: true, complete, resources };
}
