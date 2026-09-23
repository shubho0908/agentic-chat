import { after } from "next/server";
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
  expiredLocksCleared: number;
  exhausted: boolean;
}

export interface CheckpointPruneOptions {
  now?: Date;
  deadline?: number;
  dependency?: CheckpointThreadDeleter;
}

export const CHECKPOINT_PRUNE_MAX_THREADS = 500;
export const CHECKPOINT_PRUNE_PAGE_SIZE = 500;
export const CHECKPOINT_PRUNE_TIME_BUDGET_MS = 60_000;
export const CHECKPOINT_STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
export const CONVERSATION_DELETE_BATCH_SIZE = 100;
export const CONVERSATION_DELETE_TIME_BUDGET_MS = 8_000;
export const EXPIRED_THREAD_LOCK_BATCH = 1_000;

const THREAD_ROOT_PREFIX = "conv-";
const BRANCH_SEPARATOR = ":branch:";
const BRANCH_RANGE_END = ":branch;";
const SUNDAY_UTC = 0;

const EMPTY_PRUNE_RESULT: CheckpointPruneResult = {
  ran: false,
  scanned: 0,
  pruned: 0,
  kept: 0,
  skipped: 0,
  deferred: 0,
  failed: 0,
  expiredLocksCleared: 0,
  exhausted: false,
};

const CHECKPOINTS_TABLE = `${CHECKPOINT_SCHEMA}.checkpoints`;

export const CONVERSATION_THREADS_SQL = `SELECT c.thread_id FROM unnest($1::text[]) AS r(root)
JOIN ${CHECKPOINTS_TABLE} c ON c.thread_id = r.root
UNION
SELECT c.thread_id FROM unnest($1::text[]) AS r(root)
JOIN ${CHECKPOINTS_TABLE} c
  ON c.thread_id > r.root || '${BRANCH_SEPARATOR}'
 AND c.thread_id < r.root || '${BRANCH_RANGE_END}'
 AND starts_with(c.thread_id, r.root || '${BRANCH_SEPARATOR}')`;

export const THREAD_PAGE_SQL = `WITH RECURSIVE threads(thread_id) AS (
  (SELECT thread_id FROM ${CHECKPOINTS_TABLE} WHERE thread_id > $1 ORDER BY thread_id LIMIT 1)
  UNION ALL
  SELECT (SELECT c.thread_id FROM ${CHECKPOINTS_TABLE} c WHERE c.thread_id > threads.thread_id ORDER BY c.thread_id LIMIT 1)
  FROM threads WHERE threads.thread_id IS NOT NULL
)
SELECT thread_id FROM threads WHERE thread_id IS NOT NULL LIMIT $2`;

export const LATEST_CHECKPOINT_SQL = `SELECT t.thread_id, latest.ts FROM unnest($1::text[]) AS t(thread_id)
LEFT JOIN LATERAL (
  SELECT c.checkpoint->>'ts' AS ts FROM ${CHECKPOINTS_TABLE} c
  WHERE c.thread_id = t.thread_id AND c.checkpoint_ns = ''
  ORDER BY c.checkpoint_id DESC LIMIT 1
) latest ON true`;

export const LIVE_THREAD_LOCKS_SQL = `SELECT thread_id FROM thread_locks
WHERE thread_id = ANY($1::text[]) AND expires_at > now()`;

export const EXPIRED_THREAD_LOCKS_SQL = `DELETE FROM thread_locks WHERE thread_id IN (
  SELECT thread_id FROM thread_locks WHERE expires_at < now() - interval '1 hour' LIMIT ${EXPIRED_THREAD_LOCK_BATCH}
)`;

