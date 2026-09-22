import { prisma } from "@/lib/prisma";
import {
  STREAM_STOPPED_BY_USER_MARKER,
  getStreamStoppedMarkerMessageId,
} from "./stopMarker";

export interface StreamStoppedMarkResult {
  marked: boolean;
  messageId?: string;
  reason?:
    | "no-messages"
    | "user-message-not-found"
    | "turn-already-finalized"
    | "superseded-by-newer-turn";
}

interface TransactionLike {
  $executeRaw: (
    query: TemplateStringsArray,
    ...values: string[]
  ) => Promise<unknown>;
  message: {
    findUnique: (args: {
      where: { id: string };
      select: { id: true; role: true; conversationId: true };
    }) => Promise<{ id: string; role: string; conversationId: string } | null>;
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

export interface MarkStreamStoppedOptions {
  /** Extra attempts when the triggering user message has not landed yet. */
  notFoundRetries?: number;
  /** Delay between those attempts; no lock or lease is held while waiting. */
  retryDelayMs?: number;
}

/**
 * Server-side source of truth for "the user explicitly stopped this turn".
 * Only explicit-stop paths may call this: the /api/chat/stop endpoint and the
 * client's scoped marker save in the messages route. A plain transport
 * disconnect (refresh, tab close, network loss) must never write a marker,
 * so crash/refresh resume keeps working.
 *
 * The marker is always scoped to its turn: expectedUserMessageId is required
 * and the write only lands while that user message is still the newest root
 * message. A finalized completion or a newer turn wins, so a stale stop can
 * never finalize the wrong turn or cause its completion to be dropped.
 *
 * First-writer-wins against stream completion: the conversation row lock
 * serializes marker writes against completion writes (which take the same
 * lock in the messages route), and the deterministic marker id collapses
 * concurrent writers into one row. This never touches the thread lease, so a
 * stop stays instant.
 */
export async function markStreamStoppedByUser(
  conversationId: string,
  expectedUserMessageId: string,
  options: MarkStreamStoppedOptions = {},
  db: DbLike = prisma as unknown as DbLike,
): Promise<StreamStoppedMarkResult> {
  const { notFoundRetries = 4, retryDelayMs = 250 } = options;
  let attempt = 0;
  for (;;) {
    const result = await tryMarkStreamStoppedByUser(
      conversationId,
      expectedUserMessageId,
      db,
    );
    // The user-message save can still be in flight when an explicit stop
    // arrives (stop clicked while the save request is mid-flight). Give it a
    // short bounded window to land instead of losing the stop; each attempt
    // is its own short transaction, so nothing is locked while waiting.
    if (
      result.marked ||
      result.reason !== "user-message-not-found" ||
      attempt >= notFoundRetries
    ) {
      return result;
    }
    attempt += 1;
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }
}

async function tryMarkStreamStoppedByUser(
  conversationId: string,
  expectedUserMessageId: string,
  db: DbLike,
): Promise<StreamStoppedMarkResult> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM conversation WHERE id = ${conversationId} FOR UPDATE`;
    const expected = await tx.message.findUnique({
      where: { id: expectedUserMessageId },
      select: { id: true, role: true, conversationId: true },
    });
    if (!expected || expected.conversationId !== conversationId) {
      return { marked: false, reason: "user-message-not-found" as const };
    }
    if (expected.role !== "USER") {
      return { marked: false, reason: "turn-already-finalized" as const };
    }
    const latest = await tx.message.findFirst({
      where: { conversationId, isDeleted: false, parentMessageId: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, role: true, content: true },
    });
    if (!latest) {
      return { marked: false, reason: "no-messages" as const };
    }
    const messageId = getStreamStoppedMarkerMessageId(
      conversationId,
      expectedUserMessageId,
    );
    if (latest.id === messageId) {
      // Same stop delivered twice (stop endpoint plus client marker save):
      // the marker already exists, so this is a no-op success.
      return { marked: true, messageId };
    }
    // Root and branch turns coexist on separate threads: when anything newer
    // than the named turn exists, marking now would finalize the wrong turn
    // and could discard that turn's legitimate completion in the messages
    // route.
    if (latest.id !== expectedUserMessageId) {
      return {
        marked: false,
        reason:
          latest.role === "USER"
            ? ("superseded-by-newer-turn" as const)
            : ("turn-already-finalized" as const),
      };
    }
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
