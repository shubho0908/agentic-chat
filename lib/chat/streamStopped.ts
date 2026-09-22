import { prisma } from "@/lib/prisma";
import {
  STREAM_STOPPED_BY_USER_MARKER,
  getStreamStoppedMarkerMessageId,
} from "./stopMarker";

export interface StreamStoppedMarkResult {
  marked: boolean;
  messageId?: string;
  reason?: "no-messages" | "turn-already-finalized";
}

interface TransactionLike {
  $executeRaw: (
    query: TemplateStringsArray,
    ...values: string[]
  ) => Promise<unknown>;
  message: {
    findFirst: (args: {
      where: { conversationId: string; isDeleted: boolean; parentMessageId: null };
      orderBy: { createdAt: "desc" };
      select: { id: true; role: true; content: true };
    }) => Promise<{ id: string; role: string; content: string } | null>;
    createMany: (args: {
      data: Array<{
        id: string;
        conversationId: string;
        role: "ASSISTANT";
        content: string;
      }>;
      skipDuplicates: boolean;
    }) => Promise<unknown>;
  };
}

interface DbLike {
  $transaction: <T>(fn: (tx: TransactionLike) => Promise<T>) => Promise<T>;
}

/**
 * Server-side source of truth for "the user stopped this turn". Writes the
 * stop marker atomically with first-writer-wins against stream completion:
 * the conversation row lock serializes marker writes against completion
 * writes (which take the same lock in the messages route), and the marker is
 * only written while the conversation still ends at the triggering user
 * message. A finalized completion or an existing marker wins; late events
 * after a marker are dropped by the completion path.
 *
 * This never touches the thread lease, so a stop stays instant.
 */
export async function markStreamStoppedByUser(
  conversationId: string,
  db: DbLike = prisma as unknown as DbLike,
): Promise<StreamStoppedMarkResult> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM conversation WHERE id = ${conversationId} FOR UPDATE`;
    const latest = await tx.message.findFirst({
      where: { conversationId, isDeleted: false, parentMessageId: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, role: true, content: true },
    });
    if (!latest) {
      return { marked: false, reason: "no-messages" as const };
    }
    if (latest.role !== "USER") {
      return { marked: false, reason: "turn-already-finalized" as const };
    }
    const messageId = getStreamStoppedMarkerMessageId(
      conversationId,
      latest.id,
    );
    await tx.message.createMany({
      data: [
        {
          id: messageId,
          conversationId,
          role: "ASSISTANT" as const,
          content: STREAM_STOPPED_BY_USER_MARKER,
        },
      ],
      skipDuplicates: true,
    });
    return { marked: true, messageId };
  });
}
