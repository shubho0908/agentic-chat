import pg from "pg";

let lockPool: pg.Pool | null = null;

function getLockPool(): pg.Pool {
  if (lockPool) return lockPool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString)
    throw new Error("DATABASE_URL is required for thread locking");
  lockPool = new pg.Pool({ connectionString, max: 5 });
  return lockPool;
}

export interface ThreadLock {
  release(): Promise<void>;
}

/** Cross-instance transaction-independent advisory lock for one graph thread. */
export async function acquireThreadLock(threadId: string): Promise<ThreadLock> {
  const client = await getLockPool().connect();
  let released = false;
  try {
    await client.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [
      threadId,
    ]);
  } catch (error) {
    client.release();
    throw error;
  }
  return {
    async release() {
      if (released) return;
      released = true;
      try {
        await client.query(
          "SELECT pg_advisory_unlock(hashtextextended($1, 0))",
          [threadId],
        );
      } finally {
        client.release();
      }
    },
  };
}
