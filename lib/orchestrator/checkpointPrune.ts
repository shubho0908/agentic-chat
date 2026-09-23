import { prisma } from "@/lib/prisma";
import { logInfo, logWarn } from "@/lib/observability";
import { CHECKPOINT_SCHEMA, getCheckpointer } from "./checkpointer";
import { deriveThreadId, isThreadIdForConversation } from "./threadIdentity";

export interface CheckpointThreadDeleter {
  deleteThread(threadId: string): Promise<void>;
}

export interface CheckpointPruneResult {
  ran: boolean;
  scanned: number;
  pruned: number;
  kept: number;
  skipped: number;
  deferred: number;
  failed: number;
}

export const CHECKPOINT_PRUNE_MAX_THREADS = 500;
export const CHECKPOINT_STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

const THREAD_ROOT_PREFIX = "conv-";
const BRANCH_SEPARATOR = ":branch:";
const SUNDAY_UTC = 0;

const EMPTY_PRUNE_RESULT: CheckpointPruneResult = {
  ran: false,
  scanned: 0,
  pruned: 0,
  kept: 0,
  skipped: 0,
  deferred: 0,
  failed: 0,
};

async function listCheckpointThreadIds(prefixes?: string[]): Promise<string[]> {
  const rows =
    prefixes === undefined
      ? await prisma.$queryRawUnsafe<Array<{ thread_id: string }>>(
          `SELECT DISTINCT thread_id FROM ${CHECKPOINT_SCHEMA}.checkpoints`,
        )
      : await prisma.$queryRawUnsafe<Array<{ thread_id: string }>>(
          `SELECT DISTINCT thread_id FROM ${CHECKPOINT_SCHEMA}.checkpoints
           WHERE EXISTS (SELECT 1 FROM unnest($1::text[]) AS prefix WHERE starts_with(thread_id, prefix))`,
          prefixes,
        );
  return rows.map((row) => row.thread_id);
}

async function deleteThreads(
  threadIds: string[],
  deleter: CheckpointThreadDeleter,
): Promise<{ deleted: number; failed: number }> {
  let deleted = 0;
  let failed = 0;
  for (const threadId of threadIds) {
    try {
      await deleter.deleteThread(threadId);
      deleted += 1;
    } catch (error) {
      failed += 1;
      logWarn({
        event: "checkpoint_thread_delete_failed",
        threadId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { deleted, failed };
}

export function conversationIdFromThreadId(threadId: string): string | null {
  if (!threadId.startsWith(THREAD_ROOT_PREFIX)) return null;
  const encodedRoot = threadId
    .slice(THREAD_ROOT_PREFIX.length)
    .split(BRANCH_SEPARATOR, 1)[0];
  if (!encodedRoot) return null;
  let conversationId: string;
  try {
    conversationId = decodeURIComponent(encodedRoot);
  } catch {
    return null;
  }
  return isThreadIdForConversation(threadId, conversationId)
    ? conversationId
    : null;
}

export async function deleteConversationCheckpoints(
  conversationIds: string[],
  dependency?: CheckpointThreadDeleter,
): Promise<void> {
  if (conversationIds.length === 0) return;
  try {
    const deleter = dependency ?? (await getCheckpointer());
    const candidates = await listCheckpointThreadIds(
      conversationIds.map((id) => deriveThreadId(id)),
    );
    const owned = candidates.filter((threadId) =>
      conversationIds.some((id) => isThreadIdForConversation(threadId, id)),
    );
    const { failed } = await deleteThreads(owned, deleter);
    if (failed > 0) {
      logWarn({
        event: "conversation_checkpoint_delete_incomplete",
        conversationCount: conversationIds.length,
        threadCount: owned.length,
        failed,
      });
    }
  } catch (error) {
    logWarn({
      event: "conversation_checkpoint_delete_failed",
      conversationCount: conversationIds.length,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function pruneCheckpointsOnSchedule(
  now: Date = new Date(),
  dependency?: CheckpointThreadDeleter,
): Promise<CheckpointPruneResult> {
  if (now.getUTCDay() !== SUNDAY_UTC) return EMPTY_PRUNE_RESULT;
  try {
    const deleter = dependency ?? (await getCheckpointer());
    const threadIds = await listCheckpointThreadIds();
    const threadsByConversation = new Map<string, string[]>();
    let skipped = 0;
    for (const threadId of threadIds) {
      const conversationId = conversationIdFromThreadId(threadId);
      if (conversationId === null) {
        skipped += 1;
        continue;
      }
      const threads = threadsByConversation.get(conversationId) ?? [];
      threads.push(threadId);
      threadsByConversation.set(conversationId, threads);
    }

    const conversationIds = Array.from(threadsByConversation.keys());
    const conversations =
      conversationIds.length === 0
        ? []
        : await prisma.conversation.findMany({
            where: { id: { in: conversationIds } },
            select: { id: true, updatedAt: true },
          });
    const updatedAtById = new Map(
      conversations.map((conversation) => [conversation.id, conversation.updatedAt]),
    );
    const staleBefore = now.getTime() - CHECKPOINT_STALE_AFTER_MS;

    const prunable: string[] = [];
    let kept = 0;
    for (const [conversationId, threads] of threadsByConversation) {
      const updatedAt = updatedAtById.get(conversationId);
      if (updatedAt === undefined || updatedAt.getTime() < staleBefore) {
        prunable.push(...threads);
      } else {
        kept += threads.length;
      }
    }

    const batch = prunable.slice(0, CHECKPOINT_PRUNE_MAX_THREADS);
    const { deleted, failed } = await deleteThreads(batch, deleter);
    const result: CheckpointPruneResult = {
      ran: true,
      scanned: threadIds.length,
      pruned: deleted,
      kept,
      skipped,
      deferred: prunable.length - batch.length,
      failed,
    };
    logInfo({ event: "checkpoint_prune_completed", ...result });
    return result;
  } catch (error) {
    logWarn({
      event: "checkpoint_prune_failed",
      error: error instanceof Error ? error.message : String(error),
    });
    return { ...EMPTY_PRUNE_RESULT, ran: true, failed: 1 };
  }
}