async function deleteThreads(
  threadIds: string[],
  deleter: CheckpointThreadDeleter,
  deadline: number,
): Promise<{ deleted: number; failed: number; remaining: number }> {
  let deleted = 0;
  let failed = 0;
  for (const [index, threadId] of threadIds.entries()) {
    if (Date.now() >= deadline) {
      return { deleted, failed, remaining: threadIds.length - index };
    }
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
  return { deleted, failed, remaining: 0 };
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
    const rows = await prisma.$queryRawUnsafe<Array<{ thread_id: string }>>(
      CONVERSATION_THREADS_SQL,
      conversationIds.map((id) => deriveThreadId(id)),
    );
    const owned = rows
      .map((row) => row.thread_id)
      .filter((threadId) =>
        conversationIds.some((id) => isThreadIdForConversation(threadId, id)),
      );
    const deadline = Date.now() + CONVERSATION_DELETE_TIME_BUDGET_MS;
    let deleted = 0;
    let failed = 0;
    let deferred = 0;
    for (let start = 0; start < owned.length; start += CONVERSATION_DELETE_BATCH_SIZE) {
      const batch = owned.slice(start, start + CONVERSATION_DELETE_BATCH_SIZE);
      const outcome = await deleteThreads(batch, deleter, deadline);
      deleted += outcome.deleted;
      failed += outcome.failed;
      if (outcome.remaining > 0) {
        deferred = owned.length - start - batch.length + outcome.remaining;
        break;
      }
    }
    const log = failed > 0 || deferred > 0 ? logWarn : logInfo;
    log({
      event: "conversation_checkpoint_delete_completed",
      conversationCount: conversationIds.length,
      threadCount: owned.length,
      deleted,
      failed,
      deferred,
    });
  } catch (error) {
    logWarn({
      event: "conversation_checkpoint_delete_failed",
      conversationCount: conversationIds.length,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function scheduleConversationCheckpointDelete(conversationIds: string[]): void {
  if (conversationIds.length === 0) return;
  try {
    after(() => deleteConversationCheckpoints(conversationIds));
  } catch {
    void deleteConversationCheckpoints(conversationIds);
  }
}

function isStale(value: Date | string | null | undefined, staleBefore: number): boolean {
  if (value === null || value === undefined) return true;
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(time) && time < staleBefore;
}

async function clearExpiredThreadLocks(): Promise<number> {
  try {
    return await prisma.$executeRawUnsafe(EXPIRED_THREAD_LOCKS_SQL);
  } catch (error) {
    logWarn({
      event: "expired_thread_lock_cleanup_failed",
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}

export async function pruneCheckpointsOnSchedule(
  options: CheckpointPruneOptions = {},
): Promise<CheckpointPruneResult> {
  const now = options.now ?? new Date();
  if (now.getUTCDay() !== SUNDAY_UTC) return EMPTY_PRUNE_RESULT;
  const deadline = Math.min(
    options.deadline ?? Number.POSITIVE_INFINITY,
    Date.now() + CHECKPOINT_PRUNE_TIME_BUDGET_MS,
  );
  const staleBefore = now.getTime() - CHECKPOINT_STALE_AFTER_MS;
  const result: CheckpointPruneResult = { ...EMPTY_PRUNE_RESULT, ran: true };
  try {
    const deleter = options.dependency ?? (await getCheckpointer());
    result.expiredLocksCleared = await clearExpiredThreadLocks();
    let cursor = "";
    while (Date.now() < deadline) {
      const budget = CHECKPOINT_PRUNE_MAX_THREADS - result.pruned - result.failed;
      if (budget <= 0) break;
      const page = (
        await prisma.$queryRawUnsafe<Array<{ thread_id: string }>>(
          THREAD_PAGE_SQL,
          cursor,
          CHECKPOINT_PRUNE_PAGE_SIZE,
        )
      ).map((row) => row.thread_id);
      if (page.length === 0) {
        result.exhausted = true;
        break;
      }
      cursor = page[page.length - 1]!;
      result.scanned += page.length;

      const conversationByThread = new Map<string, string>();
      for (const threadId of page) {
        const conversationId = conversationIdFromThreadId(threadId);
        if (conversationId === null) result.skipped += 1;
        else conversationByThread.set(threadId, conversationId);
      }
      const conversationIds = Array.from(new Set(conversationByThread.values()));
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

      const orphans: string[] = [];
      const idle: string[] = [];
      for (const [threadId, conversationId] of conversationByThread) {
        const updatedAt = updatedAtById.get(conversationId);
        if (updatedAt === undefined) orphans.push(threadId);
        else if (isStale(updatedAt, staleBefore)) idle.push(threadId);
        else result.kept += 1;
      }

      const idleStale: string[] = [];
      if (idle.length > 0) {
        const latest = await prisma.$queryRawUnsafe<Array<{ thread_id: string; ts: string | null }>>(
          LATEST_CHECKPOINT_SQL,
          idle,
        );
        const latestByThread = new Map(latest.map((row) => [row.thread_id, row.ts]));
        for (const threadId of idle) {
          if (isStale(latestByThread.get(threadId), staleBefore)) idleStale.push(threadId);
          else result.kept += 1;
        }
      }

      const candidates = [...orphans, ...idleStale];
      const live =
        candidates.length === 0
          ? new Set<string>()
          : new Set(
              (
                await prisma.$queryRawUnsafe<Array<{ thread_id: string }>>(
                  LIVE_THREAD_LOCKS_SQL,
                  candidates,
                )
              ).map((row) => row.thread_id),
            );
      const prunable = candidates.filter((threadId) => !live.has(threadId));
      result.kept += candidates.length - prunable.length;
      const batch = prunable.slice(0, budget);
      result.deferred += prunable.length - batch.length;
      const { deleted, failed, remaining } = await deleteThreads(batch, deleter, deadline);
      result.pruned += deleted;
      result.failed += failed;
      result.deferred += remaining;
      if (page.length < CHECKPOINT_PRUNE_PAGE_SIZE) {
        result.exhausted = true;
        break;
      }
    }
    logInfo({ event: "checkpoint_prune_completed", ...result });
    return result;
  } catch (error) {
    logWarn({
      event: "checkpoint_prune_failed",
      error: error instanceof Error ? error.message : String(error),
    });
    return { ...result, failed: result.failed + 1 };
  }
}
